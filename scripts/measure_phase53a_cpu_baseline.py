"""
CROWDGUARD v2.0 — Phase 5.3A Reproducible CPU Inference Baseline & Pipeline Profiler
Measures real YOLOv8n CPU inference latency, full pipeline execution time, resource utilization,
and detection accuracy metrics against annotated evaluation dataset.
"""

import os
import sys
import time
import json
import hashlib
import platform
import psutil
import cv2
import torch
import numpy as np
from typing import Dict, Any, List

# Ensure backend modules are importable
sys.path.insert(0, os.path.abspath("backend"))

from app.services.detection_service import DetectionService
from app.services.tracking_service import SimpleByteTracker
from app.services.density_service import DensityService
from app.services.risk_engine import CrowdRiskEngine
from app.services.dip_service import DIPProcessor
from app.services.evaluation_service import evaluation_service


def compute_sha256(filepath: str) -> str:
    sha256_hash = hashlib.sha256()
    with open(filepath, "rb") as f:
        for byte_block in iter(lambda: f.read(65536), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest().upper()


def get_system_hardware_info() -> Dict[str, Any]:
    vm = psutil.virtual_memory()
    return {
        "os_platform": platform.platform(),
        "os_system": platform.system(),
        "os_release": platform.release(),
        "cpu_processor": platform.processor(),
        "cpu_physical_cores": psutil.cpu_count(logical=False),
        "cpu_logical_cores": psutil.cpu_count(logical=True),
        "ram_total_gb": round(vm.total / (1024 ** 3), 2),
        "ram_available_gb": round(vm.available / (1024 ** 3), 2),
        "python_version": platform.python_version(),
        "torch_version": torch.__version__,
        "cuda_available": torch.cuda.is_available(),
        "opencv_version": cv2.__version__
    }


def run_cpu_inference_baseline(
    model_path: str = "yolov8n.pt",
    manifest_path: str = "data/evaluation/manifest.json",
    num_inference_trials: int = 50,
    num_pipeline_trials: int = 30,
    imgsz: int = 640,
    conf_threshold: float = 0.25
) -> Dict[str, Any]:
    print("=" * 80)
    print("CROWDGUARD v2.0 — Phase 5.3A: CPU Inference Baseline Measurement")
    print("=" * 80)

    # 1. Hardware & System Info
    hw_info = get_system_hardware_info()
    print(f"OS Platform     : {hw_info['os_platform']}")
    print(f"CPU Processor   : {hw_info['cpu_processor']}")
    print(f"Cores           : {hw_info['cpu_physical_cores']} Physical, {hw_info['cpu_logical_cores']} Logical")
    print(f"RAM Total       : {hw_info['ram_total_gb']} GB (Available: {hw_info['ram_available_gb']} GB)")
    print(f"PyTorch Version : {hw_info['torch_version']} (CUDA: {hw_info['cuda_available']})")

    # 2. Model Integrity & Checksum
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model file not found: {model_path}")

    model_size_bytes = os.path.getsize(model_path)
    model_sha256 = compute_sha256(model_path)
    print(f"\nModel Name      : {model_path}")
    print(f"Model File Size : {model_size_bytes:,} bytes ({round(model_size_bytes / (1024*1024), 2)} MB)")
    print(f"Model SHA-256   : {model_sha256}")

    # 3. Model Loading & Cold Start Measurement
    t_load_start = time.perf_counter()
    detector = DetectionService(model_name=model_path, conf_threshold=conf_threshold)
    load_duration_ms = (time.perf_counter() - t_load_start) * 1000.0

    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    t_warm_start = time.perf_counter()
    detector.detect_persons(dummy_frame, imgsz=imgsz, conf_threshold=conf_threshold)
    cold_start_warmup_ms = (time.perf_counter() - t_warm_start) * 1000.0

    print(f"\nModel Load Time : {load_duration_ms:.2f} ms")
    print(f"Cold Start Time : {cold_start_warmup_ms:.2f} ms (First dummy inference pass)")

    # 4. Load Evaluation Frames
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest_data = json.load(f)
    frames_meta = manifest_data.get("frames", [])
    
    test_images = []
    for f_item in frames_meta:
        img_p = os.path.join("data/evaluation/frames", f_item.get("file_name", f"{f_item['frame_id']}.jpg"))
        if os.path.exists(img_p):
            bgr = cv2.imread(img_p)
            if bgr is not None:
                test_images.append((f_item["frame_id"], f_item.get("category", "unknown"), bgr))
    
    print(f"Loaded {len(test_images)} evaluation frames from {manifest_path}")

    # 5. Pure YOLO Inference Latency & Throughput Benchmark
    print(f"\nRunning {num_inference_trials} pure YOLO inference trials on natural surveillance frames...")
    natural_images = [img for fid, cat, img in test_images if "real" in fid]
    if not natural_images:
        natural_images = [img for _, _, img in test_images]

    process = psutil.Process()
    cpu_measurements = []
    inf_latencies_ms = []

    t_inf_bench_start = time.perf_counter()
    for i in range(num_inference_trials):
        img = natural_images[i % len(natural_images)]
        t0 = time.perf_counter()
        _ = detector.detect_persons(img, imgsz=imgsz, conf_threshold=conf_threshold)
        t1 = time.perf_counter()
        inf_latencies_ms.append((t1 - t0) * 1000.0)
        if i % 10 == 0:
            cpu_measurements.append(process.cpu_percent(interval=None))

    total_inf_bench_sec = time.perf_counter() - t_inf_bench_start
    inf_fps = round(len(inf_latencies_ms) / total_inf_bench_sec, 2)

    inf_stats = {
        "trials_count": len(inf_latencies_ms),
        "total_elapsed_sec": round(total_inf_bench_sec, 3),
        "throughput_fps": inf_fps,
        "latency_mean_ms": round(float(np.mean(inf_latencies_ms)), 2),
        "latency_p50_ms": round(float(np.median(inf_latencies_ms)), 2),
        "latency_p95_ms": round(float(np.percentile(inf_latencies_ms, 95)), 2),
        "latency_p99_ms": round(float(np.percentile(inf_latencies_ms, 99)), 2),
        "latency_min_ms": round(float(np.min(inf_latencies_ms)), 2),
        "latency_max_ms": round(float(np.max(inf_latencies_ms)), 2)
    }

    print(f"  Inference Throughput : {inf_stats['throughput_fps']} FPS")
    print(f"  Latency p50 / p95    : {inf_stats['latency_p50_ms']} ms / {inf_stats['latency_p95_ms']} ms")
    print(f"  Latency Min / Max    : {inf_stats['latency_min_ms']} ms / {inf_stats['latency_max_ms']} ms")

    # 6. End-to-End Pipeline Latency Benchmark (DIP + Optical Flow + YOLO + ByteTrack + Density + Risk)
    print(f"\nRunning {num_pipeline_trials} end-to-end full pipeline trials...")
    tracker = SimpleByteTracker(max_lost_frames=15, iou_threshold=0.3, min_hits=2)
    density_service = DensityService(grid_rows=3, grid_cols=3)
    risk_engine = CrowdRiskEngine()

    prev_gray = None
    pipe_latencies_ms = []
    stage_breakdowns = {
        "dip_preprocess_ms": [],
        "optical_flow_ms": [],
        "yolo_detection_ms": [],
        "bytetrack_update_ms": [],
        "density_analysis_ms": [],
        "risk_engine_ms": []
    }

    t_pipe_start = time.perf_counter()
    for i in range(num_pipeline_trials):
        frame = natural_images[i % len(natural_images)]
        h, w = frame.shape[:2]
        t_frame_start = time.perf_counter()

        # 1. DIP Preprocess
        t_dip0 = time.perf_counter()
        frame_clean = DIPProcessor.preprocess_frame(frame, apply_denoise=True)
        t_dip1 = time.perf_counter()

        # 2. Optical Flow
        t_flow0 = time.perf_counter()
        curr_gray = cv2.cvtColor(frame_clean, cv2.COLOR_BGR2GRAY)
        curr_gray_small = cv2.resize(curr_gray, (320, 240))
        flow_data = DIPProcessor.compute_optical_flow_dynamics(prev_gray, curr_gray_small)
        flow_mag = flow_data.get("mean_magnitude", 0.0)
        prev_gray = curr_gray_small
        t_flow1 = time.perf_counter()

        # 3. Detection
        t_det0 = time.perf_counter()
        detections = detector.detect_persons(frame_clean, imgsz=imgsz, conf_threshold=conf_threshold)
        t_det1 = time.perf_counter()

        # 4. Tracking
        t_trk0 = time.perf_counter()
        sim_ts = i * 0.0333
        active_tracks = tracker.update(detections, sim_ts, w, h)
        t_trk1 = time.perf_counter()

        # 5. Density
        t_den0 = time.perf_counter()
        zone_telemetry = density_service.compute_zone_telemetry(
            frame_width=w,
            frame_height=h,
            detections=detections,
            tracks=active_tracks,
            optical_flow_dict=flow_data
        )
        t_den1 = time.perf_counter()

        # 6. Risk Scoring
        t_risk0 = time.perf_counter()
        speeds = [t.get("speed", 0.0) for t in active_tracks]
        mean_speed = float(np.mean(speeds)) if speeds else 0.0
        grid_densities = [z.get("normalized_density", 0.0) for z in zone_telemetry]
        risk_res = risk_engine.compute_risk(
            current_count=len(active_tracks),
            optical_flow_mag=flow_mag,
            mean_speed=mean_speed,
            grid_densities=grid_densities
        )
        t_risk1 = time.perf_counter()

        t_frame_end = time.perf_counter()
        pipe_latencies_ms.append((t_frame_end - t_frame_start) * 1000.0)
        stage_breakdowns["dip_preprocess_ms"].append((t_dip1 - t_dip0) * 1000.0)
        stage_breakdowns["optical_flow_ms"].append((t_flow1 - t_flow0) * 1000.0)
        stage_breakdowns["yolo_detection_ms"].append((t_det1 - t_det0) * 1000.0)
        stage_breakdowns["bytetrack_update_ms"].append((t_trk1 - t_trk0) * 1000.0)
        stage_breakdowns["density_analysis_ms"].append((t_den1 - t_den0) * 1000.0)
        stage_breakdowns["risk_engine_ms"].append((t_risk1 - t_risk0) * 1000.0)

    total_pipe_sec = time.perf_counter() - t_pipe_start
    pipe_fps = round(len(pipe_latencies_ms) / total_pipe_sec, 2)

    pipe_stats = {
        "trials_count": len(pipe_latencies_ms),
        "total_elapsed_sec": round(total_pipe_sec, 3),
        "pipeline_throughput_fps": pipe_fps,
        "pipeline_latency_mean_ms": round(float(np.mean(pipe_latencies_ms)), 2),
        "pipeline_latency_p50_ms": round(float(np.median(pipe_latencies_ms)), 2),
        "pipeline_latency_p95_ms": round(float(np.percentile(pipe_latencies_ms, 95)), 2),
        "pipeline_latency_p99_ms": round(float(np.percentile(pipe_latencies_ms, 99)), 2),
        "pipeline_latency_min_ms": round(float(np.min(pipe_latencies_ms)), 2),
        "pipeline_latency_max_ms": round(float(np.max(pipe_latencies_ms)), 2),
        "stage_latency_means_ms": {
            k: round(float(np.mean(v)), 2) for k, v in stage_breakdowns.items()
        }
    }

    print(f"  Pipeline Throughput  : {pipe_stats['pipeline_throughput_fps']} FPS")
    print(f"  Pipeline p50 / p95   : {pipe_stats['pipeline_latency_p50_ms']} ms / {pipe_stats['pipeline_latency_p95_ms']} ms")
    print(f"  Stage Breakdown (ms) :")
    for k, v in pipe_stats["stage_latency_means_ms"].items():
        pct = (v / max(0.001, pipe_stats["pipeline_latency_mean_ms"])) * 100.0
        print(f"    - {k:<22}: {v:6.2f} ms ({pct:4.1f}%)")

    # 7. Accuracy Evaluation on Ground-Truth Dataset
    print(f"\nEvaluating detection accuracy on {len(frames_meta)} manifest frames...")
    acc_report = evaluation_service.evaluate_detection_accuracy(
        conf_threshold=conf_threshold,
        iou_threshold=0.50,
        imgsz=imgsz
    )
    
    overall_m = acc_report.get("overall_metrics", {})
    accuracy_summary = {
        "dataset_version": acc_report.get("dataset_version", "1.0.0"),
        "total_frames_evaluated": acc_report.get("evaluated_frames_count", len(frames_meta)),
        "ground_truth_persons_count": acc_report.get("total_ground_truth_persons", 0),
        "true_positives": overall_m.get("true_positives", 0),
        "false_positives": overall_m.get("false_positives", 0),
        "false_negatives": overall_m.get("false_negatives", 0),
        "precision": round(overall_m.get("precision", 0.0), 4),
        "recall": round(overall_m.get("recall", 0.0), 4),
        "f1_score": round(overall_m.get("f1_score", 0.0), 4),
        "mean_iou": round(overall_m.get("mean_iou", 0.0), 4),
        "category_metrics": acc_report.get("category_metrics", {})
    }

    print(f"  Precision : {accuracy_summary['precision']:.4f}")
    print(f"  Recall    : {accuracy_summary['recall']:.4f}")
    print(f"  F1-Score  : {accuracy_summary['f1_score']:.4f}")
    print(f"  Mean IoU  : {accuracy_summary['mean_iou']:.4f}")

    # 8. Memory & Resource Footprint
    mem_info = process.memory_info()
    rss_mb = round(mem_info.rss / (1024 * 1024), 2)
    vms_mb = round(mem_info.vms / (1024 * 1024), 2)

    resource_footprint = {
        "rss_memory_mb": rss_mb,
        "vms_memory_mb": vms_mb,
        "system_ram_util_percent": psutil.virtual_memory().percent
    }

    # Assemble comprehensive baseline results document
    baseline_results = {
        "benchmark_metadata": {
            "phase": "5.3A",
            "benchmark_name": "Reproducible CPU Inference Baseline",
            "timestamp_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "device": "cpu",
            "execution_provider": "PyTorch CPU Native",
            "model_architecture": "YOLOv8n (Ultralytics)",
            "model_weights_path": model_path,
            "model_weights_sha256": model_sha256,
            "model_weights_bytes": model_size_bytes,
            "input_resolution": f"{imgsz}x{imgsz}",
            "conf_threshold": conf_threshold,
            "iou_threshold": 0.50
        },
        "hardware_environment": hw_info,
        "model_loading_and_warmup": {
            "load_duration_ms": round(load_duration_ms, 2),
            "cold_start_warmup_duration_ms": round(cold_start_warmup_ms, 2),
            "warmup_policy": "Single-frame cold-start absorption on zero-filled 640x480 frame"
        },
        "pure_inference_benchmark": inf_stats,
        "end_to_end_pipeline_benchmark": pipe_stats,
        "resource_footprint": resource_footprint,
        "detection_accuracy_baseline": accuracy_summary,
        "unmeasured_dimensions_and_limitations": {
            "tensorrt_directml_openvino": "NOT MEASURED in Phase 5.3A (Scheduled for Phase 5.3B)",
            "real_world_field_surveyor_calibration": "NOT MEASURED (Surveyor physical ground-truth tape unavailable)",
            "browser_display_scanout_latency": "NOT MEASURED (Client performance.now() measures JS event dispatch, not monitor scan-out)",
            "multi_camera_concurrent_inference": "Anchored to Phase 5.1 CPU baseline (1.75 - 5.25 FPS/cam); synthetic dispatch (~249 dispatch/s) measures scheduler only"
        }
    }

    # Save to data/reports
    os.makedirs("data/reports", exist_ok=True)
    report_out_path = "data/reports/phase53a_cpu_baseline_results.json"
    with open(report_out_path, "w", encoding="utf-8") as f:
        json.dump(baseline_results, f, indent=2)

    print(f"\n[SUCCESS] Baseline results saved to {report_out_path}")
    return baseline_results


if __name__ == "__main__":
    run_cpu_inference_baseline()
