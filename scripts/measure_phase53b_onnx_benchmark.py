"""
CROWDGUARD v2.0 — Phase 5.3B ONNX Runtime Inference Acceleration & Benchmark Engine
Performs rigorous, reproducible, side-by-side performance, numerical parity, and accuracy
evaluations comparing PyTorch CPU vs ONNX Runtime CPU.
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
import onnx
import onnxruntime as ort
from typing import Dict, Any, List, Tuple

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
        "onnx_version": onnx.__version__,
        "onnxruntime_version": ort.__version__,
        "onnxruntime_providers": ort.get_available_providers(),
        "cuda_available": torch.cuda.is_available(),
        "opencv_version": cv2.__version__
    }


def compute_box_iou(boxA: List[float], boxB: List[float]) -> float:
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    inter_w = max(0.0, xB - xA)
    inter_h = max(0.0, yB - yA)
    inter_area = inter_w * inter_h

    boxAArea = max(0.0, boxA[2] - boxA[0]) * max(0.0, boxA[3] - boxA[1])
    boxBArea = max(0.0, boxB[2] - boxB[0]) * max(0.0, boxB[3] - boxB[1])
    union_area = boxAArea + boxBArea - inter_area

    if union_area <= 0:
        return 0.0
    return float(inter_area / union_area)


def run_phase53b_onnx_benchmark(
    pt_model_path: str = "yolov8n.pt",
    onnx_model_path: str = "yolov8n.onnx",
    manifest_path: str = "data/evaluation/manifest.json",
    num_pure_inference_trials: int = 100,
    num_pipeline_trials: int = 50,
    imgsz: int = 640,
    conf_threshold: float = 0.30
) -> Dict[str, Any]:
    print("=" * 80)
    print("CROWDGUARD v2.0 — Phase 5.3B: ONNX Runtime vs PyTorch CPU Acceleration Benchmark")
    print("=" * 80)

    # 1. System Metadata
    hw = get_system_hardware_info()
    print(f"OS Platform     : {hw['os_platform']}")
    print(f"CPU Processor   : {hw['cpu_processor']}")
    print(f"Cores           : {hw['cpu_physical_cores']} Physical, {hw['cpu_logical_cores']} Logical")
    print(f"Total RAM       : {hw['ram_total_gb']} GB")
    print(f"PyTorch Version : {hw['torch_version']}")
    print(f"ONNX / ORT      : {hw['onnx_version']} / {hw['onnxruntime_version']}")
    print(f"ORT Providers   : {hw['onnxruntime_providers']}")

    # 2. Model Files Integrity
    assert os.path.exists(pt_model_path), f"PyTorch model not found: {pt_model_path}"
    assert os.path.exists(onnx_model_path), f"ONNX model not found: {onnx_model_path}"

    pt_size = os.path.getsize(pt_model_path)
    pt_sha = compute_sha256(pt_model_path)
    onnx_size = os.path.getsize(onnx_model_path)
    onnx_sha = compute_sha256(onnx_model_path)

    print(f"\nPyTorch Model   : {pt_model_path} ({pt_size:,} bytes, {round(pt_size/(1024*1024),2)} MB)")
    print(f"PyTorch SHA256  : {pt_sha}")
    print(f"ONNX Model      : {onnx_model_path} ({onnx_size:,} bytes, {round(onnx_size/(1024*1024),2)} MB)")
    print(f"ONNX SHA256     : {onnx_sha}")

    # 3. Model Load & Warmup Benchmarking
    print("\n--- 1. Cold Load & Warm-up Times ---")
    t0 = time.perf_counter()
    ds_pt = DetectionService(model_name=pt_model_path, conf_threshold=conf_threshold, backend="pytorch")
    pt_load_ms = (time.perf_counter() - t0) * 1000.0

    t0 = time.perf_counter()
    pt_warmup_ms = ds_pt.warmup(imgsz=imgsz)

    t0 = time.perf_counter()
    ds_onnx = DetectionService(model_name=pt_model_path, conf_threshold=conf_threshold, backend="onnx", onnx_path=onnx_model_path)
    onnx_load_ms = (time.perf_counter() - t0) * 1000.0

    t0 = time.perf_counter()
    onnx_warmup_ms = ds_onnx.warmup(imgsz=imgsz)

    print(f"PyTorch CPU  : Load = {pt_load_ms:6.2f} ms | Warmup = {pt_warmup_ms:6.2f} ms")
    print(f"ONNX Runtime : Load = {onnx_load_ms:6.2f} ms | Warmup = {onnx_warmup_ms:6.2f} ms")

    # 4. Pure Inference Forward-Pass Benchmarking
    print(f"\n--- 2. Pure Inference Latency ({num_pure_inference_trials} iterations, shape 1x3x{imgsz}x{imgsz}) ---")
    
    # Raw PyTorch model
    raw_pt_model = ds_pt.model.model.float().eval()
    dummy_torch = torch.zeros((1, 3, imgsz, imgsz), dtype=torch.float32)

    # Raw ONNX Runtime session
    ort_session = ort.InferenceSession(onnx_model_path, providers=["CPUExecutionProvider"])
    dummy_numpy = np.zeros((1, 3, imgsz, imgsz), dtype=np.float32)

    # Measure PyTorch raw forward pass
    pt_pure_latencies: List[float] = []
    # Warmup 5 passes
    for _ in range(5):
        with torch.inference_mode():
            _ = raw_pt_model(dummy_torch)
    
    t_start_pt = time.perf_counter()
    for _ in range(num_pure_inference_trials):
        t1 = time.perf_counter()
        with torch.inference_mode():
            _ = raw_pt_model(dummy_torch)
        pt_pure_latencies.append((time.perf_counter() - t1) * 1000.0)
    pt_pure_total_sec = time.perf_counter() - t_start_pt

    # Measure ONNX Runtime raw session.run
    onnx_pure_latencies: List[float] = []
    # Warmup 5 passes
    for _ in range(5):
        _ = ort_session.run(None, {"images": dummy_numpy})

    t_start_onnx = time.perf_counter()
    for _ in range(num_pure_inference_trials):
        t1 = time.perf_counter()
        _ = ort_session.run(None, {"images": dummy_numpy})
        onnx_pure_latencies.append((time.perf_counter() - t1) * 1000.0)
    onnx_pure_total_sec = time.perf_counter() - t_start_onnx

    pt_pure_mean = float(np.mean(pt_pure_latencies))
    pt_pure_p50 = float(np.median(pt_pure_latencies))
    pt_pure_p95 = float(np.percentile(pt_pure_latencies, 95))
    pt_pure_p99 = float(np.percentile(pt_pure_latencies, 99))
    pt_pure_fps = round(num_pure_inference_trials / pt_pure_total_sec, 2)

    onnx_pure_mean = float(np.mean(onnx_pure_latencies))
    onnx_pure_p50 = float(np.median(onnx_pure_latencies))
    onnx_pure_p95 = float(np.percentile(onnx_pure_latencies, 95))
    onnx_pure_p99 = float(np.percentile(onnx_pure_latencies, 99))
    onnx_pure_fps = round(num_pure_inference_trials / onnx_pure_total_sec, 2)

    pure_speedup_latency = round(pt_pure_p50 / max(0.001, onnx_pure_p50), 2)
    pure_speedup_fps = round(onnx_pure_fps / max(0.001, pt_pure_fps), 2)

    print(f"PyTorch Pure Forward  : Mean={pt_pure_mean:.2f}ms | p50={pt_pure_p50:.2f}ms | p95={pt_pure_p95:.2f}ms | p99={pt_pure_p99:.2f}ms | FPS={pt_pure_fps}")
    print(f"ONNX Pure Forward     : Mean={onnx_pure_mean:.2f}ms | p50={onnx_pure_p50:.2f}ms | p95={onnx_pure_p95:.2f}ms | p99={onnx_pure_p99:.2f}ms | FPS={onnx_pure_fps}")
    print(f"Pure Inference Speedup: {pure_speedup_latency}x (p50 latency reduction) | {pure_speedup_fps}x (FPS gain)")

    # 5. Detection Service End-to-End Latency (Pre + Inf + Post/NMS)
    print(f"\n--- 3. Detection Service (Detect + NMS + Filtering) ({num_pure_inference_trials} iterations) ---")
    dummy_img = np.zeros((480, 640, 3), dtype=np.uint8)

    pt_det_latencies: List[float] = []
    t_det_pt_start = time.perf_counter()
    for _ in range(num_pure_inference_trials):
        t1 = time.perf_counter()
        _ = ds_pt.detect_persons(dummy_img, imgsz=imgsz, conf_threshold=conf_threshold)
        pt_det_latencies.append((time.perf_counter() - t1) * 1000.0)
    pt_det_total_sec = time.perf_counter() - t_det_pt_start

    onnx_det_latencies: List[float] = []
    t_det_onnx_start = time.perf_counter()
    for _ in range(num_pure_inference_trials):
        t1 = time.perf_counter()
        _ = ds_onnx.detect_persons(dummy_img, imgsz=imgsz, conf_threshold=conf_threshold)
        onnx_det_latencies.append((time.perf_counter() - t1) * 1000.0)
    onnx_det_total_sec = time.perf_counter() - t_det_onnx_start

    pt_det_p50 = float(np.median(pt_det_latencies))
    pt_det_p95 = float(np.percentile(pt_det_latencies, 95))
    pt_det_fps = round(num_pure_inference_trials / pt_det_total_sec, 2)

    onnx_det_p50 = float(np.median(onnx_det_latencies))
    onnx_det_p95 = float(np.percentile(onnx_det_latencies, 95))
    onnx_det_fps = round(num_pure_inference_trials / onnx_det_total_sec, 2)

    print(f"PyTorch Detect  : Mean={np.mean(pt_det_latencies):.2f}ms | p50={pt_det_p50:.2f}ms | p95={pt_det_p95:.2f}ms | FPS={pt_det_fps}")
    print(f"ONNX Detect     : Mean={np.mean(onnx_det_latencies):.2f}ms | p50={onnx_det_p50:.2f}ms | p95={onnx_det_p95:.2f}ms | FPS={onnx_det_fps}")

    # 6. Full Pipeline Sustained Throughput & Component Breakdown
    print(f"\n--- 4. Full Pipeline Sustained Benchmark ({num_pipeline_trials} frames) ---")
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)
    frames_meta = manifest.get("frames", [])

    cached_frames: List[np.ndarray] = []
    for fm in frames_meta:
        path = os.path.join("data/evaluation/frames", fm.get("file_name", f"{fm['frame_id']}.jpg"))
        img = cv2.imread(path)
        if img is not None:
            cached_frames.append(img)
    if not cached_frames:
        cached_frames = [np.zeros((720, 1280, 3), dtype=np.uint8)]

    def benchmark_pipeline_for_detector(detector: DetectionService, name: str) -> Dict[str, Any]:
        tracker = SimpleByteTracker(min_hits=2, iou_threshold=0.3)
        density_service = DensityService()
        risk_engine = CrowdRiskEngine()

        latencies_ms: List[float] = []
        breakdown = {
            "dip_preprocess_ms": [],
            "optical_flow_ms": [],
            "detection_ms": [],
            "tracking_ms": [],
            "density_telemetry_ms": [],
            "risk_engine_ms": []
        }

        prev_gray = None
        t_start = time.perf_counter()

        for idx in range(num_pipeline_trials):
            raw_frame = cached_frames[idx % len(cached_frames)]
            h, w = raw_frame.shape[:2]

            t_f0 = time.perf_counter()

            # 1. DIP Preprocessing
            t_s0 = time.perf_counter()
            frame_clean = DIPProcessor.preprocess_frame(raw_frame, apply_denoise=True)
            t_s1 = time.perf_counter()
            breakdown["dip_preprocess_ms"].append((t_s1 - t_s0) * 1000.0)

            # 2. Optical Flow
            t_s0 = time.perf_counter()
            curr_gray = cv2.cvtColor(frame_clean, cv2.COLOR_BGR2GRAY)
            curr_gray_small = cv2.resize(curr_gray, (320, 240))
            flow_data = DIPProcessor.compute_optical_flow_dynamics(prev_gray, curr_gray_small)
            flow_mag = flow_data.get("mean_magnitude", 0.0)
            prev_gray = curr_gray_small
            t_s1 = time.perf_counter()
            breakdown["optical_flow_ms"].append((t_s1 - t_s0) * 1000.0)

            # 3. Person Detection
            t_s0 = time.perf_counter()
            dets = detector.detect_persons(frame_clean, imgsz=imgsz, conf_threshold=conf_threshold)
            t_s1 = time.perf_counter()
            breakdown["detection_ms"].append((t_s1 - t_s0) * 1000.0)

            # 4. ByteTrack Multi-Target Tracking
            t_s0 = time.perf_counter()
            sim_ts = idx * 0.0333
            active_tracks = tracker.update(dets, sim_ts, w, h)
            t_s1 = time.perf_counter()
            breakdown["tracking_ms"].append((t_s1 - t_s0) * 1000.0)

            # 5. Density & Physical Intelligence
            t_s0 = time.perf_counter()
            zone_telemetry = density_service.compute_zone_telemetry(
                frame_width=w,
                frame_height=h,
                detections=dets,
                tracks=active_tracks,
                optical_flow_dict=flow_data
            )
            t_s1 = time.perf_counter()
            breakdown["density_telemetry_ms"].append((t_s1 - t_s0) * 1000.0)

            # 6. Risk Engine
            t_s0 = time.perf_counter()
            speeds = [t.get("speed", 0.0) for t in active_tracks]
            mean_speed = float(np.mean(speeds)) if speeds else 0.0
            grid_densities = [z.get("normalized_density", 0.0) for z in zone_telemetry]
            risk_res = risk_engine.compute_risk(
                current_count=len(active_tracks),
                optical_flow_mag=flow_mag,
                mean_speed=mean_speed,
                grid_densities=grid_densities
            )
            t_s1 = time.perf_counter()
            breakdown["risk_engine_ms"].append((t_s1 - t_s0) * 1000.0)

            latencies_ms.append((time.perf_counter() - t_f0) * 1000.0)

        total_sec = time.perf_counter() - t_start
        fps = round(num_pipeline_trials / total_sec, 2)
        mean_ms = round(float(np.mean(latencies_ms)), 2)
        p50_ms = round(float(np.median(latencies_ms)), 2)
        p95_ms = round(float(np.percentile(latencies_ms, 95)), 2)
        p99_ms = round(float(np.percentile(latencies_ms, 99)), 2)

        return {
            "name": name,
            "trials": num_pipeline_trials,
            "total_elapsed_sec": round(total_sec, 3),
            "pipeline_throughput_fps": fps,
            "pipeline_latency_mean_ms": mean_ms,
            "pipeline_latency_p50_ms": p50_ms,
            "pipeline_latency_p95_ms": p95_ms,
            "pipeline_latency_p99_ms": p99_ms,
            "breakdown_ms": {k: round(float(np.mean(v)), 2) for k, v in breakdown.items()}
        }

    pt_pipe = benchmark_pipeline_for_detector(ds_pt, "PyTorch CPU")
    onnx_pipe = benchmark_pipeline_for_detector(ds_onnx, "ONNX Runtime CPU")

    pipe_fps_speedup = round(onnx_pipe["pipeline_throughput_fps"] / max(0.001, pt_pipe["pipeline_throughput_fps"]), 2)
    pipe_p50_speedup = round(pt_pipe["pipeline_latency_p50_ms"] / max(0.001, onnx_pipe["pipeline_latency_p50_ms"]), 2)

    print(f"PyTorch Pipeline  : Throughput={pt_pipe['pipeline_throughput_fps']} FPS | p50={pt_pipe['pipeline_latency_p50_ms']}ms | p95={pt_pipe['pipeline_latency_p95_ms']}ms")
    print(f"ONNX Pipeline     : Throughput={onnx_pipe['pipeline_throughput_fps']} FPS | p50={onnx_pipe['pipeline_latency_p50_ms']}ms | p95={onnx_pipe['pipeline_latency_p95_ms']}ms")
    print(f"Pipeline Speedup  : {pipe_fps_speedup}x FPS | {pipe_p50_speedup}x p50 latency reduction")

    print("\nStage Breakdown Comparison (ms):")
    for k in pt_pipe["breakdown_ms"].keys():
        pt_v = pt_pipe["breakdown_ms"][k]
        onnx_v = onnx_pipe["breakdown_ms"][k]
        diff_pct = round(((onnx_v - pt_v) / max(0.001, pt_v)) * 100.0, 1)
        print(f"  - {k:<22}: PyTorch = {pt_v:6.2f} ms | ONNX = {onnx_v:6.2f} ms ({diff_pct:+.1f}%)")

    # 7. Ground-Truth Detection Accuracy & Parity
    print("\n--- 5. Accuracy & Numerical Parity on Manifest Frames ---")
    
    # PyTorch evaluation
    evaluation_service._shared_detector = ds_pt
    acc_pt = evaluation_service.evaluate_detection_accuracy(conf_threshold=conf_threshold, iou_threshold=0.5, imgsz=imgsz)
    pt_overall = acc_pt.get("overall_metrics", {})

    # ONNX evaluation
    evaluation_service._shared_detector = ds_onnx
    acc_onnx = evaluation_service.evaluate_detection_accuracy(conf_threshold=conf_threshold, iou_threshold=0.5, imgsz=imgsz)
    onnx_overall = acc_onnx.get("overall_metrics", {})

    print(f"PyTorch Accuracy : Prec={pt_overall.get('precision', 0.0):.4f} | Rec={pt_overall.get('recall', 0.0):.4f} | F1={pt_overall.get('f1_score', 0.0):.4f} | mIoU={pt_overall.get('mean_iou', 0.0):.4f} | TP={pt_overall.get('true_positives',0)} FP={pt_overall.get('false_positives',0)} FN={pt_overall.get('false_negatives',0)}")
    print(f"ONNX Accuracy    : Prec={onnx_overall.get('precision', 0.0):.4f} | Rec={onnx_overall.get('recall', 0.0):.4f} | F1={onnx_overall.get('f1_score', 0.0):.4f} | mIoU={onnx_overall.get('mean_iou', 0.0):.4f} | TP={onnx_overall.get('true_positives',0)} FP={onnx_overall.get('false_positives',0)} FN={onnx_overall.get('false_negatives',0)}")

    # Frame-by-frame box parity
    box_ious: List[float] = []
    conf_diffs: List[float] = []
    coord_diffs: List[float] = []
    count_matches = 0

    for fm in frames_meta:
        path = os.path.join("data/evaluation/frames", fm.get("file_name", f"{fm['frame_id']}.jpg"))
        frame = cv2.imread(path)
        if frame is None:
            continue
        dets_p = ds_pt.detect_persons(frame, imgsz=imgsz, conf_threshold=conf_threshold)
        dets_o = ds_onnx.detect_persons(frame, imgsz=imgsz, conf_threshold=conf_threshold)

        if len(dets_p) == len(dets_o):
            count_matches += 1

        for dp in dets_p:
            best_iou = 0.0
            best_do = None
            for do in dets_o:
                iou = compute_box_iou(dp["bbox"], do["bbox"])
                if iou > best_iou:
                    best_iou = iou
                    best_do = do
            if best_do is not None and best_iou > 0.5:
                box_ious.append(best_iou)
                conf_diffs.append(abs(dp["confidence"] - best_do["confidence"]))
                coord_diffs.append(max(abs(a - b) for a, b in zip(dp["bbox"], best_do["bbox"])))

    mean_box_iou_between_backends = round(float(np.mean(box_ious)), 4) if box_ious else 1.0
    mean_conf_diff = round(float(np.mean(conf_diffs)), 4) if conf_diffs else 0.0
    max_coord_diff = round(float(np.max(coord_diffs)), 2) if coord_diffs else 0.0

    print(f"Cross-Backend Parity:")
    print(f"  Count Match Rate     : {count_matches}/{len(frames_meta)} frames ({count_matches/len(frames_meta)*100:.1f}%)")
    print(f"  Mean Cross-Model IoU : {mean_box_iou_between_backends}")
    print(f"  Mean Conf Diff       : {mean_conf_diff}")
    print(f"  Max Coord Diff (px)  : {max_coord_diff}")

    # 8. Memory & System Footprint
    proc = psutil.Process()
    mem_info = proc.memory_info()
    cpu_percent = psutil.cpu_percent(interval=0.5)

    resource_footprint = {
        "process_rss_mb": round(mem_info.rss / (1024 * 1024), 2),
        "process_vms_mb": round(mem_info.vms / (1024 * 1024), 2),
        "system_cpu_util_percent": cpu_percent,
        "system_ram_util_percent": psutil.virtual_memory().percent
    }

    # 9. Assemble Complete Benchmark Report Artifact
    results = {
        "benchmark_metadata": {
            "phase": "5.3B",
            "benchmark_name": "ONNX Runtime Inference Acceleration & Parity Benchmark",
            "timestamp_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "device": "cpu",
            "execution_providers_tested": ["PyTorch CPU Native", "ONNX Runtime CPUExecutionProvider"],
            "hardware": hw
        },
        "model_artifacts": {
            "pytorch": {
                "file_path": pt_model_path,
                "file_size_bytes": pt_size,
                "sha256": pt_sha
            },
            "onnx": {
                "file_path": onnx_model_path,
                "file_size_bytes": onnx_size,
                "sha256": onnx_sha,
                "opset_version": 18
            }
        },
        "cold_start_latencies_ms": {
            "pytorch": {"load_ms": round(pt_load_ms, 2), "warmup_ms": round(pt_warmup_ms, 2)},
            "onnx": {"load_ms": round(onnx_load_ms, 2), "warmup_ms": round(onnx_warmup_ms, 2)}
        },
        "pure_inference_latencies": {
            "trials_count": num_pure_inference_trials,
            "pytorch_cpu": {
                "throughput_fps": pt_pure_fps,
                "mean_ms": round(pt_pure_mean, 2),
                "p50_ms": round(pt_pure_p50, 2),
                "p95_ms": round(pt_pure_p95, 2),
                "p99_ms": round(pt_pure_p99, 2)
            },
            "onnx_runtime_cpu": {
                "throughput_fps": onnx_pure_fps,
                "mean_ms": round(onnx_pure_mean, 2),
                "p50_ms": round(onnx_pure_p50, 2),
                "p95_ms": round(onnx_pure_p95, 2),
                "p99_ms": round(onnx_pure_p99, 2)
            },
            "speedup_ratio": {
                "latency_p50": pure_speedup_latency,
                "throughput_fps": pure_speedup_fps
            }
        },
        "detection_service_latencies": {
            "trials_count": num_pure_inference_trials,
            "pytorch_cpu": {
                "throughput_fps": pt_det_fps,
                "mean_ms": round(float(np.mean(pt_det_latencies)), 2),
                "p50_ms": round(pt_det_p50, 2),
                "p95_ms": round(pt_det_p95, 2)
            },
            "onnx_runtime_cpu": {
                "throughput_fps": onnx_det_fps,
                "mean_ms": round(float(np.mean(onnx_det_latencies)), 2),
                "p50_ms": round(onnx_det_p50, 2),
                "p95_ms": round(onnx_det_p95, 2)
            }
        },
        "full_pipeline_benchmarks": {
            "trials_count": num_pipeline_trials,
            "pytorch_cpu": pt_pipe,
            "onnx_runtime_cpu": onnx_pipe,
            "speedup_ratio": {
                "pipeline_p50": pipe_p50_speedup,
                "pipeline_fps": pipe_fps_speedup
            }
        },
        "detection_accuracy_comparison": {
            "manifest_frames_count": len(frames_meta),
            "pytorch_cpu": {
                "precision": round(pt_overall.get("precision", 0.0), 4),
                "recall": round(pt_overall.get("recall", 0.0), 4),
                "f1_score": round(pt_overall.get("f1_score", 0.0), 4),
                "mean_iou": round(pt_overall.get("mean_iou", 0.0), 4),
                "true_positives": pt_overall.get("true_positives", 0),
                "false_positives": pt_overall.get("false_positives", 0),
                "false_negatives": pt_overall.get("false_negatives", 0)
            },
            "onnx_runtime_cpu": {
                "precision": round(onnx_overall.get("precision", 0.0), 4),
                "recall": round(onnx_overall.get("recall", 0.0), 4),
                "f1_score": round(onnx_overall.get("f1_score", 0.0), 4),
                "mean_iou": round(onnx_overall.get("mean_iou", 0.0), 4),
                "true_positives": onnx_overall.get("true_positives", 0),
                "false_positives": onnx_overall.get("false_positives", 0),
                "false_negatives": onnx_overall.get("false_negatives", 0)
            },
            "cross_backend_parity": {
                "matching_count_rate": round(count_matches / len(frames_meta), 4),
                "mean_cross_model_iou": mean_box_iou_between_backends,
                "mean_confidence_diff": mean_conf_diff,
                "max_coordinate_pixel_diff": max_coord_diff
            }
        },
        "resource_utilization": resource_footprint
    }

    output_dir = "data/reports"
    os.makedirs(output_dir, exist_ok=True)
    out_file = os.path.join(output_dir, "phase53b_onnx_runtime_results.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(f"\nSaved machine-readable benchmark artifact to: {out_file}")
    return results


if __name__ == "__main__":
    run_phase53b_onnx_benchmark()
