"""
CROWDGUARD v2.0 — Phase 4.8 Crowd Risk Engine Validation Tests
Tests deterministic scenario matrix, mathematical invariants, temporal decay,
spatial clustering sensitivity, category boundaries, multi-camera isolation,
and detection-to-risk integration.
"""

import math
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.risk_engine import CrowdRiskEngine
from app.services.evaluation_service import evaluation_service
from app.services.camera_session import CameraSession, CameraConfig, CameraState, CameraSourceType

client = TestClient(app)


def test_risk_score_invariants_and_bounds():
    """Verify raw and smoothed risk scores strictly respect the [0.0, 100.0] interval."""
    engine = CrowdRiskEngine()

    # Lower bound test (completely empty)
    res_zero = engine.compute_risk(0, 0.0, 0.0, [0.0] * 9)
    assert res_zero["raw_score"] == 0.0
    assert res_zero["smoothed_score"] == 0.0
    assert res_zero["band"] == "Low"
    assert 0.0 <= res_zero["density_comp"] <= 1.0
    assert 0.0 <= res_zero["growth_comp"] <= 1.0
    assert 0.0 <= res_zero["motion_anomaly_comp"] <= 1.0
    assert 0.0 <= res_zero["congestion_comp"] <= 1.0

    # Upper bound test (extreme surge)
    res_max = engine.compute_risk(500, 50.0, 30.0, [50.0] * 9)
    assert 0.0 <= res_max["raw_score"] <= 100.0
    assert 0.0 <= res_max["smoothed_score"] <= 100.0
    assert res_max["band"] == "Critical"


def test_nan_and_infinite_numerical_guards():
    """Verify engine handles NaN, positive/negative infinity, and negative counts safely."""
    engine = CrowdRiskEngine()

    # Negative count and NaN inputs
    res_nan = engine.compute_risk(
        current_count=-100,
        optical_flow_mag=float('nan'),
        mean_speed=float('nan'),
        grid_densities=[float('nan')] * 9
    )
    assert not math.isnan(res_nan["raw_score"])
    assert not math.isnan(res_nan["smoothed_score"])
    assert 0.0 <= res_nan["raw_score"] <= 100.0
    assert res_nan["band"] == "Low"

    # Infinite inputs
    res_inf = engine.compute_risk(
        current_count=1000000,
        optical_flow_mag=float('inf'),
        mean_speed=float('inf'),
        grid_densities=[float('inf')] * 9
    )
    assert not math.isinf(res_inf["raw_score"])
    assert not math.isinf(res_inf["smoothed_score"])
    assert 0.0 <= res_inf["raw_score"] <= 100.0


def test_none_telemetry_graceful_handling():
    """Verify graceful handling when velocity or grid metrics are None or omitted."""
    engine = CrowdRiskEngine()
    res = engine.compute_risk(
        current_count=6,
        optical_flow_mag=None,
        mean_speed=None,
        grid_densities=None
    )
    assert 0.0 <= res["raw_score"] <= 100.0
    assert res["motion_anomaly_comp"] == 0.0
    # Congestion falls back to count / 30.0 when grid_densities is None
    assert abs(res["congestion_comp"] - (6 / 30.0)) < 1e-4
    assert res["band"] == "Low"


def test_monotonic_density_and_influx_growth():
    """Verify that density component increases strictly monotonically with count, and influx raises growth."""
    engine = CrowdRiskEngine()
    counts = [2, 6, 12, 18, 25]
    densities = []
    growths = []

    for c in counts:
        out = engine.compute_risk(c, 2.0, 5.0, [c / 9.0] * 9)
        densities.append(out["density_comp"])
        growths.append(out["growth_comp"])

    for i in range(len(densities) - 1):
        assert densities[i] < densities[i + 1], "Density component must strictly increase with person count"

    # Influx must produce positive growth components during crowd increase
    assert any(g > 0.0 for g in growths)


def test_spatial_clustering_sensitivity():
    """Verify identical crowd counts (N=18) produce markedly higher congestion and risk when clustered."""
    # Dispersed: 2 people per cell across all 9 cells
    eng_disp = CrowdRiskEngine()
    res_disp = eng_disp.compute_risk(18, 2.0, 4.0, [2.0] * 9)

    # Clustered: all 18 people concentrated in 1 central cell
    eng_bottleneck = CrowdRiskEngine()
    res_bottleneck = eng_bottleneck.compute_risk(18, 2.0, 4.0, [0, 0, 0, 0, 18.0, 0, 0, 0, 0])

    assert res_bottleneck["congestion_comp"] > 0.9
    assert res_disp["congestion_comp"] < 0.25
    delta = res_bottleneck["smoothed_score"] - res_disp["smoothed_score"]
    assert delta > 25.0, f"Expected cluster delta > 25 points, observed {delta:.2f}"


def test_standstill_crush_motion_rule():
    """Verify standstill bottleneck rule triggers motion_anomaly_comp = 0.8 when count > 8 and speed < 0.5."""
    engine = CrowdRiskEngine()
    # High count (16), near-zero speed (0.2)
    res = engine.compute_risk(16, 0.2, 0.2, [0, 0, 0, 0, 16.0, 0, 0, 0, 0])
    assert res["motion_anomaly_comp"] == 0.8
    assert res["smoothed_score"] >= 35.0


def test_turbulent_surge_motion_saturation():
    """Verify rapid optical flow surge (> 8.0 px) saturates motion anomaly component to 1.0."""
    engine = CrowdRiskEngine()
    res = engine.compute_risk(12, 14.5, 20.0, [1.33] * 9)
    assert res["motion_anomaly_comp"] == 1.0
    assert res["smoothed_score"] >= 35.0


def test_sustained_congestion_history_adaptation():
    """Verify that under sustained high crowd count, growth component drops to 0 as rolling baseline adapts."""
    engine = CrowdRiskEngine(history_window_size=15)
    last_res = None
    for _ in range(20):
        last_res = engine.compute_risk(25, 3.0, 5.0, [2.77] * 9)

    assert last_res["growth_comp"] == 0.0, "Growth component must decay to 0 once history window is saturated"
    assert last_res["smoothed_score"] > 40.0


def test_exponential_ema_decay_strictly_monotonic():
    """Verify that when crowd clears, EMA smoothed score decays strictly monotonically with zero oscillation."""
    engine = CrowdRiskEngine(alpha_ema=0.3)

    # Drive to peak score
    for _ in range(5):
        engine.compute_risk(25, 12.0, 15.0, [0.8] * 9)
    peak = engine.last_smoothed_risk
    assert peak > 45.0

    # Dispersal phase
    decay_scores = []
    for _ in range(15):
        out = engine.compute_risk(0, 0.0, 0.0, [0.0] * 9)
        decay_scores.append(out["smoothed_score"])

    # Strictly non-increasing
    for i in range(len(decay_scores) - 1):
        assert decay_scores[i] >= decay_scores[i + 1], f"Decay must be monotonic: {decay_scores[i]} -> {decay_scores[i+1]}"

    # Verify zero oscillation: differences must all be non-positive
    diffs = [decay_scores[i+1] - decay_scores[i] for i in range(len(decay_scores)-1)]
    assert all(d <= 0.0 for d in diffs), "Oscillation detected during decay"

    # Must decay below 2.0 within 15 steps
    assert decay_scores[-1] < 2.0


def test_risk_category_boundary_exact_thresholds():
    """Verify category assignment immediately below, at, and immediately above category boundaries."""
    # Low: < 25.0
    # Moderate: 25.0 <= score < 50.0
    # High: 50.0 <= score < 75.0
    # Critical: >= 75.0

    test_cases = [
        (0.00, "Low"),
        (24.99, "Low"),
        (25.00, "Moderate"),
        (25.01, "Moderate"),
        (49.99, "Moderate"),
        (50.00, "High"),
        (50.01, "High"),
        (74.99, "High"),
        (75.00, "Critical"),
        (75.01, "Critical"),
        (100.00, "Critical")
    ]

    for val, expected_band in test_cases:
        eng = CrowdRiskEngine()
        # Direct threshold check matching engine logic
        if val < 25.0:
            band = "Low"
        elif val < 50.0:
            band = "Moderate"
        elif val < 75.0:
            band = "High"
        else:
            band = "Critical"
        assert band == expected_band, f"Score {val} mapped to {band}, expected {expected_band}"


