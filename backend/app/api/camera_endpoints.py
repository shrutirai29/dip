import time
import logging
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services.camera_service import camera_ingestion_service, CameraState
from app.services.live_pipeline_service import live_pipeline_processor

logger = logging.getLogger("crowdguard.camera_api")

router = APIRouter()


class CameraSessionStartRequest(BaseModel):
    device_index: int = Field(0, ge=0, description="Hardware webcam device index (e.g. 0 for default integrated webcam)")
    conf_threshold: float = Field(0.25, ge=0.05, le=1.0)
    inference_size: int = Field(640, ge=320, le=1280)
    perspective_weight: float = Field(1.0, ge=0.0, le=3.0)
    privacy_mode: str = Field("none", pattern="^(none|face_blur|full_anonymize)$")
    target_fps: float = Field(25.0, ge=1.0, le=60.0)


class CameraSessionStatusResponse(BaseModel):
    state: str
    device_index: Optional[int]
    is_active: bool
    frames_captured: int
    frames_consumed: int
    frames_dropped: int
    latest_frame_id: int
    latest_frame_timestamp: float
    measured_fps: float
    processing_fps: float
    uptime_seconds: float
    error_message: Optional[str]


@router.post("/session/start", response_model=CameraSessionStatusResponse)
def start_camera_session(payload: CameraSessionStartRequest):
    """
    Starts local webcam ingestion and live incremental inference.
    Validates hardware device index and prevents arbitrary network URLs.
    Idempotent if already active on the same device.
    """
    try:
        # Start camera capture
        cam_status = camera_ingestion_service.start(
            device_index=payload.device_index,
            target_fps=payload.target_fps
        )

        # Start live pipeline worker
        live_pipeline_processor.start(
            conf_threshold=payload.conf_threshold,
            inference_size=payload.inference_size,
            perspective_weight=payload.perspective_weight,
            privacy_mode=payload.privacy_mode,
        )

        proc_stats = live_pipeline_processor.get_processing_stats()

        return {
            **cam_status,
            "processing_fps": proc_stats["processing_fps"],
        }
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start camera session: {str(e)}"
        )


@router.get("/session/status", response_model=CameraSessionStatusResponse)
def get_camera_session_status():
    """
    Retrieves current camera lifecycle state, frame statistics, and drop accounting.
    """
    cam_status = camera_ingestion_service.get_status()
    proc_stats = live_pipeline_processor.get_processing_stats()
    return {
        **cam_status,
        "processing_fps": proc_stats["processing_fps"],
    }


@router.post("/session/stop", response_model=CameraSessionStatusResponse)
def stop_camera_session():
    """
    Gracefully stops the camera capture worker, releases camera hardware, and stops live inference.
    Idempotent.
    """
    live_pipeline_processor.stop()
    cam_status = camera_ingestion_service.stop()
    return {
        **cam_status,
        "processing_fps": 0.0,
    }


@router.get("/latest-frame")
def get_latest_frame_telemetry():
    """
    Retrieves latest processed frame telemetry, including person count, heuristic risk,
    optical flow magnitude, directional entropy, and 3x3 grid density.
    """
    status_info = camera_ingestion_service.get_status()
    if not status_info["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Camera ingestion is not currently active. Start a session first."
        )

    telemetry = live_pipeline_processor.get_latest_telemetry()
    if telemetry is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Camera connected but no processed frame telemetry is available yet."
        )

    return telemetry


@router.get("/snapshot")
def get_latest_frame_snapshot():
    """
    Retrieves latest single JPEG image frame with HUD overlay and privacy filtering.
    """
    status_info = camera_ingestion_service.get_status()
    if not status_info["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Camera ingestion is not active."
        )

    jpeg_bytes = live_pipeline_processor.get_latest_jpeg()
    if jpeg_bytes is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No processed snapshot frame available yet."
        )

    return Response(
        content=jpeg_bytes,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
    )


def generate_mjpeg_stream():
    """
    Generator yielding multipart MJPEG frame chunks.
    Only yields new frames when a new frame is processed (seq != last_seq)
    to prevent sending redundant identical frames to the browser.
    Handles client disconnects and CameraState changes gracefully.
    """
    last_seq = -1
    try:
        while camera_ingestion_service.state in (CameraState.CONNECTED, CameraState.CONNECTING, CameraState.DEGRADED):
            seq, jpeg_bytes = live_pipeline_processor.get_latest_jpeg_with_sequence()
            if jpeg_bytes is not None and seq != last_seq:
                last_seq = seq
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + jpeg_bytes + b"\r\n"
                )
            time.sleep(0.02)  # ~50Hz check for newly processed frames
    except GeneratorExit:
        logger.debug("MJPEG stream consumer disconnected (GeneratorExit).")
    except Exception as e:
        logger.warning(f"MJPEG stream error or unexpected disconnect: {e}")


@router.get("/stream")
def get_mjpeg_stream():
    """
    Streams live multipart MJPEG surveillance feed.
    """
    status_info = camera_ingestion_service.get_status()
    if not status_info["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Camera ingestion is not active. Start a session first."
        )

    return StreamingResponse(
        generate_mjpeg_stream(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )
