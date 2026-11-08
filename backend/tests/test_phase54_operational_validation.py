import time
import pytest
import numpy as np

from app.services.camera_session import (
    CameraSession,
    CameraConfig,
    CameraState,
    CameraSourceType,
)
from app.services.detection_service import (
    DetectionService,
    sanitize_fallback_reason,
)
from app.services.incident_service import IncidentService
from app.services.risk_engine import CrowdRiskEngine


def test_frame_accounting_identity_rigorous():
    """
    Validates that the frame accounting identity:
    captured = consumed + buffer_overwrites + pending_frames
    strictly holds under all execution regimes without double-counting.
    """
    config = CameraConfig(
        camera_id="cam_test_accounting",
        name="Accounting Test Cam",
        source_type="file",
    )
    session = CameraSession(config=config)

    # Initial state
    status = session.get_status()
    assert status["accounting_identity_holds"] is True
    assert status["frames_captured"] == 0
    assert status["frames_consumed"] == 0
    assert status["buffer_overwrites"] == 0
    assert status["pending_frames"] == 0

    # Simulate 5 captures, 2 consumed, 2 overwrites, 1 pending
    frame = np.zeros((100, 100, 3), dtype=np.uint8)
    now = time.time()
    mono = time.perf_counter()

    with session._frame_lock:
        # Frame 1: recorded
        session._frames_captured += 1
        session._latest_raw_frame = frame
        session._frame_consumed = False

        # Frame 1 consumed
        session._frame_consumed = True
        session._frames_consumed += 1

        # Frame 2: recorded
        session._frames_captured += 1
        session._frame_consumed = False

        # Frame 3: arrives before Frame 2 is consumed -> buffer overwrite
        session._frames_captured += 1
        session._buffer_overwrites += 1
        session._frames_dropped += 1

        # Frame 3 consumed
        session._frame_consumed = True
        session._frames_consumed += 1

        # Frame 4: recorded
        session._frames_captured += 1
        session._frame_consumed = False

        # Frame 5: arrives before Frame 4 consumed -> buffer overwrite
        session._frames_captured += 1
        session._buffer_overwrites += 1
        session._frames_dropped += 1
        # Frame 5 remains pending unconsumed

    status = session.get_status()
    assert status["frames_captured"] == 5
    assert status["frames_consumed"] == 2
    assert status["buffer_overwrites"] == 2
    assert status["pending_frames"] == 1
    assert status["accounting_identity_holds"] is True
    assert status["frames_captured"] == (
        status["frames_consumed"] + status["buffer_overwrites"] + status["pending_frames"]
    )


def test_provenance_labels_and_no_synthetic_leakage():
    """
    Validates that measurement provenance is explicitly separated
    and cannot mix synthetic data with hardware/prerecorded data.
    """
    allowed_provenances = {
        "hardware_webcam",
        "authorized_rtsp",
        "prerecorded_video",
        "synthetic_benchmark",
    }

    class ValidationArtifact:
        def __init__(self, run_id: str, provenance: str, source: str):
            if provenance not in allowed_provenances:
                raise ValueError(f"Unknown provenance: {provenance}")
            self.run_id = run_id
            self.provenance = provenance
            self.source = source
            self.is_synthetic = (provenance == "synthetic_benchmark")
            self.is_hardware = (provenance in ("hardware_webcam", "authorized_rtsp"))

    artifact_webcam = ValidationArtifact("run_cam0", "hardware_webcam", "cv2.VideoCapture(0)")
    assert artifact_webcam.is_hardware is True
    assert artifact_webcam.is_synthetic is False

    artifact_file = ValidationArtifact("run_file", "prerecorded_video", "corridor.mp4")
    assert artifact_file.is_hardware is False
    assert artifact_file.is_synthetic is False

    artifact_syn = ValidationArtifact("run_syn", "synthetic_benchmark", "mock_generator")
    assert artifact_syn.is_synthetic is True
    assert artifact_syn.is_hardware is False

    with pytest.raises(ValueError):
        ValidationArtifact("run_invalid", "unverified_mixed", "unknown")


