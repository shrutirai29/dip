import os
import json
import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import Response

from app.services.evaluation_service import evaluation_service

logger = logging.getLogger("crowdguard.benchmark_api")

router = APIRouter()


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
    Measures Capture FPS, Inference FPS, Latency, CPU%, and Memory RSS.
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


@router.get("/export")
def export_evaluation_report():
    """
    Exports complete system benchmark report (accuracy metrics, scalability benchmarks,
    risk validation, and environment metadata) as formatted JSON.
    """
    try:
        accuracy = evaluation_service.evaluate_detection_accuracy(conf_threshold=0.30)
        sweep = evaluation_service.evaluate_confidence_sweep()
        risk = evaluation_service.validate_heuristic_risk_scenarios()
        perf = evaluation_service.get_latest_benchmark_report()

        export_data = {
            "title": "CROWDGUARD v2.0 - Detection Accuracy, Performance & Risk Validation Report",
            "version": "4.5.0",
            "export_timestamp": evaluation_service.load_manifest().get("created_at"),
            "detection_accuracy": accuracy,
            "confidence_sweep": sweep,
            "risk_validation": risk,
            "runtime_performance": perf
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
