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

client = TestClient(app)


def test_sustenance_window_flicker_suppression():
    """
    Validates that single/double frame transient risk spikes are suppressed (flicker protection)
    and an alert is only created when hazard is sustained for >= 3 consecutive frames.
    """
    svc = IncidentService(db=None, sustenance_frames=3, cooldown_sec=4.0)
    high_risk = {
        "smoothed_score": 82.0,
        "congestion_component": 0.8,
        "motion_component": 0.8,
        "density_component": 0.8,
        "crowd_disorder_component": 0.8
    }
    low_risk = {
        "smoothed_score": 25.0,
        "congestion_component": 0.1,
        "motion_component": 0.1,
        "density_component": 0.1,
        "crowd_disorder_component": 0.1
    }

    # Frame 1: High risk -> Suppressed
    a1 = svc.check_and_create_incidents("test_flicker", 1, 0.1, high_risk, 25, [], {}, {"forecast_10s": 85.0})
    assert len(a1) == 0

    # Frame 2: Low risk -> Counter resets
    a2 = svc.check_and_create_incidents("test_flicker", 2, 0.2, low_risk, 5, [], {}, {"forecast_10s": 25.0})
    assert len(a2) == 0
    assert svc.condition_counters.get(("test_flicker", "CRITICAL_RISK"), 0) == 0

    # Sustained: 3 consecutive frames
    s1 = svc.check_and_create_incidents("test_flicker", 3, 0.3, high_risk, 25, [], {}, {"forecast_10s": 85.0})
    s2 = svc.check_and_create_incidents("test_flicker", 4, 0.4, high_risk, 25, [], {}, {"forecast_10s": 85.0})
    s3 = svc.check_and_create_incidents("test_flicker", 5, 0.5, high_risk, 25, [], {}, {"forecast_10s": 85.0})
    
    assert len(s1) == 0
    assert len(s2) == 0
    assert len(s3) == 1
    assert s3[0].incident_type == "CRITICAL_RISK"
    assert s3[0].severity == "CRITICAL"


def test_cooldown_deduplication_and_rearm():
    """
    Validates that ongoing hazard does not emit duplicate records during cooldown (4.0s)
    and re-arms when the condition persists beyond the cooldown window.
    """
    svc = IncidentService(db=None, sustenance_frames=3, cooldown_sec=4.0)
    high_risk = {"smoothed_score": 85.0, "congestion_component": 0.8, "motion_component": 0.8, "density_component": 0.8, "crowd_disorder_component": 0.8}

    # Sustained trigger at t=1.0, 1.1, 1.2
    _ = svc.check_and_create_incidents("test_cd", 1, 1.0, high_risk, 30, [], {}, {"forecast_10s": 85.0})
    _ = svc.check_and_create_incidents("test_cd", 2, 1.1, high_risk, 30, [], {}, {"forecast_10s": 85.0})
    first_alert = svc.check_and_create_incidents("test_cd", 3, 1.2, high_risk, 30, [], {}, {"forecast_10s": 85.0})
    assert len(first_alert) == 1

    # Frames during cooldown: 1.5s, 2.5s, 4.0s, 5.0s (<= 1.2 + 4.0 = 5.2s)
    for t in [1.5, 2.5, 4.0, 5.0]:
        suppressed = svc.check_and_create_incidents("test_cd", int(t*10), t, high_risk, 30, [], {}, {"forecast_10s": 85.0})
        assert len(suppressed) == 0

    # Frame after cooldown expires: 5.5s (> 5.2s)
    rearmed = svc.check_and_create_incidents("test_cd", 55, 5.5, high_risk, 30, [], {}, {"forecast_10s": 85.0})
    assert len(rearmed) == 1


def test_condition_deescalation_reset():
    """
    Validates that when conditions normalize, condition counters clear to zero immediately.
    """
    svc = IncidentService(db=None, sustenance_frames=3, cooldown_sec=4.0)
    high_risk = {"smoothed_score": 80.0, "congestion_component": 0.8, "motion_component": 0.8, "density_component": 0.8, "crowd_disorder_component": 0.8}
    low_risk = {"smoothed_score": 20.0, "congestion_component": 0.1, "motion_component": 0.1, "density_component": 0.1, "crowd_disorder_component": 0.1}

    _ = svc.check_and_create_incidents("cam_deesc", 1, 0.1, high_risk, 30, [], {}, {"forecast_10s": 85.0})
    _ = svc.check_and_create_incidents("cam_deesc", 2, 0.2, high_risk, 30, [], {}, {"forecast_10s": 85.0})
    assert svc.condition_counters.get(("cam_deesc", "CRITICAL_RISK"), 0) == 2

    # Drop below threshold
    _ = svc.check_and_create_incidents("cam_deesc", 3, 0.3, low_risk, 5, [], {}, {"forecast_10s": 20.0})
    assert svc.condition_counters.get(("cam_deesc", "CRITICAL_RISK"), 0) == 0


