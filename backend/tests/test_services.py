import pytest
import numpy as np
import cv2
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database.session import Base
from app.models.entities import Analysis, FrameRecord, Incident, Video
from app.services.risk_engine import CrowdRiskEngine
from app.services.dip_service import DIPProcessor
from app.services.tracking_service import SimpleByteTracker
from app.services.density_service import DensityService
from app.services.forecasting_service import PatternAndForecastingEngine
from app.services.incident_service import IncidentService
from app.services.report_service import ReportService

# -------------------------------------------------------------
# 1. RISK ENGINE TESTS
# -------------------------------------------------------------

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

def test_risk_score_nan_inf_safety():
    engine = CrowdRiskEngine()
    # Verify NaN and Inf do not cause crash or propagate
    res = engine.compute_risk(current_count=10, optical_flow_mag=float('nan'), mean_speed=float('inf'), grid_densities=[float('nan')]*9)
    assert not np.isnan(res["raw_score"])
    assert not np.isnan(res["smoothed_score"])
    assert 0.0 <= res["raw_score"] <= 100.0
    assert 0.0 <= res["smoothed_score"] <= 100.0

# -------------------------------------------------------------
# 2. DIGITAL IMAGE PROCESSING (DIP) TESTS
# -------------------------------------------------------------

def test_optical_flow_identical_and_translated_frames():
    # 1. Identical frames -> 0 motion
    frame1 = np.full((120, 120), 50, dtype=np.uint8)
    frame1[40:80, 40:80] = 200
    flow_zero = DIPProcessor.compute_optical_flow_dynamics(frame1, frame1.copy())
    assert flow_zero["mean_magnitude"] == 0.0
    assert flow_zero["directional_entropy"] == 0.0

    # 2. Translated synthetic square -> non-zero motion
    frame2 = np.full((120, 120), 50, dtype=np.uint8)
    frame2[45:85, 45:85] = 200
    flow_motion = DIPProcessor.compute_optical_flow_dynamics(frame1, frame2)
    assert flow_motion["mean_magnitude"] > 0.0
    assert 0.0 <= flow_motion["directional_entropy"] <= 1.0

    # 3. Invalid inputs (None, empty, mismatched dimensions)
    flow_none = DIPProcessor.compute_optical_flow_dynamics(None, frame2)
    assert flow_none["mean_magnitude"] == 0.0
    flow_diff_size = DIPProcessor.compute_optical_flow_dynamics(frame1, frame2[0:60, 0:60])
    assert flow_diff_size["mean_magnitude"] == 0.0

def test_perspective_aware_density_heatmap():
    dets = [{"bbox": [100, 50, 140, 110], "confidence": 0.9}]
    hmap1 = DIPProcessor.generate_density_heatmap((480, 640), dets, perspective_weight=1.0)
    hmap2 = DIPProcessor.generate_density_heatmap((480, 640), dets, perspective_weight=2.0)
    assert hmap1.shape == (480, 640, 3)
    assert hmap2.shape == (480, 640, 3)
    # Higher perspective weight should increase distant person density representation
    assert np.sum(hmap2.astype(np.float64)) >= np.sum(hmap1.astype(np.float64))

    # Empty detections return zero array
    hmap_empty = DIPProcessor.generate_density_heatmap((480, 640), [])
    assert np.all(hmap_empty == 0)

def test_privacy_filter_pixel_modification():
    # Use non-uniform patterned image so blur is guaranteed to change pixels
    np.random.seed(42)
    frame = np.random.randint(0, 255, (200, 200, 3), dtype=np.uint8)
    dets = [{"bbox": [40, 40, 120, 160], "confidence": 0.9}]

    # Test face_blur
    blurred = DIPProcessor.apply_privacy_filter(frame, dets, mode="face_blur")
    assert blurred.shape == frame.shape
    # Pixels in the head region (y: 40 to 40 + 120*0.28 = 73) MUST have changed
    assert not np.array_equal(frame[40:70, 40:120], blurred[40:70, 40:120])
    # Pixels far outside the bounding box MUST remain identical
    assert np.array_equal(frame[0:30, 0:30], blurred[0:30, 0:30])

    # Test full_anonymize
    anon = DIPProcessor.apply_privacy_filter(frame, dets, mode="full_anonymize")
    assert anon.shape == frame.shape
    # Pixels inside the bounding box MUST have changed
    assert not np.array_equal(frame[40:160, 40:120], anon[40:160, 40:120])
    # Pixels outside the box MUST remain unchanged
    assert np.array_equal(frame[0:30, 0:30], anon[0:30, 0:30])

# -------------------------------------------------------------
# 3. TRACKING TESTS
# -------------------------------------------------------------

def test_tracker_persistence_and_acceleration():
    tracker = SimpleByteTracker(max_lost_frames=5, iou_threshold=0.3)
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

