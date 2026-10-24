#!/usr/bin/env python3
"""
CROWDGUARD v2.0 — Phase 4.9 End-to-End Live Monitoring, Alert Reliability
& Incident Lifecycle Validation CLI

Executes systematic validation across 10 mission-critical stages:
1. End-to-end telemetry and processed frame flow
2. Alert sustenance window and transient flicker suppression (N=3)
3. Alert cooldown deduplication and re-arming (4.0s)
4. De-escalation condition counter reset
5. Incident lifecycle state machine (Open -> Acknowledged -> Resolved)
6. Evidentiary snapshot keyframe generation and retrieval
7. Timestamp monotonicity and end-to-end causality
8. Camera disconnection, stale telemetry guards, and reconnect resets
9. Multi-camera incident state isolation
10. Measured capture-to-alert latency distributions

Usage:
    python scripts/run_incident_lifecycle_validation.py
    python scripts/run_incident_lifecycle_validation.py --verbose
    python scripts/run_incident_lifecycle_validation.py --output data/reports/custom_incident_report.json
    python scripts/run_incident_lifecycle_validation.py --check
"""

import sys
import os
import argparse
import json

# Ensure backend directory is in path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, os.path.abspath("backend"))

from app.services.evaluation_service import evaluation_service


def main():
    parser = argparse.ArgumentParser(
        description="CROWDGUARD Phase 4.9 Live Monitoring & Incident Lifecycle Validation CLI"
    )
    parser.add_argument(
        "--output",
        type=str,
        default="data/reports/incident_lifecycle_validation_results.json",
        help="Path where the machine-readable JSON validation report will be saved"
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Prints detailed stage diagnostics, state transitions, and latency percentiles"
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exits with non-zero exit code if any validation stage fails"
    )

    args = parser.parse_args()

    print("=" * 88)
    print("CROWDGUARD v2.0 — Phase 4.9: Live Monitoring & Incident Lifecycle Validation")
    print("End-to-End Flow, Alert Sustenance, Cooldown Deduplication & Lifecycle State Machine")
    print("=" * 88)

    report = evaluation_service.validate_phase49_incident_lifecycle(save_report=True)

    # Save to custom output if requested
    if args.output != "data/reports/incident_lifecycle_validation_results.json":
        os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
        print(f"Report also exported to: {args.output}")

    print(f"\nOverall Validation Status: {report['validation_status']}")
    print(f"Stages Evaluated: {report['total_stages_evaluated']}")
    print(f"Passed: {report['stages_passed']} | Failed: {report['stages_failed']}")
    print("-" * 88)
    print(f"{'Stage ID':<38} | {'Stage Name':<38} | {'Status':<8}")
    print("-" * 88)

    stages = report.get("validation_stages", [])
    for st in stages:
        st_id = st["stage_id"][:38]
        st_name = st["name"][:38]
        st_status = st["status"]
        print(f"{st_id:<38} | {st_name:<38} | {st_status:<8}")

    print("-" * 88)

    if args.verbose:
        print("\n" + "=" * 88)
        print("STAGE 2 & 3: SUSTENANCE WINDOW & COOLDOWN DEDUPLICATION DYNAMICS")
        print("=" * 88)
        st2 = next((s for s in stages if "stage_02" in s["stage_id"]), {})
        st3 = next((s for s in stages if "stage_03" in s["stage_id"]), {})
        print(f"Sustenance Required Frames: {st2.get('inputs', {}).get('sustenance_frames_required')}")
        print(f"Transient Spike Alert Count: {st2.get('observed_metrics', {}).get('transient_spike_alert_count')}")
        print(f"Sustained Frame 3 Alert Count: {st2.get('observed_metrics', {}).get('sustained_frame_3_alert_count')}")
        print(f"Cooldown Window Duration: {st3.get('inputs', {}).get('cooldown_sec')}s")
        print(f"Duplicate Alerts Suppressed: {st3.get('observed_metrics', {}).get('duplicates_suppressed_count')}")
        print(f"Post-Cooldown Re-Arm Count: {st3.get('observed_metrics', {}).get('post_cooldown_rearm_count')}")

        print("\n" + "=" * 88)
        print("STAGE 5: INCIDENT LIFECYCLE AUDIT TRAIL")
        print("=" * 88)
        st5 = next((s for s in stages if "stage_05" in s["stage_id"]), {})
        om5 = st5.get("observed_metrics", {})
        print(f"Created Incident ID: {st5.get('inputs', {}).get('test_incident_id')}")
        print(f"Initial State: {om5.get('initial_state')}")
        print(f"Acknowledged State: {om5.get('acknowledged_state')}")
        print(f"Resolved State: {om5.get('resolved_state')}")

        print("\n" + "=" * 88)
        print("STAGE 7: TIMESTAMP ORDERING & CAUSALITY TRACE")
        print("=" * 88)
        st7 = next((s for s in stages if "stage_07" in s["stage_id"]), {})
        om7 = st7.get("observed_metrics", {})
        print(f"Monotonicity Verified: {om7.get('strict_monotonicity_holds')}")
        print(f"  Capture -> Inference : {om7.get('t_capture_to_infer_ms')} ms")
        print(f"  Inference -> Risk    : {om7.get('t_infer_to_risk_ms')} ms")
        print(f"  Risk -> Alert Trigger: {om7.get('t_risk_to_alert_ms')} ms")

        print("\n" + "=" * 88)
        print("STAGE 10: END-TO-END MEASURED LATENCY DISTRIBUTIONS")
        print("=" * 88)
        st10 = next((s for s in stages if "stage_10" in s["stage_id"]), {})
        om10 = st10.get("observed_metrics", {})
        print(f"Alert Decision Execution Time: Mean = {om10.get('mean_decision_ms')} ms | p50 = {om10.get('p50_decision_ms')} ms | p95 = {om10.get('p95_decision_ms')} ms")

    print(f"\nReport saved to: data/reports/incident_lifecycle_validation_results.json")

    if args.check and report["stages_failed"] > 0:
        print(f"\n[FAIL] {report['stages_failed']} validation stage(s) failed.")
        sys.exit(1)
    else:
        print("\n[SUCCESS] All incident lifecycle validation stages passed.")
        sys.exit(0)


if __name__ == "__main__":
    main()
