import pytest
import os
import json
from fastapi.testclient import TestClient

from app.main import app
from app.services.evaluation_service import (
    compute_box_iou,
    match_boxes_one_to_one,
    compute_precision_recall_f1,
    evaluation_service
)
from app.services.risk_engine import CrowdRiskEngine

client = TestClient(app)


# ---------------------------------------------------------------------------
# 1. Unit Tests for Detection Metrics and Box IoU
# ---------------------------------------------------------------------------

def test_box_iou_perfect_overlap():
    box1 = [10.0, 10.0, 50.0, 50.0]
    box2 = [10.0, 10.0, 50.0, 50.0]
    iou = compute_box_iou(box1, box2)
    assert abs(iou - 1.0) < 1e-4


def test_box_iou_disjoint():
    box1 = [0.0, 0.0, 10.0, 10.0]
    box2 = [20.0, 20.0, 30.0, 30.0]
    iou = compute_box_iou(box1, box2)
    assert iou == 0.0


def test_box_iou_partial_overlap():
    # Box 1: 0 to 10 x 0 to 10 (area 100)
    # Box 2: 5 to 15 x 0 to 10 (area 100)
    # Intersection: 5 to 10 x 0 to 10 (area 50)
    # Union: 100 + 100 - 50 = 150
    # Expected IoU: 50 / 150 = 1/3 ~ 0.3333
    box1 = [0.0, 0.0, 10.0, 10.0]
    box2 = [5.0, 0.0, 15.0, 10.0]
    iou = compute_box_iou(box1, box2)
    assert abs(iou - (1.0 / 3.0)) < 1e-3


def test_box_iou_zero_area_guard():
    box1 = [10.0, 10.0, 10.0, 10.0] # zero area
    box2 = [10.0, 10.0, 20.0, 20.0]
    assert compute_box_iou(box1, box2) == 0.0


def test_precision_recall_f1_zero_division():
    # Zero detections and zero ground truths
    p, r, f1 = compute_precision_recall_f1(tp=0, fp=0, fn=0)
    assert p == 0.0 and r == 0.0 and f1 == 0.0

    # True positives only
    p, r, f1 = compute_precision_recall_f1(tp=10, fp=0, fn=0)
    assert p == 1.0 and r == 1.0 and f1 == 1.0

    # True positives with false positives and false negatives
    p, r, f1 = compute_precision_recall_f1(tp=8, fp=2, fn=2)
    assert p == 0.8 and r == 0.8 and f1 == 0.8


def test_match_boxes_one_to_one_greedy():
    # 2 Ground Truths
    gts = [
        {"bbox": [10, 10, 50, 50], "class_name": "person"},
        {"bbox": [100, 100, 150, 150], "class_name": "person"}
    ]
    # 3 Predictions: 2 match GTs, 1 is a duplicate predicting the same person, 1 is in empty space
    preds = [
        {"bbox": [12, 12, 48, 48], "confidence": 0.95}, # Matches GT 0
        {"bbox": [10, 10, 50, 50], "confidence": 0.80}, # Duplicate for GT 0 (must NOT double match)
        {"bbox": [102, 98, 148, 152], "confidence": 0.90}, # Matches GT 1
        {"bbox": [300, 300, 350, 350], "confidence": 0.85}  # Unmatched FP
    ]

    result = match_boxes_one_to_one(preds, gts, iou_threshold=0.50)
    assert result["true_positives"] == 2
    assert result["false_positives"] == 2
    assert result["false_negatives"] == 0
    assert result["mean_iou"] > 0.80
    assert len(result["matches"]) == 2


def test_match_boxes_empty_ground_truth():
    preds = [{"bbox": [10, 10, 50, 50], "confidence": 0.90}]
    gts = []
    res = match_boxes_one_to_one(preds, gts)
    assert res["true_positives"] == 0
    assert res["false_positives"] == 1
    assert res["false_negatives"] == 0


def test_match_boxes_empty_predictions():
    preds = []
    gts = [{"bbox": [10, 10, 50, 50], "class_name": "person"}]
    res = match_boxes_one_to_one(preds, gts)
    assert res["true_positives"] == 0
    assert res["false_positives"] == 0
    assert res["false_negatives"] == 1


# ---------------------------------------------------------------------------
# 2. Evaluation Manifest & Dataset Tests
# ---------------------------------------------------------------------------

def test_evaluation_manifest_structure():
    manifest = evaluation_service.load_manifest()
    assert "dataset_version" in manifest
    assert "frames" in manifest
    assert len(manifest["frames"]) >= 10
    
    # Check that required fields exist in each frame entry
    for f in manifest["frames"]:
        assert "frame_id" in f
        assert "source_video" in f
        assert "category" in f
        assert "ground_truth_boxes" in f
        assert f["category"] in (
            "empty", "sparse", "multi_person", "dense_occluded", "synthetic_simulation"
        )


def test_detection_accuracy_evaluation():
    results = evaluation_service.evaluate_detection_accuracy(conf_threshold=0.30, iou_threshold=0.50)
    assert results["evaluated_frames_count"] >= 10
    assert "overall_metrics" in results
    m = results["overall_metrics"]
    assert 0.0 <= m["precision"] <= 1.0
    assert 0.0 <= m["recall"] <= 1.0
    assert 0.0 <= m["f1_score"] <= 1.0
    assert m["true_positives"] >= 20
    assert m["precision"] > 0.90 # High precision on real dataset


def test_confidence_threshold_sweep():
    sweep = evaluation_service.evaluate_confidence_sweep(thresholds=[0.20, 0.30, 0.50])
    assert len(sweep) == 3
    # Higher confidence threshold should monotonically non-increase recall
    r_20 = next(s["recall"] for s in sweep if s["conf_threshold"] == 0.20)
    r_50 = next(s["recall"] for s in sweep if s["conf_threshold"] == 0.50)
    assert r_20 >= r_50


