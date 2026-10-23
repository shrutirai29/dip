import sys
import os
import time
import numpy as np
import cv2

sys.path.insert(0, os.path.abspath("backend"))

from app.services.camera_registry import camera_registry_service
from app.services.camera_session import CameraSourceType
from app.services.inference_scheduler import fair_inference_scheduler
from app.services.dip_service import DIPProcessor
from app.services.detection_service import DetectionService
from app.services.tracking_service import SimpleByteTracker
from app.services.density_service import DensityService
from app.services.risk_engine import CrowdRiskEngine
from app.services.forecasting_service import PatternAndForecastingEngine

def benchmark_isolated_components():
    print("==================================================================")
    print(" CROWDGUARD Component-Level Micro-Profiling (Isolated Benchmark) ")
    print("==================================================================")
    
    detector = DetectionService()
    tracker = SimpleByteTracker()
    density_service = DensityService()
    risk_engine = CrowdRiskEngine()
    forecasting_engine = PatternAndForecastingEngine()

    video_path = "data/uploads/vid_2e28e1e65a.mp4"
    cap = cv2.VideoCapture(video_path)
    ret, frame_bgr = cap.read()
    cap.release()
    assert ret, "Failed to read test frame from video"
    
    h, w = frame_bgr.shape[:2]
    prev_gray = cv2.resize(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY), (320, 240))
    curr_gray = prev_gray.copy()

    # Warmup
    for _ in range(3):
        detector.detect_persons(frame_bgr, imgsz=640, conf_threshold=0.30)
        DIPProcessor.compute_optical_flow_dynamics(prev_gray, curr_gray)

    N_ITERS = 20
    times = {
        "optical_flow": [],
        "yolo_inference": [],
        "bytetrack_tracking": [],
        "density_grid": [],
        "crowd_pattern": [],
        "risk_engine": [],
        "forecasting": [],
        "heatmap_generation_blend": [],
        "hud_drawing": [],
        "jpeg_encoding": []
    }

    raw_dets = []
    active_tracks = []
    flow_data = {}
    grid_cells = []
    risk_data = {}

    for _ in range(N_ITERS):
        # 1. Optical Flow
        t0 = time.perf_counter()
        flow_data = DIPProcessor.compute_optical_flow_dynamics(prev_gray, curr_gray)
        times["optical_flow"].append((time.perf_counter() - t0) * 1000.0)

        # 2. YOLOv8 Inference
        t0 = time.perf_counter()
        raw_dets = detector.detect_persons(frame_bgr, imgsz=640, conf_threshold=0.30)
        times["yolo_inference"].append((time.perf_counter() - t0) * 1000.0)

        # 3. ByteTracker
        t0 = time.perf_counter()
        active_tracks = tracker.update(raw_dets, time.time(), w, h)
        times["bytetrack_tracking"].append((time.perf_counter() - t0) * 1000.0)

        # 4. Density Grid
        t0 = time.perf_counter()
        grid_cells = density_service.compute_zone_telemetry(w, h, raw_dets, active_tracks, flow_data, 1.0)
        times["density_grid"].append((time.perf_counter() - t0) * 1000.0)

        # 5. Crowd Pattern
        t0 = time.perf_counter()
        pattern_data = forecasting_engine.detect_crowd_patterns(active_tracks, grid_cells, 0.5, 10.0, len(active_tracks))
        times["crowd_pattern"].append((time.perf_counter() - t0) * 1000.0)

        # 6. Risk Engine
        t0 = time.perf_counter()
        risk_data = risk_engine.compute_risk(len(active_tracks), 2.0, 10.0, [0.2]*9)
        times["risk_engine"].append((time.perf_counter() - t0) * 1000.0)

        # 7. Forecasting
        t0 = time.perf_counter()
        forecast_data = forecasting_engine.compute_short_term_forecast(risk_data["smoothed_score"], 0.2, 0.5, 10.0, "stationary", 0.1)
        times["forecasting"].append((time.perf_counter() - t0) * 1000.0)

        # 8. Heatmap Generation & Blend
        t0 = time.perf_counter()
        if len(raw_dets) > 0:
            hm = DIPProcessor.generate_density_heatmap((h, w), raw_dets, kernel_size=61, sigma_base=14.0, perspective_weight=1.0)
            ann = DIPProcessor.blend_heatmap_on_frame(frame_bgr, hm, alpha=0.45)
        else:
            ann = frame_bgr.copy()
        times["heatmap_generation_blend"].append((time.perf_counter() - t0) * 1000.0)

        # 9. HUD Drawing & Grid
        t0 = time.perf_counter()
        ann = density_service.draw_grid_overlay(ann, grid_cells, alpha=0.22)
        cv2.rectangle(ann, (0, 0), (w, 46), (10, 15, 24), -1)
        cv2.putText(ann, "Surveillance HUD Line 1", (12, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.46, (244, 247, 250), 1, cv2.LINE_AA)
        times["hud_drawing"].append((time.perf_counter() - t0) * 1000.0)

        # 10. JPEG Encoding
        t0 = time.perf_counter()
        success, enc = cv2.imencode(".jpg", ann, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        times["jpeg_encoding"].append((time.perf_counter() - t0) * 1000.0)

    print(f"{'Component':<28} | {'Mean (ms)':<10} | {'Median / p50':<12} | {'p95 (ms)':<10} | {'% of Pipeline'}")
    print("------------------------------------------------------------------------------------------------")
    total_mean = sum(np.mean(v) for v in times.values())
    for name, v in times.items():
        m = float(np.mean(v))
        p50 = float(np.median(v))
        p95 = float(np.percentile(v, 95))
        pct = (m / total_mean) * 100.0
        print(f"{name:<28} | {m:<10.2f} | {p50:<12.2f} | {p95:<10.2f} | {pct:<.1f}%")
    print("------------------------------------------------------------------------------------------------")
    print(f"Total Mean Pipeline Processing Time: {total_mean:.2f} ms ({1000.0/total_mean:.2f} theoretical single-thread FPS)")
    
    # Check YOLO at different resolutions
    print("\nYOLO Inference Scaling by Resolution:")
    for sz in [320, 480, 640]:
        t_sz = []
        for _ in range(10):
            t0 = time.perf_counter()
            detector.detect_persons(frame_bgr, imgsz=sz, conf_threshold=0.30)
            t_sz.append((time.perf_counter() - t0) * 1000.0)
        print(f"  imgsz={sz}: Mean = {np.mean(t_sz):.1f} ms | p50 = {np.median(t_sz):.1f} ms | Max FPS = {1000.0/np.mean(t_sz):.1f} FPS")

if __name__ == "__main__":
    benchmark_isolated_components()
