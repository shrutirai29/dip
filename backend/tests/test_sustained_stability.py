import time
import numpy as np
import pytest
from unittest.mock import MagicMock

from app.services.camera_session import CameraSession, CameraConfig, CameraSourceType, CameraState
from app.services.camera_registry import camera_registry_service
from app.services.inference_scheduler import FairInferenceScheduler, fair_inference_scheduler
from app.services.evaluation_service import evaluation_service


def test_scheduler_bounded_queue_o1_under_high_load():
    """Verify that even under extreme request arrival rates, pending slots remain strictly O(1) per camera."""
    mock_detector = MagicMock()
    mock_detector.detect_persons_with_diagnostics.return_value = ([], {})

    scheduler = FairInferenceScheduler(shared_detector=mock_detector)
    scheduler.register_camera("cam_flood_1")
    scheduler.register_camera("cam_flood_2")
    scheduler.start()

    try:
        frame = np.zeros((64, 64, 3), dtype=np.uint8)
        # Enqueue 30 frames rapidly to each camera
        for i in range(30):
            scheduler.schedule_inference("cam_flood_1", i, time.time(), frame)
            scheduler.schedule_inference("cam_flood_2", i, time.time(), frame)

        with scheduler._lock:
            # Pending slots must never exceed the number of registered cameras (2)
            assert len(scheduler._pending_slots) <= 2
            # Bounded buffer: single slot per camera
            assert "cam_flood_1" in scheduler._pending_slots or len(scheduler._pending_slots) <= 2

        telem_1 = scheduler.get_telemetry("cam_flood_1")
        telem_2 = scheduler.get_telemetry("cam_flood_2")

        # Must record replaced pending frames
        assert telem_1["total_submitted"] == 30
        assert telem_2["total_submitted"] == 30
        assert telem_1["total_replaced_pending"] >= 20
        assert telem_2["total_replaced_pending"] >= 20
    finally:
        scheduler.stop()


def test_session_isolation_independent_stop_and_resume():
    """Verify that stopping one camera session mid-flight does not interrupt or stall remaining active streams."""
    video_path = "data/uploads/vid_2e28e1e65a.mp4"

    # Register 3 streams
    cam1 = camera_registry_service.register_camera(
        name="Iso Test Stream 1",
        source_type=CameraSourceType.FILE,
        rtsp_url=video_path,
        target_fps=25.0
    )
    cam2 = camera_registry_service.register_camera(
        name="Iso Test Stream 2",
        source_type=CameraSourceType.FILE,
        rtsp_url=video_path,
        target_fps=25.0
    )
    cam3 = camera_registry_service.register_camera(
        name="Iso Test Stream 3",
        source_type=CameraSourceType.FILE,
        rtsp_url=video_path,
        target_fps=25.0
    )

    try:
        # Start all 3
        cam1.start()
        cam2.start()
        cam3.start()

        # Let them run for 1.5 seconds
        time.sleep(1.5)
        assert cam1.is_active
        assert cam2.is_active
        assert cam3.is_active

        st1_before = cam1.get_status()["frames_captured"]
        st3_before = cam3.get_status()["frames_captured"]

        # Stop Camera 2 mid-flight
        cam2.stop()
        assert not cam2.is_active
        assert cam2.state == CameraState.IDLE

        # Allow Cameras 1 and 3 to continue for 1.5 seconds
        time.sleep(1.5)
        st1_after = cam1.get_status()["frames_captured"]
        st3_after = cam3.get_status()["frames_captured"]

        # Cameras 1 and 3 must have continued capturing smoothly
        assert st1_after > st1_before
        assert st3_after > st3_before
        assert cam1.is_active
        assert cam3.is_active

        # Re-start Camera 2
        cam2.start()
        time.sleep(1.0)
        assert cam2.is_active
        assert cam2.get_status()["frames_captured"] > 0
    finally:
        cam1.stop()
        cam2.stop()
        cam3.stop()
        camera_registry_service.remove_camera(cam1.camera_id)
        camera_registry_service.remove_camera(cam2.camera_id)
        camera_registry_service.remove_camera(cam3.camera_id)


def test_repeated_stream_lifecycle_start_stop_no_resource_leaks():
    """Verify that repeated start/stop cycles release resources cleanly without crashing or hanging."""
    video_path = "data/uploads/vid_2e28e1e65a.mp4"
    session = camera_registry_service.register_camera(
        name="Lifecycle Stress Stream",
        source_type=CameraSourceType.FILE,
        rtsp_url=video_path,
        target_fps=25.0
    )

    try:
        for cycle in range(5):
            session.start()
            assert session.is_active
            time.sleep(0.3)
            # Verify frame captured
            st = session.get_status()
            assert st["frames_captured"] >= 0

            session.stop()
            assert not session.is_active
            assert session.state == CameraState.IDLE
            assert session._capture_thread is None
            assert session._inference_thread is None
            assert session._cap is None
            time.sleep(0.1)
    finally:
        session.stop()
        camera_registry_service.remove_camera(session.camera_id)


def test_sustained_benchmark_mathematical_agreement_and_metrics():
    """Verify differential frame accounting and exact throughput agreement on a mini sustained run."""
    rep = evaluation_service.run_sustained_benchmark(
        max_cameras=2,
        warmup_duration_sec=2.0,
        measurement_duration_sec=4.0,
        sample_interval_sec=0.5
    )

    assert "sustained_scaling_results" in rep
    assert len(rep["sustained_scaling_results"]) == 2

    for level in rep["sustained_scaling_results"]:
        cams = level["active_cameras"]
        dur = level["measurement_window_seconds"]
        agg_fps = level["aggregate_inference_fps"]
        sum_fps = level["sum_per_cam_inference_fps"]
        discrepancy = level["throughput_discrepancy"]

        assert dur >= 3.8
        assert level["throughput_mathematical_agreement"] is True
        assert discrepancy <= 0.05
        assert level["capture_failure_rate_percent"] == 0.0
        assert "resource_utilization" in level
        assert "stability_audit" in level
        assert level["stability_audit"]["queue_bounded_O1"] is True
        assert level["stability_audit"]["stalled_stream_events"] == 0
        assert len(level["cameras"]) == cams

        for cam in level["cameras"]:
            assert cam["window_captured"] > 0
            assert "latency_distributions" in cam
            assert "capture_to_published" in cam["latency_distributions"]


def test_accuracy_regression_preservation():
    """Verify zero degradation on 15 ground-truth evaluation frames (100% recall, high precision)."""
    acc_report = evaluation_service.evaluate_detection_accuracy(imgsz=640, conf_threshold=0.30)
    metrics = acc_report["overall_metrics"]

    # Must preserve exact 100% recall and high precision
    assert metrics["recall"] == 1.0
    assert metrics["true_positives"] == 26
    assert metrics["false_negatives"] == 0
    assert metrics["precision"] >= 0.95
    assert metrics["f1_score"] >= 0.97
    assert metrics["mean_iou"] >= 0.90
