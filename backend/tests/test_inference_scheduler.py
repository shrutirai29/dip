import time
import numpy as np
import pytest
from unittest.mock import MagicMock

from app.services.inference_scheduler import FairInferenceScheduler, ScheduledInferenceRequest


def test_scheduler_lifecycle():
    scheduler = FairInferenceScheduler()
    assert not scheduler._running
    scheduler.start()
    assert scheduler._running
    # Idempotent start
    scheduler.start()
    assert scheduler._running
    scheduler.stop()
    assert not scheduler._running


def test_scheduler_bounded_queue_latest_frame_replacement():
    """Verify that enqueuing multiple frames before execution keeps only the latest frame."""
    mock_detector = MagicMock()
    mock_detector.detect_persons_with_diagnostics.return_value = (
        [{"bbox": [10, 10, 50, 50], "confidence": 0.9}],
        {"mock": True}
    )
    scheduler = FairInferenceScheduler(shared_detector=mock_detector)
    cam_id = "test_cam_1"
    scheduler.register_camera(cam_id)

    dummy_frame1 = np.zeros((100, 100, 3), dtype=np.uint8)
    dummy_frame2 = np.zeros((100, 100, 3), dtype=np.uint8)
    dummy_frame3 = np.zeros((100, 100, 3), dtype=np.uint8)

    scheduler._running = True  # Allow schedule_inference to accept requests
    scheduler.schedule_inference(cam_id, frame_id=1, capture_timestamp=time.time(), frame=dummy_frame1)
    scheduler.schedule_inference(cam_id, frame_id=2, capture_timestamp=time.time(), frame=dummy_frame2)
    scheduler.schedule_inference(cam_id, frame_id=3, capture_timestamp=time.time(), frame=dummy_frame3)

    # Slot must contain strictly ONE request (frame_id=3), and obsolete count must be 2
    assert len(scheduler._pending_slots) == 1
    assert scheduler._pending_slots[cam_id].frame_id == 3

    telem = scheduler.get_telemetry(cam_id)
    assert telem["total_scheduled"] == 3
    assert telem["total_replaced_obsolete"] == 2


def test_scheduler_round_robin_fairness():
    """Verify that multiple active cameras are serviced in fair round-robin order."""
    execution_order = []

    def mock_detect(frame, imgsz=640, conf_threshold=None):
        tag = "A" if frame[0, 0, 0] == 1 else "B"
        execution_order.append(tag)
        time.sleep(0.01)
        return [], {}

    mock_detector = MagicMock()
    mock_detector.detect_persons_with_diagnostics.side_effect = mock_detect

    scheduler = FairInferenceScheduler(shared_detector=mock_detector)
    scheduler.register_camera("cam_A")
    scheduler.register_camera("cam_B")
    scheduler.start()

    try:
        frame_a = np.zeros((50, 50, 3), dtype=np.uint8)
        frame_a[0, 0, 0] = 1
        frame_b = np.zeros((50, 50, 3), dtype=np.uint8)
        frame_b[0, 0, 0] = 2

        # Submit 3 alternating batches
        for i in range(3):
            scheduler.schedule_inference("cam_A", frame_id=i, capture_timestamp=time.time(), frame=frame_a)
            scheduler.schedule_inference("cam_B", frame_id=i, capture_timestamp=time.time(), frame=frame_b)
            time.sleep(0.04)

        # Execution order should alternate fairly
        assert len(execution_order) >= 4
        assert "A" in execution_order
        assert "B" in execution_order
        # Verify no monopolization: neither dominates 3 consecutive entries
        for idx in range(len(execution_order) - 2):
            assert not (execution_order[idx] == execution_order[idx+1] == execution_order[idx+2])
    finally:
        scheduler.stop()


def test_scheduler_exception_resilience():
    """Verify that an exception on one camera's frame does not crash the scheduler or other cameras."""
    call_counts = {"bad": 0, "good": 0}

    def failing_detect(frame, imgsz=640, conf_threshold=None):
        if frame[0, 0, 0] == 99:
            call_counts["bad"] += 1
            raise ValueError("Corrupted frame buffer simulation")
        call_counts["good"] += 1
        return [{"bbox": [0, 0, 10, 10], "confidence": 0.85}], {}

    mock_detector = MagicMock()
    mock_detector.detect_persons_with_diagnostics.side_effect = failing_detect

    scheduler = FairInferenceScheduler(shared_detector=mock_detector)
    scheduler.register_camera("cam_bad")
    scheduler.register_camera("cam_good")
    scheduler.start()

    try:
        bad_frame = np.zeros((50, 50, 3), dtype=np.uint8)
        bad_frame[0, 0, 0] = 99
        good_frame = np.zeros((50, 50, 3), dtype=np.uint8)
        good_frame[0, 0, 0] = 1

        # Schedule bad frame, then good frame
        res_bad, diag_bad = scheduler.execute_sync("cam_bad", 1, time.time(), bad_frame, timeout=0.5)
        res_good, diag_good = scheduler.execute_sync("cam_good", 2, time.time(), good_frame, timeout=0.5)

        # Bad frame failed gracefully with empty detections and error recorded
        assert res_bad == []
        assert "error" in diag_bad or diag_bad == {}

        # Good frame succeeded despite previous exception
        assert len(res_good) == 1
        assert res_good[0]["confidence"] == 0.85
        assert call_counts["bad"] >= 1
        assert call_counts["good"] >= 1
    finally:
        scheduler.stop()


