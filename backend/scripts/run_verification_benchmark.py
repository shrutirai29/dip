import sys
import os
import json

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath("backend"))

from app.services.evaluation_service import evaluation_service

if __name__ == "__main__":
    print("Starting 4-camera verification benchmark...")
    rep = evaluation_service.run_multicamera_benchmark(max_cameras=4, sample_duration_sec=4.0)
    print("Benchmark completed successfully!")
    for r in rep["scaling_results"]:
        cams = r["active_cameras"]
        cap_fps = r["mean_capture_fps"]
        inf_fps = r["mean_inference_fps"]
        agg_fps = r["aggregate_pipeline_fps"]
        cap_to_pub = r["mean_capture_to_published_ms"]
        p95_pub = r["capture_to_published_p95_ms"]
        mean_pipe = r["mean_pipeline_latency_ms"]
        raw_age = r["mean_raw_buffer_age_seconds"]
        fail_rate = r["capture_failure_rate_percent"]
        overwrites = r["total_buffer_overwrites"]
        print(f"Cameras: {cams} | Capture: {cap_fps} FPS | Inf: {inf_fps} FPS | Agg: {agg_fps} FPS | Cap-to-Pub: {cap_to_pub:.1f}ms | p95: {p95_pub:.1f}ms | Pipe Lat: {mean_pipe:.1f}ms | Raw Age: {raw_age:.3f}s | Fail Rate: {fail_rate}% | Overwrites: {overwrites}")