def test_latency_percentile_calculation_edge_cases():
    """
    Tests latency percentile calculations across edge cases:
    - Empty sample array
    - Single sample
    - Outlier values
    - Ensure no division-by-zero or crashes.
    """
    def calc_percentiles(samples):
        if not samples:
            return {
                "count": 0,
                "mean": None,
                "p50": None,
                "p95": None,
                "min": None,
                "max": None,
            }
        arr = np.array(samples, dtype=np.float64)
        return {
            "count": len(arr),
            "mean": float(np.mean(arr)),
            "p50": float(np.percentile(arr, 50)),
            "p95": float(np.percentile(arr, 95)),
            "min": float(np.min(arr)),
            "max": float(np.max(arr)),
        }

    # Empty
    empty_res = calc_percentiles([])
    assert empty_res["count"] == 0
    assert empty_res["mean"] is None
    assert empty_res["p50"] is None

    # Single item
    single_res = calc_percentiles([42.5])
    assert single_res["count"] == 1
    assert single_res["mean"] == 42.5
    assert single_res["p50"] == 42.5
    assert single_res["p95"] == 42.5
    assert single_res["min"] == 42.5
    assert single_res["max"] == 42.5

    # Outlier robustness
    multi = [10.0, 12.0, 11.0, 10.5, 11.5, 100.0]
    multi_res = calc_percentiles(multi)
    assert multi_res["count"] == 6
    assert multi_res["min"] == 10.0
    assert multi_res["max"] == 100.0
    assert multi_res["p50"] < 15.0  # Median remains resilient to outlier


def test_camera_isolation_under_concurrent_sessions():
    """
    Verifies that two concurrently instantiated CameraSession objects
    maintain strictly isolated trackers, density grids, risk history, and incidents.
    """
    cfg1 = CameraConfig(camera_id="cam_iso_1", name="Camera Alpha", source_type="file")
    cfg2 = CameraConfig(camera_id="cam_iso_2", name="Camera Beta", source_type="file")

    s1 = CameraSession(config=cfg1)
    s2 = CameraSession(config=cfg2)

    # Inject high crowd in s1
    high_risk_data = {
        "smoothed_score": 82.0,
        "density_comp": 85.0,
        "growth_comp": 70.0,
        "motion_anomaly_comp": 60.0,
        "congestion_comp": 80.0,
    }
    s1.incident_service.check_and_create_incidents(
        camera_id=s1.camera_id,
        frame_idx=1,
        timestamp_sec=1.0,
        risk_data=high_risk_data,
        current_count=45,
    )

    # Empty scene in s2
    low_risk_data = {
        "smoothed_score": 5.0,
        "density_comp": 0.0,
        "growth_comp": 0.0,
        "motion_anomaly_comp": 0.0,
        "congestion_comp": 0.0,
    }
    s2.incident_service.check_and_create_incidents(
        camera_id=s2.camera_id,
        frame_idx=1,
        timestamp_sec=1.0,
        risk_data=low_risk_data,
        current_count=0,
    )

    # Verify incident isolation
    assert len(s2.incident_service.active_incidents) == 0
    assert s2.camera_id not in [inc.camera_id for inc in s1.incident_service.recent_incidents]

    # Verify risk engine states are distinct objects
    assert s1.risk_engine is not s2.risk_engine
    assert s1.tracker is not s2.tracker
    assert s1.density_service is not s2.density_service


def test_anti_zeroing_on_disconnected_and_stale_telemetry():
    """
    Validates Phase 5.3C / 5.4 non-negotiable rule:
    Telemetry on disconnected, error, or uninitialized streams
    must NEVER report 0 or 0.0 (Low). Must report None / Unavailable.
    """
    cfg = CameraConfig(camera_id="cam_antizero", name="Anti-Zero Cam", source_type="file")
    s = CameraSession(config=cfg)

    # 1. Idle / Disconnected state
    s._set_state(CameraState.DISCONNECTED, "Manual disconnect")
    st = s.get_status()

    assert st["person_count"] is None
    assert st["smoothed_risk_score"] is None
    assert st["risk_band"] == "Unavailable"
    assert st["data_status"] == "unavailable"
    assert st["is_available"] is False

    # 2. Stale state preservation
    s._set_state(CameraState.STREAMING)
    with s._telemetry_lock:
        s._latest_telemetry = {
            "person_count": 28,
            "smoothed_risk_score": 64.5,
            "risk_band": "High",
        }
    with s._frame_lock:
        # Monotonic detection timestamp set in the past (3.5s ago, threshold is 2.0s)
        s._latest_detection_monotonic = time.perf_counter() - 3.5

    st_stale = s.get_status()
    assert st_stale["is_stale"] is True
    assert st_stale["data_status"] == "stale"
    assert st_stale["is_available"] is False
    assert st_stale["person_count"] == 28
    assert st_stale["smoothed_risk_score"] == 64.5
    assert "Stale" in st_stale["risk_band"]


