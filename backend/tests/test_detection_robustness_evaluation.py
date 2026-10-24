import os
import json
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.evaluation_service import (
    evaluation_service,
    compute_box_iou,
    match_boxes_one_to_one,
    compute_precision_recall_f1
)

client = TestClient(app)


# ============================================================================
# 1. MATHEMATICAL & MATCHING INVARIANT TESTS
# ============================================================================

def test_iou_invariants():
    """Verify geometric IoU properties under normal, boundary, and degenerate inputs."""
    # Identical boxes
    assert compute_box_iou([0, 0, 100, 100], [0, 0, 100, 100]) == pytest.approx(1.0)
    # Disjoint boxes
    assert compute_box_iou([0, 0, 50, 50], [60, 60, 100, 100]) == 0.0
    # Partial overlap
    # box1: [0, 0, 10, 10] area 100
    # box2: [5, 0, 15, 10] area 100
    # inter: [5, 0, 10, 10] area 50
    # union: 100 + 100 - 50 = 150 -> IoU = 50/150 = 1/3 = 0.3333
    assert compute_box_iou([0, 0, 10, 10], [5, 0, 15, 10]) == pytest.approx(1.0 / 3.0, rel=1e-3)
    # Degenerate boxes (inverted coordinates)
    assert compute_box_iou([10, 10, 5, 5], [0, 0, 10, 10]) == 0.0
    # Zero area
    assert compute_box_iou([0, 0, 0, 0], [0, 0, 10, 10]) == 0.0
    # Non-finite values
    assert compute_box_iou([float("nan"), 0, 10, 10], [0, 0, 10, 10]) == 0.0


def test_one_to_one_matching_duplicate_penalization():
    """Verify that multiple overlapping predictions on a single GT person are strictly penalized as FP."""
    gt = [{"bbox": [10, 10, 100, 100], "class_name": "person"}]
    # Pred 1 has higher confidence, Pred 2 has lower confidence
    preds = [
        {"bbox": [12, 12, 98, 98], "confidence": 0.90, "class_name": "person"},
        {"bbox": [15, 15, 95, 95], "confidence": 0.40, "class_name": "person"}
    ]
    res = match_boxes_one_to_one(preds, gt, iou_threshold=0.50)
    assert res["true_positives"] == 1
    assert res["false_positives"] == 1
    assert res["false_negatives"] == 0
    assert len(res["matches"]) == 1
    # Higher confidence prediction wins the match
    assert res["matches"][0]["pred"]["confidence"] == 0.90
    assert len(res["unmatched_predictions"]) == 1
    assert res["unmatched_predictions"][0]["confidence"] == 0.40


def test_empty_predictions_and_ground_truth():
    """Verify consistent behavior for empty predictions and empty ground truth."""
    # Both empty -> true negative scene (0 TP, 0 FP, 0 FN)
    res_empty = match_boxes_one_to_one([], [], iou_threshold=0.50)
    assert res_empty["true_positives"] == 0
    assert res_empty["false_positives"] == 0
    assert res_empty["false_negatives"] == 0
    assert res_empty["mean_iou"] == 0.0

    # Predictions on empty GT -> all predictions are false positives
    preds = [{"bbox": [0, 0, 50, 50], "confidence": 0.85}]
    res_empty_gt = match_boxes_one_to_one(preds, [], iou_threshold=0.50)
    assert res_empty_gt["true_positives"] == 0
    assert res_empty_gt["false_positives"] == 1
    assert res_empty_gt["false_negatives"] == 0

    # Missed GT with no predictions -> all GTs are false negatives
    gts = [{"bbox": [0, 0, 50, 50]}]
    res_empty_pred = match_boxes_one_to_one([], gts, iou_threshold=0.50)
    assert res_empty_pred["true_positives"] == 0
    assert res_empty_pred["false_positives"] == 0
    assert res_empty_pred["false_negatives"] == 1