# ---------------------------------------------------------------------------
# 3. Risk Engine Scenario Validation Tests
# ---------------------------------------------------------------------------

def test_risk_model_validation_scenarios():
    val = evaluation_service.validate_heuristic_risk_scenarios()
    assert val["validation_status"] == "PASSED"
    assert val["scenarios_evaluated"] == 7
    for sc in val["outcomes"]:
        assert sc["status"] == "PASSED"
        assert 0.0 <= sc["observed_score"] <= 100.0
        assert sc["observed_band"] in ("Low", "Moderate", "High", "Critical")


def test_risk_engine_session_isolation():
    engine_a = CrowdRiskEngine()
    engine_b = CrowdRiskEngine()

    # Simulate heavy influx and motion anomaly on Camera A
    for _ in range(5):
        res_a = engine_a.compute_risk(
            current_count=25,
            optical_flow_mag=12.0,
            mean_speed=18.0,
            grid_densities=[0.5] * 9
        )

    # Engine B on Camera B observes calm empty scene
    res_b = engine_b.compute_risk(
        current_count=0,
        optical_flow_mag=0.0,
        mean_speed=0.0,
        grid_densities=[0.0] * 9
    )

    assert res_a["smoothed_score"] > 30.0
    assert res_b["smoothed_score"] == 0.0 # Absolutely isolated


# ---------------------------------------------------------------------------
# 4. API Endpoints Integration Tests
# ---------------------------------------------------------------------------

def test_api_benchmark_dataset():
    response = client.get("/api/benchmark/dataset")
    assert response.status_code == 200
    data = response.json()
    assert "frames" in data
    assert len(data["frames"]) > 0


def test_api_benchmark_accuracy():
    response = client.get("/api/benchmark/accuracy?conf_threshold=0.30&iou_threshold=0.50")
    assert response.status_code == 200
    data = response.json()
    assert "accuracy" in data
    assert "confidence_sweep" in data
    assert data["accuracy"]["overall_metrics"]["f1_score"] > 0.90


def test_api_benchmark_risk_validation():
    response = client.get("/api/benchmark/risk-validation")
    assert response.status_code == 200
    data = response.json()
    assert data["validation_status"] == "PASSED"
    assert data["scenarios_evaluated"] == 7


def test_api_benchmark_performance_report():
    response = client.get("/api/benchmark/performance")
    assert response.status_code == 200
    data = response.json()
    assert "scaling_results" in data
    assert len(data["scaling_results"]) >= 2
    # Verify presence of core benchmarking metrics
    first_level = data["scaling_results"][0]
    assert "mean_capture_fps" in first_level
    assert "mean_inference_fps" in first_level
    assert "mean_cpu_percent" in first_level
    assert "mean_memory_working_set_mb" in first_level


def test_api_benchmark_export():
    response = client.get("/api/benchmark/export")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    data = response.json()
    assert "detection_accuracy" in data
    assert "runtime_performance" in data
    assert "risk_validation" in data



def test_api_benchmark_experiments():
    response = client.get("/api/benchmark/experiments")
    assert response.status_code == 200
    data = response.json()
    assert "environment" in data
    assert "optimizations_implemented" in data
    assert "baseline_scaling" in data
    assert "optimized_scaling" in data
    assert "accuracy_verification" in data
    assert data["accuracy_verification"]["precision"] >= 0.90
    assert data["accuracy_verification"]["recall"] >= 0.95


def test_api_benchmark_profiling():
    response = client.get("/api/benchmark/profiling")
    assert response.status_code == 200
    data = response.json()
    assert "components" in data
    assert len(data["components"]) >= 5
    assert "speedup_factor" in data


def test_api_benchmark_dataset_validation():
    response = client.get("/api/benchmark/dataset-validation")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "VALID"
    assert data["total_annotated_persons"] == 26
    assert "subgroup_sample_warnings" in data
    assert len(data["validation_errors"]) == 0


def test_multicamera_benchmark_metric_integrity():
    """Verify multicamera benchmark metrics schema and preservation of baseline results."""
    import os
    import json

    # Baseline file must remain immutable
    base_path = "data/reports/baseline_benchmark_results.json"
    assert os.path.exists(base_path)
    with open(base_path, "r", encoding="utf-8") as f:
        baseline_content = json.load(f)
    assert baseline_content["max_cameras_tested"] == 4
    assert len(baseline_content["scaling_results"]) > 0

    # Execute a lightweight 1-camera benchmark for 1.0 second
    rep = evaluation_service.run_multicamera_benchmark(max_cameras=1, sample_duration_sec=1.0)
    assert "scaling_results" in rep
    assert len(rep["scaling_results"]) == 1
    sr = rep["scaling_results"][0]

    # Verify separated metric definitions
    assert "mean_capture_fps" in sr
    assert "mean_inference_fps" in sr
    assert "mean_capture_to_published_ms" in sr
    assert "capture_to_published_p50_ms" in sr
    assert "capture_to_published_p95_ms" in sr
    assert "capture_failure_rate_percent" in sr
    assert "inference_coverage_percent" in sr
    assert "buffer_overwrite_rate_percent" in sr
    assert "cameras" in sr

    # Verify verification report was generated and baseline untouched
    assert os.path.exists("data/reports/verification_benchmark_results.json")
    with open(base_path, "r", encoding="utf-8") as f:
        baseline_recheck = json.load(f)
    assert baseline_recheck["benchmark_run_at"] == baseline_content["benchmark_run_at"]