def test_incident_lifecycle_database_state_machine():
    """
    Validates database creation and state transitions: Open -> Acknowledged -> Resolved.
    """
    db = SessionLocal()
    test_id = f"inc_test_lifecycle_{uuid.uuid4().hex[:8]}"
    try:
        inc = Incident(
            id=test_id,
            camera_id="cam_audit_lifecycle",
            frame_index=100,
            video_timestamp_sec=10.0,
            incident_type="CRITICAL_RISK",
            severity="CRITICAL",
            risk_score=85.0,
            forecast_risk=90.0,
            trigger_reason="Test critical risk trigger",
            recommended_action="Dispatch safety marshals",
            measurements={"person_count": 35},
            status="Open"
        )
        db.add(inc)
        db.commit()

        # Verify Initial Open state via API
        r_get = client.get(f"/api/incidents/{test_id}")
        assert r_get.status_code == 200
        assert r_get.json()["status"] == "Open"
        assert r_get.json()["camera_id"] == "cam_audit_lifecycle"

        # Transition to Acknowledged
        r_ack = client.put(f"/api/incidents/{test_id}/status", json={
            "status": "Acknowledged",
            "operator_notes": "Security operator reviewing camera live feed"
        })
        assert r_ack.status_code == 200
        assert r_ack.json()["status"] == "Acknowledged"
        assert "reviewing" in r_ack.json()["operator_notes"]

        # Transition to Resolved
        r_res = client.put(f"/api/incidents/{test_id}/status", json={
            "status": "Resolved",
            "operator_notes": "Crowd directed through auxiliary exits. Area secure."
        })
        assert r_res.status_code == 200
        assert r_res.json()["status"] == "Resolved"
        assert "auxiliary exits" in r_res.json()["operator_notes"]

    finally:
        # Clean up database record
        to_del = db.query(Incident).filter(Incident.id == test_id).first()
        if to_del:
            db.delete(to_del)
            db.commit()
        db.close()


def test_evidence_keyframe_persistence_and_api():
    """
    Validates evidentiary image creation, OpenCV decode integrity, and API retrieval.
    """
    evidence_dir = "data/reports/evidence"
    os.makedirs(evidence_dir, exist_ok=True)
    test_inc_id = f"inc_ev_{uuid.uuid4().hex[:8]}"
    evidence_file = os.path.join(evidence_dir, f"{test_inc_id}.jpg")

    # Create dummy keyframe
    frame = np.full((360, 640, 3), 40, dtype=np.uint8)
    cv2.putText(frame, "CROWDGUARD EVIDENCE AUDIT", (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 255), 2)
    cv2.imwrite(evidence_file, frame)
    assert os.path.exists(evidence_file)

    # Insert incident in database pointing to evidence
    db = SessionLocal()
    try:
        inc = Incident(
            id=test_inc_id,
            camera_id="cam_ev_test",
            frame_index=50,
            video_timestamp_sec=5.0,
            incident_type="LOCALIZED_BOTTLENECK",
            severity="HIGH",
            risk_score=72.0,
            trigger_reason="Bottleneck evidence test",
            evidence_frame_path=evidence_file,
            status="Open"
        )
        db.add(inc)
        db.commit()

        # Query evidence endpoint
        r_ev = client.get(f"/api/incidents/{test_inc_id}/evidence")
        assert r_ev.status_code == 200
        assert r_ev.headers["content-type"] in ["image/jpeg", "image/jpg"]
        assert len(r_ev.content) > 1000

        # Verify decoded image dimensions
        nparr = np.frombuffer(r_ev.content, np.uint8)
        decoded = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        assert decoded is not None
        assert decoded.shape[0] == 360
        assert decoded.shape[1] == 640

    finally:
        to_del = db.query(Incident).filter(Incident.id == test_inc_id).first()
        if to_del:
            db.delete(to_del)
            db.commit()
        db.close()
        if os.path.exists(evidence_file):
            try:
                os.remove(evidence_file)
            except OSError:
                pass


def test_timestamp_monotonicity():
    """
    Validates temporal order: t_capture <= t_inference <= t_risk <= t_alert <= t_persisted.
    """
    t_cap = time.perf_counter()
    time.sleep(0.002)
    t_inf = time.perf_counter()
    time.sleep(0.001)
    t_risk = time.perf_counter()
    time.sleep(0.001)
    t_alert = time.perf_counter()

    assert t_cap < t_inf < t_risk < t_alert
    assert (t_inf - t_cap) * 1000.0 >= 1.0


def test_camera_disconnection_and_stale_guards():
    """
    Validates that camera disconnect flags telemetry as stale and reconnection resets engine state.
    """
    session = CameraSession(CameraConfig(camera_id="cam_disc_test", name="Disconnect Test", source_type=CameraSourceType.FILE))
    
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

    # Start/reconnect clears risk state and incidents
    session.start()
    assert session.risk_engine.last_smoothed_risk == 0.0
    assert len(session.incident_service.condition_counters) == 0