def test_scheduler_camera_unregistration_cleanup():
    """Verify that unregistering a camera purges its pending slot and round-robin entry."""
    scheduler = FairInferenceScheduler()
    cam_id = "temp_cam"
    scheduler.register_camera(cam_id)
    assert cam_id in scheduler._registered_cameras

    dummy_frame = np.zeros((50, 50, 3), dtype=np.uint8)
    scheduler._running = True
    scheduler.schedule_inference(cam_id, 1, time.time(), dummy_frame)
    assert cam_id in scheduler._pending_slots

    scheduler.unregister_camera(cam_id)
    assert cam_id not in scheduler._registered_cameras
    assert cam_id not in scheduler._camera_order
    assert cam_id not in scheduler._pending_slots


def test_scheduler_monotonic_latency_boundaries_and_counters():
    """Verify drift-free monotonic latency tracking and separated telemetry counters."""
    mock_detector = MagicMock()
    mock_detector.detect_persons_with_diagnostics.return_value = (
        [{"bbox": [5, 5, 25, 25], "confidence": 0.95}],
        {"mock": True}
    )
    scheduler = FairInferenceScheduler(shared_detector=mock_detector)
    cam_id = "cam_mono_test"
    scheduler.register_camera(cam_id)
    scheduler.start()

    try:
        t_mono_capture = time.perf_counter()
        t_wall_capture = time.time()
        frame = np.zeros((64, 64, 3), dtype=np.uint8)

        detections, meta = scheduler.execute_sync(
            camera_id=cam_id,
            frame_id=101,
            capture_wallclock=t_wall_capture,
            frame=frame,
            timeout=1.0,
            capture_monotonic=t_mono_capture,
        )

        assert len(detections) == 1
        assert "inference_duration_ms" in meta
        assert "scheduler_wait_ms" in meta
        assert "capture_to_result_ms" in meta
        assert meta["inference_duration_ms"] >= 0.0
        assert meta["scheduler_wait_ms"] >= 0.0
        assert meta["capture_to_result_ms"] >= 0.0

        telem = scheduler.get_telemetry(cam_id)
        assert telem["total_submitted"] == 1
        assert telem["total_dispatched"] == 1
        assert telem["total_completed"] == 1
        assert telem["total_failed"] == 0
        assert telem["total_replaced_pending"] == 0
        assert telem["mean_duration_ms"] >= 0.0
        assert telem["mean_wait_ms"] >= 0.0
    finally:
        scheduler.stop()


def test_camera_session_decoupled_accounting_and_metrics():
    """Verify CameraSession distinguishes raw buffer overwrites from device read failures."""
    from app.services.camera_session import CameraSession, CameraConfig, CameraSourceType

    cfg = CameraConfig(
        camera_id="cam_acct_test",
        name="Accounting Test Cam",
        source_type=CameraSourceType.FILE,
        rtsp_url="data/uploads/vid_2e28e1e65a.mp4",
        target_fps=25.0
    )
    session = CameraSession(config=cfg)

    # Simulate 5 successful capture events into raw buffer without inference consuming
    frame = np.zeros((100, 100, 3), dtype=np.uint8)
    for i in range(5):
        session._record_frame(frame, time.time(), time.perf_counter())

    st = session.get_status()
    # 5 captured, 1 in buffer -> 4 overwrites
    assert st["frames_captured"] == 5
    assert st["buffer_overwrites"] == 4
    # Legacy frames_dropped alias must match buffer_overwrites
    assert st["frames_dropped"] == 4
    assert st["capture_failures"] == 0
    assert st["capture_failure_rate_percent"] == 0.0

    # Consume one frame
    raw_data = session.get_latest_raw_frame(timeout=0.1)
    assert raw_data is not None
    fid, ts, mono_ts, f = raw_data
    assert fid == 5
    assert mono_ts > 0

    st_after = session.get_status()
    assert st_after["frames_consumed"] == 1
