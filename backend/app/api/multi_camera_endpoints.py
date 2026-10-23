import time
import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services.camera_registry import camera_registry_service
from app.services.camera_session import CameraState
from app.services.rtsp_security import validate_rtsp_url, sanitize_rtsp_url

logger = logging.getLogger("crowdguard.multi_camera_api")

router = APIRouter()


class CameraRegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=64, description="Display name for the camera")
    source_type: str = Field(..., pattern="^(webcam|rtsp)$", description="Camera source type ('webcam' or 'rtsp')")
    device_index: Optional[int] = Field(0, ge=0, description="Local webcam device index")
    rtsp_url: Optional[str] = Field(None, description="RTSP feed URL for network cameras")
    username: Optional[str] = Field(None, max_length=64)
    password: Optional[str] = Field(None, max_length=128)
    location: Optional[str] = Field(None, max_length=128, description="Physical zone or location")
    target_fps: float = Field(25.0, ge=1.0, le=60.0)
    conf_threshold: float = Field(0.30, ge=0.05, le=1.0)
    inference_size: int = Field(640, ge=320, le=1280)
    perspective_weight: float = Field(1.0, ge=0.0, le=3.0)
    privacy_mode: str = Field("none", pattern="^(none|face_blur|full_anonymize)$")
    timeout_seconds: float = Field(5.0, ge=1.0, le=30.0)
    max_retries: int = Field(5, ge=0, le=50)
    start_immediately: bool = Field(False, description="Automatically start ingestion upon registration")


class CameraValidateSourcePayload(BaseModel):
    rtsp_url: str = Field(..., description="RTSP URL to validate")
    username: Optional[str] = None
    password: Optional[str] = None


@router.get("", response_model=List[Dict[str, Any]])
def list_cameras():
    """Returns all registered cameras and their current statuses."""
    return camera_registry_service.list_cameras()


@router.post("", status_code=status.HTTP_201_CREATED)
def register_camera(payload: CameraRegisterRequest):
    """Registers a new camera (webcam or RTSP CCTV)."""
    try:
        session = camera_registry_service.register_camera(
            name=payload.name,
            source_type=payload.source_type,
            device_index=payload.device_index,
            rtsp_url=payload.rtsp_url,
            username=payload.username,
            password=payload.password,
            location=payload.location,
            target_fps=payload.target_fps,
            conf_threshold=payload.conf_threshold,
            inference_size=payload.inference_size,
            perspective_weight=payload.perspective_weight,
            privacy_mode=payload.privacy_mode,
            timeout_seconds=payload.timeout_seconds,
            max_retries=payload.max_retries,
            start_immediately=payload.start_immediately
        )
        return session.get_status()
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(ve))
    except Exception as e:
        logger.exception("Error registering camera")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Registration failed: {str(e)}")


@router.get("/health")
def get_aggregate_camera_health():
    """Returns system-wide multi-camera operational health and capacity summary."""
    return camera_registry_service.get_aggregate_health()


@router.post("/validate-source")
def validate_camera_source(payload: CameraValidateSourcePayload):
    """Validates an RTSP URL against SSRF and port security rules without registration."""
    is_valid, err_msg, meta = validate_rtsp_url(payload.rtsp_url)
    sanitized = sanitize_rtsp_url(payload.rtsp_url)
    return {
        "is_valid": is_valid,
        "sanitized_url": sanitized,
        "host": meta.get("host") if meta else None,
        "port": meta.get("port") if meta else None,
        "error_message": err_msg
    }


@router.get("/{camera_id}")
def get_camera_details(camera_id: str):
    """Retrieves metadata and status for a specific camera."""
    session = camera_registry_service.get_camera(camera_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Camera '{camera_id}' not found.")
    return session.get_status()


@router.delete("/{camera_id}")
def remove_camera(camera_id: str):
    """Removes an inactive camera from the registry."""
    try:
        camera_registry_service.remove_camera(camera_id)
        return {"status": "success", "message": f"Camera '{camera_id}' removed successfully."}
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Camera '{camera_id}' not found.")
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(ve))


@router.post("/{camera_id}/start")
def start_camera(camera_id: str):
    """Starts ingestion and inference for an individual camera."""
    try:
        return camera_registry_service.start_camera(camera_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Camera '{camera_id}' not found.")
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/{camera_id}/stop")
def stop_camera(camera_id: str):
    """Stops ingestion and releases resources for an individual camera."""
    try:
        return camera_registry_service.stop_camera(camera_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Camera '{camera_id}' not found.")


@router.post("/{camera_id}/retry")
def retry_camera(camera_id: str):
    """Triggers an immediate reconnect attempt on a camera."""
    try:
        return camera_registry_service.retry_camera(camera_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Camera '{camera_id}' not found.")


@router.get("/{camera_id}/status")
def get_camera_status(camera_id: str):
    """Retrieves connection health and frame drop accounting for a specific camera."""
    session = camera_registry_service.get_camera(camera_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Camera '{camera_id}' not found.")
    return session.get_status()


@router.get("/{camera_id}/telemetry")
def get_camera_telemetry(camera_id: str):
    """Retrieves latest frame telemetry (YOLO person counts, ByteTracks, DIP metrics, heuristic risk score)."""
    session = camera_registry_service.get_camera(camera_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Camera '{camera_id}' not found.")
    if not session.is_active:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Camera is currently inactive.")

    telemetry = session.get_telemetry()
    if telemetry is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="No processed frame telemetry available yet.")
    return telemetry


@router.get("/{camera_id}/snapshot")
def get_camera_snapshot(camera_id: str):
    """Returns latest JPEG snapshot with HUD overlays."""
    session = camera_registry_service.get_camera(camera_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Camera '{camera_id}' not found.")
    if not session.is_active:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Camera is inactive.")

    _, jpeg_bytes = session.get_latest_jpeg_with_sequence()
    if not jpeg_bytes:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="No snapshot available yet.")

    return Response(content=jpeg_bytes, media_type="image/jpeg", headers={"Cache-Control": "no-cache, no-store"})


def generate_mjpeg_stream_for_session(session):
    last_seq = -1
    try:
        while session.state in (
            CameraState.CONNECTED,
            CameraState.CONNECTING,
            CameraState.DEGRADED,
            CameraState.RECONNECTING
        ):
            seq, jpeg_bytes = session.get_latest_jpeg_with_sequence()
            if jpeg_bytes is not None and seq != last_seq:
                last_seq = seq
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + jpeg_bytes + b"\r\n"
                )
            time.sleep(0.02)
    except GeneratorExit:
        pass
    except Exception as e:
        logger.warning(f"MJPEG stream error on camera {session.camera_id}: {e}")


@router.get("/{camera_id}/stream")
def get_camera_stream(camera_id: str):
    """Streams live multipart MJPEG feed for a specific camera."""
    session = camera_registry_service.get_camera(camera_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Camera '{camera_id}' not found.")
    if not session.is_active:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Camera is inactive. Start it first.")

    return StreamingResponse(
        generate_mjpeg_stream_for_session(session),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )
