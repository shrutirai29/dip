import asyncio
import time
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.event_broadcaster import event_broadcaster, RealtimeEventType
from app.services.camera_session import CameraSession, CameraConfig, CameraSourceType, CameraState
from app.services.incident_service import IncidentService
from app.services.evaluation_service import evaluation_service


@pytest.fixture(autouse=True)
def clean_broadcaster_state():
    event_broadcaster.reset()
    yield
    event_broadcaster.reset()


def test_websocket_client_connection_and_handshake():
    """
    Validates that a WebSocket client can connect, receives the welcome handshake,
    and can exchange ping/pong heartbeats.
    """
    client = TestClient(app)
    with client.websocket_connect("/api/ws/events") as websocket:
        handshake = websocket.receive_json()
        assert handshake["event_type"] == "system_status"
        assert handshake["status"] == "connected"
        assert "server_time" in handshake
        assert handshake["replayed_events_count"] == 0

        # Send heartbeat ping
        websocket.send_json({"type": "ping"})
        pong = websocket.receive_json()
        assert pong["type"] == "pong"
        assert "server_time" in pong


def test_multiple_concurrent_subscribers_fanout():
    """
    Validates fan-out message broadcast across multiple simultaneous subscribers.
    """
    q1 = asyncio.Queue(maxsize=10)
    q2 = asyncio.Queue(maxsize=10)
    sub1 = object()
    sub2 = object()

    with event_broadcaster._lock:
        event_broadcaster._subscribers[sub1] = q1
        event_broadcaster._subscribers[sub2] = q2

    try:
        pub_ev = event_broadcaster.publish(
            event_type=RealtimeEventType.INCIDENT_CREATED,
            camera_id="cam_fanout_test",
            incident_id="inc_fanout_01",
            hazard_type="CRITICAL_RISK",
            severity="CRITICAL",
            data={"risk_score": 88.5}
        )

        assert q1.qsize() == 1
        assert q2.qsize() == 1
        ev1 = q1.get_nowait()
        ev2 = q2.get_nowait()
        assert ev1["event_id"] == pub_ev["event_id"]
        assert ev2["event_id"] == pub_ev["event_id"]
        assert ev1["hazard_type"] == "CRITICAL_RISK"
        assert ev2["hazard_type"] == "CRITICAL_RISK"
    finally:
        with event_broadcaster._lock:
            event_broadcaster._subscribers.pop(sub1, None)
            event_broadcaster._subscribers.pop(sub2, None)


def test_event_serialization_and_id_uniqueness():
    """
    Validates that every published event has a unique, monotonically increasing event_id
    and contains all required fields.
    """
    ids = set()
    for i in range(50):
        ev = event_broadcaster.publish(
            event_type=RealtimeEventType.SYSTEM_STATUS,
            data={"counter": i}
        )
        eid = ev["event_id"]
        assert eid.startswith("evt_")
        assert eid not in ids
        ids.add(eid)
        assert "timestamp" in ev
        assert "timestamp_mono" in ev
    assert len(ids) == 50


def test_reconnection_and_missed_event_recovery():
    """
    Validates that a reconnected client supplying ?last_event_id recovers all missed events
    from the bounded ring-buffer in exact chronological order.
    """
    client = TestClient(app)
    
    # Publish initial event
    e1 = event_broadcaster.publish(RealtimeEventType.SYSTEM_STATUS, data={"msg": "initial"})
    e1_id = e1["event_id"]

    # Publish 3 intervening events while client is 'offline'
    e2 = event_broadcaster.publish(RealtimeEventType.INCIDENT_CREATED, incident_id="inc_2", hazard_type="RAPID_GROWTH")
    e3 = event_broadcaster.publish(RealtimeEventType.CAMERA_DISCONNECTED, camera_id="cam_offline_test")
    e4 = event_broadcaster.publish(RealtimeEventType.INCIDENT_RESOLVED, incident_id="inc_2")

    # Client reconnects passing last_event_id=e1_id
    with client.websocket_connect(f"/api/ws/events?last_event_id={e1_id}") as ws:
        handshake = ws.receive_json()
        assert handshake["status"] == "connected"
        assert handshake["replayed_events_count"] == 3

        replayed_1 = ws.receive_json()
        replayed_2 = ws.receive_json()
        replayed_3 = ws.receive_json()

        assert replayed_1["event_id"] == e2["event_id"]
        assert replayed_2["event_id"] == e3["event_id"]
        assert replayed_3["event_id"] == e4["event_id"]
        assert replayed_1["is_replay"] is True
        assert replayed_2["is_replay"] is True
        assert replayed_3["is_replay"] is True


