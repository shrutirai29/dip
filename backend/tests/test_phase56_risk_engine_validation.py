"""
CROWDGUARD v2.0 — Phase 5.6 Independent CrowdRiskEngine Validation Tests

Validates the deterministic heuristic risk engine across 11 distinct operational scenarios:
1. Empty scene: person_count=0, flow=0, speed=0, density=[] -> score=0.0, band='Low'
2. Sparse scene: person_count=2, low speed, low flow -> low risk (<25)
3. Dispersed moderate: person_count=15 distributed evenly across 9 cells -> moderate risk
4. Concentrated: person_count=15 concentrated in 1 cell -> elevated congestion component
5. Increasing density: successive calls with growing count -> positive growth component
6. Sustained congestion: high density over multiple calls -> smoothed risk reflects congestion
7. Noisy spikes: single-frame spike followed by drop -> EMA dampens the spike
8. Motion anomaly: high optical flow / running speed -> elevated motion component
9. Missing inputs / None values handled gracefully without exception
10. Stale / extreme inputs (NaN, Inf, negative) sanitized safely
11. Reset behavior restores state for clean camera restart / reconnection
"""

import math
import pytest
from app.services.risk_engine import CrowdRiskEngine


def test_scenario_1_empty_scene():
    """Scenario 1: Completely empty scene produces zero risk."""
    engine = CrowdRiskEngine()
    result = engine.compute_risk(current_count=0, optical_flow_mag=0.0, mean_speed=0.0, grid_densities=[])

    assert result["raw_score"] == 0.0
    assert result["smoothed_score"] == 0.0
    assert result["band"] == "Low"
    assert result["density_comp"] == 0.0
    assert result["growth_comp"] == 0.0
    assert result["motion_anomaly_comp"] == 0.0
    assert result["congestion_comp"] == 0.0


def test_scenario_2_sparse_scene():
    """Scenario 2: Sparse scene (2 persons walking normally) yields low risk."""
    engine = CrowdRiskEngine()
    result = engine.compute_risk(current_count=2, optical_flow_mag=1.2, mean_speed=1.5, grid_densities=[1, 1, 0, 0, 0, 0, 0, 0, 0])

    assert result["raw_score"] < 25.0
    assert result["smoothed_score"] < 25.0
    assert result["band"] == "Low"


def test_scenario_3_dispersed_moderate_crowd():
    """Scenario 3: 15 persons dispersed evenly across 9 grid cells."""
    engine = CrowdRiskEngine()
    even_cells = [1.67] * 9
    result = engine.compute_risk(current_count=15, optical_flow_mag=2.0, mean_speed=1.2, grid_densities=even_cells)

    assert 20.0 <= result["raw_score"] <= 60.0
    # Concentration ratio is low: 1.67 / 15 = 0.11
    assert result["congestion_comp"] < 0.25


def test_scenario_4_concentrated_crowd_congestion():
    """Scenario 4: 15 persons bottlenecked into a single grid cell."""
    engine_dispersed = CrowdRiskEngine()
    even_cells = [1.67] * 9
    res_dispersed = engine_dispersed.compute_risk(current_count=15, optical_flow_mag=2.0, mean_speed=1.2, grid_densities=even_cells)

    engine_bottleneck = CrowdRiskEngine()
    bottleneck_cells = [15.0, 0, 0, 0, 0, 0, 0, 0, 0]
    res_bottleneck = engine_bottleneck.compute_risk(current_count=15, optical_flow_mag=2.0, mean_speed=1.2, grid_densities=bottleneck_cells)

    assert res_bottleneck["congestion_comp"] > res_dispersed["congestion_comp"]
    assert res_bottleneck["density_comp"] > res_dispersed["density_comp"]
    assert res_bottleneck["raw_score"] > res_dispersed["raw_score"]


