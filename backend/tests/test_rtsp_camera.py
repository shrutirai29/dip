import time
from unittest.mock import patch, MagicMock
import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.services.rtsp_security import (
    sanitize_rtsp_url,
    validate_rtsp_url,
    build_authenticated_rtsp_url
)
from app.services.camera_service import (
    camera_ingestion_service,
    CameraState,
    CameraSourceType,
    RtspCameraConfig
)
from app.services.live_pipeline_service import live_pipeline_processor

client = TestClient(app)


def test_rtsp_url_credential_masking():
    """Verify passwords and usernames are completely masked in sanitized URLs."""
    raw_url = "rtsp://admin:superSecret123@192.168.1.100:554/stream1"
    sanitized = sanitize_rtsp_url(raw_url)
    assert "superSecret123" not in sanitized
    assert "admin" not in sanitized
    assert sanitized == "rtsp://****:****@192.168.1.100:554/stream1"

    # URL without credentials
    clean_url = "rtsp://192.168.1.100:554/stream1"
    assert sanitize_rtsp_url(clean_url) == clean_url


def test_rtsp_scheme_validation():
    """Ensure non-RTSP schemes are rejected."""
    # file:// scheme
    ok, err, meta = validate_rtsp_url("file:///etc/passwd", resolve_dns=False)
    assert not ok
    assert "Only 'rtsp://' and 'rtsps://' are permitted" in err

    # http:// scheme
    ok, err, meta = validate_rtsp_url("http://192.168.1.100:554/feed", resolve_dns=False)
    assert not ok
    assert "Unsupported protocol scheme" in err


def test_rtsp_disallowed_service_ports():
    """Ensure probing internal web/database/SSH services is blocked."""
    for bad_port in [22, 80, 443, 8000, 5173, 3306, 6379]:
        ok, err, meta = validate_rtsp_url(f"rtsp://192.168.1.50:{bad_port}/live", resolve_dns=False)
        assert not ok
        assert f"Port {bad_port} is restricted" in err


def test_rtsp_ssrf_destination_protection():
    """Ensure loopback, link-local metadata, multicast, and unauthorized subnets are rejected."""
    # Cloud metadata / link-local address
    with patch("socket.getaddrinfo") as mock_dns:
        mock_dns.return_value = [(2, 1, 6, "", ("169.254.169.254", 554))]
        ok, err, meta = validate_rtsp_url("rtsp://metadata.internal:554/feed", allow_loopback=False)
        assert not ok
        assert "Link-local addresses" in err

    # Multicast address
    with patch("socket.getaddrinfo") as mock_dns:
        mock_dns.return_value = [(2, 1, 6, "", ("224.0.0.1", 554))]
        ok, err, meta = validate_rtsp_url("rtsp://multicast.internal:554/feed")
        assert not ok
        assert "Multicast camera destinations are disallowed" in err

    # Loopback address rejected when allow_loopback=False
    with patch("socket.getaddrinfo") as mock_dns:
        mock_dns.return_value = [(2, 1, 6, "", ("127.0.0.1", 554))]
        ok, err, meta = validate_rtsp_url("rtsp://127.0.0.1:554/feed", allow_loopback=False)
        assert not ok
        assert "Loopback addresses" in err

    # Loopback address accepted when explicitly permitted for testing
    with patch("socket.getaddrinfo") as mock_dns:
        mock_dns.return_value = [(2, 1, 6, "", ("127.0.0.1", 554))]
        ok, err, meta = validate_rtsp_url("rtsp://127.0.0.1:554/feed", allow_loopback=True)
        assert ok


def test_rtsp_validate_api_endpoint():
    """Test POST /api/camera/rtsp/validate endpoint."""
    with patch("socket.getaddrinfo") as mock_dns:
        mock_dns.return_value = [(2, 1, 6, "", ("192.168.1.80", 554))]
        res = client.post("/api/camera/rtsp/validate", json={
            "rtsp_url": "rtsp://admin:pass@192.168.1.80:554/live",
            "username": "admin",
            "password": "pass"
        })
        assert res.status_code == 200
        data = res.json()
        assert data["is_valid"] is True
        assert "pass" not in data["sanitized_url"]
        assert data["host"] == "192.168.1.80"
        assert data["port"] == 554


def test_rtsp_start_api_rejects_ssrf():
    """Ensure POST /api/camera/rtsp/start returns 422 for disallowed destinations."""
    with patch("socket.getaddrinfo") as mock_dns:
        mock_dns.return_value = [(2, 1, 6, "", ("127.0.0.1", 554))]
        res = client.post("/api/camera/rtsp/start", json={
            "name": "Malicious Probe",
            "rtsp_url": "rtsp://127.0.0.1:554/feed"
        })
        assert res.status_code == 422
        assert "Loopback addresses" in res.json()["detail"]