def test_tracker_lost_and_pruned():
    tracker = SimpleByteTracker(max_lost_frames=3, iou_threshold=0.3)
    det1 = [{"bbox": [50, 50, 100, 120], "confidence": 0.9}]
    tracker.update(det1, timestamp_sec=0.0)
    assert len(tracker.tracks) == 1

    # Update with empty detections for 3 frames -> track lost but retained in memory
    for t in [0.1, 0.2, 0.3]:
        tracker.update([], timestamp_sec=t)
    assert len(tracker.tracks) == 1

    # 4th empty frame exceeds max_lost_frames=3 -> track pruned
    tracker.update([], timestamp_sec=0.4)
    assert len(tracker.tracks) == 0

def test_tracker_crossing_trajectories():
    tracker = SimpleByteTracker(iou_threshold=0.2)
    # Person A moving right, Person B moving left
    tracks_t0 = tracker.update([
        {"bbox": [100, 100, 140, 180]},
        {"bbox": [300, 100, 340, 180]}
    ], timestamp_sec=0.0)
    assert len(tracks_t0) == 2
    ids_t0 = {t["id"] for t in tracks_t0}

    # Frame 1: Smooth continuous displacement
    tracks_t1 = tracker.update([
        {"bbox": [112, 100, 152, 180]},
        {"bbox": [288, 100, 328, 180]}
    ], timestamp_sec=0.1)
    ids_t1 = {t["id"] for t in tracks_t1}
    assert ids_t0 == ids_t1

# -------------------------------------------------------------
# 4. SPATIAL GRID & PATTERN DETECTION TESTS
# -------------------------------------------------------------

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

def test_all_crowd_patterns():
    engine = PatternAndForecastingEngine(history_window=15)
    
    # 1. Bottleneck pattern
    zones = [{"name": "Zone B2", "pattern": "BOTTLENECK", "inflow": 4, "outflow": 0}]
    p1 = engine.detect_crowd_patterns([], zones, optical_entropy=0.3, mean_speed=2.0, current_count=8)
    assert p1["pattern"] == "BOTTLENECK"

    # 2. Abnormal disorder / panic
    p2 = engine.detect_crowd_patterns([], [], optical_entropy=0.75, mean_speed=5.0, current_count=10)
    assert p2["pattern"] == "ABNORMAL_DISORDER"

    # 3. Counterflow pattern (opposing directional vectors)
    tracks_counter = [
        {"direction_angle": 0.0, "speed": 2.5},   # East
        {"direction_angle": 0.1, "speed": 2.8},   # East
        {"direction_angle": 3.14, "speed": 2.6},  # West
        {"direction_angle": 3.10, "speed": 2.7},  # West
    ]
    p3 = engine.detect_crowd_patterns(tracks_counter, [], optical_entropy=0.4, mean_speed=2.6, current_count=4)
    assert p3["pattern"] == "COUNTERFLOW"

    # 4. Convergence pattern
    zones_conv = [{"inflow": 5, "outflow": 0}]
    p4 = engine.detect_crowd_patterns([], zones_conv, optical_entropy=0.2, mean_speed=1.5, current_count=7)
    assert p4["pattern"] == "CONVERGENCE"

    # 5. Divergence pattern
    zones_div = [{"inflow": 0, "outflow": 5}]
    p5 = engine.detect_crowd_patterns([], zones_div, optical_entropy=0.2, mean_speed=1.5, current_count=7)
    assert p5["pattern"] == "DIVERGENCE"

    # 6. Normal flow baseline
    p6 = engine.detect_crowd_patterns([], [], optical_entropy=0.2, mean_speed=1.0, current_count=1)
    assert p6["pattern"] == "NORMAL_FLOW"

def test_forecast_horizons_use_real_sample_interval():
    slow_sampling = PatternAndForecastingEngine(history_window=10)
    fast_sampling = PatternAndForecastingEngine(history_window=10)
    risk_samples = [20.0, 22.0, 24.0, 26.0, 28.0]
    slow_result = fast_result = None
    for risk in risk_samples:
        slow_result = slow_sampling.compute_short_term_forecast(
            risk, 0.4, 0.5, 4.0, "NORMAL_FLOW", sample_interval_sec=1.0
        )
        fast_result = fast_sampling.compute_short_term_forecast(
            risk, 0.4, 0.5, 4.0, "NORMAL_FLOW", sample_interval_sec=0.2
        )
    assert slow_result is not None and fast_result is not None
    assert fast_result["forecast_5s"] >= slow_result["forecast_5s"]
    assert fast_result["forecast_10s"] >= slow_result["forecast_10s"]
    assert "not a probability" in fast_result["reliability"]

