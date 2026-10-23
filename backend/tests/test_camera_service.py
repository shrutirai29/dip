import time
import pytest
import numpy as np
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.services.camera_service import CameraIngestionService, CameraState
from app.services.live_pipeline_service import LivePipelineProcessor


class MockVideoCapture:
    def __init__(self, opened=True, read_success=True, frame_shape=(480, 640, 3), max_reads=None):
        self._is_opened = opened
        self._read_success = read_success
        self._frame = np.zeros(frame_shape, dtype=np.uint8)
        self.released = False
        self.read_call_count = 0
        self.max_reads = max_reads

    def isOpened(self):
        return self._is_opened and not self.released

    def read(self):
        self.read_call_count += 1
        if self.released:
            return False, None
        if self.max_reads is not None and self.read_call_count > self.max_reads:
            return False, None
        if not self._read_success:
            return False, None
        return True, self._frame.copy()

    def release(self):
        self.released = True
        self._is_opened = False


@pytest.fixture
def clean_camera_service():
    service = CameraIngestionService()
    yield service
    service.stop()


def test_camera_init_success(clean_camera_service):
    mock_cap = MockVideoCapture(opened=True, read_success=True)
    with patch("cv2.VideoCapture", return_value=mock_cap):
        status = clean_camera_service.start(device_index=0, target_fps=30.0)
        assert status["device_index"] == 0
        assert status["is_active"] is True

        # Wait for first frame
        frame_data = clean_camera_service.get_latest_frame(timeout=1.0)
        assert frame_data is not None
        fid, ts, frame = frame_data
        assert fid >= 1
        assert ts > 0
        assert frame.shape == (480, 640, 3)
        assert clean_camera_service.state == CameraState.CONNECTED

        # Stop and verify resource release
        stop_status = clean_camera_service.stop()
        assert stop_status["state"] == CameraState.IDLE
        assert mock_cap.released is True


def test_camera_unavailable(clean_camera_service):
    mock_cap = MockVideoCapture(opened=False)
    with patch("cv2.VideoCapture", return_value=mock_cap):
        clean_camera_service.start(device_index=99)
        time.sleep(0.3)
        status = clean_camera_service.get_status()
        assert status["state"] == CameraState.DISCONNECTED
        assert "Unable to open camera device index 99" in (status["error_message"] or "")
        assert status["is_active"] is False


def test_camera_invalid_device_index(clean_camera_service):
    with pytest.raises(ValueError):
        clean_camera_service.start(device_index=-1)


def test_camera_duplicate_start_idempotent(clean_camera_service):
    mock_cap = MockVideoCapture(opened=True, read_success=True)
    with patch("cv2.VideoCapture", return_value=mock_cap):
        status1 = clean_camera_service.start(device_index=0)
        assert status1["is_active"] is True
        time.sleep(0.1)

        # Second start with same device index should be idempotent
        status2 = clean_camera_service.start(device_index=0)
        assert status2["device_index"] == 0
        assert status2["is_active"] is True


def test_camera_read_failures_and_disconnection(clean_camera_service):
    # Cap opens, but read returns failure immediately
    mock_cap = MockVideoCapture(opened=True, read_success=False)
    with patch("cv2.VideoCapture", return_value=mock_cap):
        clean_camera_service.start(device_index=0, target_fps=30.0)
        
        # Wait for consecutive failure loop to exceed MAX_CONSECUTIVE_FAILURES (10)
        for _ in range(30):
            if clean_camera_service.state == CameraState.DISCONNECTED:
                break
            time.sleep(0.1)

        status = clean_camera_service.get_status()
        assert status["state"] == CameraState.DISCONNECTED
        assert "consecutive read failures" in (status["error_message"] or "")
        assert mock_cap.released is True


def test_camera_frame_drop_accounting(clean_camera_service):
    mock_cap = MockVideoCapture(opened=True, read_success=True)
    with patch("cv2.VideoCapture", return_value=mock_cap):
        clean_camera_service.start(device_index=0, target_fps=60.0)
        # Allow multiple frames to arrive without consuming them
        time.sleep(0.3)
        status = clean_camera_service.get_status()
        assert status["frames_captured"] > 1
        # Dropped frames should be greater than 0 since we didn't consume every frame
        assert status["frames_dropped"] > 0
        clean_camera_service.stop()


def test_camera_api_lifecycle():
    client = TestClient(app)
    mock_cap = MockVideoCapture(opened=True, read_success=True)

    with patch("cv2.VideoCapture", return_value=mock_cap):
        # 1. Start session with valid device index
        payload = {
            "device_index": 0,
            "conf_threshold": 0.3,
            "inference_size": 640,
            "perspective_weight": 1.1,
            "privacy_mode": "none",
            "target_fps": 25.0
        }
        res = client.post("/api/camera/session/start", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["device_index"] == 0
        assert data["is_active"] is True

        # 2. Check status
        res_stat = client.get("/api/camera/session/status")
        assert res_stat.status_code == 200
        stat_data = res_stat.json()
        assert stat_data["is_active"] is True
        assert stat_data["state"] in (CameraState.CONNECTING, CameraState.CONNECTED)

        # 3. Test invalid negative device index
        bad_payload = {**payload, "device_index": -1}
        res_bad = client.post("/api/camera/session/start", json=bad_payload)
        assert res_bad.status_code == 422

        # 4. Stop session
        res_stop = client.post("/api/camera/session/stop")
        assert res_stop.status_code == 200
        stop_data = res_stop.json()
        assert stop_data["is_active"] is False
        assert stop_data["state"] == CameraState.IDLE