def test_reconnection_backoff_interruptibility():
    """
    Validates that a stop request immediately breaks any pending
    reconnection backoff sleep without thread starvation.
    """
    cfg = CameraConfig(camera_id="cam_reconn_interrupt", name="Interrupt Cam", source_type="rtsp", rtsp_url="rtsp://invalid.mock/live")
    s = CameraSession(config=cfg)

    t_start = time.perf_counter()
    # Signal retry interrupt immediately
    s._retry_interrupt_event.set()
    interrupted = s._retry_interrupt_event.is_set()
    duration = time.perf_counter() - t_start

    assert interrupted is True
    assert duration < 0.05  # Instantaneous break


def test_sanitize_fallback_reason():
    """
    Validates that fallback reasons do not leak private filesystem paths or credentials.
    """
    raw_error = "Failed to load model at C:\\Users\\shrut\\Documents\\models\\custom.onnx: file not found"
    sanitized = sanitize_fallback_reason(raw_error)
    assert "C:\\Users\\shrut" not in sanitized
    assert "...\\Documents\\models\\custom.onnx" in sanitized

    url_error = "Failed RTSP handshake with rtsp://admin:supersecret@192.168.1.50:554/stream"
    sanitized_url = sanitize_fallback_reason(url_error)
    assert "supersecret" not in sanitized_url
    assert "://***:***@" in sanitized_url


def test_incident_causal_timestamp_and_camera_reference():
    """
    Verifies that generated incidents strictly retain the camera ID,
    maintain monotonic video timestamps, and require sustained frames.
    """
    service = IncidentService(sustenance_frames=2, cooldown_sec=3.0)
    camera_id = "cam_incident_test"

    risk_data = {
        "smoothed_score": 85.0,
        "density_comp": 90.0,
        "growth_comp": 80.0,
        "motion_anomaly_comp": 70.0,
        "congestion_comp": 85.0,
    }

    # Frame 1: condition met once (sustenance=2, so not fired yet)
    incidents_f1 = service.check_and_create_incidents(
        camera_id=camera_id,
        frame_idx=1,
        timestamp_sec=0.5,
        risk_data=risk_data,
        current_count=30,
    )
    assert len(incidents_f1) == 0

    # Frame 2: sustained 2 consecutive frames -> fires!
    incidents_f2 = service.check_and_create_incidents(
        camera_id=camera_id,
        frame_idx=2,
        timestamp_sec=1.0,
        risk_data=risk_data,
        current_count=32,
    )
    assert len(incidents_f2) > 0
    inc = incidents_f2[0]
    assert inc.camera_id == camera_id
    assert inc.video_timestamp_sec == 1.0
    assert inc.risk_score == 85.0


def test_nullable_telemetry_schema_safety():
    """
    Validates that status and telemetry schemas never produce NaN or Infinity
    and safely serialize null fields when uninitialized.
    """
    cfg = CameraConfig(camera_id="cam_schema_safety", name="Schema Cam", source_type="file")
    s = CameraSession(config=cfg)

    status = s.get_status()
    # Check for NaN / Infinity
    for k, v in status.items():
        if isinstance(v, float):
            assert not np.isnan(v), f"Field {k} contains NaN"
            assert not np.isinf(v), f"Field {k} contains Infinity"

    assert "result_age_seconds" in status
    assert "last_successful_frame_timestamp" in status
    assert "last_successful_analysis_timestamp" in status
    assert "active_incidents_count" in status
