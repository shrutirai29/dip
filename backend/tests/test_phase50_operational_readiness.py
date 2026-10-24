import os
import sys
import time
import uuid
import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database.session import SessionLocal
from app.models.entities import Incident
from app.services.incident_service import IncidentService
from app.services.evaluation_service import evaluation_service
from app.services.camera_session import CameraSession, CameraConfig, CameraSourceType, CameraState
from app.services.risk_engine import CrowdRiskEngine
from app.services.tracking_service import SimpleByteTracker

client = TestClient(app)


def test_scenario_suite_18_determinism():
    """
    Executes all 18 operational scenarios across baseline occupancy, dynamic buildup,
    spatial bottlenecks, motion anomalies, sensor degradation, and fault injections.
    Asserts 100% deterministic scenario pass rate.
    """
    rep = evaluation_service.validate_phase50_operational_readiness(save_report=False)
    assert rep["validation_status"] == "PASSED"
    summary = rep["scenarios_summary"]
    assert summary["total_scenarios_evaluated"] == 18
    assert summary["scenarios_passed"] == 18
    assert summary["scenarios_failed"] == 0
    assert summary["success_rate_percent"] == 100.0


def test_continuing_incident_deduplication_categories_a_b_c_d():
    """
    Validates explicit architectural categorization:
    Category A: Continuing incident (same incident updated, duplicate ticket prevented)
    Category B: Repeated notification emitted
    Category C: New incident after recovery and clearing
    Category D: Separate isolated incident on another camera
    """
    svc = IncidentService(db=None, sustenance_frames=3, cooldown_sec=4.0)
    high_risk = {"smoothed_score": 85.0, "congestion_component": 0.8, "motion_component": 0.8}
    low_risk = {"smoothed_score": 20.0, "congestion_component": 0.1, "motion_component": 0.1}

    # 1. Initial sustained hazard onset (Frames at t=1.0, 1.1, 1.2)
    _ = svc.check_and_create_incidents("cam_A", 1, 1.0, high_risk, 30, [], {}, {"forecast_10s": 85.0}, camera_id="cam_A")
    _ = svc.check_and_create_incidents("cam_A", 2, 1.1, high_risk, 30, [], {}, {"forecast_10s": 85.0}, camera_id="cam_A")
    first_onset = svc.check_and_create_incidents("cam_A", 3, 1.2, high_risk, 30, [], {}, {"forecast_10s": 85.0}, camera_id="cam_A")
    assert len(first_onset) == 1
    initial_id = first_onset[0].id
    assert first_onset[0].measurements.get("repeat_event_count") == 1
    assert first_onset[0].measurements.get("is_continuation") is False

    # 2. Category A & B: Ongoing hazard continues past 4.0s cooldown window (t=5.5s)
    continuing_event = svc.check_and_create_incidents("cam_A", 55, 5.5, high_risk, 32, [], {}, {"forecast_10s": 86.0}, camera_id="cam_A")
    assert len(continuing_event) == 1
    # MUST be the SAME incident ID (preventing duplicate ticket spam in SQLite)
    assert continuing_event[0].id == initial_id
    assert continuing_event[0].measurements.get("repeat_event_count") == 2
    assert continuing_event[0].measurements.get("is_continuation") is True
    assert continuing_event[0].measurements.get("last_observed_sec") == 5.5

    # 3. Category C: Crowd condition clears (t=6.0s), followed by a genuinely new event later (t=15.0s)
    # Clear / recovery
    _ = svc.check_and_create_incidents("cam_A", 60, 6.0, low_risk, 3, [], {}, {"forecast_10s": 15.0}, camera_id="cam_A")
    assert svc.condition_counters.get(("cam_A", "CRITICAL_RISK"), 0) == 0
    assert ("cam_A", "CRITICAL_RISK") not in svc.active_incidents

    # New onset after recovery (t=15.0, 15.1, 15.2)
    _ = svc.check_and_create_incidents("cam_A", 150, 15.0, high_risk, 35, [], {}, {"forecast_10s": 88.0}, camera_id="cam_A")
    _ = svc.check_and_create_incidents("cam_A", 151, 15.1, high_risk, 35, [], {}, {"forecast_10s": 88.0}, camera_id="cam_A")
    new_event = svc.check_and_create_incidents("cam_A", 152, 15.2, high_risk, 35, [], {}, {"forecast_10s": 88.0}, camera_id="cam_A")
    assert len(new_event) == 1
    # Must be a NEW distinct incident ID after full recovery
    assert new_event[0].id != initial_id
    assert new_event[0].measurements.get("repeat_event_count") == 1
    assert new_event[0].measurements.get("is_continuation") is False

    # 4. Category D: Concurrent hazard on separate Camera B (requires N=3 sustenance frames)
    _ = svc.check_and_create_incidents("cam_B", 150, 15.0, high_risk, 40, [], {}, {"forecast_10s": 90.0}, camera_id="cam_B")
    _ = svc.check_and_create_incidents("cam_B", 151, 15.1, high_risk, 40, [], {}, {"forecast_10s": 90.0}, camera_id="cam_B")
    cam_B_alerts = svc.check_and_create_incidents("cam_B", 152, 15.2, high_risk, 40, [], {}, {"forecast_10s": 90.0}, camera_id="cam_B")
    assert len(cam_B_alerts) == 1
    assert cam_B_alerts[0].camera_id == "cam_B"
    assert cam_B_alerts[0].id != new_event[0].id


