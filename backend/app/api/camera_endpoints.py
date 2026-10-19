import time
import logging
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services.camera_service import (
    camera_ingestion_service,
    CameraState,
    CameraSourceType,
    RtspCameraConfig
)
from app.services.live_pipeline_service import live_pipeline_processor
from app.services.rtsp_security import validate_rtsp_url, sanitize_rtsp_url

logger = logging.getLogger("crowdguard.camera_api")

router = APIRouter()


class CameraSessionStartRequest(BaseModel):
    device_index: int = Field(0, ge=0, description="Hardware webcam device index (e.g. 0 for default integrated webcam)")
    conf_threshold: float = Field(0.30, ge=0.05, le=1.0, description="Confidence threshold (calibrated 0.30 baseline to suppress background clutter)")
    inference_size: int = Field(640, ge=320, le=1280)
    perspective_weight: float = Field(1.0, ge=0.0, le=3.0)
    privacy_mode: str = Field("none", pattern="^(none|face_blur|full_anonymize)$")
    target_fps: float = Field(25.0, ge=1.0, le=60.0)


class RtspValidateRequest(BaseModel):
    rtsp_url: str = Field(..., description="RTSP URL to validate (e.g. rtsp://192.168.1.100:554/stream1)")
    username: Optional[str] = Field(None, max_length=64)
    password: Optional[str] = Field(None, max_length=128)


class RtspValidateResponse(BaseModel):
    is_valid: bool
    sanitized_url: str
    host: Optional[str] = None
    port: Optional[int] = None
    error_message: Optional[str] = None


class RtspCameraStartRequest(BaseModel):
    name: str = Field("CCTV Camera", min_length=1, max_length=64, description="Human-readable camera label")
    rtsp_url: str = Field(..., description="RTSP feed URL")
    username: Optional[str] = Field(None, max_length=64, description="Optional stream credentials")
    password: Optional[str] = Field(None, max_length=128, description="Optional stream credentials")
    timeout_seconds: float = Field(5.0, ge=1.0, le=30.0, description="Network read/connect timeout")
    max_retries: int = Field(5, ge=0, le=50, description="Maximum reconnect attempts upon stream loss")
    target_fps: float = Field(25.0, ge=1.0, le=60.0, description="Target capture acquisition FPS")
    conf_threshold: float = Field(0.30, ge=0.05, le=1.0, description="Person detection threshold")
    inference_size: int = Field(640, ge=320, le=1280)
    perspective_weight: float = Field(1.0, ge=0.0, le=3.0)
    privacy_mode: str = Field("none", pattern="^(none|face_blur|full_anonymize)$")
    location: Optional[str] = Field(None, max_length=128, description="Physical camera location or zone")


class CameraSessionStatusResponse(BaseModel):
    state: str
    source_type: Optional[str] = None
    device_index: Optional[int] = None
    camera_name: Optional[str] = None
    sanitized_url: Optional[str] = None
    location: Optional[str] = None
    is_active: bool
    frames_captured: int
    frames_consumed: int
    frames_dropped: int
    latest_frame_id: int
    latest_frame_timestamp: float
    measured_fps: float
    processing_fps: float
    uptime_seconds: float
    error_message: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 0
    next_retry_delay_sec: float = 0.0


@router.post("/session/start", response_model=CameraSessionStatusResponse)
def start_camera_session(payload: CameraSessionStartRequest):
    """
    Starts local webcam ingestion and live incremental inference.
    Validates hardware device index and prevents arbitrary network URLs.
    Idempotent if already active on the same device.
    """
    try:
        # Start camera capture
        cam_status = camera_ingestion_service.start_webcam(
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


@router.post("/rtsp/validate", response_model=RtspValidateResponse)
def validate_rtsp_source(payload: RtspValidateRequest):
    """
    Validates an RTSP source URL and network destination against SSRF policies,
    disallowed service ports, and authorized camera subnet ranges without opening a persistent stream.
    Masks credentials in the response.
    """
    is_valid, err_msg, meta = validate_rtsp_url(payload.rtsp_url)
    sanitized = sanitize_rtsp_url(payload.rtsp_url)
    return {
        "is_valid": is_valid,
        "sanitized_url": sanitized,
        "host": meta.get("host") if meta else None,
        "port": meta.get("port") if meta else None,
        "error_message": err_msg
    }


@router.post("/rtsp/start", response_model=CameraSessionStatusResponse)
def start_rtsp_camera_session(payload: RtspCameraStartRequest):
    """
    Validates and connects to an authorized network RTSP CCTV feed.
    Enforces SSRF prevention, credentials isolation, and bounded reconnect policies.
    Starts live incremental CV and DIP inference.
    """
    # 1. Server-side URL & Destination Validation
    is_valid, err_msg, meta = validate_rtsp_url(payload.rtsp_url)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid or forbidden RTSP camera configuration: {err_msg}"
        )

    try:
        # 2. Build In-Memory Config (Secrets isolated server-side)
        rtsp_config = RtspCameraConfig(
            name=payload.name,
            rtsp_url=payload.rtsp_url,
            username=payload.username,
            password=payload.password,
            timeout_seconds=payload.timeout_seconds,
            max_retries=payload.max_retries,
            target_fps=payload.target_fps,
            location=payload.location,
        )

        # 3. Start RTSP Capture Worker
        cam_status = camera_ingestion_service.start_rtsp(rtsp_config)

        # 4. Start Live Pipeline Worker
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
    except Exception as e:
        logger.exception("Failed to initialize RTSP camera session")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start RTSP session: {str(e)}"
        )


@router.post("/rtsp/retry", response_model=CameraSessionStatusResponse)
def retry_rtsp_camera_session():
    """
    Manually interrupts backoff delay to trigger an immediate reconnect attempt for
    an interrupted or degraded RTSP camera session.
    """
    cam_status = camera_ingestion_service.trigger_immediate_retry()
    proc_stats = live_pipeline_processor.get_processing_stats()
    return {
        **cam_status,
        "processing_fps": proc_stats["processing_fps"],
    }


@router.get("/session/status", response_model=CameraSessionStatusResponse)
def get_camera_session_status():
    """
    Retrieves current camera lifecycle state, frame statistics, and drop accounting
    for the active camera session (webcam or RTSP).
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
    Gracefully stops the camera capture worker, releases camera/network resources, and stops live inference.
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


@router.get("/diagnostics")
def get_camera_diagnostics():
    """
    Development-only diagnostics endpoint returning:
    - Raw YOLO candidate detections, confidences, coordinates, and filter outcomes
    - Tracker internal tracks, states ('tentative' vs 'confirmed'), and hit counts
    - Frame dimensions and model input size
    """
    detection_diag = live_pipeline_processor.detection_service.get_latest_diagnostics()
    tracker_diag = live_pipeline_processor.tracker.get_diagnostic_tracks() if live_pipeline_processor.tracker else []
    return {
        "status": "operational",
        "detection_diagnostics": detection_diag,
        "tracker_diagnostics": tracker_diag
    }


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
        while camera_ingestion_service.state in (
            CameraState.CONNECTED,
            CameraState.CONNECTING,
            CameraState.DEGRADED,
            CameraState.RECONNECTING
        ):
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
    Streams live multipart MJPEG surveillance feed from active webcam or RTSP camera.
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
