import os
import json
import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import Response

from app.services.evaluation_service import evaluation_service
from app.services.inference_scheduler import fair_inference_scheduler
from pydantic import BaseModel, Field

class AdaptivePolicyUpdate(BaseModel):
    policy: Optional[str] = Field(None, description="Scheduling policy: 'round_robin' or 'adaptive_risk'")
    max_pending_age_sec: Optional[float] = Field(None, ge=0.5, le=10.0, description="Max age of pending frames in seconds before dropping")

logger = logging.getLogger("crowdguard.benchmark_api")

router = APIRouter()


@router.get("/adaptive-policy")
def get_adaptive_policy():
    """
    Returns current adaptive inference scheduler policy, max pending age, and scheduler status.
    """
    return {
        "active_policy": fair_inference_scheduler.get_policy(),
        "max_pending_age_sec": fair_inference_scheduler.get_max_pending_age(),
        "status": fair_inference_scheduler.get_status()
    }


@router.post("/adaptive-policy")
def update_adaptive_policy(update: AdaptivePolicyUpdate):
    """
    Updates adaptive inference scheduler policy ('round_robin' or 'adaptive_risk')
    and/or max pending frame age in seconds.
    """
    if update.policy:
        if update.policy not in ("round_robin", "adaptive_risk"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid policy '{update.policy}'. Allowed policies: 'round_robin', 'adaptive_risk'"
            )
        fair_inference_scheduler.set_policy(update.policy)

    if update.max_pending_age_sec is not None:
        fair_inference_scheduler.set_max_pending_age(update.max_pending_age_sec)

    return {
        "status": "success",
        "active_policy": fair_inference_scheduler.get_policy(),
        "max_pending_age_sec": fair_inference_scheduler.get_max_pending_age(),
        "scheduler_status": fair_inference_scheduler.get_status()
    }


@router.get("/adaptive-report")
def get_adaptive_report():
    """
    Returns the comprehensive Phase 4.7 Adaptive Inference & Crowd Monitoring Reliability report:
    - Ground-truth IoU discrepancy resolution (Macro 93.81% vs Micro 93.08% vs documentation typo 78.4%)
    - Empirical bottleneck profiling breakdown across DIP and CNN stages
    - Adaptive fairness and starvation prevention contract
    - Freshness, timestamp contracts, and staleness alert specifications
    """
    try:
        return evaluation_service.get_adaptive_inference_report()
    except Exception as e:
        logger.exception("Failed to build adaptive inference report")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Adaptive report generation failed: {str(e)}"
        )


@router.get("/dataset")
def get_evaluation_dataset():
    """
    Returns the evaluation dataset metadata, annotation conventions, and annotated frame manifest.
    """
    try:
        return evaluation_service.load_manifest()
    except Exception as e:
        logger.exception("Failed to load evaluation dataset manifest")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load dataset: {str(e)}"
        )


@router.get("/accuracy")
def get_detection_accuracy(
    conf_threshold: float = Query(0.30, ge=0.05, le=0.95),
    iou_threshold: float = Query(0.50, ge=0.10, le=0.90)
):
    """
    Evaluates detector performance against the ground-truth annotated dataset.
    Calculates TP, FP, FN, Precision, Recall, F1 score, mean IoU, and category breakdown.
    Also returns confidence threshold sweep.
    """
    try:
        accuracy_results = evaluation_service.evaluate_detection_accuracy(
            conf_threshold=conf_threshold,
            iou_threshold=iou_threshold
        )
        sweep_results = evaluation_service.evaluate_confidence_sweep(iou_threshold=iou_threshold)

        return {
            "evaluation_type": "Ground-Truth Verification",
            "accuracy": accuracy_results,
            "confidence_sweep": sweep_results
        }
    except Exception as e:
        logger.exception("Error evaluating detection accuracy")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Accuracy evaluation failed: {str(e)}"
        )


@router.get("/risk-validation")
def get_risk_model_validation():
    """
    Executes controlled scenario evaluations on CrowdRiskEngine.
    Validates empty scene, sparse flow, clustering, motion surge, missing telemetry, and camera isolation.
    """
    try:
        return evaluation_service.validate_heuristic_risk_scenarios()
    except Exception as e:
        logger.exception("Error executing risk model validation")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Risk validation failed: {str(e)}"
        )


@router.get("/performance")
def get_performance_benchmark():
    """
    Retrieves the latest multi-camera scalability benchmark results (1, 2, 3, 4 cameras).
    """
    report = evaluation_service.get_latest_benchmark_report()
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No benchmark run found. Trigger a benchmark run first."
        )
    return report


@router.post("/run-performance")
def run_performance_benchmark(
    max_cameras: int = Query(4, ge=1, le=4),
    duration_sec: float = Query(5.0, ge=2.0, le=15.0)
):
    """
    Triggers an active multi-camera performance benchmark across 1 to max_cameras.
    Measures Capture FPS, Inference FPS, Latency (mean, p50, p95), CPU%, and Memory RSS.
    """
    try:
        return evaluation_service.run_multicamera_benchmark(
            max_cameras=max_cameras,
            sample_duration_sec=duration_sec
        )
    except Exception as e:
        logger.exception("Error running multi-camera performance benchmark")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Benchmark execution failed: {str(e)}"
        )


