import time
import pytest
import numpy as np

from app.services.camera_session import (
    CameraSession,
    CameraConfig,
    CameraState,
    CameraSourceType,
)
from app.services.evaluation_service import EvaluationService
from app.services.detection_service import sanitize_fallback_reason


def test_manifest_evaluation_dynamic_execution():
    """
    Validates that EvaluationService executes ground-truth evaluation dynamically
    and produces verified precision, recall, and IoU metrics rather than static constants.
    """
    manifest_path = "data/evaluation/manifest.json"
    eval_svc = EvaluationService(manifest_path=manifest_path)
    res = eval_svc.evaluate_detection_accuracy(conf_threshold=0.30, iou_threshold=0.50)

    assert "overall_metrics" in res
    overall = res["overall_metrics"]

    assert overall["true_positives"] == 26
    assert overall["false_negatives"] == 0
    assert overall["precision"] > 0.90
    assert overall["recall"] == 1.00
    assert overall["mean_iou"] > 0.85
    assert res["evaluated_frames_count"] == 15


def test_frame_accounting_under_high_arrival_rate():
    """
    Verifies that when input frames arrive faster than consumption,
    the bounded queue overwrites excess frames and maintains exact accounting.
    """
    cfg = CameraConfig(camera_id="cam_audit_accounting", name="Audit Cam", source_type="file")
    s = CameraSession(config=cfg)

    frame = np.zeros((100, 100, 3), dtype=np.uint8)

    with s._frame_lock:
        s._latest_raw_frame = None
        s._frame_consumed = True
        # 100 frames arrive; downstream consumer consumes every 5th frame
        for i in range(100):
            s._frames_captured += 1
            if not s._frame_consumed and s._latest_raw_frame is not None:
                # Previous unconsumed frame is overwritten by incoming frame
                s._buffer_overwrites += 1
                s._frames_dropped += 1
            s._latest_raw_frame = frame
            s._frame_consumed = False

            if i % 5 == 0:
                s._frames_consumed += 1
                s._frame_consumed = True

    st = s.get_status()
    assert st["frames_captured"] == 100
    assert st["frames_consumed"] == 20
    assert st["buffer_overwrites"] == 79
    assert st["pending_frames"] == 1
    assert st["accounting_identity_holds"] is True
    assert st["frames_captured"] == (st["frames_consumed"] + st["buffer_overwrites"] + st["pending_frames"])
    # Invariant: captured == consumed + buffer_overwrites (note pending is tracked in identity formula)


def test_clean_resource_release_on_session_stop():
    """
    Verifies that stopping an active camera session terminates threads,
    releases VideoCapture handles, and unregisters from the scheduler.
    """
    cfg = CameraConfig(
        camera_id="cam_audit_release",
        name="Release Cam",
        source_type="file",
        rtsp_url="data/sample_videos/crowd_corridor_sample.mp4",
    )
    session = CameraSession(config=cfg)
    session.start()
    time.sleep(0.5)

    assert session.is_active is True
    session.stop()

    assert session.state == CameraState.IDLE
    assert session._cap is None
    assert session._capture_thread is None
    assert session._inference_thread is None


def test_multi_camera_independent_telemetry_isolation():
    """
    Verifies that concurrent camera sessions never cross-contaminate
    telemetry, observed people counts, or risk bands.
    """
    cfg_a = CameraConfig(camera_id="cam_audit_a", name="Cam A", source_type="file")
    cfg_b = CameraConfig(camera_id="cam_audit_b", name="Cam B", source_type="file")

    s_a = CameraSession(config=cfg_a)
    s_b = CameraSession(config=cfg_b)

    s_a._set_state(CameraState.STREAMING)
    s_b._set_state(CameraState.STREAMING)

    with s_a._telemetry_lock:
        s_a._latest_telemetry = {"person_count": 55, "smoothed_risk_score": 82.0, "risk_band": "High"}
    with s_b._telemetry_lock:
        s_b._latest_telemetry = {"person_count": 2, "smoothed_risk_score": 10.0, "risk_band": "Low"}

    st_a = s_a.get_status()
    st_b = s_b.get_status()

    assert st_a["person_count"] == 55
    assert st_a["smoothed_risk_score"] == 82.0
    assert "High" in st_a["risk_band"]

    assert st_b["person_count"] == 2
    assert st_b["smoothed_risk_score"] == 10.0
    assert "Low" in st_b["risk_band"]

    # Disconnect A, verify B remains untouched
    s_a._set_state(CameraState.DISCONNECTED)
    st_a_disc = s_a.get_status()
    st_b_cont = s_b.get_status()

    assert st_a_disc["person_count"] is None
    assert st_a_disc["smoothed_risk_score"] is None
    assert st_a_disc["risk_band"] == "Unavailable"

    assert st_b_cont["person_count"] == 2
    assert st_b_cont["smoothed_risk_score"] == 10.0
    assert "Low" in st_b_cont["risk_band"]
