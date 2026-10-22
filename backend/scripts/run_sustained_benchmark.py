import os
import sys
import time

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath("backend"))

from app.services.evaluation_service import evaluation_service

if __name__ == "__main__":
    print("=================================================================")
    print(" CROWDGUARD Phase 4.6.2 — Sustained Multi-Camera Validation Run  ")
    print("=================================================================")
    print("Configuration: 1 to 4 streams, 10s warm-up, 60s measurement window per level")
    print("Monotonic timing, differential frame accounting, latency distributions")
    
    # Check authentic video source
    video_path = "data/uploads/vid_2e28e1e65a.mp4"
    if not os.path.exists(video_path):
        video_path = "data/sample_videos/crowd_bottleneck_demo.mp4"
    print(f"Video Source: {video_path}")

    t0 = time.perf_counter()
    report = evaluation_service.run_sustained_benchmark(
        max_cameras=4,
        warmup_duration_sec=10.0,
        measurement_duration_sec=60.0,
        sample_interval_sec=1.0,
        video_path=video_path
    )
    total_run_time = time.perf_counter() - t0
    print(f"\nCompleted all levels in {total_run_time:.1f}s!\n")

    print("----------------------------------------------------------------------------------------------------------------------")
    print(f"{'Cams':<5} | {'Duration':<9} | {'Cap FPS':<8} | {'Inf FPS':<8} | {'Agg FPS':<8} | {'Cap-Pub p95':<12} | {'Buffer Overwrite%':<18} | {'Cap Fail%':<10} | {'Throughput Match':<16}")
    print("----------------------------------------------------------------------------------------------------------------------")
    for r in report["sustained_scaling_results"]:
        cams = r["active_cameras"]
        dur = f"{r['measurement_window_seconds']}s"
        cap = f"{r['aggregate_capture_fps'] / cams:.1f}"
        inf = f"{r['aggregate_inference_fps'] / cams:.2f}"
        agg = f"{r['aggregate_inference_fps']:.2f}"
        p95 = f"{r['pooled_latency']['p95_capture_to_published_ms']:.1f}ms"
        ovr = f"{r['buffer_overwrite_rate_percent']:.1f}% ({r['total_buffer_overwrites']})"
        fail = f"{r['capture_failure_rate_percent']:.2f}%"
        agree = f"YES ({r['throughput_discrepancy']:.4f})" if r["throughput_mathematical_agreement"] else f"NO ({r['throughput_discrepancy']:.4f})"
        print(f"{cams:<5} | {dur:<9} | {cap:<8} | {inf:<8} | {agg:<8} | {p95:<12} | {ovr:<18} | {fail:<10} | {agree:<16}")
    print("----------------------------------------------------------------------------------------------------------------------")
