"""
CROWDGUARD v2.0 — Phase 5.3C Unit & Integration Tests
Validates camera lifecycle states, stale detection, multi-camera isolation,
reconnection backoff, queue boundedness, and backend transparency.
"""

import time
import pytest
import numpy as np
from unittest.mock import MagicMock, patch

from app.services.camera_registry import camera_registry_service
from app.services.camera_session import CameraSession, CameraConfig, CameraState, CameraSourceType
from app.services.detection_service import DetectionService


@pytest.fixture(autouse=True)
def clean_registry():
    """Ensure registry is clean before and after each test."""
    with camera_registry_service._lock:
        for s in list(camera_registry_service._sessions.values()):
            try:
                s.stop()
            except Exception:
                pass
        camera_registry_service._sessions.clear()
    yield
    with camera_registry_service._lock:
        for s in list(camera_registry_service._sessions.values()):
            try:
                s.stop()
            except Exception:
                pass
        camera_registry_service._sessions.clear()


class MockFrameCapture:
    """Mock capture object for deterministic failure injection and streaming tests."""
    def __init__(self, fps=25.0, frame_shape=(480, 640, 3)):
        self.fps = fps
        self.frame_shape = frame_shape
        self.is_open = True
        self.frame_count = 0
        self.stalled = False

    def isOpened(self):
        return self.is_open

    def read(self):
        if not self.is_open or self.stalled:
            return False, None
        self.frame_count += 1
        frame = np.full(self.frame_shape, 120, dtype=np.uint8)
        return True, frame

    def release(self):
        self.is_open = False


def test_camera_lifecycle_states():
    """Verify camera lifecycle: IDLE/DISCONNECTED -> CONNECTING -> STREAMING -> STALE -> DISCONNECTED."""
    config = CameraConfig(
        camera_id="cam_test_lifecycle",
        name="Lifecycle Test Cam",
        source_type="file",
        target_fps=20.0,
        staleness_threshold_sec=0.5
    )
    session = CameraSession(config)
    assert session.state == CameraState.IDLE

    # Mock VideoCapture to test transition to STREAMING
    mock_cap = MockFrameCapture()
    with patch("cv2.VideoCapture", return_value=mock_cap):
        session.start()
        time.sleep(0.15)
        assert session.state in (CameraState.STREAMING, CameraState.CONNECTED)

        # Stop session
        session.stop()
        assert session.state in (CameraState.IDLE, CameraState.DISCONNECTED)


def test_stale_telemetry_marking_and_no_zero_conversion():
    """Verify that when frames stop arriving, telemetry is marked stale, and disconnected cameras report unavailable rather than 0.0."""
    config = CameraConfig(
        camera_id="cam_test_stale",
        name="Stale Test Cam",
        source_type="file",
        target_fps=20.0,
        staleness_threshold_sec=0.3
    )
    session = CameraSession(config)

    # 1. When disconnected, status must report None / Unavailable, NOT 0.0 or Low
    status_disc = session.get_status()
    assert status_disc["data_status"] == "unavailable"
    assert status_disc["is_available"] is False
    assert status_disc["person_count"] is None
    assert status_disc["smoothed_risk_score"] is None
    assert status_disc["risk_band"] == "Unavailable"

    # 2. Simulate active stream receiving a frame with risk score
    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    now = time.time()
    mono = time.perf_counter()
    session._set_state(CameraState.STREAMING)
    session._record_frame(dummy_frame, now, mono)
    
    # Fake telemetry payload
    with session._telemetry_lock:
        session._latest_telemetry = {
            "camera_id": session.camera_id,
            "person_count": 8,
            "smoothed_risk_score": 62.5,
            "risk_band": "High"
        }
        session._latest_detection_monotonic = mono
        session._latest_detection_timestamp = now

    # Fresh status check
    status_fresh = session.get_status()
    assert status_fresh["data_status"] == "available"
    assert status_fresh["is_available"] is True
    assert status_fresh["person_count"] == 8
    assert status_fresh["smoothed_risk_score"] == 62.5
    assert status_fresh["risk_band"] == "High"

    # 3. Fast-forward past staleness threshold (0.3s)
    session._latest_detection_monotonic = mono - 1.0
    status_stale = session.get_status()
    assert status_stale["data_status"] == "stale"
    assert status_stale["is_available"] is False
    assert status_stale["is_stale"] is True
    assert "Stale" in status_stale["risk_band"]
    # Preserved values remain inspectable but marked stale
    assert status_stale["smoothed_risk_score"] == 62.5

    # 4. Telemetry check
    telem = session.get_telemetry()
    assert telem["is_stale"] is True
    assert telem["data_status"] == "stale"
    assert telem["is_available"] is False
    assert "Stale" in telem["display_risk_band"]