def test_rtsp_mock_capture_lifecycle_success():
    """Test RTSP session start, connected state, frame consumption, and clean stop."""
    camera_ingestion_service.stop()
    live_pipeline_processor.stop()

    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)

    mock_cap = MagicMock()
    mock_cap.isOpened.return_value = True
    mock_cap.read.return_value = (True, dummy_frame)

    with patch("cv2.VideoCapture", return_value=mock_cap), \
         patch("socket.getaddrinfo", return_value=[(2, 1, 6, "", ("192.168.1.55", 554))]):

        res = client.post("/api/camera/rtsp/start", json={
            "name": "North Gate CCTV",
            "rtsp_url": "rtsp://192.168.1.55:554/live",
            "target_fps": 30.0,
            "conf_threshold": 0.30
        })
        assert res.status_code == 200
        data = res.json()
        assert data["source_type"] == "rtsp"
        assert data["camera_name"] == "North Gate CCTV"
        assert data["is_active"] is True

        # Allow worker thread to cycle
        time.sleep(0.3)

        status_res = client.get("/api/camera/session/status")
        assert status_res.status_code == 200
        status_data = status_res.json()
        assert status_data["state"] == CameraState.CONNECTED
        assert status_data["frames_captured"] > 0
        assert status_data["sanitized_url"] == "rtsp://192.168.1.55:554/live"

        # Stop session
        stop_res = client.post("/api/camera/session/stop")
        assert stop_res.status_code == 200
        assert stop_res.json()["state"] == CameraState.IDLE
        assert stop_res.json()["is_active"] is False


def test_rtsp_reconnection_backoff_and_retry_limits():
    """Test that stream read failure triggers RECONNECTING with backoff and stops at max_retries."""
    camera_ingestion_service.stop()
    live_pipeline_processor.stop()

    mock_cap = MagicMock()
    # Initially fails to open stream
    mock_cap.isOpened.return_value = False

    with patch("cv2.VideoCapture", return_value=mock_cap), \
         patch("socket.getaddrinfo", return_value=[(2, 1, 6, "", ("192.168.1.77", 554))]):

        config = RtspCameraConfig(
            name="Failover Cam",
            rtsp_url="rtsp://192.168.1.77:554/h264",
            max_retries=2,
            initial_backoff_sec=0.2,
            max_backoff_sec=1.0
        )
        status = camera_ingestion_service.start_rtsp(config)
        assert status["is_active"] is True

        # Poll until retries exhaust and state becomes DISCONNECTED
        for _ in range(40):
            if camera_ingestion_service.state == CameraState.DISCONNECTED:
                break
            time.sleep(0.1)

        final_status = camera_ingestion_service.get_status()
        assert final_status["state"] == CameraState.DISCONNECTED
        assert "Exceeded maximum retry attempts" in (final_status["error_message"] or "")

        camera_ingestion_service.stop()


def test_rtsp_manual_retry_action():
    """Verify POST /api/camera/rtsp/retry interrupts backoff or retries disconnected session."""
    camera_ingestion_service.stop()

    config = RtspCameraConfig(
        name="Retry Test Cam",
        rtsp_url="rtsp://192.168.1.99:554/live",
        max_retries=1,
        initial_backoff_sec=10.0
    )
    mock_cap = MagicMock()
    mock_cap.isOpened.return_value = False

    with patch("cv2.VideoCapture", return_value=mock_cap):
        camera_ingestion_service.start_rtsp(config)
        time.sleep(0.2)

        # Trigger immediate retry via API
        retry_res = client.post("/api/camera/rtsp/retry")
        assert retry_res.status_code == 200

        camera_ingestion_service.stop()


def test_source_switching_webcam_to_rtsp_releases_resources():
    """Ensure switching from webcam to RTSP cleanly stops the webcam worker without crosstalk."""
    camera_ingestion_service.stop()
    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)

    mock_cap_webcam = MagicMock()
    mock_cap_webcam.isOpened.return_value = True
    mock_cap_webcam.read.return_value = (True, dummy_frame)

    mock_cap_rtsp = MagicMock()
    mock_cap_rtsp.isOpened.return_value = True
    mock_cap_rtsp.read.return_value = (True, dummy_frame)

    with patch("cv2.VideoCapture", side_effect=[mock_cap_webcam, mock_cap_rtsp]), \
         patch("socket.getaddrinfo", return_value=[(2, 1, 6, "", ("192.168.1.66", 554))]):

        # 1. Start webcam
        res1 = client.post("/api/camera/session/start", json={"device_index": 0})
        assert res1.status_code == 200
        assert res1.json()["source_type"] == "webcam"
        time.sleep(0.2)

        # 2. Start RTSP: should automatically stop webcam worker
        res2 = client.post("/api/camera/rtsp/start", json={
            "name": "Gate RTSP",
            "rtsp_url": "rtsp://192.168.1.66:554/live"
        })
        assert res2.status_code == 200
        assert res2.json()["source_type"] == "rtsp"
        assert res2.json()["device_index"] is None
        assert mock_cap_webcam.release.called

        camera_ingestion_service.stop()
        live_pipeline_processor.stop()
