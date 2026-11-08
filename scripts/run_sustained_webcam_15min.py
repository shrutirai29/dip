"""
CROWDGUARD v2.0 — Phase 5.6 15-Minute Continuous Physical Webcam Soak Test

Executes a sustained continuous 15-minute (900s) ingestion and full AI analytics
pipeline soak test on physical webcam hardware (DirectShow Device 0).
Monitors:
- RSS memory drift and leak verification
- CPU utilization across time
- Decoupled frame-disposition accounting (captured = processed + overwrites + rejected + failed + pending + in_flight)
- Live pipeline latency and FPS stability
- Generates reproducible JSON telemetry: data/reports/phase56_soak_test_telemetry.json
"""

import os
import sys
import time
import json
import platform
import psutil
import cv2
import numpy as np

sys.path.insert(0, os.path.abspath("backend"))

from app.services.camera_registry import camera_registry_service
from app.services.camera_session import CameraConfig, CameraSession


def run_soak_test(duration_minutes: float = 15.0, output_path: str = "data/reports/phase56_soak_test_telemetry.json"):
    duration_sec = duration_minutes * 60.0
    print(f"================================================================================")
    print(f"CROWDGUARD v2.0 — Phase 5.6 15-Minute Continuous Physical Webcam Soak Test")
    print(f"Target Duration: {duration_minutes:.1f} minutes ({duration_sec:.0f} seconds)")
    print(f"Output Telemetry: {output_path}")
    print(f"================================================================================")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # 1. Clean camera registry
    with camera_registry_service._lock:
        for s in list(camera_registry_service._sessions.values()):
            try:
                s.stop()
            except Exception:
                pass
        camera_registry_service._sessions.clear()

    # 2. Register webcam session
    session = camera_registry_service.register_camera(
        name="Phase 5.6 15min Soak Webcam",
        source_type="webcam",
        device_index=0,
        target_fps=20.0,
        conf_threshold=0.30,
        inference_size=640,
    )
    session.reset_frame_accounting()
    session.reset_benchmark_metrics()

    process = psutil.Process()
    initial_rss_mb = round(process.memory_info().rss / (1024 * 1024), 2)
    sample_interval = 10.0
    samples = []

    t_start = time.perf_counter()
    wall_start = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    print(f"Starting camera session at {wall_start} (Initial RSS: {initial_rss_mb} MB)...")
    session.start()

    print("\nTimestamp | Elapsed (s) | In FPS | Proc FPS | Overwrites | Success | Failed | RSS (MB) | CPU % | Balanced?")
    print("-" * 105)

    elapsed = 0.0
    try:
        while elapsed < duration_sec:
            time.sleep(min(sample_interval, max(0.1, duration_sec - elapsed)))
            elapsed = time.perf_counter() - t_start
            st = session.get_status()
            mem_mb = round(process.memory_info().rss / (1024 * 1024), 2)
            cpu = psutil.cpu_percent(interval=None)

            sample_entry = {
                "timestamp": time.strftime("%H:%M:%S"),
                "elapsed_seconds": round(elapsed, 1),
                "rss_memory_mb": mem_mb,
                "cpu_percent": cpu,
                "input_fps": st.get("measured_fps", 0.0),
                "processing_fps": st.get("processing_fps", 0.0),
                "frames_captured": st.get("frames_captured", 0),
                "frames_consumed": st.get("frames_consumed", 0),
                "buffer_overwrites": st.get("buffer_overwrites", 0),
                "frames_processed_success": st.get("frames_processed_success", 0),
                "frames_processing_failed": st.get("frames_processing_failed", 0),
                "frames_rejected": st.get("frames_rejected", 0),
                "pending_frames": st.get("pending_frames", 0),
                "in_flight_frames": st.get("in_flight_frames", 0),
                "disposition_sum": st.get("disposition_sum", 0),
                "disposition_balanced": st.get("disposition_balanced", False),
                "accounting_identity_holds": st.get("accounting_identity_holds", False),
                "pipeline_latency_ms": st.get("pipeline_latency_ms", 0.0),
                "capture_to_alert_ms": st.get("capture_to_alert_ms", 0.0),
            }
            samples.append(sample_entry)

            print(
                f"{sample_entry['timestamp']}  | "
                f"{elapsed:9.1f}   | "
                f"{sample_entry['input_fps']:6.1f} | "
                f"{sample_entry['processing_fps']:8.1f} | "
                f"{sample_entry['buffer_overwrites']:10d} | "
                f"{sample_entry['frames_processed_success']:7d} | "
                f"{sample_entry['frames_processing_failed']:6d} | "
                f"{mem_mb:8.1f} | "
                f"{cpu:5.1f}% | "
                f"{str(sample_entry['disposition_balanced']):9s}"
            )

    except KeyboardInterrupt:
        print("\nSoak test interrupted by user.")
    finally:
        t_end = time.perf_counter()
        wall_end = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        final_status = session.get_status()
        session.stop()

    actual_duration_sec = round(t_end - t_start, 2)
    final_rss_mb = round(process.memory_info().rss / (1024 * 1024), 2)
    rss_values = [s["rss_memory_mb"] for s in samples] if samples else [initial_rss_mb]
    cpu_values = [s["cpu_percent"] for s in samples] if samples else [0.0]
    in_fps_values = [s["input_fps"] for s in samples if s["input_fps"] > 0]
    proc_fps_values = [s["processing_fps"] for s in samples if s["processing_fps"] > 0]

    peak_rss_mb = round(max(rss_values), 2)
    min_rss_mb = round(min(rss_values), 2)
    rss_growth_mb = round(final_rss_mb - initial_rss_mb, 2)
    leakage_detected = (rss_growth_mb > 150.0)

    # Dispositions
    breakdown = final_status.get("accounting_disposition_breakdown", {})
    captured = final_status.get("frames_captured", 0)
    consumed = final_status.get("frames_consumed", 0)
    overwrites = final_status.get("buffer_overwrites", 0)
    success = final_status.get("frames_processed_success", 0)
    failed = final_status.get("frames_processing_failed", 0)
    rejected = final_status.get("frames_rejected", 0)
    pending = final_status.get("pending_frames", 0)
    in_flight = final_status.get("in_flight_frames", 0)
    disp_sum = final_status.get("disposition_sum", 0)
    disp_balanced = final_status.get("disposition_balanced", False)

    summary = {
        "test_name": "Phase 5.6 15-Minute Continuous Physical Webcam Soak Test",
        "started_at": wall_start,
        "completed_at": wall_end,
        "duration_seconds": actual_duration_sec,
        "target_duration_seconds": duration_sec,
        "samples_collected": len(samples),
        "hardware": {
            "platform": platform.platform(),
            "python_version": platform.python_version(),
            "cpu_count": psutil.cpu_count(logical=True),
            "total_ram_gb": round(psutil.virtual_memory().total / (1024**3), 2),
            "camera_source": "Physical Webcam (DirectShow Device 0)"
        },
        "frame_disposition_accounting": {
            "frames_captured": captured,
            "frames_consumed": consumed,
            "buffer_overwrites": overwrites,
            "frames_processed_success": success,
            "frames_processing_failed": failed,
            "frames_rejected": rejected,
            "pending_frames": pending,
            "in_flight_frames": in_flight,
            "disposition_sum": disp_sum,
            "disposition_balanced": disp_balanced,
            "identity_formula": "captured = processed_success + buffer_overwrites + rejected + processing_failed + pending + in_flight",
            "all_samples_balanced": all(s["disposition_balanced"] for s in samples) if samples else False
        },
        "performance_and_throughput": {
            "mean_input_fps": round(float(np.mean(in_fps_values)), 2) if in_fps_values else 0.0,
            "mean_processing_fps": round(float(np.mean(proc_fps_values)), 2) if proc_fps_values else 0.0,
            "mean_cpu_percent": round(float(np.mean(cpu_values)), 2) if cpu_values else 0.0,
            "peak_cpu_percent": round(float(np.max(cpu_values)), 2) if cpu_values else 0.0
        },
        "memory_integrity": {
            "initial_rss_mb": initial_rss_mb,
            "final_rss_mb": final_rss_mb,
            "peak_rss_mb": peak_rss_mb,
            "min_rss_mb": min_rss_mb,
            "rss_drift_mb": rss_growth_mb,
            "leakage_suspected": leakage_detected
        },
        "samples": samples
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print("\n================================================================================")
    print("15-Minute Continuous Webcam Soak Test Complete!")
    print(f"Duration: {actual_duration_sec:.1f}s | Samples: {len(samples)}")
    print(f"Captured: {captured} | Success: {success} | Overwrites: {overwrites} | Failures: {failed}")
    print(f"Disposition Formula Sum: {disp_sum} | Balanced: {disp_balanced}")
    print(f"Memory: Initial={initial_rss_mb} MB -> Final={final_rss_mb} MB (Drift: {rss_growth_mb} MB)")
    print(f"Saved Telemetry to: {output_path}")
    print("================================================================================")
    return summary


if __name__ == "__main__":
    dur = float(sys.argv[1]) if len(sys.argv) > 1 else 15.0
    out = sys.argv[2] if len(sys.argv) > 2 else "data/reports/phase56_soak_test_telemetry.json"
    run_soak_test(dur, out)
