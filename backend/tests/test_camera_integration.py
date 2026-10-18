import time
import pytest
import numpy as np
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.services.camera_service import camera_ingestion_service, CameraState
from app.services.live_pipeline_service import live_pipeline_processor
from app.services.dip_service import DIPProcessor


class SyntheticVideoCapture:
    """
    Mock cv2.VideoCapture that returns synthetic frames of pedestrians on a background.
    """
    def __init__(self, opened=True, frame_shape=(480, 640, 3)):
        self._is_opened = opened
        self._frame_shape = frame_shape
        self.released = False
        self.frame_count = 0

    def isOpened(self):
        return self._is_opened and not self.released

    def read(self):
        if self.released or not self._is_opened:
            return False, None
        self.frame_count += 1
        # Create a frame with some recognizable patterns
        frame = np.full(self._frame_shape, 120, dtype=np.uint8)
        # Draw a synthetic pedestrian block in center
        cv2 = pytest.importorskip("cv2")
        cv2.rectangle(frame, (280, 150), (360, 350), (40, 50, 60), -1)
        cv2.circle(frame, (320, 180), 25, (180, 150, 130), -1)
        return True, frame

    def release(self):
        self.released = True
        self._is_opened = False


from app.database.session import Base, engine


@pytest.fixture(autouse=True)
def ensure_clean_camera_state():
    """Ensure database tables exist and any running camera or live pipeline is cleanly stopped."""
    Base.metadata.create_all(bind=engine)
    try:
        from tests.test_api import test_engine
        Base.metadata.create_all(bind=test_engine)
    except Exception:
        pass

    live_pipeline_processor.stop()
    camera_ingestion_service.stop()
    yield
    live_pipeline_processor.stop()
    camera_ingestion_service.stop()


def test_camera_latest_frame_503_when_inactive():
    client = TestClient(app)
    res = client.get("/api/camera/latest-frame")
    assert res.status_code == 503
    assert "not currently active" in res.json()["detail"].lower()


def test_camera_snapshot_503_when_inactive():
    client = TestClient(app)
    res = client.get("/api/camera/snapshot")
    assert res.status_code == 503


def test_camera_stream_503_when_inactive():
    client = TestClient(app)
    res = client.get("/api/camera/stream")
    assert res.status_code == 503


def test_camera_session_start_and_telemetry():
    client = TestClient(app)
    mock_cap = SyntheticVideoCapture(opened=True)

    with patch("cv2.VideoCapture", return_value=mock_cap):
        # 1. Start camera session
        payload = {
            "device_index": 0,
            "conf_threshold": 0.25,
            "inference_size": 320,
            "perspective_weight": 1.0,
            "privacy_mode": "none",
            "target_fps": 30.0,
        }
        res_start = client.post("/api/camera/session/start", json=payload)
        assert res_start.status_code == 200
        start_data = res_start.json()
        assert start_data["is_active"] is True
        assert start_data["device_index"] == 0

        # Wait for live worker to process at least one frame
        telemetry = None
        for _ in range(25):
            time.sleep(0.1)
            t_res = client.get("/api/camera/latest-frame")
            if t_res.status_code == 200:
                telemetry = t_res.json()
                break

        assert telemetry is not None, "Failed to retrieve telemetry within timeout"
        assert "frame_index" in telemetry
        assert "timestamp_sec" in telemetry
        assert "smoothed_risk_score" in telemetry
        assert "risk_band" in telemetry
        assert "grid_density" in telemetry
        assert len(telemetry["grid_density"]) == 9
        assert "directional_entropy" in telemetry
        assert "camera_state" in telemetry
        assert telemetry["camera_state"] in ("CONNECTED", "CONNECTING")

        # Check snapshot
        res_snap = client.get("/api/camera/snapshot")
        assert res_snap.status_code == 200
        assert res_snap.headers["content-type"] == "image/jpeg"
        assert len(res_snap.content) > 100

        # Stop camera session
        res_stop = client.post("/api/camera/session/stop")
        assert res_stop.status_code == 200
        assert res_stop.json()["is_active"] is False


def test_camera_stream_mjpeg_content_type():
    from app.api.camera_endpoints import generate_mjpeg_stream
    fake_jpeg = b"\xff\xd8\xff\xe0\x00\x10JFIF"
    with patch.object(live_pipeline_processor, "get_latest_jpeg", return_value=fake_jpeg):
        with patch.object(type(camera_ingestion_service), "state", property(lambda self: CameraState.CONNECTED)):
            gen = generate_mjpeg_stream()
            chunk = next(gen)
            assert b"--frame\r\n" in chunk
            assert b"Content-Type: image/jpeg\r\n\r\n" in chunk
            assert fake_jpeg in chunk
            gen.close()

    # Also test endpoint headers using TestClient with mocked active service
    client = TestClient(app)
    with patch.object(camera_ingestion_service, "get_status", return_value={"is_active": True}):
        with patch("app.api.camera_endpoints.generate_mjpeg_stream", return_value=iter([b"--frame\r\n"])):
            with client.stream("GET", "/api/camera/stream") as response:
                assert response.status_code == 200
                assert "multipart/x-mixed-replace; boundary=frame" in response.headers["content-type"]
                first_chunk = next(response.iter_bytes())
                assert b"--frame" in first_chunk


def test_privacy_mode_verification():
    """
    Verify that:
    1. 'none' leaves the raw frame completely unaltered.
    2. 'face_blur' modifies upper bounding box (face region).
    3. 'full_anonymize' modifies the entire bounding box with a silhouette.
    """
    raw_frame = np.full((400, 400, 3), 150, dtype=np.uint8)
    # Add texture inside bbox so blur is measurable
    raw_frame[100:300, 150:250] = np.random.randint(50, 220, (200, 100, 3), dtype=np.uint8)
    detections = [{"bbox": [150, 100, 250, 300], "confidence": 0.85, "class_id": 0}]

    # 1. Mode: none
    out_none = DIPProcessor.apply_privacy_filter(raw_frame.copy(), detections, mode="none")
    assert np.array_equal(out_none, raw_frame), "Privacy mode 'none' must not alter pixels."

    # 2. Mode: face_blur
    out_face = DIPProcessor.apply_privacy_filter(raw_frame.copy(), detections, mode="face_blur")
    # Face region (upper 28%) must differ
    face_h = int(200 * 0.28)
    assert not np.array_equal(
        out_face[100:100 + face_h, 150:250],
        raw_frame[100:100 + face_h, 150:250]
    ), "Face region must be blurred in 'face_blur' mode."
    # Lower body (below 28%) must remain identical
    assert np.array_equal(
        out_face[100 + face_h:300, 150:250],
        raw_frame[100 + face_h:300, 150:250]
    ), "Lower body region must remain intact in 'face_blur' mode."

    # 3. Mode: full_anonymize
    out_anon = DIPProcessor.apply_privacy_filter(raw_frame.copy(), detections, mode="full_anonymize")
    assert not np.array_equal(
        out_anon[100:300, 150:250],
        raw_frame[100:300, 150:250]
    ), "Entire bounding box must be masked in 'full_anonymize' mode."
    # Outside bounding box must remain identical
    assert np.array_equal(out_anon[:100, :], raw_frame[:100, :])
    assert np.array_equal(out_anon[300:, :], raw_frame[300:, :])


def test_recorded_video_workflow_non_interference():
    """
    Verify that existing recorded-video analysis endpoints (/api/videos/samples, /api/videos)
    continue to function smoothly and return 200 while camera ingestion is running.
    """
    client = TestClient(app)
    mock_cap = SyntheticVideoCapture(opened=True)

    with patch("cv2.VideoCapture", return_value=mock_cap):
        # Start camera session
        client.post("/api/camera/session/start", json={"device_index": 0})

        # Query recorded video endpoints
        res_samples = client.get("/api/videos/samples")
        assert res_samples.status_code == 200
        assert isinstance(res_samples.json(), list)

        res_videos = client.get("/api/videos")
        assert res_videos.status_code == 200
        assert isinstance(res_videos.json(), list)

        res_analyses = client.get("/api/analyses")
        assert res_analyses.status_code == 200
        assert isinstance(res_analyses.json(), list)

        # Stop camera session
        client.post("/api/camera/session/stop")
