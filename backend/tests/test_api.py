import os
import cv2
import pytest
import numpy as np
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database.session import Base, get_db
from app.models.entities import Video, Analysis, FrameRecord, Incident

from sqlalchemy.pool import StaticPool
import app.api.endpoints as endpoints_mod

# Setup isolated test database for API tests
TEST_DB_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(scope="module", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[get_db] = override_get_db
    orig_session_local = getattr(endpoints_mod, "SessionLocal", None)
    endpoints_mod.SessionLocal = TestingSessionLocal
    yield
    Base.metadata.drop_all(bind=test_engine)
    app.dependency_overrides.pop(get_db, None)
    if orig_session_local is not None:
        endpoints_mod.SessionLocal = orig_session_local

@pytest.fixture
def client():
    return TestClient(app)

def test_health_check(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert "Digital Image Processing" in data["system"]

def test_upload_invalid_extension(client):
    # Try uploading a .txt file
    res = client.post(
        "/api/videos/upload",
        files={"file": ("malicious.txt", b"not a video", "text/plain")}
    )
    assert res.status_code == 400
    assert "Unsupported video format" in res.json()["detail"]

def test_upload_empty_video(client):
    res = client.post(
        "/api/videos/upload",
        files={"file": ("empty.mp4", b"", "video/mp4")}
    )
    assert res.status_code == 400
    assert "empty" in res.json()["detail"].lower()

def test_sample_videos_endpoints(client):
    res = client.get("/api/videos/samples")
    assert res.status_code == 200
    samples = res.json()
    assert isinstance(samples, list)
    if samples:
        first_sample = samples[0]["filename"]
        ingest_res = client.post(f"/api/videos/samples/{first_sample}/ingest")
        assert ingest_res.status_code == 200
        vid = ingest_res.json()
        assert vid["original_filename"] == first_sample
        assert vid["duration_seconds"] > 0.0

def test_videos_list_and_get(client):
    # Query video list
    res = client.get("/api/videos")
    assert res.status_code == 200
    videos = res.json()
    assert isinstance(videos, list)
    if videos:
        vid_id = videos[0]["id"]
        detail_res = client.get(f"/api/videos/{vid_id}")
        assert detail_res.status_code == 200
        assert detail_res.json()["id"] == vid_id

    # 404 for non-existent video
    missing = client.get("/api/videos/vid_nonexistent")
    assert missing.status_code == 404

def test_analysis_lifecycle_api(client):
    # Ensure at least one video exists
    sample_list = client.get("/api/videos/samples").json()
    if not sample_list:
        pytest.skip("No sample videos available for analysis creation test.")
    
    ingest_res = client.post(f"/api/videos/samples/{sample_list[0]['filename']}/ingest")
    vid_id = ingest_res.json()["id"]

    # 1. Create analysis
    payload = {
        "video_id": vid_id,
        "conf_threshold": 0.25,
        "frame_stride": 4,
        "inference_size": 320,
        "weight_density": 0.35,
        "weight_growth": 0.20,
        "weight_motion_anomaly": 0.25,
        "weight_congestion": 0.20,
        "perspective_weight": 1.2,
        "privacy_mode": "none"
    }
    create_res = client.post("/api/analyses", json=payload)
    assert create_res.status_code == 200
    anl = create_res.json()
    anl_id = anl["id"]
    assert anl["status"] in ["pending", "processing"]
    assert anl["video_id"] == vid_id

    # 2. Get analysis by ID
    get_res = client.get(f"/api/analyses/{anl_id}")
    assert get_res.status_code == 200
    assert get_res.json()["id"] == anl_id

    # 3. 404 for non-existent analysis
    assert client.get("/api/analyses/anl_nonexistent").status_code == 404

def test_incidents_api(client):
    db = TestingSessionLocal()
    try:
        # Create a test incident directly in DB
        inc = Incident(
            id="inc_api_test",
            analysis_id="anl_fake",
            frame_index=10,
            video_timestamp_sec=0.5,
            incident_type="CRITICAL_RISK",
            severity="CRITICAL",
            risk_score=85.0,
            forecast_risk=90.0,
            trigger_reason="Test hazard threshold exceeded",
            recommended_action="Dispatch personnel",
            relevant_region="Sector A1",
            status="Open"
        )
        db.add(inc)
        db.commit()
    finally:
        db.close()

    # List incidents
    res = client.get("/api/incidents")
    assert res.status_code == 200
    incidents = res.json()
    assert any(i["id"] == "inc_api_test" for i in incidents)

    # Filter by severity
    filter_res = client.get("/api/incidents?severity=CRITICAL")
    assert filter_res.status_code == 200
    assert all(i["severity"] == "CRITICAL" for i in filter_res.json())

    # Get incident by ID
    single = client.get("/api/incidents/inc_api_test")
    assert single.status_code == 200
    assert single.json()["id"] == "inc_api_test"

    # Update incident status & notes
    patch_res = client.patch(
        "/api/incidents/inc_api_test",
        json={"status": "Acknowledged", "operator_notes": "Officer dispatched to Sector A1."}
    )
    assert patch_res.status_code == 200
    updated = patch_res.json()
    assert updated["status"] == "Acknowledged"
    assert updated["operator_notes"] == "Officer dispatched to Sector A1."

def test_analytics_summary_api(client):
    res = client.get("/api/analytics/summary")
    assert res.status_code == 200
    data = res.json()
    assert "total_videos" in data
    assert "total_analyses" in data
    assert "total_incidents" in data
    assert "avg_risk_overall" in data
