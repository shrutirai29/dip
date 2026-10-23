import sys
import os
import time

sys.path.insert(0, os.path.abspath("backend"))

from app.services.camera_registry import camera_registry_service
from app.services.camera_session import CameraSourceType
from app.services.inference_scheduler import fair_inference_scheduler

def run_prof(n_cams):
    print(f"\n=======================================================")
    print(f" Profiling {n_cams} Camera Stream(s) ")
    print(f"=======================================================")
    video_path = "data/uploads/vid_2e28e1e65a.mp4"
    cams = []
    fair_inference_scheduler.start()

    try:
        for i in range(n_cams):
            c = camera_registry_service.register_camera(
                name=f"Prof_Cam_{i+1}",
                source_type=CameraSourceType.FILE,
                rtsp_url=video_path,
                target_fps=25.0
            )
            cams.append(c)
            c.start()

        # Warmup
        time.sleep(3.0)

        # Profile for 5 seconds
        t_start = time.perf_counter()
        snaps_start = {c.camera_id: c.get_status() for c in cams}
        time.sleep(5.0)
        t_end = time.perf_counter()
        dur = t_end - t_start
        snaps_end = {c.camera_id: c.get_status() for c in cams}

        total_inf = 0
        print(f"{'Camera':<15} | {'Cap FPS':<8} | {'Inf FPS':<8} | {'Wait (p50/p95)':<16} | {'Infer Duration':<15} | {'Cap-to-Pub':<12}")
        print("---------------------------------------------------------------------------------------------------------")
        for c in cams:
            cid = c.camera_id
            st_b = snaps_start[cid]
            st_e = snaps_end[cid]
            cap_fps = (st_e["frames_captured"] - st_b["frames_captured"]) / dur
            inf_fps = (st_e["frames_inferred"] - st_b["frames_inferred"]) / dur
            total_inf += inf_fps
            
            p50_w = np_p50(c._latency_samples_scheduler_wait)
            p95_w = np_p95(c._latency_samples_scheduler_wait)
            mean_inf = c._last_inf_duration_ms
            p95_pub = np_p95(c._latency_samples_capture_to_published)

            print(f"{cid:<15} | {cap_fps:<8.1f} | {inf_fps:<8.2f} | {p50_w:.1f}ms / {p95_w:.1f}ms | {mean_inf:<15.1f} | {p95_pub:<12.1f}ms")
        print("---------------------------------------------------------------------------------------------------------")
        print(f"Aggregate Inference FPS: {total_inf:.2f} FPS across {n_cams} cameras (Elapsed: {dur:.2f}s)")

    finally:
        for c in cams:
            c.stop()
            camera_registry_service.remove_camera(c.camera_id)

def np_p50(arr):
    import numpy as np
    return float(np.percentile(arr, 50)) if arr else 0.0

def np_p95(arr):
    import numpy as np
    return float(np.percentile(arr, 95)) if arr else 0.0

if __name__ == "__main__":
    for n in [1, 2, 4]:
        run_prof(n)