def test_scenario_5_increasing_density_growth():
    """Scenario 5: Successive frames with rapidly growing crowd count trigger growth component."""
    engine = CrowdRiskEngine()
    counts = [2, 4, 8, 14, 22]

    results = []
    for c in counts:
        res = engine.compute_risk(current_count=c, optical_flow_mag=1.0, mean_speed=1.0)
        results.append(res)

    # Late frames with positive delta must have positive growth_comp
    assert results[-1]["growth_comp"] > 0.5
    assert results[-1]["raw_score"] > results[0]["raw_score"]


def test_scenario_6_sustained_congestion():
    """Scenario 6: Sustained high density over consecutive frames drives smoothed risk into high/critical."""
    engine = CrowdRiskEngine()
    for _ in range(10):
        res = engine.compute_risk(
            current_count=28,
            optical_flow_mag=5.0,
            mean_speed=0.2, # standstill bottleneck
            grid_densities=[10, 8, 5, 2, 1, 1, 1, 0, 0]
        )

    assert res["smoothed_score"] >= 65.0
    assert res["band"] in ("High", "Critical")


def test_scenario_7_noisy_spike_damping():
    """Scenario 7: A single transient spike is smoothed by exponential moving average."""
    engine = CrowdRiskEngine(alpha_ema=0.3)

    # Establish baseline of 5 persons
    for _ in range(5):
        engine.compute_risk(current_count=5, optical_flow_mag=1.0, mean_speed=1.0)

    # Inject single huge spike
    spike_res = engine.compute_risk(current_count=30, optical_flow_mag=8.0, mean_speed=0.1)

    # Smoothed score should dampen raw spike score significantly
    assert spike_res["smoothed_score"] < spike_res["raw_score"]
    assert spike_res["smoothed_score"] < 65.0


def test_scenario_8_motion_anomaly():
    """Scenario 8: Running crowd / panic optical flow surge elevates motion component."""
    engine = CrowdRiskEngine()

    res_normal = engine.compute_risk(current_count=10, optical_flow_mag=1.0, mean_speed=1.0)
    engine.reset()
    res_surge = engine.compute_risk(current_count=10, optical_flow_mag=8.0, mean_speed=4.5)

    assert res_surge["motion_anomaly_comp"] > res_normal["motion_anomaly_comp"]
    assert res_surge["motion_anomaly_comp"] == 1.0 # 8.0 / 8.0 = 1.0


def test_scenario_9_missing_inputs_graceful():
    """Scenario 9: None and missing inputs do not raise unhandled exceptions."""
    engine = CrowdRiskEngine()
    res = engine.compute_risk(current_count=None, optical_flow_mag=None, mean_speed=None, grid_densities=None)

    assert isinstance(res, dict)
    assert res["raw_score"] == 0.0
    assert res["smoothed_score"] == 0.0
    assert res["band"] == "Low"


def test_scenario_10_extreme_and_nan_inputs():
    """Scenario 10: NaN, Inf, and negative inputs are clamped safely to valid numeric ranges."""
    engine = CrowdRiskEngine()
    res = engine.compute_risk(
        current_count=-10,
        optical_flow_mag=float("nan"),
        mean_speed=float("inf"),
        grid_densities=[float("nan"), float("-inf"), 5.0]
    )

    assert not math.isnan(res["raw_score"])
    assert not math.isnan(res["smoothed_score"])
    assert 0.0 <= res["raw_score"] <= 100.0
    assert 0.0 <= res["smoothed_score"] <= 100.0


def test_scenario_11_reset_restores_state():
    """Scenario 11: Calling reset() fully clears history and smoothed score for clean camera restart."""
    engine = CrowdRiskEngine()

    for _ in range(5):
        engine.compute_risk(current_count=20, optical_flow_mag=4.0, mean_speed=2.0)

    assert engine.last_smoothed_risk > 0.0
    assert len(engine.count_history) > 0

    engine.reset()

    assert engine.last_smoothed_risk == 0.0
    assert len(engine.count_history) == 0
    assert len(engine.speed_history) == 0

    # Next call behaves like fresh start
    res_fresh = engine.compute_risk(current_count=0, optical_flow_mag=0.0, mean_speed=0.0)
    assert res_fresh["raw_score"] == 0.0
    assert res_fresh["smoothed_score"] == 0.0
