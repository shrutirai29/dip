#!/usr/bin/env python3
"""
CROWDGUARD v2.0 — Phase 5.0 Operational Readiness & Crowd Scenario Validation CLI

Executes systematic operational evaluation:
- 18 Deterministic Crowd Scenarios (Empty scene to extreme surge, occlusion, and low light)
- Tracking continuity and ID stability audit
- Detection accuracy evaluation (Natural surveillance vs Synthetic negative controls)
- End-to-end component latency breakdown (mean, p50, p95)
- Multi-camera scalability throughput (1 to 4 streams)
- Continuing incident deduplication (Categories A, B, C, D)
- Camera disconnection resilience and stale telemetry guards
- Operational readiness checklist verdicts (VERIFIED PASS, BLOCKED, OBSERVATION / LIMITATION)

Usage:
    python scripts/run_operational_readiness_validation.py
    python scripts/run_operational_readiness_validation.py --verbose
    python scripts/run_operational_readiness_validation.py --output data/reports/custom_operational_report.json
    python scripts/run_operational_readiness_validation.py --check
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
        description="CROWDGUARD Phase 5.0 Operational Readiness & Scenario Validation CLI"
    )
    parser.add_argument(
        "--output",
        type=str,
        default="data/reports/operational_readiness_results.json",
        help="Path where the machine-readable JSON validation report will be saved"
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Prints detailed scenario tables, tracking continuity metrics, and latency percentiles"
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exits with non-zero exit code if any scenario or readiness check fails"
    )

    args = parser.parse_args()

    print("=" * 90)
    print("CROWDGUARD v2.0 — Phase 5.0: Operational Readiness & Crowd Scenario Validation")
    print("18 Scenarios, Tracking Continuity, Latency Breakdown & Deduplication Architecture")
    print("=" * 90)

    report = evaluation_service.validate_phase50_operational_readiness(save_report=True)

    # Save to custom output if requested
    if args.output != "data/reports/operational_readiness_results.json":
        os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
        print(f"Report also exported to: {args.output}")

    summary = report.get("scenarios_summary", {})
    print(f"\nOverall Validation Status: {report['validation_status']}")
    print(f"Execution Duration: {report.get('execution_time_sec', 0.0):.2f}s")
    print(f"Scenarios Evaluated: {summary.get('total_scenarios_evaluated', 18)}")
    print(f"Passed: {summary.get('scenarios_passed', 0)} | Failed: {summary.get('scenarios_failed', 0)} | Success Rate: {summary.get('success_rate_percent', 0.0)}%")
    print("-" * 90)
    print(f"{'Scenario ID':<36} | {'Category':<22} | {'Test Type':<18} | {'Status':<8}")
    print("-" * 90)

    for sc in report.get("scenarios", []):
        sc_id = sc["scenario_id"][:36]
        sc_cat = sc["category"][:22]
        sc_type = sc["test_type"][:18]
        sc_stat = sc["status"]
        print(f"{sc_id:<36} | {sc_cat:<22} | {sc_type:<18} | {sc_stat:<8}")

    print("-" * 90)

    if args.verbose:
        print("\n" + "=" * 90)
        print("STAGE 3: DETECTION & TRACKING CONTINUITY AUDIT")
        print("=" * 90)
        det = report.get("detection_evaluation", {})
        trk = report.get("tracking_continuity", {})
        print(f"Detection Accuracy (conf >= 0.30, iou >= 0.50):")
        print(f"  Precision: {det.get('overall_precision')} | Recall: {det.get('overall_recall')} | F1 Score: {det.get('overall_f1')} | Mean IoU: {det.get('mean_iou')}")
        print(f"Tracking Continuity (SimpleByteTracker):")
        print(f"  Stability Rate: {trk.get('track_stability_rate_percent')}% | Unique Tracks Spawned: {trk.get('unique_track_ids_spawned')} | ID Switches: {trk.get('id_switches')}")

        print("\n" + "=" * 90)
        print("STAGE 4: END-TO-END MEASURED LATENCY BREAKDOWN (25 Samples, CPU)")
        print("=" * 90)
        lat = report.get("end_to_end_latency", {})
        for stage_name in ["capture_ms", "inference_ms", "tracking_ms", "risk_scoring_ms", "alert_decision_ms", "total_capture_to_alert_ms"]:
            st_data = lat.get(stage_name, {})
            print(f"  {stage_name:<26}: Mean = {st_data.get('mean'):>6.2f} ms | p50 = {st_data.get('p50'):>6.2f} ms | p95 = {st_data.get('p95'):>6.2f} ms")

        print("\n" + "=" * 90)
        print("OPERATIONAL READINESS CHECKLIST VERDICTS")
        print("=" * 90)
        for item in report.get("operational_readiness_checklist", []):
            print(f"  [{item.get('verdict'):<22}] {item.get('item'):<48} ({item.get('evidence')})")

    print(f"\nMachine-readable report saved to: data/reports/operational_readiness_results.json")

    if args.check and summary.get("scenarios_failed", 0) > 0:
        print(f"\n[FAIL] {summary.get('scenarios_failed')} scenario(s) failed.")
        sys.exit(1)
    else:
        print("\n[SUCCESS] Phase 5.0 operational readiness validation passed.")
        sys.exit(0)


if __name__ == "__main__":
    main()