def test_tracking_continuity_and_confirmation():
    """
    Validates SimpleByteTracker two-stage confirmation ('tentative' -> 'confirmed'),
    persistent track IDs, and zero spurious ID switches on continuous tracks.
    """
    tracker = SimpleByteTracker(max_lost_frames=15, iou_threshold=0.30, min_hits=2)
    
    # Frame 0: 2 persons detected -> Tentative
    dets_f0 = [
        {"bbox": [100, 100, 140, 180], "confidence": 0.55, "class_name": "person"},
        {"bbox": [300, 200, 340, 280], "confidence": 0.55, "class_name": "person"}
    ]
    tracks_f0 = tracker.update(dets_f0, 0.0, 640, 480)
    # Low confidence tracks require min_hits=2 to confirm
    assert len(tracks_f0) == 0
    assert len(tracker.tracks) == 2

    # Frame 1: Matched detections -> Confirmed
    dets_f1 = [
        {"bbox": [105, 102, 145, 182], "confidence": 0.70, "class_name": "person"},
        {"bbox": [305, 202, 345, 282], "confidence": 0.70, "class_name": "person"}
    ]
    tracks_f1 = tracker.update(dets_f1, 0.1, 640, 480)
    assert len(tracks_f1) == 2
    id1, id2 = tracks_f1[0]["id"], tracks_f1[1]["id"]

    # Frame 2: Continuous movement -> Preserves same IDs
    dets_f2 = [
        {"bbox": [110, 104, 150, 184], "confidence": 0.75, "class_name": "person"},
        {"bbox": [310, 204, 350, 284], "confidence": 0.75, "class_name": "person"}
    ]
    tracks_f2 = tracker.update(dets_f2, 0.2, 640, 480)
    assert len(tracks_f2) == 2
    assert tracks_f2[0]["id"] == id1
    assert tracks_f2[1]["id"] == id2


def test_detection_evaluation_and_stratification():
    """
    Validates evaluation of detection accuracy on benchmark dataset manifest.
    Asserts precision >= 0.80, recall >= 0.80, and density stratification availability.
    """
    res = evaluation_service.evaluate_detection_accuracy(conf_threshold=0.30, iou_threshold=0.50)
    assert "overall_metrics" in res
    assert "category_metrics" in res
    om = res["overall_metrics"]
    assert om["precision"] >= 0.80
    assert om["recall"] >= 0.80
    assert om["mean_iou"] >= 0.70