def test_forecast_flat_series_stays_stable_and_bounded():
    engine = PatternAndForecastingEngine(history_window=10)
    result = None
    for _ in range(6):
        result = engine.compute_short_term_forecast(
            30.0, 0.4, 0.5, 2.0, "NORMAL_FLOW", sample_interval_sec=0.1
        )
    assert result is not None
    assert result["forecast_5s"] == 30.0
    assert result["forecast_10s"] == 30.0
    assert result["forecast_15s"] == 30.0
    assert result["trend"] == "STABLE"
    assert 0.0 <= result["confidence"] <= 100.0

# -------------------------------------------------------------
# 5. INCIDENT & SUSTENANCE TESTS
# -------------------------------------------------------------

def test_incident_sustenance_and_cooldown():
    # In-memory test sqlite engine
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    try:
        inc_service = IncidentService(db, sustenance_frames=2, cooldown_sec=5.0)
        risk_critical = {"smoothed_score": 85.0, "density_comp": 0.8, "growth_comp": 0.2, "motion_anomaly_comp": 0.3, "congestion_comp": 0.4}
        forecast_high = {"forecast_10s": 90.0}

        # Frame 1: condition met, but sustenance_frames=2 -> should NOT trigger yet
        res1 = inc_service.check_and_create_incidents(
            analysis_id="anl_test", frame_idx=0, timestamp_sec=0.0,
            risk_data=risk_critical, current_count=20, grid_cells=[],
            pattern_data={"pattern": "NORMAL_FLOW"}, forecast_data=forecast_high
        )
        assert len(res1) == 0

        # Frame 2: sustained for 2 frames -> SHOULD trigger incident
        res2 = inc_service.check_and_create_incidents(
            analysis_id="anl_test", frame_idx=1, timestamp_sec=0.2,
            risk_data=risk_critical, current_count=20, grid_cells=[],
            pattern_data={"pattern": "NORMAL_FLOW"}, forecast_data=forecast_high
        )
        assert len(res2) == 1
        assert res2[0].severity == "CRITICAL"
        assert res2[0].incident_type == "CRITICAL_RISK"

        # Frame 3: still high risk at t=1.0s, but within cooldown (5.0s) -> should NOT trigger duplicate
        res3 = inc_service.check_and_create_incidents(
            analysis_id="anl_test", frame_idx=2, timestamp_sec=1.0,
            risk_data=risk_critical, current_count=20, grid_cells=[],
            pattern_data={"pattern": "NORMAL_FLOW"}, forecast_data=forecast_high
        )
        assert len(res3) == 0

        # Frame 4: at t=6.0s (cooldown expired) -> triggers next incident
        res4 = inc_service.check_and_create_incidents(
            analysis_id="anl_test", frame_idx=30, timestamp_sec=6.0,
            risk_data=risk_critical, current_count=20, grid_cells=[],
            pattern_data={"pattern": "NORMAL_FLOW"}, forecast_data=forecast_high
        )
        assert len(res4) == 1

    finally:
        db.close()

# -------------------------------------------------------------
# 6. CSV REPORT EXPORT TESTS
# -------------------------------------------------------------

def test_csv_report_generation():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    try:
        vid = Video(id="vid_test", filename="test.mp4", original_filename="my_test.mp4", file_path="data/test.mp4", file_size_bytes=1024)
        anl = Analysis(id="anl_test", video_id="vid_test", status="completed", peak_count=15, avg_count=10.2, max_risk_score=78.5, avg_risk_score=34.1, dominant_pattern="NORMAL_FLOW", high_risk_duration_sec=3.5, total_frames=100)
        anl.video = vid
        db.add(vid)
        db.add(anl)
        db.commit()

        fr = FrameRecord(
            analysis_id="anl_test", frame_index=1, timestamp_sec=0.2, person_count=5,
            density_component=0.2, growth_component=0.1, motion_anomaly_component=0.1, congestion_component=0.2,
            raw_risk_score=20.0, smoothed_risk_score=19.5, risk_band="Low", risk_explanation="Normal flow",
            forecast_risk_5s=22.0, forecast_risk_10s=24.0, forecast_risk_15s=25.0, forecast_confidence=80.0, forecast_trend="STABLE",
            optical_flow_magnitude=1.5, directional_entropy=0.35, mean_speed_pixels=2.0, mean_acceleration=0.1, detected_pattern="NORMAL_FLOW"
        )
        inc = Incident(
            id="inc_test", analysis_id="anl_test", frame_index=1, video_timestamp_sec=0.2, incident_type="CRITICAL_RISK",
            severity="CRITICAL", risk_score=78.5, forecast_risk=82.0, trigger_reason="High risk", recommended_action="Inspect",
            relevant_region="Sector B2", status="Open"
        )
        db.add(fr)
        db.add(inc)
        db.commit()

        csv_content = ReportService.generate_analysis_csv(anl, [fr], [inc])
        assert "CROWDGUARD" in csv_content
        assert "anl_test" in csv_content
        assert "CRITICAL_RISK" in csv_content
        assert "Forecast +10s" in csv_content
    finally:
        db.close()