@router.get("/sustained")
def get_sustained_benchmark():
    """
    Retrieves the latest Phase 4.6.2 sustained performance validation report.
    """
    report = evaluation_service.get_latest_sustained_benchmark_report()
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No sustained benchmark run found. Trigger a sustained benchmark run first."
        )
    return report


@router.post("/run-sustained")
def run_sustained_benchmark(
    max_cameras: int = Query(4, ge=1, le=4),
    measurement_duration_sec: float = Query(60.0, ge=5.0, le=600.0),
    warmup_duration_sec: float = Query(10.0, ge=1.0, le=60.0),
):
    """
    Triggers an active sustained multi-camera benchmark across 1 to max_cameras.
    Features configurable warm-up, monotonic timing, differential frame accounting,
    mathematical throughput agreement check, latency distributions, and CPU/memory trends.
    """
    try:
        return evaluation_service.run_sustained_benchmark(
            max_cameras=max_cameras,
            warmup_duration_sec=warmup_duration_sec,
            measurement_duration_sec=measurement_duration_sec
        )
    except Exception as e:
        logger.exception("Error running sustained multi-camera performance benchmark")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Sustained benchmark execution failed: {str(e)}"
        )


@router.get("/experiments")
def get_optimization_experiments():
    """
    Returns the comprehensive Phase 4.6 Optimization Experiment report:
    - Side-by-side Baseline vs Optimized Scaling (1, 2, 3, 4 streams)
    - Ground-Truth Accuracy Verification (0% degradation)
    - Bottleneck Profiling Breakdown
    - System & Environment Details
    - Scientific Disclaimers & Validation Limitations
    """
    try:
        return evaluation_service.get_optimization_experiment_report()
    except Exception as e:
        logger.exception("Failed to build optimization experiment report")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Experiment report generation failed: {str(e)}"
        )


@router.get("/profiling")
def get_profiling_breakdown():
    """
    Returns empirical component latency profiling breakdown (ms per frame).
    """
    try:
        return evaluation_service.get_profiling_breakdown()
    except Exception as e:
        logger.exception("Failed to retrieve profiling breakdown")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Profiling retrieval failed: {str(e)}"
        )


@router.get("/dataset-validation")
def get_dataset_validation():
    """
    Validates the dataset manifest bounding boxes, dimensions, and subgroup sample counts.
    """
    try:
        return evaluation_service.validate_dataset_manifest()
    except Exception as e:
        logger.exception("Failed to validate dataset manifest")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Dataset validation failed: {str(e)}"
        )


@router.post("/run-optimization-comparison")
def run_optimization_comparison(
    max_cameras: int = Query(4, ge=1, le=4),
    duration_sec: float = Query(4.0, ge=2.0, le=10.0)
):
    """
    Executes a fresh multi-camera benchmark and returns the updated before-vs-after experiment report.
    """
    try:
        _ = evaluation_service.run_multicamera_benchmark(
            max_cameras=max_cameras,
            sample_duration_sec=duration_sec
        )
        return evaluation_service.get_optimization_experiment_report()
    except Exception as e:
        logger.exception("Error running optimization comparison benchmark")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Comparison execution failed: {str(e)}"
        )


@router.get("/export")
def export_evaluation_report():
    """
    Exports complete system benchmark report (accuracy metrics, scalability benchmarks,
    risk validation, optimization experiments, and environment metadata) as formatted JSON.
    """
    try:
        accuracy = evaluation_service.evaluate_detection_accuracy(conf_threshold=0.30)
        sweep = evaluation_service.evaluate_confidence_sweep()
        risk = evaluation_service.validate_heuristic_risk_scenarios()
        perf = evaluation_service.get_latest_benchmark_report()
        experiments = evaluation_service.get_optimization_experiment_report()

        export_data = {
            "title": "CROWDGUARD v2.0 - Detection Accuracy, Performance, Risk Validation & Adaptive Inference Report",
            "version": "4.7.0",
            "export_timestamp": evaluation_service.load_manifest().get("created_at"),
            "detection_accuracy": accuracy,
            "confidence_sweep": sweep,
            "risk_validation": risk,
            "runtime_performance": perf,
            "sustained_performance": evaluation_service.get_latest_sustained_benchmark_report(),
            "optimization_experiments": experiments,
            "adaptive_inference": evaluation_service.get_adaptive_inference_report()
        }

        json_bytes = json.dumps(export_data, indent=2).encode("utf-8")
        return Response(
            content=json_bytes,
            media_type="application/json",
            headers={
                "Content-Disposition": "attachment; filename=crowdguard_benchmark_report.json"
            }
        )
    except Exception as e:
        logger.exception("Failed to export evaluation report")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Export failed: {str(e)}"
        )
