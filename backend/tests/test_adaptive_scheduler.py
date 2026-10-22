"""
Unit and integration tests for CROWDGUARD Phase 4.7 Adaptive Inference Scheduler.
Validates:
1. Policy switching ('round_robin' vs 'adaptive_risk') and configuration validation.
2. Strict round-robin fairness under default policy.
3. Dynamic risk-weighted prioritization under 'adaptive_risk' policy.
4. Starvation prevention: low-risk cameras are guaranteed dispatch within 2*N cycles.
5. Dropping obsolete frames when pending age exceeds max_pending_age_sec.
6. Timestamp and staleness telemetry contract in CameraSession.
"""

import time
import pytest
import numpy as np

from app.services.inference_scheduler import FairInferenceScheduler
from app.services.camera_session import CameraSession, CameraConfig, CameraSourceType


class MockDetector:
    def __init__(self, delay_sec: float = 0.01):
        self.delay_sec = delay_sec
        self.invocations = []

    def detect_persons_with_diagnostics(self, frame, imgsz=640, conf_threshold=0.3):
        if self.delay_sec > 0:
            time.sleep(self.delay_sec)
        return [{"class": "person", "box": [0, 0, 20, 20], "confidence": 0.88}], {"diag_info": "ok"}


@pytest.fixture
def clean_scheduler():
    """Provides a fresh, isolated FairInferenceScheduler instance with a MockDetector."""
    scheduler = FairInferenceScheduler()
    detector = MockDetector(delay_sec=0.005)
    scheduler.set_detector(detector)
    scheduler.start()
    yield scheduler
    scheduler.stop()


def test_scheduler_policy_toggle_and_config(clean_scheduler):
    sched = clean_scheduler
    assert sched.get_policy() == "round_robin"
    assert sched.get_max_pending_age() == 2.5

    # Switch to adaptive_risk
    sched.set_policy("adaptive_risk")
    assert sched.get_policy() == "adaptive_risk"

    # Set custom pending age
    sched.set_max_pending_age(1.8)
    assert sched.get_max_pending_age() == 1.8

    # Reject invalid policy
    with pytest.raises(ValueError):
        sched.set_policy("random_lottery")


def test_round_robin_fairness(clean_scheduler):
    sched = clean_scheduler
    sched.set_policy("round_robin")

    dispatch_order = []

    def on_complete(cam_id):
        def _cb(detections, diag):
            dispatch_order.append(cam_id)
        return _cb

    cams = ["cam_a", "cam_b", "cam_c", "cam_d"]
    for c in cams:
        sched.register_camera(c)

    dummy_frame = np.zeros((100, 100, 3), dtype=np.uint8)

    # Submit 3 sequential rounds where each camera submits one frame per round
    for rnd in range(3):
        for c in cams:
            sched.schedule_inference(
                camera_id=c,
                frame_id=rnd * 10,
                capture_timestamp=time.time(),
                frame=dummy_frame,
                callback=on_complete(c)
            )
            time.sleep(0.015)

    time.sleep(0.15)

    # In round-robin, all 4 cameras must be dispatched with equal count
    counts = {c: dispatch_order.count(c) for c in cams}
    for c in cams:
        assert counts[c] == 3, f"Camera {c} dispatch count {counts[c]} != 3"


def test_adaptive_risk_prioritization(clean_scheduler):
    sched = clean_scheduler
    sched.set_policy("adaptive_risk")

    sched.register_camera("cam_high")
    sched.register_camera("cam_low")

    # Set risk scores: cam_high has critical risk (90.0), cam_low has minimal risk (5.0)
    sched.update_camera_risk("cam_high", 90.0)
    sched.update_camera_risk("cam_low", 5.0)

    telem_high = sched.get_telemetry("cam_high")
    telem_low = sched.get_telemetry("cam_low")

    assert telem_high["priority_weight"] > telem_low["priority_weight"]
    assert telem_high["priority_weight"] >= 2.5  # 1.0 + min(2.0, 90/50) = 2.8


