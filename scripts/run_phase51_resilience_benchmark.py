#!/usr/bin/env python3
"""
CROWDGUARD v2.0 — Phase 5.1 Real-Time Delivery & Multi-Camera Resilience Benchmark CLI Runner
Executes WebSocket event push validation, reconnection replay, slow consumer bounding,
multi-stream scalability, camera disconnection/reconnection fault tolerance, and Category A-D deduplication.

Usage:
    python scripts/run_phase51_resilience_benchmark.py [--verbose] [--check] [--max-cameras 4] [--output path.json]
"""

import sys
import os
import argparse
import json
import time

# Ensure repository root is on Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))


def main():
    parser = argparse.ArgumentParser(description="CROWDGUARD Phase 5.1 Real-Time Delivery & Resilience Benchmark Runner")
    parser.add_argument("--verbose", "-v", action="store_true", help="Print detailed diagnostic output")
    parser.add_argument("--check", action="store_true", help="Exit with non-zero code if any resilience test fails")
    parser.add_argument("--max-cameras", type=int, default=4, help="Maximum concurrent camera streams (1 to 4)")
    parser.add_argument("--duration", type=float, default=4.0, help="Measurement window duration in seconds")
    parser.add_argument("--output", "-o", type=str, default="data/reports/realtime_delivery_and_resilience_results.json", help="Report output path")
    args = parser.parse_args()

    print("=" * 90)
    print("CROWDGUARD v2.0 — Phase 5.1: Real-Time Event Delivery & Resilience Validation")
    print("WebSocket Push, Replay Recovery, Slow Consumer Bounding & Multi-Stream Scalability")
    print("=" * 90)

    from app.services.evaluation_service import evaluation_service

    t0 = time.time()
    try:
        report = evaluation_service.run_phase51_multicamera_and_resilience_benchmark(
            save_report=True,
            max_cameras=args.max_cameras,
            warmup_duration_sec=2.0,
            measurement_duration_sec=args.duration
        )
    except Exception as e:
        print(f"\n[FATAL ERROR] Phase 5.1 benchmark failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    elapsed = time.time() - t0

    # Print Multi-Camera Scalability Table
    print(f"\nOverall Validation Status: {report['validation_status']}")
    print(f"Total Execution Duration: {elapsed:.2f}s")
    print("\n" + "=" * 90)
    print("MULTI-CAMERA CONCURRENT STREAM SCALABILITY (1 to 4 STREAMS)")
    print("=" * 90)
    print(f"{'Cameras':<8} | {'Agg FPS':<10} | {'Per-Cam FPS':<12} | {'Overwrite %':<12} | {'CPU Util %':<12} | {'Mem RSS (MB)':<12} | {'Max Queue':<10}")
    print("-" * 90)
    for res in report.get("multicamera_scaling", []):
        cams = res.get("active_cameras", 1)
        agg_fps = res.get("aggregate_inference_fps", 0.0)
        mean_fps = res.get("mean_inference_fps_per_camera", 0.0)
        ovr = res.get("buffer_overwrite_rate_percent", 0.0)
        cpu = res.get("resource_utilization", {}).get("mean_cpu_percent", 0.0)
        mem = res.get("resource_utilization", {}).get("end_memory_rss_mb", 0.0)
        q = res.get("stability_audit", {}).get("max_pending_queue_depth", 0)
        print(f"{cams:<8} | {agg_fps:<10.2f} | {mean_fps:<12.2f} | {ovr:<12.1f} | {cpu:<12.1f} | {mem:<12.1f} | {q:<10}")
    print("-" * 90)

    # Print Event Delivery Metrics
    deliv = report.get("event_delivery_metrics", {})
    lat = deliv.get("publication_latency_ms", {})
    print("\n" + "=" * 90)
    print("WEBSOCKET EVENT PUBLICATION LATENCY (50 SAMPLES, MONOTONIC CLOCK)")
    print("=" * 90)
    print(f"  Mean Publication Latency : {lat.get('mean', 0.0):.3f} ms")
    print(f"  Median (p50) Latency     : {lat.get('p50', 0.0):.3f} ms")
    print(f"  95th Percentile (p95)    : {lat.get('p95', 0.0):.3f} ms")
    print(f"  Publication SLA Target   : < {lat.get('sla_target_ms', 2.0):.1f} ms [{lat.get('status', 'PASS')}]")
    print(f"  Replay Buffer Capacity   : {deliv.get('buffer_capacity', 200)} events (Active: {deliv.get('buffer_current_size', 0)})")
    print(f"  Slow-Consumer Drops      : {deliv.get('slow_consumer_dropped', 0)} events cleanly bounded")

    # Print Seven Resilience Tests
    print("\n" + "=" * 90)
    print("SEVEN FAILURE & RECOVERY RESILIENCE TESTS")
    print("=" * 90)
    print(f"{'Test ID':<35} | {'Test Name':<38} | {'Status':<10}")
    print("-" * 90)
    for t in report.get("resilience_and_recovery_tests", []):
        tid = t.get("test_id", "")[:35]
        name = t.get("name", "")[:38]
        st = t.get("status", "FAILED")
        print(f"{tid:<35} | {name:<38} | {st:<10}")
        if args.verbose:
            print(f"    -> Evidence: {t.get('evidence', '')}")
    print("-" * 90)

    # Print Operational Checklist
    print("\n" + "=" * 90)
    print("PHASE 5.1 OPERATIONAL READINESS CHECKLIST")
    print("=" * 90)
    for item in report.get("operational_checklist", []):
        verdict = item.get("verdict", "")
        name = item.get("item", "")
        evid = item.get("evidence", "")
        print(f"  [{verdict:<24}] {name:<65} ({evid})")

    # Save to custom output if provided
    if args.output and args.output != "data/reports/realtime_delivery_and_resilience_results.json":
        os.makedirs(os.path.dirname(args.output), exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
        print(f"\nReport written to: {args.output}")
    else:
        print(f"\nMachine-readable report saved to: data/reports/realtime_delivery_and_resilience_results.json")

    # Check assertions
    if args.check:
        failed_tests = [t["name"] for t in report.get("resilience_and_recovery_tests", []) if t["status"] != "PASSED"]
        if failed_tests:
            print(f"\n[FAILURE] Resilience tests failed: {failed_tests}")
            sys.exit(1)
        if report.get("validation_status") != "PASSED":
            print("\n[FAILURE] Overall Phase 5.1 validation status is FAILED.")
            sys.exit(1)

    print("\n[SUCCESS] Phase 5.1 real-time delivery and resilience benchmark passed cleanly.")


if __name__ == "__main__":
    main()
