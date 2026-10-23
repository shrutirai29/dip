import os
import json
import pytest
import numpy as np
import cv2
from unittest.mock import MagicMock, patch

from app.core.config import settings
from app.services.detection_service import DetectionService
from app.services.tracking_service import SimpleByteTracker
from app.services.density_service import DensityService
from app.services.risk_engine import CrowdRiskEngine


# ============================================================================
# 1. UNIT & CONTRACT TESTS (ISOLATED & PRECISE)
# ============================================================================

def test_model_class_0_is_strictly_person():
    """Verify that the loaded YOLO model strictly adheres to COCO Class 0 = 'person'."""
    service = DetectionService()
    assert service.model.names[0] == "person", "COCO class 0 must be 'person'"


def test_non_person_classes_excluded():
    """Verify that any YOLO detection that is not Class 0 ('person') is rejected."""
    service = DetectionService()

    # Mock ultralytics YOLO return with non-person boxes (e.g. class 2 'car', class 59 'bed')
    mock_box_person = MagicMock()
    mock_box_person.cls = [torch_scalar(0)]
    mock_box_person.conf = [torch_scalar(0.85)]
    mock_box_person.xyxy = [torch_tensor([50.0, 60.0, 150.0, 200.0])]

    mock_box_car = MagicMock()
    mock_box_car.cls = [torch_scalar(2)]
    mock_box_car.conf = [torch_scalar(0.90)]
    mock_box_car.xyxy = [torch_tensor([200.0, 200.0, 400.0, 350.0])]

    mock_box_bed = MagicMock()
    mock_box_bed.cls = [torch_scalar(59)]
    mock_box_bed.conf = [torch_scalar(0.70)]
    mock_box_bed.xyxy = [torch_tensor([10.0, 300.0, 300.0, 470.0])]

    mock_result = MagicMock()
    mock_result.boxes = [mock_box_person, mock_box_car, mock_box_bed]

    with patch.object(service, "model", return_value=[mock_result]):
        dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        dets, diag = service.detect_persons_with_diagnostics(dummy_frame)

        assert len(dets) == 1, "Only class 0 should survive"
        assert dets[0]["class_id"] == 0
        assert dets[0]["class_name"] == "person"
        assert diag["accepted_count"] == 1
        assert diag["total_candidates"] == 3


def test_confidence_threshold_filtering():
    """Verify that detections below the active confidence threshold are rejected."""
    service = DetectionService(conf_threshold=0.30)

    # Candidate with 0.28 (below threshold) vs candidate with 0.85 (above threshold)
    b_low = MagicMock()
    b_low.cls = [torch_scalar(0)]
    b_low.conf = [torch_scalar(0.28)]
    b_low.xyxy = [torch_tensor([10.0, 10.0, 50.0, 100.0])]

    b_high = MagicMock()
    b_high.cls = [torch_scalar(0)]
    b_high.conf = [torch_scalar(0.85)]
    b_high.xyxy = [torch_tensor([100.0, 100.0, 200.0, 300.0])]

    mock_res = MagicMock()
    mock_res.boxes = [b_low, b_high]

    with patch.object(service, "model", return_value=[mock_res]):
        dummy = np.zeros((480, 640, 3), dtype=np.uint8)
        dets, diag = service.detect_persons_with_diagnostics(dummy, conf_threshold=0.30)
        assert len(dets) == 1
        assert dets[0]["confidence"] == 0.85


