import pytest
import numpy as np
from app.services.risk_engine import CrowdRiskEngine
from app.services.dip_service import DIPProcessor
from app.services.tracking_service import SimpleByteTracker
from app.services.density_service import DensityService
from app.services.forecasting_service import PatternAndForecastingEngine

def test_risk_score_normalization():
    engine = CrowdRiskEngine(weight_density=0.35, weight_growth=0.20, weight_motion_anomaly=0.25, weight_congestion=0.20)
    
    # Test zero load
    res_zero = engine.compute_risk(current_count=0, optical_flow_mag=0.0, mean_speed=0.0, grid_densities=[0]*9)
    assert 0.0 <= res_zero["raw_score"] <= 5.0
    assert res_zero["band"] == "Low"

    # Test high surge
    res_high = engine.compute_risk(current_count=35, optical_flow_mag=12.0, mean_speed=5.0, grid_densities=[15, 5, 2, 0, 0, 0, 0, 0, 0])
    assert 60.0 <= res_high["raw_score"] <= 100.0
    assert res_high["band"] in ["High", "Critical"]
    assert "Elevated crowd concentration" in res_high["explanation"]

def test_dip_optical_flow_dynamics_and_entropy():
    frame1 = np.zeros((100, 100), dtype=np.uint8)
    frame2 = np.zeros((100, 100), dtype=np.uint8)
    frame1[40:60, 40:60] = 255
    frame2[45:65, 45:65] = 255
    
    flow_data = DIPProcessor.compute_optical_flow_dynamics(frame1, frame2)
    assert "mean_magnitude" in flow_data
    assert "directional_entropy" in flow_data
    assert flow_data["mean_magnitude"] >= 0.0
    assert 0.0 <= flow_data["directional_entropy"] <= 1.0

def test_perspective_aware_density_heatmap():
    dets = [{"bbox": [100, 50, 140, 110], "confidence": 0.9}]
    # Test perspective weight scaling
    hmap = DIPProcessor.generate_density_heatmap((480, 640), dets, perspective_weight=1.5)
    assert hmap.shape == (480, 640, 3)

def test_privacy_filter():
    frame = np.full((100, 100, 3), 120, dtype=np.uint8)
    dets = [{"bbox": [20, 20, 60, 80], "confidence": 0.85}]
    blurred = DIPProcessor.apply_privacy_filter(frame, dets, mode="face_blur")
    assert blurred.shape == frame.shape
    anon = DIPProcessor.apply_privacy_filter(frame, dets, mode="full_anonymize")
    assert anon.shape == frame.shape

def test_byte_tracker_persistence_and_acceleration():
    tracker = SimpleByteTracker()
    det1 = [{"bbox": [50, 50, 100, 120], "confidence": 0.9}]
    tracks1 = tracker.update(det1, timestamp_sec=0.0)
    assert len(tracks1) == 1
    tid1 = tracks1[0]["id"]
    
    # Second frame with displacement
    det2 = [{"bbox": [55, 50, 105, 120], "confidence": 0.88}]
    tracks2 = tracker.update(det2, timestamp_sec=0.1)
    assert len(tracks2) == 1
    assert tracks2[0]["id"] == tid1
    assert tracks2[0]["speed"] > 0.0
    assert "acceleration" in tracks2[0]
    assert "foot_point" in tracks2[0]

def test_grid_zone_telemetry():
    service = DensityService(grid_rows=3, grid_cols=3)
    dets = [
        {"bbox": [10, 10, 30, 40]},
        {"bbox": [20, 20, 35, 45]},
        {"bbox": [500, 400, 520, 450]}
    ]
    tracks = [
        {"speed": 2.5, "current_zone": "Zone A1", "prev_zone": "Zone A1"},
        {"speed": 1.2, "current_zone": "Zone A1", "prev_zone": "Zone A2"}  # Inflow
    ]
    cells = service.compute_zone_telemetry(640, 480, dets, tracks)
    assert len(cells) == 9
    assert cells[0]["name"] == "Zone A1"
    assert "inflow" in cells[0]
    assert "zone_risk" in cells[0]

def test_pattern_detection_and_forecasting():
    engine = PatternAndForecastingEngine(history_window=15)
    
    # 1. Bottleneck pattern
    zones = [{"name": "Zone B2", "pattern": "BOTTLENECK", "inflow": 3, "outflow": 0}]
    p = engine.detect_crowd_patterns([], zones, optical_entropy=0.3, mean_speed=2.0, current_count=8)
    assert p["pattern"] == "BOTTLENECK"
    
    # 2. Forecasting projection
    for r in [20.0, 25.0, 32.0, 40.0, 50.0]:
        fc = engine.compute_short_term_forecast(r, 0.4, 0.5, 4.0, "BOTTLENECK")
    
    assert fc["forecast_10s"] > 50.0
    assert fc["trend"] in ["RISING", "SURGING"]
    assert 0.0 <= fc["confidence"] <= 100.0
