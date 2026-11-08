import json
import numpy as np

with open("data/reports/phase56_soak_test_telemetry.json", "r", encoding="utf-8") as f:
    data = json.load(f)

samples = data.get("samples", [])
print(f"Total samples: {len(samples)}")
print(f"Reported duration: {data.get('duration_seconds')}s")
summary_acct = data.get("frame_disposition_accounting", {})
print("Summary Accounting:", summary_acct)

# Check all 90 samples for invariant
invalid_checkpoints = []
rss_series = []
cpu_series = []
input_fps_series = []
proc_fps_series = []
timestamps = []
intervals = []

prev_t = 0.0
for idx, s in enumerate(samples):
    cap = s.get("frames_captured", 0)
    succ = s.get("frames_processed_success", 0)
    over = s.get("buffer_overwrites", 0)
    rej = s.get("frames_rejected", 0)
    fail = s.get("frames_processing_failed", 0)
    pend = s.get("pending_frames", 0)
    inflight = s.get("in_flight_frames", 0)
    disp_sum = succ + over + rej + fail + pend + inflight
    if disp_sum != cap:
        invalid_checkpoints.append((idx, s.get("elapsed_seconds"), cap, disp_sum))
    
    t = s.get("elapsed_seconds", 0.0)
    if idx > 0:
        intervals.append(round(t - prev_t, 2))
    prev_t = t

    rss_series.append(s.get("rss_memory_mb", 0.0))
    cpu_series.append(s.get("cpu_percent", 0.0))
    input_fps_series.append(s.get("input_fps", 0.0))
    proc_fps_series.append(s.get("processing_fps", 0.0))
    timestamps.append(s.get("timestamp"))

print(f"Invariant check: {len(invalid_checkpoints)} invalid checkpoints out of {len(samples)}.")

# Check sample timing
print(f"First timestamp: {timestamps[0]} | Last timestamp: {timestamps[-1]}")
print(f"Min sample interval: {min(intervals)}s | Max interval: {max(intervals)}s | Mean interval: {np.mean(intervals):.2f}s")
print(f"Total duration from elapsed: {samples[-1]['elapsed_seconds']}s")

# RSS Trend Analysis
mem = data.get("memory_integrity", {})
print("\n--- Memory Analysis ---")
print(f"Reported Initial RSS: {mem.get('initial_rss_mb')} MB")
print(f"Sample 0 RSS: {rss_series[0]} MB")
print(f"Sample peak RSS: {max(rss_series)} MB (at sample {rss_series.index(max(rss_series))}, t={samples[rss_series.index(max(rss_series))]['elapsed_seconds']}s)")
print(f"Sample min RSS: {min(rss_series)} MB (at sample {rss_series.index(min(rss_series))}, t={samples[rss_series.index(min(rss_series))]['elapsed_seconds']}s)")
print(f"Last Sample RSS: {rss_series[-1]} MB")
print(f"Reported Final RSS: {mem.get('final_rss_mb')} MB")

# Check RSS drops
print("\nSignificant RSS transitions:")
for i in range(1, len(rss_series)):
    diff = rss_series[i] - rss_series[i-1]
    if abs(diff) > 40.0:
        print(f"  Sample {i-1} -> {i} (t={samples[i-1]['elapsed_seconds']}s -> {samples[i]['elapsed_seconds']}s): {rss_series[i-1]} MB -> {rss_series[i]} MB (Delta: {diff:+.1f} MB)")

# CPU Analysis
print("\n--- CPU Analysis ---")
print(f"Reported Mean CPU: {data.get('performance_and_throughput', {}).get('mean_cpu_percent')}%")
print(f"Computed Mean CPU from samples: {np.mean(cpu_series):.2f}%")
print(f"Min CPU: {min(cpu_series)}% | Max CPU: {max(cpu_series)}%")

# Throughput Analysis
print("\n--- Throughput Analysis ---")
print(f"Mean Input FPS: {np.mean(input_fps_series):.2f} FPS")
print(f"Mean Processing FPS: {np.mean(proc_fps_series):.2f} FPS")
last_s = samples[-1]
overall_input_fps = last_s['frames_captured'] / last_s['elapsed_seconds']
overall_proc_fps = last_s['frames_processed_success'] / last_s['elapsed_seconds']
print(f"Cumulative Overall Input FPS: {overall_input_fps:.2f} FPS ({last_s['frames_captured']} frames / {last_s['elapsed_seconds']}s)")
print(f"Cumulative Overall Processing FPS: {overall_proc_fps:.2f} FPS ({last_s['frames_processed_success']} frames / {last_s['elapsed_seconds']}s)")
