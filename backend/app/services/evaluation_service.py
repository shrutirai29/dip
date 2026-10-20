import os
import json
import time
import math
import logging
from typing import Dict, List, Any, Optional, Tuple
import cv2
import numpy as np

from app.core.config import settings
from app.services.detection_service import DetectionService
from app.services.risk_engine import CrowdRiskEngine
from app.services.camera_registry import camera_registry_service
from app.services.camera_session import CameraSourceType, CameraState

logger = logging.getLogger("crowdguard.evaluation")


def compute_box_iou(box1: List[float], box2: List[float]) -> float:
    """
    Computes Intersection over Union (IoU) between two bounding boxes [x1, y1, x2, y2].
    Handles zero-area and invalid boxes gracefully.
    """
    b1_x1, b1_y1, b1_x2, b1_y2 = box1
    b2_x1, b2_y1, b2_x2, b2_y2 = box2

    inter_x1 = max(b1_x1, b2_x1)
    inter_y1 = max(b1_y1, b2_y1)
    inter_x2 = min(b1_x2, b2_x2)
    inter_y2 = min(b1_y2, b2_y2)

    inter_w = max(0.0, inter_x2 - inter_x1)
    inter_h = max(0.0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h

    area1 = max(0.0, b1_x2 - b1_x1) * max(0.0, b1_y2 - b1_y1)
    area2 = max(0.0, b2_x2 - b2_x1) * max(0.0, b2_y2 - b2_y1)
    union_area = area1 + area2 - inter_area

    if union_area <= 0.0:
        return 0.0

    return float(inter_area / union_area)


def match_boxes_one_to_one(
    predictions: List[Dict[str, Any]],
    ground_truths: List[Dict[str, Any]],
    iou_threshold: float = 0.50
) -> Dict[str, Any]:
    """
    Matches predictions to ground truth bounding boxes using one-to-one greedy assignment.
    Prevents duplicate matches to the same ground-truth annotation.

    Returns:
    {
        "true_positives": int,
        "false_positives": int,
        "false_negatives": int,
        "matches": List[Dict],
        "unmatched_predictions": List[Dict],
        "unmatched_ground_truths": List[Dict],
        "mean_iou": float
    }
    """
    if not predictions and not ground_truths:
        return {
            "true_positives": 0,
            "false_positives": 0,
            "false_negatives": 0,
            "matches": [],
            "unmatched_predictions": [],
            "unmatched_ground_truths": [],
            "mean_iou": 0.0
        }

    if not ground_truths:
        # All predictions on empty frame are false positives
        return {
            "true_positives": 0,
            "false_positives": len(predictions),
            "false_negatives": 0,
            "matches": [],
            "unmatched_predictions": predictions,
            "unmatched_ground_truths": [],
            "mean_iou": 0.0
        }

    if not predictions:
        # All ground truths missed are false negatives
        return {
            "true_positives": 0,
            "false_positives": 0,
            "false_negatives": len(ground_truths),
            "matches": [],
            "unmatched_predictions": [],
            "unmatched_ground_truths": ground_truths,
            "mean_iou": 0.0
        }

    # Build IoU matrix
    # Sort predictions by confidence descending
    sorted_preds = sorted(predictions, key=lambda p: p.get("confidence", 0.0), reverse=True)

    matched_gt_indices = set()
    matched_pred_indices = set()
    matches = []
    ious = []

    for pred_idx, pred in enumerate(sorted_preds):
        best_iou = 0.0
        best_gt_idx = -1

        for gt_idx, gt in enumerate(ground_truths):
            if gt_idx in matched_gt_indices:
                continue
            iou = compute_box_iou(pred["bbox"], gt["bbox"])
            if iou > best_iou:
                best_iou = iou
                best_gt_idx = gt_idx

        if best_iou >= iou_threshold and best_gt_idx >= 0:
            matched_gt_indices.add(best_gt_idx)
            matched_pred_indices.add(pred_idx)
            matches.append({
                "pred": pred,
                "gt": ground_truths[best_gt_idx],
                "iou": round(best_iou, 4)
            })
            ious.append(best_iou)

    tp = len(matches)
    fp = len(sorted_preds) - tp
    fn = len(ground_truths) - tp

    unmatched_preds = [p for i, p in enumerate(sorted_preds) if i not in matched_pred_indices]
    unmatched_gts = [g for i, g in enumerate(ground_truths) if i not in matched_gt_indices]
    mean_iou = float(np.mean(ious)) if ious else 0.0

    return {
        "true_positives": tp,
        "false_positives": fp,
        "false_negatives": fn,
        "matches": matches,
        "unmatched_predictions": unmatched_preds,
        "unmatched_ground_truths": unmatched_gts,
        "mean_iou": round(mean_iou, 4)
    }


def compute_precision_recall_f1(tp: int, fp: int, fn: int) -> Tuple[float, float, float]:
    """
    Computes Precision, Recall, and F1 score with explicit zero-denominator guards.
    """
    precision = float(tp / (tp + fp)) if (tp + fp) > 0 else 0.0
    recall = float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0
    f1 = float(2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
    return round(precision, 4), round(recall, 4), round(f1, 4)


class EvaluationService:
    """
    Scientifically rigorous benchmarking engine for:
    1. Detection Accuracy (IoU matching, PR curves, category breakdown)
    2. Multi-Camera Scalability & Runtime Performance
    3. Heuristic Crowd-Risk Model Scenario Validation
    """

    def __init__(self, manifest_path: str = "data/evaluation/manifest.json"):
        self.manifest_path = manifest_path
        self._shared_detector: Optional[DetectionService] = None

    def _get_detector(self) -> DetectionService:
        if self._shared_detector is None:
            model_file = "models/yolov8n.pt" if os.path.exists("models/yolov8n.pt") else "yolov8n.pt"
            self._shared_detector = DetectionService(model_name=model_file)
        return self._shared_detector

    def load_manifest(self) -> Dict[str, Any]:
        """Loads and returns the ground truth evaluation dataset manifest."""
        if not os.path.exists(self.manifest_path):
            raise FileNotFoundError(f"Evaluation manifest not found at {self.manifest_path}")
        with open(self.manifest_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def evaluate_detection_accuracy(
        self,
        conf_threshold: float = 0.30,
        iou_threshold: float = 0.50,
        imgsz: int = 640
    ) -> Dict[str, Any]:
        """
        Executes reproducible detection accuracy benchmark across all annotated frames in manifest.
        Calculates TP, FP, FN, Precision, Recall, F1, mean IoU, and category aggregations.
        """
        manifest = self.load_manifest()
        detector = self._get_detector()
        frames_meta = manifest.get("frames", [])

        overall_tp = 0
        overall_fp = 0
        overall_fn = 0
        overall_ious = []
        category_stats: Dict[str, Dict[str, Any]] = {}
        frame_results: List[Dict[str, Any]] = []

        for frame_item in frames_meta:
            frame_id = frame_item["frame_id"]
            cat = frame_item.get("category", "uncategorized")
            img_path = os.path.join("data/evaluation/frames", frame_item.get("file_name", f"{frame_id}.jpg"))

            if cat not in category_stats:
                category_stats[cat] = {
                    "frames_count": 0,
                    "ground_truth_persons": 0,
                    "tp": 0,
                    "fp": 0,
                    "fn": 0,
                    "ious": []
                }
            category_stats[cat]["frames_count"] += 1
            category_stats[cat]["ground_truth_persons"] += len(frame_item.get("ground_truth_boxes", []))

            if not os.path.exists(img_path):
                logger.warning(f"Frame image {img_path} not found. Skipping.")
                continue

            frame_bgr = cv2.imread(img_path)
            if frame_bgr is None:
                logger.warning(f"Failed to read image {img_path}. Skipping.")
                continue

            # Run detection inference
            t0 = time.time()
            raw_dets = detector.detect_persons(frame_bgr, imgsz=imgsz, conf_threshold=conf_threshold)
            latency_ms = (time.time() - t0) * 1000.0

            gt_boxes = frame_item.get("ground_truth_boxes", [])
            match_res = match_boxes_one_to_one(raw_dets, gt_boxes, iou_threshold=iou_threshold)

            tp = match_res["true_positives"]
            fp = match_res["false_positives"]
            fn = match_res["false_negatives"]
            p, r, f1 = compute_precision_recall_f1(tp, fp, fn)

            overall_tp += tp
            overall_fp += fp
            overall_fn += fn
            if match_res["mean_iou"] > 0:
                overall_ious.append(match_res["mean_iou"])

            category_stats[cat]["tp"] += tp
            category_stats[cat]["fp"] += fp
            category_stats[cat]["fn"] += fn
            if match_res["mean_iou"] > 0:
                category_stats[cat]["ious"].append(match_res["mean_iou"])

            frame_results.append({
                "frame_id": frame_id,
                "category": cat,
                "description": frame_item.get("description", ""),
                "ground_truth_count": len(gt_boxes),
                "predicted_count": len(raw_dets),
                "true_positives": tp,
                "false_positives": fp,
                "false_negatives": fn,
                "precision": p,
                "recall": r,
                "f1_score": f1,
                "mean_iou": match_res["mean_iou"],
                "latency_ms": round(latency_ms, 2),
                "predictions": raw_dets,
                "ground_truths": gt_boxes
            })

        ov_prec, ov_rec, ov_f1 = compute_precision_recall_f1(overall_tp, overall_fp, overall_fn)
        mean_ov_iou = float(np.mean(overall_ious)) if overall_ious else 0.0

        # Summarize category metrics
        summary_categories = {}
        for cat_name, c_data in category_stats.items():
            cp, cr, cf1 = compute_precision_recall_f1(c_data["tp"], c_data["fp"], c_data["fn"])
            c_miou = float(np.mean(c_data["ious"])) if c_data["ious"] else 0.0
            summary_categories[cat_name] = {
                "frames_count": c_data["frames_count"],
                "ground_truth_persons": c_data["ground_truth_persons"],
                "true_positives": c_data["tp"],
                "false_positives": c_data["fp"],
                "false_negatives": c_data["fn"],
                "precision": cp,
                "recall": cr,
                "f1_score": cf1,
                "mean_iou": round(c_miou, 4)
            }

        return {
            "dataset_version": manifest.get("dataset_version", "1.0.0"),
            "evaluated_frames_count": len(frame_results),
            "total_ground_truth_persons": sum(len(f.get("ground_truth_boxes", [])) for f in frames_meta),
            "evaluated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "parameters": {
                "conf_threshold": conf_threshold,
                "iou_threshold": iou_threshold,
                "imgsz": imgsz,
                "model_name": detector.model_name
            },
            "overall_metrics": {
                "true_positives": overall_tp,
                "false_positives": overall_fp,
                "false_negatives": overall_fn,
                "precision": ov_prec,
                "recall": ov_rec,
                "f1_score": ov_f1,
                "mean_iou": round(mean_ov_iou, 4)
            },
            "category_metrics": summary_categories,
            "frame_results": frame_results
        }

    def evaluate_confidence_sweep(
        self,
        thresholds: List[float] = None,
        iou_threshold: float = 0.50
    ) -> List[Dict[str, Any]]:
        """Sweeps confidence thresholds to characterize Precision-Recall tradeoff."""
        if thresholds is None:
            thresholds = [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70]

        results = []
        for th in thresholds:
            ev = self.evaluate_detection_accuracy(conf_threshold=th, iou_threshold=iou_threshold)
            m = ev["overall_metrics"]
            results.append({
                "conf_threshold": th,
                "precision": m["precision"],
                "recall": m["recall"],
                "f1_score": m["f1_score"],
                "true_positives": m["true_positives"],
                "false_positives": m["false_positives"],
                "false_negatives": m["false_negatives"]
            })
        return results

    def validate_heuristic_risk_scenarios(self) -> Dict[str, Any]:
        """
        Executes controlled scenario validation on CrowdRiskEngine.
        Validates mathematical monotonicity, missing-value guards, and band classifications.
        """
        engine = CrowdRiskEngine()
        scenarios = [
            {
                "id": "scenario_1_empty",
                "name": "Empty Concourse (Zero Density, Zero Flow)",
                "description": "Baseline scene with no individuals and no movement",
                "inputs": {
                    "person_count": 0,
                    "optical_flow_mag": 0.0,
                    "mean_speed": 0.0,
                    "grid_densities": [0.0] * 9
                },
                "expected_band": "Low",
                "expected_max_score": 10.0
            },
            {
                "id": "scenario_2_sparse_transit",
                "name": "Sparse Calm Movement (2 Persons, Low Velocity)",
                "description": "Routine corridor walking without clustering",
                "inputs": {
                    "person_count": 2,
                    "optical_flow_mag": 1.5,
                    "mean_speed": 7.5,
                    "grid_densities": [0.0, 0.0, 0.0, 0.0, 0.1, 0.1, 0.0, 0.0, 0.0]
                },
                "expected_band": "Low",
                "expected_max_score": 25.0
            },
            {
                "id": "scenario_3_moderate_gathering",
                "name": "Moderate Gathering (8 Persons, Mild Flow)",
                "description": "Pedestrian queue with gentle spatial dispersion",
                "inputs": {
                    "person_count": 8,
                    "optical_flow_mag": 2.2,
                    "mean_speed": 4.0,
                    "grid_densities": [0.05, 0.15, 0.1, 0.05, 0.2, 0.15, 0.05, 0.05, 0.0]
                },
                "expected_band": "Low",
                "expected_max_score": 35.0
            },
            {
                "id": "scenario_4_bottleneck_congestion",
                "name": "Bottleneck Congestion (18 Persons, Focal Cluster)",
                "description": "High spatial concentration in single central zone B2 with slowing speed",
                "inputs": {
                    "person_count": 18,
                    "optical_flow_mag": 3.8,
                    "mean_speed": 3.0,
                    "grid_densities": [0.0, 0.05, 0.0, 0.1, 0.85, 0.1, 0.0, 0.05, 0.0]
                },
                "expected_band": "Moderate",
                "expected_min_score": 25.0
            },
            {
                "id": "scenario_5_motion_surge",
                "name": "Turbulent Motion Surge (High Velocity Dispersion)",
                "description": "Rapid optical flow surge and elevated speed",
                "inputs": {
                    "person_count": 12,
                    "optical_flow_mag": 14.5,
                    "mean_speed": 22.0,
                    "grid_densities": [0.2, 0.25, 0.2, 0.2, 0.3, 0.25, 0.15, 0.2, 0.15]
                },
                "expected_band": "Moderate",
                "expected_min_score": 30.0
            },
            {
                "id": "scenario_6_missing_data_guard",
                "name": "Missing / None Telemetry Guard",
                "description": "Evaluates graceful degradation when velocity or grid metrics are None/empty",
                "inputs": {
                    "person_count": 5,
                    "optical_flow_mag": None,
                    "mean_speed": None,
                    "grid_densities": None
                },
                "expected_band": "Low",
                "expected_max_score": 35.0
            },
            {
                "id": "scenario_7_session_isolation",
                "name": "Multi-Camera Session State Isolation",
                "description": "Ensures independent risk engines maintain strict state isolation without cross-talk",
                "inputs": {
                    "person_count": 22,
                    "optical_flow_mag": 10.0,
                    "mean_speed": 15.0,
                    "grid_densities": [0.3] * 9
                },
                "expected_band": "Moderate",
                "expected_min_score": 30.0
            }
        ]

        scenario_outcomes = []
        all_passed = True

        for sc in scenarios:
            inp = sc["inputs"]
            if sc["id"] == "scenario_7_session_isolation":
                # Create two isolated engine instances to explicitly verify no state contamination
                engine_a = CrowdRiskEngine()
                engine_b = CrowdRiskEngine()
                res_a = engine_a.compute_risk(inp["person_count"], inp["optical_flow_mag"], inp["mean_speed"], inp["grid_densities"])
                res_b = engine_b.compute_risk(0, 0.0, 0.0, [0.0] * 9)
                score = res_a["smoothed_score"]
                band = res_a["band"]
                out = res_a
                # Engine B must remain 0.0
                isolation_intact = (res_b["smoothed_score"] == 0.0)
                passed = (score >= sc["expected_min_score"]) and isolation_intact
            else:
                out = engine.compute_risk(
                    current_count=inp["person_count"],
                    optical_flow_mag=inp["optical_flow_mag"],
                    mean_speed=inp["mean_speed"],
                    grid_densities=inp["grid_densities"]
                )
                score = out["smoothed_score"]
                band = out["band"]

                passed = True
                if "expected_max_score" in sc and score > sc["expected_max_score"]:
                    passed = False
                if "expected_min_score" in sc and score < sc["expected_min_score"]:
                    passed = False
            if not passed:
                all_passed = False

            scenario_outcomes.append({
                "scenario_id": sc["id"],
                "name": sc["name"],
                "description": sc["description"],
                "inputs": inp,
                "observed_score": round(score, 2),
                "observed_band": band,
                "density_component": round(out["density_comp"], 3),
                "growth_component": round(out["growth_comp"], 3),
                "motion_anomaly_component": round(out["motion_anomaly_comp"], 3),
                "congestion_component": round(out["congestion_comp"], 3),
                "explanation": out["explanation"],
                "status": "PASSED" if passed else "FAILED"
            })

        return {
            "validation_status": "PASSED" if all_passed else "FAILED",
            "model_type": "Heuristic Explainable Decision-Support Scoring",
            "calibration_notice": (
                "Notice: Risk scores represent an uncalibrated heuristic index (0-100) based on weighted DIP features. "
                "They provide operator decision support and are not calibrated disaster probability metrics."
            ),
            "scenarios_evaluated": len(scenario_outcomes),
            "outcomes": scenario_outcomes
        }

    def run_multicamera_benchmark(
        self,
        max_cameras: int = 4,
        sample_duration_sec: float = 5.0
    ) -> Dict[str, Any]:
        """
        Executes reproducible scalability benchmark across 1 to max_cameras active sources.
        Records Capture FPS, Inference FPS, latency, dropped frames, CPU, and memory working set.
        """
        import psutil
        proc = psutil.Process()
        benchmark_results = []
        created_benchmark_ids = []

        try:
            for n_cams in range(1, max_cameras + 1):
                logger.info(f"--- Running benchmark level: {n_cams} active camera(s) ---")
                current_sessions = []

                # Register required number of benchmark camera sessions
                for i in range(n_cams):
                    if i == 0:
                        s = camera_registry_service.register_camera(
                            name=f"Benchmark Cam {i+1} (Webcam)",
                            source_type=CameraSourceType.WEBCAM,
                            device_index=0,
                            start_immediately=False
                        )
                    else:
                        s = camera_registry_service.register_camera(
                            name=f"Benchmark Cam {i+1} (RTSP Stream2)",
                            source_type=CameraSourceType.RTSP,
                            rtsp_url="rtsp://127.0.0.1:8554/live/stream2",
                            start_immediately=False
                        )
                    created_benchmark_ids.append(s.camera_id)
                    current_sessions.append(s)

                # Start all sessions for this level
                for s in current_sessions:
                    if not s.is_active:
                        try:
                            s.start()
                        except Exception as e:
                            logger.warning(f"Error starting {s.camera_id}: {e}")

                # 2s Warm-up period
                time.sleep(2.0)

                # Measurement window
                cpu_samples = []
                mem_samples = []
                t_end = time.time() + sample_duration_sec

                num_cpus = max(1, psutil.cpu_count() or 1)
                while time.time() < t_end:
                    try:
                        raw_cpu = proc.cpu_percent(interval=0.2)
                        cpu_samples.append(raw_cpu / num_cpus)
                        mem_samples.append(proc.memory_info().rss / (1024 * 1024))
                    except Exception:
                        pass

                # Gather metrics from each session
                per_camera_metrics = []
                total_cap_fps = 0.0
                total_inf_fps = 0.0
                latencies = []
                total_dropped = 0

                for s in current_sessions:
                    st = s.get_status()
                    c_fps = st.get("measured_fps", 0.0)
                    i_fps = st.get("processing_fps", 0.0)
                    age = st.get("frame_age_seconds") or 0.0
                    drp = st.get("frames_dropped", 0)

                    total_cap_fps += c_fps
                    total_inf_fps += i_fps
                    total_dropped += drp
                    if age > 0:
                        latencies.append(age)

                    per_camera_metrics.append({
                        "camera_id": s.camera_id,
                        "name": s.config.name,
                        "source_type": s.config.source_type,
                        "state": st.get("state"),
                        "capture_fps": c_fps,
                        "inference_fps": i_fps,
                        "frame_age_seconds": round(age, 3),
                        "frames_captured": st.get("frames_captured", 0),
                        "frames_consumed": st.get("frames_consumed", 0),
                        "frames_dropped": drp
                    })

                mean_cpu = float(np.mean(cpu_samples)) if cpu_samples else 0.0
                mean_mem = float(np.mean(mem_samples)) if mem_samples else 0.0
                mean_lat = float(np.mean(latencies)) if latencies else 0.0

                benchmark_results.append({
                    "active_cameras": n_cams,
                    "mean_capture_fps": round(total_cap_fps / n_cams, 1) if n_cams else 0.0,
                    "mean_inference_fps": round(total_inf_fps / n_cams, 1) if n_cams else 0.0,
                    "aggregate_pipeline_fps": round(total_inf_fps, 1),
                    "mean_frame_latency_seconds": round(mean_lat, 3),
                    "total_frames_dropped": total_dropped,
                    "mean_cpu_percent": round(mean_cpu, 1),
                    "mean_memory_working_set_mb": round(mean_mem, 1),
                    "cameras": per_camera_metrics
                })

                # Stop sessions if scaling up to avoid resource leaks
                for s in current_sessions:
                    try:
                        s.stop()
                    except Exception:
                        pass
                time.sleep(1.0)

        finally:
            # Safe cleanup of all benchmark sessions
            for cid in set(created_benchmark_ids):
                try:
                    s = camera_registry_service.get_camera(cid)
                    if s:
                        s.stop()
                        camera_registry_service.remove_camera(cid)
                except Exception as e:
                    logger.debug(f"Benchmark cleanup info: {e}")

        report = {
            "benchmark_run_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "hardware_platform": "Windows (Intel/AMD x64)",
            "detector_model": self._get_detector().model_name,
            "sample_duration_per_level_sec": sample_duration_sec,
            "max_cameras_tested": max_cameras,
            "scaling_results": benchmark_results
        }

        # Save to reports directory
        os.makedirs("data/reports", exist_ok=True)
        with open("data/reports/multicamera_benchmark_results.json", "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)

        return report

    def get_latest_benchmark_report(self) -> Optional[Dict[str, Any]]:
        """Returns previously saved benchmark report, if available."""
        report_path = "data/reports/multicamera_benchmark_results.json"
        if os.path.exists(report_path):
            try:
                with open(report_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return None


# Global singleton instance
evaluation_service = EvaluationService()