def test_slow_consumer_queue_bounding_and_isolation():
    """
    Validates that a slow consumer's bounded queue drops oldest messages rather than
    growing unbounded or blocking the publisher thread.
    """
    slow_queue = asyncio.Queue(maxsize=3)
    dummy_ws = object()

    with event_broadcaster._lock:
        event_broadcaster._subscribers[dummy_ws] = slow_queue

    # Publish 10 events rapidly
    for i in range(10):
        event_broadcaster.publish(RealtimeEventType.SYSTEM_STATUS, data={"burst": i})

    # Queue should be bounded to maxsize 3
    assert slow_queue.qsize() <= 3
    assert event_broadcaster._total_dropped_slow_consumers >= 7

    with event_broadcaster._lock:
        del event_broadcaster._subscribers[dummy_ws]


def test_camera_disconnect_and_reconnect_broadcasts():
    """
    Validates that camera disconnect and reconnect state transitions broadcast real-time events.
    """
    session = CameraSession(CameraConfig(camera_id="cam_test_events", name="Test Event Cam", source_type=CameraSourceType.FILE))
    
    # 1. Disconnect transition
    session._set_state(CameraState.DISCONNECTED, "Simulated network failure")
    events = event_broadcaster.get_recent_events(limit=5)
    disc_events = [e for e in events if e["event_type"] == RealtimeEventType.CAMERA_DISCONNECTED and e["camera_id"] == "cam_test_events"]
    assert len(disc_events) >= 1
    assert disc_events[-1]["data"]["error_message"] == "Simulated network failure"

    # 2. Reconnection transition
    session._set_state(CameraState.CONNECTED, None)
    events2 = event_broadcaster.get_recent_events(limit=5)
    reconnected_events = [e for e in events2 if e["event_type"] == RealtimeEventType.CAMERA_RECONNECTED and e["camera_id"] == "cam_test_events"]
    assert len(reconnected_events) >= 1


def test_incident_created_and_continuation_deduplication():
    """
    Validates that IncidentService broadcasts INCIDENT_CREATED on initial hazard onset (Category C)
    and INCIDENT_CONTINUATION on ongoing hazard past cooldown (Category A & B) without duplicate tickets.
    """
    svc = IncidentService(db=None, sustenance_frames=3, cooldown_sec=4.0)

    # Frame 1, 2: Sustenance building -> no alerts
    svc.check_and_create_incidents(camera_id="cam_dedup_test", frame_idx=1, timestamp_sec=1.0, risk_data={"smoothed_score": 80.0})
    svc.check_and_create_incidents(camera_id="cam_dedup_test", frame_idx=2, timestamp_sec=2.0, risk_data={"smoothed_score": 82.0})
    assert len(event_broadcaster.get_recent_events()) == 0

    # Frame 3: Sustained 3 frames -> INCIDENT_CREATED emitted
    alerts = svc.check_and_create_incidents(camera_id="cam_dedup_test", frame_idx=3, timestamp_sec=3.0, risk_data={"smoothed_score": 85.0})
    assert len(alerts) == 1
    orig_id = alerts[0].id

    recent = event_broadcaster.get_recent_events()
    assert len(recent) == 1
    assert recent[0]["event_type"] == RealtimeEventType.INCIDENT_CREATED
    assert recent[0]["incident_id"] == orig_id
    assert recent[0]["is_continuation"] is False

    # Advance time past cooldown to 8.0s -> Ongoing hazard
    alerts_cont = svc.check_and_create_incidents(camera_id="cam_dedup_test", frame_idx=8, timestamp_sec=8.0, risk_data={"smoothed_score": 88.0})
    assert len(alerts_cont) == 1
    assert alerts_cont[0].id == orig_id
    assert alerts_cont[0].measurements["repeat_event_count"] == 2

    recent_cont = event_broadcaster.get_recent_events()
    assert len(recent_cont) == 2
    assert recent_cont[-1]["event_type"] == RealtimeEventType.INCIDENT_CONTINUATION
    assert recent_cont[-1]["incident_id"] == orig_id
    assert recent_cont[-1]["is_continuation"] is True
    assert recent_cont[-1]["repeat_event_count"] == 2