def test_zero_denominator_metric_guards():
    """Verify precision, recall, and F1 zero-denominator guards."""
    p, r, f1 = compute_precision_recall_f1(0, 0, 0)
    assert p == 0.0 and r == 0.0 and f1 == 0.0

    # Perfect detection
    p, r, f1 = compute_precision_recall_f1(10, 0, 0)
    assert p == 1.0 and r == 1.0 and f1 == 1.0

    # Only false positives
    p, r, f1 = compute_precision_recall_f1(0, 5, 0)
    assert p == 0.0 and r == 0.0 and f1 == 0.0

    # Only false negatives
    p, r, f1 = compute_precision_recall_f1(0, 0, 5)
    assert p == 0.0 and r == 0.0 and f1 == 0.0


# ============================================================================
# 2. PHASE 4.7D EVALUATION EXPANSION TESTS
# ============================================================================

def test_split_separation_natural_vs_synthetic():
    """Verify that Natural Surveillance and Synthetic Simulation are strictly separated."""
    rep = evaluation_service.evaluate_detection_robustness(conf_threshold=0.30, iou_threshold=0.50, save_report=False)
    assert "splits" in rep
    assert "natural" in rep["splits"]
    assert "synthetic" in rep["splits"]
    assert "overall_combined" in rep["splits"]

    nat = rep["splits"]["natural"]
    assert nat["frames_count"] == 10
    assert nat["ground_truth_persons"] == 26
    assert nat["true_positives"] == 26
    assert nat["false_positives"] == 1
    assert nat["false_negatives"] == 0
    assert nat["precision"] == pytest.approx(0.9630, abs=1e-3)
    assert nat["recall"] == 1.0
    assert nat["macro_mean_iou"] == pytest.approx(0.9381, abs=1e-3)
    assert nat["micro_mean_iou"] == pytest.approx(0.9308, abs=1e-3)
    assert nat["empty_frames_true_negatives"] == 3

    syn = rep["splits"]["synthetic"]
    assert syn["frames_count"] == 5
    assert syn["ground_truth_persons"] == 0
    assert syn["true_positives"] == 0
    assert syn["false_positives"] == 0
    assert syn["negative_specificity"] == 1.0
    assert syn["precision"] is None  # Zero-denominator guarded
    assert syn["recall"] is None


def test_density_subgroup_aggregation():
    """Verify crowd density subgroup categorization and preliminary sample-size flagging."""
    rep = evaluation_service.evaluate_detection_robustness(conf_threshold=0.30, iou_threshold=0.50, save_report=False)
    assert "density_subgroups" in rep
    d_groups = rep["density_subgroups"]

    assert "empty" in d_groups
    assert "sparse" in d_groups
    assert "moderate" in d_groups
    assert "dense" in d_groups

    # Sparse: 1 frame, 1 GT person
    assert d_groups["sparse"]["frames_count"] == 1
    assert d_groups["sparse"]["ground_truth_persons"] == 1
    assert d_groups["sparse"]["true_positives"] == 1
    assert d_groups["sparse"]["is_statistically_preliminary"] is True

    # Moderate: 3 frames, 11 GT persons
    assert d_groups["moderate"]["frames_count"] == 3
    assert d_groups["moderate"]["ground_truth_persons"] == 11
    assert d_groups["moderate"]["true_positives"] == 11
    assert d_groups["moderate"]["recall"] == 1.0
    assert d_groups["moderate"]["is_statistically_preliminary"] is True

    # Dense: 3 frames, 14 GT persons
    assert d_groups["dense"]["frames_count"] == 3
    assert d_groups["dense"]["ground_truth_persons"] == 14
    assert d_groups["dense"]["true_positives"] == 14
    assert d_groups["dense"]["false_positives"] == 1
    assert d_groups["dense"]["recall"] == 1.0


def test_attribute_breakdowns_occlusion_and_scale():
    """Verify occlusion, truncation, and bounding-box scale robustness metrics."""
    rep = evaluation_service.evaluate_detection_robustness(conf_threshold=0.30, iou_threshold=0.50, save_report=False)
    assert "attribute_breakdowns" in rep
    attrs = rep["attribute_breakdowns"]

    occ = attrs["occlusion"]
    assert occ["occluded"]["ground_truth_count"] == 8
    assert occ["occluded"]["detected_count"] == 8
    assert occ["occluded"]["recall"] == 1.0
    assert occ["non_occluded"]["ground_truth_count"] == 18
    assert occ["non_occluded"]["detected_count"] == 18
    assert occ["non_occluded"]["recall"] == 1.0

    scale = attrs["bounding_box_scale"]
    # Demonstrates empirical audit honesty: zero small-scale GT persons
    assert scale["small_under_10k_px"]["ground_truth_count"] == 0
    assert "data_gap_note" in scale["small_under_10k_px"]
    assert scale["large_over_100k_px"]["ground_truth_count"] == 25
    assert scale["large_over_100k_px"]["detected_count"] == 25


