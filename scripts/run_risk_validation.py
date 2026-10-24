#!/usr/bin/env python3
"""
CROWDGUARD v2.0 — Phase 4.8 Risk Engine Validation CLI
Executes deterministic scenario validation, temporal decay dynamics,
spatial sensitivity, category boundary invariants, and multi-camera isolation.

Usage:
    python scripts/run_risk_validation.py
    python scripts/run_risk_validation.py --verbose
    python scripts/run_risk_validation.py --output data/reports/custom_risk_report.json
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
        description="CROWDGUARD Phase 4.8 Crowd Risk Engine Validation CLI"
    )
    parser.add_argument(
        "--output",
        type=str,
        default="data/reports/risk_engine_validation_results.json",
        help="Path where the machine-readable JSON validation report will be saved"
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Prints detailed scenario tables, decay steps, and spatial comparisons"
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exits with non-zero status if any scenario fails validation"
    )

    args = parser.parse_args()

    print("=" * 80)
    print("CROWDGUARD v2.0 — Phase 4.8: Crowd Risk Engine Validation")
    print("Deterministic Scenario Testing, Temporal Dynamics & Boundary Invariants")
    print("=" * 80)

    report = evaluation_service.validate_phase48_risk_engine(save_report=True)

    # If user provided a different output file than the default, save there too
    if args.output != "data/reports/risk_engine_validation_results.json":
        os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
        print(f"Report also exported to: {args.output}")

    print(f"\nValidation Status: {report['validation_status']}")
    print(f"Total Scenarios Evaluated: {report['total_scenarios_evaluated']}")
    print(f"Passed: {report['scenarios_passed']} | Failed: {report['scenarios_failed']}")
    print("-" * 80)
    print(f"{'ID':<6} | {'Scenario Name':<42} | {'Category':<22} | {'Status':<6}")
    print("-" * 80)

    for sc in report["scenario_matrix"]:
        sc_id = sc["scenario_id"][:6]
        sc_name = sc["name"][:42]
        sc_cat = sc["category"][:22]
        sc_status = sc["status"]
        print(f"{sc_id:<6} | {sc_name:<42} | {sc_cat:<22} | {sc_status:<6}")

    print("-" * 80)

    if args.verbose:
        print("\n" + "=" * 80)
        print("TEMPORAL DYNAMICS & EXPONENTIAL DECAY (alpha = 0.30)")
        print("=" * 80)
        temp = report["temporal_dynamics"]
        print(f"Theoretical Half-Life: {temp['theoretical_half_life_frames']} frames")
        print(f"Decay Multiplier per Frame: {temp['decay_multiplier_per_frame']}")
        print(f"Peak Initial Score: {temp['peak_initial_score']}")
        print(f"Time to Reach Low Band (<25.0): {temp['time_to_reach_low_band_frames']} frames")
        print(f"Oscillation Detected: {temp['oscillation_detected']}")
        print("\nStep-by-Step Decay Progression:")
        print(f"{'Step':<5} | {'Observed Score':<15} | {'Theoretical Score':<18} | {'Band':<10}")
        print("-" * 55)
        for s in temp["decay_curve_steps"]:
            print(f"{s['step']:<5} | {s['score']:<15.2f} | {s['theoretical_score']:<18.2f} | {s['band']:<10}")

        print("\n" + "=" * 80)
        print("SPATIAL SENSITIVITY & BOTTLENECK ANALYSIS (N = 18 Persons)")
        print("=" * 80)
        sp = report["spatial_sensitivity"]
        print(f"Spatial Sensitivity Proven: {sp['sensitivity_proven']}")
        for cfg in sp["configurations"]:
            print(f"- Layout: {cfg['layout']}")
            print(f"  Description: {cfg['description']}")
            print(f"  Max Cluster Density: {cfg['max_cluster_density']} | Concentration Ratio: {cfg['concentration_ratio']}")
            print(f"  Congestion Component: {cfg['congestion_component']} | Resulting Risk: {cfg['resulting_risk_score']} ({cfg['band']})")

        print("\n" + "=" * 80)
        print("DETECTION-TO-RISK INTEGRATION SENSITIVITY")
        print("=" * 80)
        det = report["detection_integration"]
        dup = det["duplicate_detection_impact"]
        print(f"- Duplicate Detection Impact (real_f145 model):")
        print(f"  5-person baseline: {dup['baseline_count_5_score']} -> 6-person duplicate: {dup['duplicate_count_6_score']} (Delta: +{dup['risk_delta_points']} pts)")
        print(f"  Conclusion: {dup['conclusion']}")
        
        occ = det["occlusion_transient_dampening"]
        print(f"- Occlusion Transient Dampening (15 -> 3 count drop):")
        print(f"  Pre-occlusion: {occ['pre_occlusion_score']} -> Instantaneous raw: {occ['instantaneous_raw_score']} -> Cushioned smoothed: {occ['smoothed_cushioned_score']}")
        print(f"  Conclusion: {occ['conclusion']}")

    print("\n" + "=" * 80)
    print("CALIBRATION & SCIENTIFIC INTEGRITY NOTICE:")
    print(report["calibration_disclaimer"])
    print("=" * 80 + "\n")

    if args.check and report["validation_status"] != "PASSED":
        sys.exit(1)


if __name__ == "__main__":
    main()
