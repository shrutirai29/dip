import time
import pytest
from unittest.mock import MagicMock, patch
import numpy as np

from app.main import app
from app.services.camera_registry import camera_registry_service, CameraRegistryService
from app.services.camera_session import CameraSession, CameraConfig, CameraState, CameraSourceType
from fastapi.testclient import TestClient

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_registry():
    """Ensure registry is clean before and after each test."""
    with camera_registry_service._lock:
        # Stop and remove all sessions
        for s in list(camera_registry_service._sessions.values()):
            try:
                s.stop()
            except Exception:
                pass
        camera_registry_service._sessions.clear()
    yield
    with camera_registry_service._lock:
        for s in list(camera_registry_service._sessions.values()):
            try:
                s.stop()
            except Exception:
                pass
        camera_registry_service._sessions.clear()


def test_register_and_list_cameras():
    """Verify camera registration and listing across both webcam and RTSP types."""
    # 1. Register webcam
    cam1 = camera_registry_service.register_camera(
        name="Main Gate Webcam",
        source_type="webcam",
        device_index=0,
        location="Zone 1"
    )
    assert cam1.camera_id.startswith("cam_")
    assert cam1.config.name == "Main Gate Webcam"
    assert cam1.state == CameraState.IDLE

    # 2. Register RTSP
    with patch("app.services.camera_registry.validate_rtsp_url", return_value=(True, None, {"host": "192.168.1.100", "port": 554})):
        cam2 = camera_registry_service.register_camera(
            name="Perimeter CCTV",
            source_type="rtsp",
            rtsp_url="rtsp://admin:pass@192.168.1.100:554/stream1",
            location="Perimeter North"
        )
    assert cam2.config.sanitized_url == "rtsp://****:****@192.168.1.100:554/stream1"
    assert cam2.state == CameraState.IDLE

    # 3. List
    cam_list = camera_registry_service.list_cameras()
    assert len(cam_list) == 2
    names = [c["camera_name"] for c in cam_list]
    assert "Main Gate Webcam" in names
    assert "Perimeter CCTV" in names


def test_independent_camera_sessions_isolation():
    """Verify separate frame buffers, trackers, and analytics state for multiple cameras."""
    cam1 = camera_registry_service.register_camera(name="Cam A", source_type="webcam", device_index=0)
    cam2 = camera_registry_service.register_camera(name="Cam B", source_type="webcam", device_index=1)

    assert cam1.tracker is not cam2.tracker
    assert cam1.density_service is not cam2.density_service
    assert cam1.risk_engine is not cam2.risk_engine
    assert cam1.forecasting_engine is not cam2.forecasting_engine
    assert cam1._frame_lock is not cam2._frame_lock

    # Inject frame into Cam A only
    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    cam1._record_frame(dummy_frame, time.time())

    assert cam1._frames_captured == 1
    assert cam2._frames_captured == 0
    assert cam1._latest_raw_frame is not None
    assert cam2._latest_raw_frame is None


def test_camera_start_and_stop_isolation():
    """Verify starting or stopping camera A does not reset or disconnect camera B."""
    cam1 = camera_registry_service.register_camera(name="Cam A", source_type="webcam")
    cam2 = camera_registry_service.register_camera(name="Cam B", source_type="webcam")

    with patch.object(cam1, "_capture_worker"), patch.object(cam1, "_inference_worker"), \
         patch.object(cam2, "_capture_worker"), patch.object(cam2, "_inference_worker"):

        camera_registry_service.start_camera(cam1.camera_id)
        assert cam1.is_active is True
        assert cam2.is_active is False

        camera_registry_service.start_camera(cam2.camera_id)
        assert cam1.is_active is True
        assert cam2.is_active is True

        # Stop Cam A only
        camera_registry_service.stop_camera(cam1.camera_id)
        assert cam1.is_active is False
        assert cam1.state == CameraState.IDLE
        assert cam2.is_active is True  # Cam B remains unaffected


