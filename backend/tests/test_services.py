import pytest
import numpy as np
from app.services.risk_engine import CrowdRiskEngine
from app.services.dip_service import DIPProcessor
from app.services.tracking_service import SimpleByteTracker
from app.services.density_service import DensityService

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

def test_dip_optical_flow_calculation():
    frame1 = np.zeros((100, 100), dtype=np.uint8)
    frame2 = np.zeros((100, 100), dtype=np.uint8)
    # create synthetic motion
    frame1[40:60, 40:60] = 255
    frame2[45:65, 45:65] = 255
    
    mag, _, _ = DIPProcessor.compute_optical_flow(frame1, frame2)
    assert mag > 0.0

def test_byte_tracker_persistence():
    tracker = SimpleByteTracker()
    det1 = [{"bbox": [50, 50, 100, 120], "confidence": 0.9}]
    tracks1 = tracker.update(det1, timestamp_sec=0.0)
    assert len(tracks1) == 1
    tid1 = tracks1[0]["id"]
    
    # Slight movement at t=0.1
    det2 = [{"bbox": [53, 52, 103, 122], "confidence": 0.88}]
    tracks2 = tracker.update(det2, timestamp_sec=0.1)
    assert len(tracks2) == 1
    assert tracks2[0]["id"] == tid1
    assert tracks2[0]["speed"] > 0.0

def test_grid_density_service():
    service = DensityService(grid_rows=3, grid_cols=3)
    dets = [
        {"bbox": [10, 10, 30, 40]},
        {"bbox": [20, 20, 35, 45]},
        {"bbox": [500, 400, 520, 450]}
    ]
    cells = service.compute_grid_density(640, 480, dets)
    assert len(cells) == 9
    assert any(c["count"] >= 2 for c in cells)