def test_starvation_prevention(clean_scheduler):
    """
    Validates that a low-risk camera is never starved even when a high-risk camera
    floods the scheduler with requests under adaptive_risk policy.
    """
    sched = clean_scheduler
    sched.set_policy("adaptive_risk")

    sched.register_camera("cam_critical")
    sched.register_camera("cam_idle")

    sched.update_camera_risk("cam_critical", 100.0)  # Weight 3.0
    sched.update_camera_risk("cam_idle", 0.0)         # Weight 1.0

    dispatches = []

    def on_complete(cam_id):
        def _cb(detections, diag):
            dispatches.append(cam_id)
        return _cb

    dummy_frame = np.zeros((50, 50, 3), dtype=np.uint8)

    # Submit both cameras initially
    sched.schedule_inference("cam_critical", 1, time.time(), dummy_frame, callback=on_complete("cam_critical"))
    sched.schedule_inference("cam_idle", 1, time.time(), dummy_frame, callback=on_complete("cam_idle"))

    # Continually flood requests for cam_critical
    for i in range(12):
        sched.schedule_inference("cam_critical", i + 2, time.time(), dummy_frame, callback=on_complete("cam_critical"))
        time.sleep(0.01)

    time.sleep(0.2)

    # cam_idle must have been served and not starved
    assert "cam_idle" in dispatches
    telem_idle = sched.get_telemetry("cam_idle")
    assert telem_idle["total_dispatched"] >= 1


def test_stale_pending_frame_dropping(clean_scheduler):
    """
    Validates that if a pending frame stays in the queue longer than max_pending_age_sec,
    it is dropped rather than executed.
    """
    sched = clean_scheduler
    # Set a tiny max pending age
    sched.set_max_pending_age(0.05)  # 50 ms expiry

    sched.register_camera("cam_slow")
    sched.register_camera("cam_stale")

    executed = []
    dropped_cb_received = []

    def on_complete(cam_id):
        def _cb(detections, diag):
            if diag.get("error") == "stale_frame_dropped":
                dropped_cb_received.append(cam_id)
            else:
                executed.append(cam_id)
        return _cb

    # Introduce artificial slow detector to hold up the queue
    class SlowDetector:
        def detect_persons_with_diagnostics(self, frame, imgsz=640, conf_threshold=0.3):
            time.sleep(0.12)  # 120 ms sleep > 50ms expiry
            return [], {}

    sched.set_detector(SlowDetector())

    dummy_frame = np.zeros((50, 50, 3), dtype=np.uint8)

    # Enqueue slow request first
    sched.schedule_inference("cam_slow", 1, time.time(), dummy_frame, callback=on_complete("cam_slow"))
    time.sleep(0.005)

    # Enqueue stale camera request right after
    sched.schedule_inference("cam_stale", 1, time.time(), dummy_frame, callback=on_complete("cam_stale"))

    # Wait for execution and drop inspection
    time.sleep(0.25)

    telem_stale = sched.get_telemetry("cam_stale")
    assert telem_stale["total_dropped_stale"] >= 1
    assert "cam_stale" not in executed
    assert "cam_stale" in dropped_cb_received


def test_camera_session_staleness_contract():
    """
    Validates that CameraSession.get_status() correctly reports explicit timestamps
    and dynamic staleness status.
    """
    cfg = CameraConfig(
        camera_id="cam_test_freshness",
        name="Freshness Test Cam",
        source_type=CameraSourceType.WEBCAM,
        device_index=0,
        staleness_threshold_sec=0.1  # 100 ms threshold for fast testing
    )
    session = CameraSession(cfg)

    # Initial status
    status = session.get_status()
    assert "latest_captured_timestamp" in status
    assert "latest_published_timestamp" in status
    assert "detection_age_seconds" in status
    assert "staleness_threshold_sec" in status
    assert status["staleness_threshold_sec"] == 0.1
    assert status["staleness_status"] == "uninitialized"

    # Simulate frame capture
    dummy_frame = np.zeros((100, 100, 3), dtype=np.uint8)
    now = time.time()
    mono = time.perf_counter()
    session._record_frame(dummy_frame, now, mono)

    # Simulate inference run completing
    session._latest_detection_timestamp = time.time()
    session._latest_detection_monotonic = time.perf_counter()

    status_fresh = session.get_status()
    assert status_fresh["staleness_status"] in ("fresh", "aging")
    assert status_fresh["is_stale"] is False

    # Wait until staleness threshold (0.1s) is exceeded
    time.sleep(0.15)
    status_stale = session.get_status()
    assert status_stale["is_stale"] is True
    assert status_stale["staleness_status"] == "stale"
    assert status_stale["detection_age_seconds"] >= 0.1