def test_capacity_limit_enforcement():
    """Verify maximum registered cameras and active stream limits."""
    # Test max registered limit
    with patch.object(camera_registry_service, "max_registered", 2):
        camera_registry_service.register_camera(name="C1", source_type="webcam")
        camera_registry_service.register_camera(name="C2", source_type="webcam")
        with pytest.raises(ValueError, match="Maximum registered camera limit reached"):
            camera_registry_service.register_camera(name="C3", source_type="webcam")

    # Test max active streams limit
    c1 = camera_registry_service.register_camera(name="C1", source_type="webcam")
    c2 = camera_registry_service.register_camera(name="C2", source_type="webcam")

    with patch.object(camera_registry_service, "max_active", 1):
        with patch.object(c1, "_capture_worker"), patch.object(c1, "_inference_worker"), \
             patch.object(c2, "_capture_worker"), patch.object(c2, "_inference_worker"):
            camera_registry_service.start_camera(c1.camera_id)
            assert c1.is_active is True

            with pytest.raises(ValueError, match="Active camera stream limit reached"):
                camera_registry_service.start_camera(c2.camera_id)


def test_failure_and_reconnection_isolation():
    """Verify camera A's failure and reconnect cycle does not disrupt camera B."""
    cam1 = camera_registry_service.register_camera(name="Cam A", source_type="webcam")
    cam2 = camera_registry_service.register_camera(name="Cam B", source_type="webcam")

    cam1._set_state(CameraState.CONNECTED)
    cam2._set_state(CameraState.CONNECTED)

    # Simulate network failure on Cam A
    cam1._set_state(CameraState.RECONNECTING, "Network drop")
    assert cam1.state == CameraState.RECONNECTING
    assert cam2.state == CameraState.CONNECTED  # Cam B untouched

    cam1._set_state(CameraState.DISCONNECTED, "Max retries reached")
    assert cam1.state == CameraState.DISCONNECTED
    assert cam2.state == CameraState.CONNECTED


def test_remove_camera_safety():
    """Verify active cameras cannot be removed without stopping first."""
    cam = camera_registry_service.register_camera(name="Cam", source_type="webcam")
    cam._set_state(CameraState.CONNECTED)

    with pytest.raises(ValueError, match="Cannot remove active camera"):
        camera_registry_service.remove_camera(cam.camera_id)

    cam._set_state(CameraState.IDLE)
    assert camera_registry_service.remove_camera(cam.camera_id) is True
    assert camera_registry_service.get_camera(cam.camera_id) is None


def test_multi_camera_api_endpoints():
    """Verify REST API collection, item, health, and validation endpoints."""
    # 1. Validate Source Endpoint
    with patch("app.api.multi_camera_endpoints.validate_rtsp_url", return_value=(True, None, {"host": "192.168.1.50", "port": 554})):
        val_res = client.post("/api/cameras/validate-source", json={"rtsp_url": "rtsp://admin:secret@192.168.1.50:554/live"})
        assert val_res.status_code == 200
        val_data = val_res.json()
        assert val_data["is_valid"] is True
        assert "secret" not in val_data["sanitized_url"]
        assert "****" in val_data["sanitized_url"]

    # 2. Register via API
    reg_res = client.post("/api/cameras", json={
        "name": "Lobby Webcam",
        "source_type": "webcam",
        "device_index": 0,
        "location": "Lobby Entrance"
    })
    assert reg_res.status_code == 201
    created_cam = reg_res.json()
    cam_id = created_cam["camera_id"]
    assert cam_id.startswith("cam_")

    # 3. List via API
    list_res = client.get("/api/cameras")
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1

    # 4. Details via API
    detail_res = client.get(f"/api/cameras/{cam_id}")
    assert detail_res.status_code == 200
    assert detail_res.json()["camera_name"] == "Lobby Webcam"

    # 5. Aggregate Health Endpoint
    health_res = client.get("/api/cameras/health")
    assert health_res.status_code == 200
    health_data = health_res.json()
    assert health_data["total_registered"] == 1
    assert health_data["active_streams"] == 0

    # 6. Delete via API
    del_res = client.delete(f"/api/cameras/{cam_id}")
    assert del_res.status_code == 200
    assert client.get(f"/api/cameras/{cam_id}").status_code == 404