def test_error_analysis_identifies_duplicate_false_positive():
    """Verify that error analysis precisely detects and diagnoses the single false positive in real_f145."""
    rep = evaluation_service.evaluate_detection_robustness(conf_threshold=0.30, iou_threshold=0.50, save_report=False)
    assert "error_analysis" in rep
    err = rep["error_analysis"]
    assert err["total_false_positives"] == 1
    assert err["total_false_negatives"] == 0

    fp_case = err["false_positive_cases"][0]
    assert fp_case["frame_id"] == "real_f145"
    assert fp_case["error_type"] == "DUPLICATE_DETECTION"
    assert fp_case["confidence"] == pytest.approx(0.317, abs=1e-2)
    assert fp_case["overlap_with_gt"] > 0.50


def test_confidence_sweep_sensitivity():
    """
    Verify precision-recall tradeoff across confidence thresholds:
    - At conf 0.30: 100% recall (26/26 TP) with 1 duplicate FP in real_f145.
    - At conf 0.40: 100% precision (0 FP), but recall drops to 96.15% (25/26 TP, 1 FN on occluded person).
    """
    rep_30 = evaluation_service.evaluate_detection_robustness(conf_threshold=0.30, iou_threshold=0.50, save_report=False)
    rep_40 = evaluation_service.evaluate_detection_robustness(conf_threshold=0.40, iou_threshold=0.50, save_report=False)

    assert rep_30["splits"]["natural"]["false_positives"] == 1
    assert rep_30["splits"]["natural"]["recall"] == 1.0

    # At conf 0.40, false positives drop to 0 (100% precision), but 1 occluded person is missed
    assert rep_40["splits"]["natural"]["false_positives"] == 0
    assert rep_40["splits"]["natural"]["precision"] == 1.0
    assert rep_40["splits"]["natural"]["recall"] == pytest.approx(25.0 / 26.0, abs=1e-3)
    assert rep_40["splits"]["natural"]["false_negatives"] == 1


def test_diagnostic_overlay_generation():
    """Verify generation of visual diagnostic overlay images."""
    artifacts = evaluation_service.generate_diagnostic_overlays()
    assert len(artifacts) >= 4
    for art in artifacts:
        assert os.path.exists(art["file_path"]), f"Missing visual artifact: {art['file_path']}"
        assert art["width"] > 0 and art["height"] > 0
        assert art["image_url"].startswith("/api/benchmark/diagnostics/")


# ============================================================================
# 3. API ENDPOINTS INTEGRATION TESTS
# ============================================================================

def test_api_get_detection_robustness():
    """Verify GET /api/benchmark/detection-robustness returns Phase 4.7D data."""
    response = client.get("/api/benchmark/detection-robustness")
    assert response.status_code == 200
    data = response.json()
    assert "report_version" in data
    assert "splits" in data
    assert "density_subgroups" in data
    assert "attribute_breakdowns" in data
    assert "error_analysis" in data
    assert "provenance" in data
    assert "limitations_and_future_recommendations" in data


def test_api_run_detection_robustness_with_subset():
    """Verify POST /api/benchmark/run-detection-robustness with subset filter."""
    response = client.post("/api/benchmark/run-detection-robustness?subset=natural&conf_threshold=0.30")
    assert response.status_code == 200
    data = response.json()
    assert data["splits"]["natural"]["frames_count"] == 10


def test_api_get_diagnostic_image():
    """Verify GET /api/benchmark/diagnostics/{image_name} serves valid image."""
    response = client.get("/api/benchmark/diagnostics/diagnostic_real_f145_duplicate_fp.jpg")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert len(response.content) > 10000