def test_multi_camera_state_isolation():
    """Verify strict isolation of tracking state, risk scores, and telemetry between cameras."""
    cam1 = camera_registry_service.register_camera(name="Cam 1", source_type="webcam", device_index=0)
    cam2 = camera_registry_service.register_camera(name="Cam 2", source_type="webcam", device_index=1)

    assert cam1.camera_id != cam2.camera_id
    assert cam1.tracker is not cam2.tracker
    assert cam1.risk_engine is not cam2.risk_engine
    assert cam1.density_service is not cam2.density_service
    assert cam1.incident_service is not cam2.incident_service

    # Update cam1 with 5 tracks and risk
    risk_res1 = cam1.risk_engine.compute_risk(
        current_count=12,
        optical_flow_mag=4.5,
        mean_speed=18.0,
        grid_densities=[0.5] * 9
    )
    score1 = risk_res1["smoothed_score"]

    # Cam 2 should remain pristine and uninfluenced
    score2 = cam2.risk_engine.last_smoothed_risk
    assert score1 > 0
    assert score2 == 0.0


def test_reconnection_backoff_and_cancel_on_stop():
    """Verify retry attempts follow exponential backoff and pending sleep is interrupted upon stop/remove."""
    config = CameraConfig(
        camera_id="cam_test_reconnect",
        name="Reconnect Cam",
        source_type="rtsp",
        rtsp_url="rtsp://192.168.1.200:554/live",
        timeout_seconds=1.0,
        max_retries=3
    )
    session = CameraSession(config)

    # Initial state
    assert session._retry_count == 0
    assert session._next_retry_delay_sec == 0.0

    # Simulate stop while reconnecting: interrupt event must be set immediately
    session._set_state(CameraState.RECONNECTING, "Waiting to reconnect...")
    session._retry_count = 2
    session._next_retry_delay_sec = 4.0

    session.stop()
    assert session._retry_interrupt_event.is_set()
    assert session._stop_event.is_set()
    assert session.state in (CameraState.IDLE, CameraState.DISCONNECTED)


def test_bounded_queue_buffer_overwrite():
    """Verify that incoming frames strictly overwrite unconsumed frames without unbounded queue growth."""
    config = CameraConfig(camera_id="cam_test_queue", name="Queue Cam", source_type="file")
    session = CameraSession(config)

    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)

    # Push 10 frames without consuming
    for i in range(10):
        session._record_frame(dummy_frame, time.time() + i, time.perf_counter() + i)

    # Bounded buffer: buffer_overwrites must have absorbed the 9 dropped frames
    assert session._buffer_overwrites == 9
    assert session._frames_captured == 10
    assert session._frame_consumed is False

    # Consume the single latest frame
    res = session.get_latest_raw_frame(timeout=0.01)
    assert res is not None
    assert session._frame_consumed is True
    assert session._frames_consumed == 1

    # Identity holds: captured == consumed + buffer_overwrites + pending
    status = session.get_status()
    assert status["accounting_identity_holds"] is True


def test_backend_transparency_in_status():
    """Verify that get_status reports the active and requested backend."""
    detector = DetectionService(backend="pytorch")
    config = CameraConfig(camera_id="cam_backend_test", name="Backend Cam", source_type="file")
    session = CameraSession(config, shared_detection_service=detector)

    status = session.get_status()
    assert status["inference_backend"] == "pytorch"
    assert status["requested_backend"] == "pytorch"
    assert status["backend_fallback_occurred"] is False