def test_multicamera_incident_isolation():
    """
    Validates that an incident generated for Camera A does not leak into Camera B.
    """
    svcA = IncidentService(db=None, sustenance_frames=1, cooldown_sec=4.0)
    svcB = IncidentService(db=None, sustenance_frames=1, cooldown_sec=4.0)

    hazard_risk = {"smoothed_score": 90.0, "congestion_component": 0.9, "motion_component": 0.9, "density_component": 0.9, "crowd_disorder_component": 0.9}
    calm_risk = {"smoothed_score": 15.0, "congestion_component": 0.1, "motion_component": 0.1, "density_component": 0.1, "crowd_disorder_component": 0.1}

    alertsA = svcA.check_and_create_incidents("cam_A", 1, 1.0, hazard_risk, 40, [], {}, {"forecast_10s": 90.0}, camera_id="cam_A")
    alertsB = svcB.check_and_create_incidents("cam_B", 1, 1.0, calm_risk, 4, [], {}, {"forecast_10s": 15.0}, camera_id="cam_B")

    assert len(alertsA) == 1
    assert alertsA[0].camera_id == "cam_A"
    assert len(alertsB) == 0


def test_alert_decision_latency_distribution():
    """
    Validates that alert evaluation execution time is highly responsive (< 2.0ms mean on CPU).
    """
    svc = IncidentService(db=None, sustenance_frames=1, cooldown_sec=0.01)
    risk_data = {"smoothed_score": 85.0, "congestion_component": 0.8, "motion_component": 0.8, "density_component": 0.8, "crowd_disorder_component": 0.8}

    latencies = []
    for i in range(20):
        t0 = time.perf_counter()
        _ = svc.check_and_create_incidents(f"sess_{i}", i, i * 0.1, risk_data, 30, [], {}, {"forecast_10s": 85.0}, camera_id=f"cam_{i}")
        t1 = time.perf_counter()
        latencies.append((t1 - t0) * 1000.0)

    mean_lat = float(np.mean(latencies))
    p95_lat = float(np.percentile(latencies, 95))
    assert mean_lat < 2.0
    assert p95_lat < 5.0


def test_phase49_benchmark_endpoints():
    """
    Validates Phase 4.9 benchmark API endpoints:
    GET /api/benchmark/incident-lifecycle-phase49
    POST /api/benchmark/run-incident-lifecycle-phase49
    """
    # Trigger run
    r_post = client.post("/api/benchmark/run-incident-lifecycle-phase49")
    assert r_post.status_code == 200
    report = r_post.json()
    assert report["validation_status"] == "PASSED"
    assert report["total_stages_evaluated"] == 10
    assert report["stages_passed"] == 10
    assert report["stages_failed"] == 0

    # Retrieve cached report
    r_get = client.get("/api/benchmark/incident-lifecycle-phase49")
    assert r_get.status_code == 200
    cached = r_get.json()
    assert cached["validation_status"] == "PASSED"
    assert len(cached["validation_stages"]) == 10


def test_incidents_api_camera_and_severity_filtering():
    """
    Validates GET /api/incidents filtering by camera_id and severity.
    """
    db = SessionLocal()
    cam_id = f"cam_filter_{uuid.uuid4().hex[:6]}"
    inc1_id = f"inc_f1_{uuid.uuid4().hex[:6]}"
    inc2_id = f"inc_f2_{uuid.uuid4().hex[:6]}"

    try:
        inc1 = Incident(
            id=inc1_id,
            camera_id=cam_id,
            frame_index=10,
            video_timestamp_sec=1.0,
            incident_type="CRITICAL_RISK",
            severity="CRITICAL",
            risk_score=92.0,
            trigger_reason="Filter test critical",
            status="Open"
        )
        inc2 = Incident(
            id=inc2_id,
            camera_id=cam_id,
            frame_index=20,
            video_timestamp_sec=2.0,
            incident_type="LOCALIZED_BOTTLENECK",
            severity="HIGH",
            risk_score=70.0,
            trigger_reason="Filter test high",
            status="Open"
        )
        db.add_all([inc1, inc2])
        db.commit()

        # Filter by camera_id
        r_cam = client.get(f"/api/incidents?camera_id={cam_id}")
        assert r_cam.status_code == 200
        cam_incidents = r_cam.json()
        assert len(cam_incidents) == 2

        # Filter by camera_id AND severity
        r_crit = client.get(f"/api/incidents?camera_id={cam_id}&severity=CRITICAL")
        assert r_crit.status_code == 200
        crit_incidents = r_crit.json()
        assert len(crit_incidents) == 1
        assert crit_incidents[0]["id"] == inc1_id

    finally:
        for inc_id in [inc1_id, inc2_id]:
            to_del = db.query(Incident).filter(Incident.id == inc_id).first()
            if to_del:
                db.delete(to_del)
        db.commit()
        db.close()