def test_out_of_bounds_and_degenerate_boxes_handled():
    """Verify coordinate clamping and rejection of negative / out-of-frame / zero-area boxes."""
    service = DetectionService()

    # Out of bounds coordinates (negative and beyond frame width/height)
    b_oob = MagicMock()
    b_oob.cls = [torch_scalar(0)]
    b_oob.conf = [torch_scalar(0.80)]
    b_oob.xyxy = [torch_tensor([-15.0, -10.0, 700.0, 550.0])]

    # Degenerate zero-width box
    b_degen = MagicMock()
    b_degen.cls = [torch_scalar(0)]
    b_degen.conf = [torch_scalar(0.90)]
    b_degen.xyxy = [torch_tensor([50.0, 50.0, 50.0, 150.0])]

    mock_res = MagicMock()
    mock_res.boxes = [b_oob, b_degen]

    with patch.object(service, "model", return_value=[mock_res]):
        dummy = np.zeros((480, 640, 3), dtype=np.uint8)
        dets, _ = service.detect_persons_with_diagnostics(dummy)
        # b_oob should be clamped safely to [0, 0, 640, 480], b_degen rejected
        assert len(dets) == 1
        assert dets[0]["bbox"] == [0, 0, 640, 480]


def test_tracker_tentative_to_confirmed_lifecycle():
    """
    Verify that:
    1. Moderate confidence detections (< instant_confirm_conf) spawn 'tentative' tracks.
    2. Tentative tracks are NOT returned as active confirmed people.
    3. Tentative tracks become confirmed once matched across min_hits (2) frames.
    4. High confidence detections (>= instant_confirm_conf) confirm immediately.
    """
    tracker = SimpleByteTracker(min_hits=2, instant_confirm_conf=0.60)

    # Frame 1: Moderate detection (conf=0.35)
    f1_dets = [{"bbox": [100, 100, 150, 250], "confidence": 0.35}]
    out1 = tracker.update(f1_dets, timestamp_sec=0.0)
    assert len(out1) == 0, "Tentative tracks must NOT be returned as active confirmed people"
    assert len(tracker.tracks) == 1
    t1 = list(tracker.tracks.values())[0]
    assert t1["state"] == "tentative"
    assert t1["hits"] == 1

    # Frame 2: Moderate detection matches again
    f2_dets = [{"bbox": [102, 101, 152, 251], "confidence": 0.36}]
    out2 = tracker.update(f2_dets, timestamp_sec=0.1)
    assert len(out2) == 1, "Track must become confirmed on 2nd consecutive hit"
    assert out2[0]["id"] == t1["id"]
    assert out2[0]["is_confirmed"] is True

    # Frame 3: High confidence detection in new location (conf=0.88)
    f3_dets = [
        {"bbox": [103, 102, 153, 252], "confidence": 0.36}, # existing confirmed
        {"bbox": [300, 150, 400, 400], "confidence": 0.88}  # new high-confidence person
    ]
    out3 = tracker.update(f3_dets, timestamp_sec=0.2)
    assert len(out3) == 2, "High-confidence detection confirms immediately on frame 1"


def test_transient_false_detection_pruned_immediately():
    """Verify that a single-frame false positive does NOT linger in tracker memory."""
    tracker = SimpleByteTracker(min_hits=2, instant_confirm_conf=0.60)

    # Frame 1: Spurious socket detection for 1 frame
    f1_dets = [{"bbox": [34, 370, 149, 479], "confidence": 0.32}]
    out1 = tracker.update(f1_dets, timestamp_sec=0.0)
    assert len(out1) == 0, "Spurious detection must not be confirmed"
    assert len(tracker.tracks) == 1

    # Frame 2: Detector no longer reports the socket
    f2_dets = []
    out2 = tracker.update(f2_dets, timestamp_sec=0.1)
    assert len(out2) == 0
    # Must be pruned immediately from internal memory!
    assert len(tracker.tracks) == 0, "Tentative false track must be pruned immediately when missed"