def test_incident_lifecycle_acknowledgement_and_resolution():
    """
    Validates that updating incident status via API broadcasts real-time lifecycle events.
    """
    from app.database.session import SessionLocal
    from app.models.entities import Incident
    import datetime

    db = SessionLocal()
    test_inc_id = "inc_lifecycle_p51"
    try:
        inc = Incident(
            id=test_inc_id,
            camera_id="cam_test_lifecycle",
            frame_index=10,
            video_timestamp_sec=2.5,
            incident_type="CRITICAL_RISK",
            severity="CRITICAL",
            risk_score=85.0,
            forecast_risk=90.0,
            status="Open",
            trigger_reason="Test lifecycle reason",
            created_at=datetime.datetime.utcnow()
        )
        db.merge(inc)
        db.commit()

        client = TestClient(app)
        
        # 1. Update to Acknowledged
        resp_ack = client.patch(f"/api/incidents/{test_inc_id}/status", json={"status": "Acknowledged", "operator_notes": "Security investigating"})
        assert resp_ack.status_code == 200
        
        recent = event_broadcaster.get_recent_events(limit=5)
        ack_events = [e for e in recent if e["event_type"] == RealtimeEventType.INCIDENT_ACKNOWLEDGED and e["incident_id"] == test_inc_id]
        assert len(ack_events) == 1
        assert ack_events[0]["incident_status"] == "Acknowledged"

        # 2. Update to Resolved
        resp_res = client.patch(f"/api/incidents/{test_inc_id}/status", json={"status": "Resolved", "operator_notes": "Area cleared"})
        assert resp_res.status_code == 200

        recent2 = event_broadcaster.get_recent_events(limit=5)
        res_events = [e for e in recent2 if e["event_type"] == RealtimeEventType.INCIDENT_RESOLVED and e["incident_id"] == test_inc_id]
        assert len(res_events) == 1
        assert res_events[0]["incident_status"] == "Resolved"

    finally:
        db.query(Incident).filter(Incident.id == test_inc_id).delete()
        db.commit()
        db.close()


def test_phase51_benchmark_api_endpoints():
    """
    Validates REST endpoints for recent events, event status, and Phase 5.1 resilience report.
    """
    client = TestClient(app)

    # 1. GET /api/events/status
    res_status = client.get("/api/events/status")
    assert res_status.status_code == 200
    stat = res_status.json()
    assert "active_subscribers" in stat
    assert "buffer_capacity" in stat

    # 2. GET /api/events/recent
    event_broadcaster.publish(RealtimeEventType.SYSTEM_STATUS, data={"probe": 123})
    res_recent = client.get("/api/events/recent?limit=10")
    assert res_recent.status_code == 200
    rec = res_recent.json()
    assert rec["count"] >= 1
    assert "last_event_id" in rec

    # 3. GET /api/benchmark/phase51-resilience
    res_p51 = client.get("/api/benchmark/phase51-resilience")
    assert res_p51.status_code == 200
    p51_data = res_p51.json()
    assert p51_data["phase"] == "5.1"
    assert "multicamera_scaling" in p51_data
    assert "resilience_and_recovery_tests" in p51_data
    assert p51_data["validation_status"] == "PASSED"
