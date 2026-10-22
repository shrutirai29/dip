import pytest
import numpy as np
from typing import List, Dict, Any

from app.services.evaluation_service import (
    compute_box_iou,
    match_boxes_one_to_one,
    compute_precision_recall_f1
)


def test_perfectly_overlapping_boxes():
    """Identical bounding boxes must yield IoU = 1.0."""
    box_a = [100.0, 100.0, 200.0, 300.0]
    box_b = [100.0, 100.0, 200.0, 300.0]
    assert compute_box_iou(box_a, box_b) == pytest.approx(1.0, rel=1e-5)


def test_partially_overlapping_boxes():
    """Known geometric overlap calculations."""
    # Box 1: [0, 0, 10, 10] -> area 100
    # Box 2: [5, 0, 15, 10] -> area 100
    # Intersection: [5, 0, 10, 10] -> w=5, h=10 -> area 50
    # Union: 100 + 100 - 50 = 150
    # IoU = 50 / 150 = 1/3 ~ 0.333333
    b1 = [0.0, 0.0, 10.0, 10.0]
    b2 = [5.0, 0.0, 15.0, 10.0]
    assert compute_box_iou(b1, b2) == pytest.approx(1.0 / 3.0, rel=1e-4)

    # Box 3: 50% vertical overlap
    # Box 1: [0, 0, 10, 10] -> area 100
    # Box 3: [0, 5, 10, 15] -> area 100
    # Intersection: [0, 5, 10, 10] -> area 50
    # Union: 150 -> IoU = 1/3
    b3 = [0.0, 5.0, 10.0, 15.0]
    assert compute_box_iou(b1, b3) == pytest.approx(1.0 / 3.0, rel=1e-4)


def test_non_overlapping_boxes():
    """Disjoint boxes must yield IoU = 0.0."""
    b1 = [0.0, 0.0, 10.0, 10.0]
    b2 = [20.0, 20.0, 30.0, 30.0]
    assert compute_box_iou(b1, b2) == 0.0

    # Touching edges but zero area overlap
    b_edge = [10.0, 0.0, 20.0, 10.0]
    assert compute_box_iou(b1, b_edge) == 0.0


def test_empty_ground_truth():
    """When GT is empty, all predictions are FP, mean IoU = 0.0."""
    preds = [
        {"bbox": [10, 10, 50, 50], "confidence": 0.8},
        {"bbox": [60, 60, 100, 100], "confidence": 0.7}
    ]
    res = match_boxes_one_to_one(preds, [], iou_threshold=0.5)
    assert res["true_positives"] == 0
    assert res["false_positives"] == 2
    assert res["false_negatives"] == 0
    assert res["mean_iou"] == 0.0
    assert len(res["matches"]) == 0


def test_empty_predictions():
    """When predictions are empty, all GT are FN, mean IoU = 0.0."""
    gts = [
        {"bbox": [10, 10, 50, 50]},
        {"bbox": [60, 60, 100, 100]}
    ]
    res = match_boxes_one_to_one([], gts, iou_threshold=0.5)
    assert res["true_positives"] == 0
    assert res["false_positives"] == 0
    assert res["false_negatives"] == 2
    assert res["mean_iou"] == 0.0


def test_duplicate_predictions_greedy_assignment():
    """Two predictions overlapping the same GT person must match at most ONE (the higher confidence)."""
    gts = [{"bbox": [50, 50, 150, 150]}]
    preds = [
        {"bbox": [52, 52, 148, 148], "confidence": 0.95}, # Best match
        {"bbox": [50, 50, 150, 150], "confidence": 0.60}  # Duplicate prediction
    ]
    res = match_boxes_one_to_one(preds, gts, iou_threshold=0.5)
    # Exactly one True Positive, one False Positive
    assert res["true_positives"] == 1
    assert res["false_positives"] == 1
    assert res["false_negatives"] == 0
    assert len(res["matches"]) == 1
    assert res["matches"][0]["pred"]["confidence"] == 0.95


def test_multiple_ground_truth_greedy_assignment():
    """Multiple GT people matched to multiple candidate predictions."""
    gts = [
        {"bbox": [10, 10, 50, 100]},   # Person 1
        {"bbox": [200, 10, 240, 100]}  # Person 2
    ]
    preds = [
        {"bbox": [11, 11, 49, 99], "confidence": 0.90},   # Matches Person 1
        {"bbox": [202, 12, 238, 98], "confidence": 0.85}, # Matches Person 2
        {"bbox": [500, 500, 550, 600], "confidence": 0.70} # False positive
    ]
    res = match_boxes_one_to_one(preds, gts, iou_threshold=0.5)
    assert res["true_positives"] == 2
    assert res["false_positives"] == 1
    assert res["false_negatives"] == 0
    assert res["mean_iou"] > 0.85


def test_invalid_and_out_of_bounds_coordinates():
    """Robust handling of negative, inverted, or zero-dimension boxes."""
    # Degenerate zero-area box (x1 == x2)
    b_zero = [10.0, 10.0, 10.0, 50.0]
    b_valid = [0.0, 0.0, 100.0, 100.0]
    assert compute_box_iou(b_zero, b_valid) == 0.0

    # Inverted coordinates (x2 < x1)
    b_inverted = [50.0, 10.0, 10.0, 50.0]
    assert compute_box_iou(b_inverted, b_valid) == 0.0

    # Negative coordinates
    b_neg = [-50.0, -50.0, 50.0, 50.0]
    # Intersection with [0, 0, 100, 100] is [0, 0, 50, 50] -> area 2500
    # b_neg area: 100 * 100 = 10000. b_valid area: 10000.
    # union: 10000 + 10000 - 2500 = 17500. IoU = 2500 / 17500 = 1/7 ~ 0.142857
    assert compute_box_iou(b_neg, b_valid) == pytest.approx(2500.0 / 17500.0, rel=1e-4)


def test_coordinate_scaling_invariance():
    """Rescaling both predictions and GT proportionally must preserve exact IoU."""
    b1 = [34.0, 42.0, 834.0, 846.0]
    b2 = [36.0, 40.0, 830.0, 840.0]
    iou_original = compute_box_iou(b1, b2)

    # Scale by 0.5 (e.g. 50% downscale)
    scale = 0.5
    b1_scaled = [x * scale for x in b1]
    b2_scaled = [x * scale for x in b2]
    iou_scaled = compute_box_iou(b1_scaled, b2_scaled)

    assert iou_original == pytest.approx(iou_scaled, rel=1e-5)


def test_micro_vs_macro_iou_formulations():
    """Demonstrate the mathematical relationship between micro-mean and macro-mean IoU."""
    # Frame 1: 1 match with IoU 0.90 -> frame mean 0.90
    # Frame 2: 3 matches with IoUs [0.80, 0.82, 0.84] -> frame mean 0.82
    box_ious_f1 = [0.90]
    box_ious_f2 = [0.80, 0.82, 0.84]

    macro_iou = (np.mean(box_ious_f1) + np.mean(box_ious_f2)) / 2.0 # (0.90 + 0.82) / 2 = 0.86
    micro_iou = np.mean(box_ious_f1 + box_ious_f2) # (0.90 + 0.80 + 0.82 + 0.84) / 4 = 3.36 / 4 = 0.84

    assert macro_iou == pytest.approx(0.86, rel=1e-4)
    assert micro_iou == pytest.approx(0.84, rel=1e-4)
    # Both are mathematically valid, well-defined metrics; macro weights frames equally, micro weights boxes equally.