def test_pipeline_density_and_risk_uses_only_confirmed_tracks():
    """Verify that rejected or unconfirmed detections never leak into crowd count or risk score."""
    density_service = DensityService()
    risk_engine = CrowdRiskEngine()

    # When no confirmed tracks exist
    active_tracks = []
    confirmed_dets = []

    grid_cells = density_service.compute_zone_telemetry(640, 480, confirmed_dets, active_tracks)
    total_pop = sum(c["population"] for c in grid_cells)
    assert total_pop == 0, "Density matrix population must be 0 when no confirmed tracks exist"

    risk_data = risk_engine.compute_risk(
        current_count=len(active_tracks),
        optical_flow_mag=0.0,
        mean_speed=0.0,
        grid_densities=[c["normalized_density"] for c in grid_cells]
    )
    assert risk_data["raw_score"] == 0.0, "Risk score must be 0 with zero confirmed crowd count"


# ============================================================================
# 2. OFFLINE BENCHMARK ON REAL LABELED TEST FIXTURES
# ============================================================================

def test_problematic_socket_scene_has_zero_false_positives():
    """
    Evidence-based validation on the exact problematic webcam wall-socket scene.
    Ensures 0 false positive detections at calibrated conf_threshold >= 0.30.
    """
    socket_img_path = "backend/tests/fixtures/detection_eval/scene_empty_socket.jpg"
    assert os.path.exists(socket_img_path), f"Fixture missing: {socket_img_path}"

    frame = cv2.imread(socket_img_path)
    detector = DetectionService(conf_threshold=0.30)
    dets = detector.detect_persons(frame, imgsz=640, conf_threshold=0.30)

    assert len(dets) == 0, f"Expected 0 detections on empty socket scene, got {len(dets)}: {dets}"


def test_offline_labeled_benchmark_precision_recall():
    """
    Evaluates real YOLOv8 inference across all labeled benchmark scenes.
    Measures True Positives, False Positives, False Negatives, Precision, and Recall.
    """
    manifest_path = "backend/tests/fixtures/detection_eval/manifest.json"
    assert os.path.exists(manifest_path), f"Manifest missing: {manifest_path}"

    with open(manifest_path, "r") as f:
        manifest = json.load(f)

    detector = DetectionService(conf_threshold=0.30)

    total_gt = 0
    total_tp = 0
    total_fp = 0
    total_fn = 0
    socket_fp = 0

    results = []
    for item in manifest:
        img_path = os.path.join("backend/tests/fixtures/detection_eval", item["filename"])
        frame = cv2.imread(img_path)
        assert frame is not None, f"Failed to load image: {img_path}"

        dets = detector.detect_persons(frame, imgsz=640, conf_threshold=0.30)
        gt = item["ground_truth_people"]
        pred = len(dets)
        total_gt += gt

        tp = min(gt, pred)
        fp = max(0, pred - gt)
        fn = max(0, gt - pred)

        total_tp += tp
        total_fp += fp
        total_fn += fn

        if "socket" in item["filename"]:
            socket_fp += fp

        results.append({
            "scene": item["filename"],
            "gt": gt,
            "pred": pred,
            "tp": tp,
            "fp": fp,
            "fn": fn
        })

    precision = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 1.0
    recall = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 0.0

    print("\n--- BENCHMARK RESULTS (conf=0.30) ---")
    for r in results:
        print(f"  {r['scene']:30}: GT={r['gt']} Pred={r['pred']} (TP={r['tp']}, FP={r['fp']}, FN={r['fn']})")
    print(f"TOTAL: TP={total_tp}, FP={total_fp} (Socket FP={socket_fp}), FN={total_fn}")
    print(f"PRECISION: {precision:.3f}, RECALL: {recall:.3f}\n")

    # Strict performance assertions
    assert socket_fp == 0, "Wall socket false positives must be completely eliminated"
    assert precision >= 0.85, f"Precision below 85%: {precision:.3f}"
    assert recall >= 0.70, f"Recall below 70%: {recall:.3f}"


# Helper mocks
def torch_scalar(val):
    mock = MagicMock()
    mock.cpu().numpy.return_value = val
    return mock

def torch_tensor(arr):
    mock = MagicMock()
    mock.cpu().numpy.return_value = np.array(arr)
    return mock