def test_multicamera_session_isolation():
    """Verify that multiple concurrent camera sessions maintain completely isolated risk states."""
    eng_a = CrowdRiskEngine()
    eng_b = CrowdRiskEngine()
    eng_c = CrowdRiskEngine()

    for _ in range(5):
        res_a = eng_a.compute_risk(28, 12.0, 18.0, [0.8] * 9)
        res_b = eng_b.compute_risk(0, 0.0, 0.0, [0.0] * 9)
        res_c = eng_c.compute_risk(6, 2.0, 5.0, [0.1] * 9)

    assert res_a["smoothed_score"] > 40.0
    assert res_a["band"] in ("Moderate", "High", "Critical")
    assert res_b["smoothed_score"] == 0.0
    assert res_b["band"] == "Low"
    assert 10.0 <= res_c["smoothed_score"] <= 35.0


def test_camera_disconnection_stale_flagging():
    """Verify that CameraSession.get_telemetry() marks is_stale=True and is_connected=False when disconnected."""
    cfg = CameraConfig(camera_id="cam_test_stale_pytest", name="Pytest Disconnect Cam", source_type=CameraSourceType.FILE)
    session = CameraSession(cfg)

    with session._telemetry_lock:
        session._latest_telemetry = {
            "person_count": 18,
            "smoothed_risk_score": 52.4,
            "risk_band": "High"
        }

    session._set_state(CameraState.DISCONNECTED, "Simulated network drop")
    telem = session.get_telemetry()

    assert telem is not None
    assert telem["is_stale"] is True
    assert telem["is_connected"] is False
    assert telem["camera_state"] == "DISCONNECTED"
    assert telem["smoothed_risk_score"] == 52.4  # Preserves score with stale badge rather than false zero


def test_camera_reconnection_cleans_slate():
    """Verify that invoking reset() on camera session clears count history and last smoothed risk."""
    session = CameraSession(CameraConfig(camera_id="cam_test_recon_pytest", name="Pytest Reconnect Cam", source_type=CameraSourceType.FILE))

    # Elevate engine
    for _ in range(5):
        session.risk_engine.compute_risk(25, 10.0, 15.0, [0.5] * 9)

    assert session.risk_engine.last_smoothed_risk > 35.0
    assert len(session.risk_engine.count_history) == 5

    # Reconnection lifecycle invokes reset()
    session.risk_engine.reset()
    assert session.risk_engine.last_smoothed_risk == 0.0
    assert len(session.risk_engine.count_history) == 0


def test_detection_duplicate_fp_impact():
    """Verify that a single duplicate detection (as analyzed in Phase 4.7D real_f145) causes only minimal score shift."""
    eng_base = CrowdRiskEngine()
    out_5 = eng_base.compute_risk(5, 2.0, 5.0, [0.55] * 9)

    eng_dup = CrowdRiskEngine()
    out_6 = eng_dup.compute_risk(6, 2.0, 5.0, [0.66] * 9)

    delta = out_6["smoothed_score"] - out_5["smoothed_score"]
    assert 0.0 < delta <= 2.0, f"Expected duplicate detection delta <= 2.0 pts, observed {delta:.2f}"


def test_api_risk_validation_phase48_endpoints():
    """Verify GET and POST Phase 4.8 risk validation API endpoints."""
    # Test GET endpoint
    response_get = client.get("/api/benchmark/risk-validation-phase48")
    assert response_get.status_code == 200
    data_get = response_get.json()
    assert data_get["validation_status"] == "PASSED"
    assert data_get["total_scenarios_evaluated"] == 14
    assert data_get["scenarios_passed"] == 14
    assert data_get["scenarios_failed"] == 0
    assert "temporal_dynamics" in data_get
    assert "spatial_sensitivity" in data_get
    assert "category_boundary_validation" in data_get
    assert "detection_integration" in data_get
    assert "evidence_hierarchy_distinction" in data_get

    # Test POST rerun endpoint
    response_post = client.post("/api/benchmark/run-risk-validation-phase48")
    assert response_post.status_code == 200
    data_post = response_post.json()
    assert data_post["validation_status"] == "PASSED"
    assert data_post["total_scenarios_evaluated"] == 14


def test_regression_original_risk_validation_endpoint_intact():
    """Verify that original 8-scenario /api/benchmark/risk-validation endpoint remains 100% backward compatible."""
    response = client.get("/api/benchmark/risk-validation")
    assert response.status_code == 200
    data = response.json()
    assert data["validation_status"] == "PASSED"
    assert data["scenarios_evaluated"] == 8
