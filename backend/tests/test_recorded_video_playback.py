import os
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database.session import SessionLocal
from app.models.entities import Video, Analysis, FrameRecord
from app.core.config import settings
from app.services.video_transcode_service import (
    get_ffmpeg_path,
    is_h264_stream,
    ensure_h264_browser_compatible
)

client = TestClient(app)

def test_video_transcode_service_ffmpeg_discovery():
    """Ensure ffmpeg executable is discovered on system."""
    ffmpeg = get_ffmpeg_path()
    assert ffmpeg is not None, "ffmpeg should be discoverable in test environment"
    assert os.path.exists(ffmpeg)

def test_video_transcode_service_h264_detection():
    """Ensure is_h264_stream accurately identifies H.264 files."""
    # Test file that does not exist
    assert is_h264_stream("data/non_existent_file.mp4") is False

    # Check known H.264 file if present
    target = os.path.join(settings.PROCESSED_DIR, "anl_e26f97a1f6_annotated.mp4")
    if os.path.exists(target):
        assert is_h264_stream(target) is True

def test_analysis_video_endpoint_not_found():
    """Requesting non-existent analysis returns 404."""
    response = client.get("/api/analyses/anl_non_existent_9999/video")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()

def test_analysis_video_endpoint_processing_conflict():
    """Requesting video for currently processing analysis returns 409."""
    db = SessionLocal()
    try:
        # Create a temporary dummy processing analysis
        test_video = Video(
            id="vid_temp_test_proc",
            filename="temp_test.mp4",
            original_filename="temp_test.mp4",
            file_path="data/temp_test.mp4",
            file_size_bytes=100,
            duration_seconds=5.0,
            fps=25.0,
            width=640,
            height=480,
            frame_count=125
        )
        db.merge(test_video)
        
        proc_analysis = Analysis(
            id="anl_test_proc_video",
            video_id="vid_temp_test_proc",
            status="processing",
            progress_percent=45.0,
            annotated_video_path="/data/processed/anl_test_proc_video_annotated.mp4"
        )
        db.merge(proc_analysis)
        db.commit()

        response = client.get("/api/analyses/anl_test_proc_video/video")
        assert response.status_code == 409
        assert "currently being rendered" in response.json()["detail"]
    finally:
        # Cleanup
        db.query(Analysis).filter(Analysis.id == "anl_test_proc_video").delete()
        db.query(Video).filter(Video.id == "vid_temp_test_proc").delete()
        db.commit()
        db.close()

def test_analysis_video_endpoint_streaming_success():
    """Requesting completed analysis video returns 200 with video/mp4 and Accept-Ranges."""
    # Find an existing completed analysis with file on disk
    target_id = "anl_e26f97a1f6"
    target_file = os.path.join(settings.PROCESSED_DIR, f"{target_id}_annotated.mp4")
    
    if os.path.exists(target_file):
        # Test HEAD request (required by HTML5 video players for metadata probe)
        head_response = client.head(f"/api/analyses/{target_id}/video")
        assert head_response.status_code == 200
        assert head_response.headers.get("content-type") == "video/mp4"
        assert head_response.headers.get("accept-ranges") == "bytes"
        assert int(head_response.headers.get("content-length", 0)) > 0

        # Test GET request
        response = client.get(f"/api/analyses/{target_id}/video")
        assert response.status_code == 200
        assert response.headers.get("content-type") == "video/mp4"
        assert response.headers.get("accept-ranges") == "bytes"
        assert int(response.headers.get("content-length", 0)) > 0

def test_analysis_video_endpoint_byte_range_request():
    """Requesting Range: bytes=0-1024 returns HTTP 206 Partial Content."""
    target_id = "anl_e26f97a1f6"
    target_file = os.path.join(settings.PROCESSED_DIR, f"{target_id}_annotated.mp4")
    
    if os.path.exists(target_file):
        file_size = os.path.getsize(target_file)
        headers = {"Range": "bytes=0-1023"}
        response = client.get(f"/api/analyses/{target_id}/video", headers=headers)
        
        assert response.status_code == 206
        assert response.headers.get("content-type") == "video/mp4"
        assert response.headers.get("accept-ranges") == "bytes"
        assert response.headers.get("content-range") == f"bytes 0-1023/{file_size}"
        assert len(response.content) == 1024
