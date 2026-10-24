"""
CROWDGUARD v2.0 — Phase 5.2 Calibration API Endpoints
REST interface for managing planar homography ground-plane models.
"""

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query, Body, Response
from pydantic import BaseModel, Field

from app.services.calibration_service import calibration_service, CalibrationStatus

calibration_router = APIRouter(prefix="/api/calibration", tags=["calibration"])


class CalibrationPoint(BaseModel):
    x: float
    y: float


class SetCalibrationRequest(BaseModel):
    image_points: List[List[float]] = Field(..., description="List of [u, v] pixel coordinates (at least 4 points)")
    ground_points: List[List[float]] = Field(..., description="List of [X, Y] ground-plane coordinates in meters (at least 4 points)")
    image_width: int = Field(1280, description="Image frame width")
    image_height: int = Field(720, description="Image frame height")
    units: str = Field("meters", description="Ground plane measurement units")
    ground_roi_polygon: Optional[List[List[float]]] = Field(None, description="Optional ROI boundary polygon in ground coordinates")
    notes: Optional[str] = Field("", description="Operator or setup notes")


class ValidateCalibrationRequest(BaseModel):
    image_points: List[List[float]]
    ground_points: List[List[float]]
    image_width: int = 1280
    image_height: int = 720


@calibration_router.get("/{camera_id}")
def get_camera_calibration(camera_id: str):
    """Returns the current calibration model, matrix, and status for the camera."""
    calib = calibration_service.get_calibration(camera_id)
    return calib.to_dict()


@calibration_router.post("/{camera_id}")
def set_camera_calibration(camera_id: str, payload: SetCalibrationRequest):
    """
    Computes, validates, and stores a new planar homography calibration for the camera.
    Returns 400 if points are degenerate, collinear, or insufficient.
    """
    success, calib, message = calibration_service.set_calibration(
        camera_id=camera_id,
        image_points=payload.image_points,
        ground_points=payload.ground_points,
        image_width=payload.image_width,
        image_height=payload.image_height,
        units=payload.units,
        ground_roi_polygon=payload.ground_roi_polygon,
        notes=payload.notes or ""
    )
    if not success:
        raise HTTPException(status_code=400, detail={"error": message, "calibration": calib.to_dict()})
    return {"success": True, "message": message, "calibration": calib.to_dict()}


@calibration_router.post("/{camera_id}/validate")
def validate_points(camera_id: str, payload: ValidateCalibrationRequest):
    """
    Validates point pairs without saving to disk.
    Computes reprojection errors and returns validation residuals.
    """
    from app.services.calibration_service import CameraCalibration
    test_calib = CameraCalibration(
        camera_id=camera_id,
        image_width=payload.image_width,
        image_height=payload.image_height,
        image_points=payload.image_points,
        ground_points=payload.ground_points
    )
    valid, message = test_calib.compute_homography()
    return {
        "valid": valid,
        "status": test_calib.status,
        "message": message,
        "reprojection_error_px": test_calib.reprojection_error_px,
        "reprojection_error_m": test_calib.reprojection_error_m,
        "ground_roi_area_m2": test_calib.ground_roi_area_m2
    }


@calibration_router.delete("/{camera_id}")
def reset_camera_calibration(camera_id: str):
    """Resets the camera calibration back to uncalibrated."""
    calibration_service.delete_calibration(camera_id)
    return {"success": True, "message": f"Calibration for {camera_id} cleared."}


@calibration_router.get("/{camera_id}/reference-frame")
def get_reference_frame(camera_id: str):
    """
    Fetches the latest JPEG snapshot for the camera to allow operator point selection in the UI.
    """
    from app.services.camera_registry import camera_registry
    session = camera_registry.get_session(camera_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Camera {camera_id} session not found.")
    
    jpeg_bytes = session.get_latest_jpeg()
    if not jpeg_bytes:
        raise HTTPException(status_code=503, detail="No frame available from camera yet.")

    return Response(content=jpeg_bytes, media_type="image/jpeg")