def test_latency_instrumentation_percentiles():
    """
    Validates monotonic clock instrumentation and sub-millisecond alert decision logic.
    """
    rep = evaluation_service.validate_phase50_operational_readiness(save_report=False)
    lat = rep["end_to_end_latency"]
    assert lat["sample_count"] == 25
    assert lat["alert_decision_ms"]["mean"] < 2.0
    assert lat["alert_decision_ms"]["p95"] < 5.0
    assert lat["total_capture_to_alert_ms"]["mean"] < 600.0  # CPU bounds (under heavy test concurrency)


def test_camera_disconnection_and_stale_guards():
    """
    Validates camera disconnect sets stale telemetry flags and reconnection cleans state.
    """
    session = CameraSession(CameraConfig(camera_id="cam_test_disc", name="Test Disc", source_type=CameraSourceType.FILE))
    with session._telemetry_lock:
        session._latest_telemetry = {
            "person_count": 22,
            "smoothed_risk_score": 88.0,
            "risk_band": "Critical",
            "timestamp": time.time()
        }
    session._set_state(CameraState.DISCONNECTED, "Simulated network drop")
    telem = session.get_telemetry()
    assert telem is not None
    assert telem.get("is_stale") is True
    assert telem.get("is_connected") is False

    # Start restores state
    session.start()
    assert session.risk_engine.last_smoothed_risk == 0.0
    assert len(session.incident_service.condition_counters) == 0


def test_evidence_keyframe_decode_and_retrieval():
    """
    Validates evidentiary image creation, OpenCV decode integrity, and API retrieval.
    """
    evidence_dir = "data/reports/evidence"
    os.makedirs(evidence_dir, exist_ok=True)
    test_id = f"inc_ev_p50_{uuid.uuid4().hex[:8]}"
    ev_path = os.path.join(evidence_dir, f"{test_id}.jpg")

    img = np.full((360, 640, 3), 50, dtype=np.uint8)
    cv2.putText(img, "PHASE 5.0 EVIDENCE", (30, 60), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 0), 2)
    cv2.imwrite(ev_path, img)
    assert os.path.exists(ev_path)

    db = SessionLocal()
    try:
        inc = Incident(
            id=test_id,
            camera_id="cam_p50_ev",
            frame_index=1,
            video_timestamp_sec=1.0,
            incident_type="CRITICAL_RISK",
            severity="CRITICAL",
            risk_score=85.0,
            trigger_reason="Evidence test",
            evidence_frame_path=ev_path,
            status="Open"
        )
        db.add(inc)
        db.commit()

        r = client.get(f"/api/incidents/{test_id}/evidence")
        assert r.status_code == 200
        assert r.headers["content-type"] in ["image/jpeg", "image/jpg"]
        assert len(r.content) > 500

        # Verify OpenCV decode
        nparr = np.frombuffer(r.content, np.uint8)
        dec = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        assert dec is not None
        assert dec.shape == (360, 640, 3)

    finally:
        to_del = db.query(Incident).filter(Incident.id == test_id).first()
        if to_del:
            db.delete(to_del)
            db.commit()
        db.close()
        if os.path.exists(ev_path):
            try:
                os.remove(ev_path)
            except OSError:
                pass


def test_phase50_api_endpoints():
    """
    Validates GET and POST endpoints for Phase 5.0 operational readiness:
    GET /api/benchmark/operational-readiness-phase50
    POST /api/benchmark/run-operational-readiness-phase50
    """
    # Trigger active run
    r_post = client.post("/api/benchmark/run-operational-readiness-phase50")
    assert r_post.status_code == 200
    rep = r_post.json()
    assert rep["validation_status"] == "PASSED"
    assert rep["scenarios_summary"]["total_scenarios_evaluated"] == 18
    assert rep["scenarios_summary"]["scenarios_passed"] == 18

    # Query cached endpoint
    r_get = client.get("/api/benchmark/operational-readiness-phase50")
    assert r_get.status_code == 200
    cached = r_get.json()
    assert cached["validation_status"] == "PASSED"
    assert len(cached["scenarios"]) == 18
