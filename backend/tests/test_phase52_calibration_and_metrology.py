"""
CROWDGUARD v2.0 — Phase 5.2 Track B Automated Tests
Planar Homography Calibration, Physical Crowd Density, and Pedestrian Speed Metrology
"""

import pytest
import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.services.calibration_service import (
    calibration_service,
    CameraCalibration,
    CalibrationStatus
)


@pytest.fixture
def test_client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def clean_test_calibrations():
    """Clears test calibrations before and after each test."""
    yield
    calibration_service.delete_calibration("cam_test_valid")
    calibration_service.delete_calibration("cam_test_camA")
    calibration_service.delete_calibration("cam_test_camB")
    calibration_service.delete_calibration("cam_test_collinear")


def test_valid_synthetic_homography_and_reprojection():
    """
    Verifies that a mathematically sound 4-point planar quadrilateral produces
    a valid, invertible homography with low reprojection error (<0.05m).
    """
    img_pts = [[200.0, 600.0], [1080.0, 600.0], [800.0, 200.0], [480.0, 200.0]]
    gnd_pts = [[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0]]  # 10m x 10m = 100 m^2

    calib = CameraCalibration(
        camera_id="cam_test_valid",
        image_points=img_pts,
        ground_points=gnd_pts
    )
    success, msg = calib.compute_homography()

    assert success is True
    assert calib.status == CalibrationStatus.VALID
    assert calib.homography_matrix is not None
    assert calib.reprojection_error_m < 0.05
    assert calib.ground_roi_area_m2 == 100.0


def test_known_physical_distance_and_coordinate_mapping():
    """
    Verifies that projected physical coordinates match known ground-truth distances (10.0m side, 14.142m diagonal).
    """
    img_pts = [[200.0, 600.0], [1080.0, 600.0], [800.0, 200.0], [480.0, 200.0]]
    gnd_pts = [[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0]]

    calib = CameraCalibration("cam_test_valid", image_points=img_pts, ground_points=gnd_pts)
    calib.compute_homography()

    # Test projection of bottom corners
    p_bl = calib.project_image_to_ground(200.0, 600.0)
    p_br = calib.project_image_to_ground(1080.0, 600.0)
    p_tr = calib.project_image_to_ground(800.0, 200.0)

    assert p_bl is not None
    assert p_br is not None
    assert p_tr is not None

    # Side length (bottom edge): (10, 0) - (0, 0) = 10.0m
    dist_bottom = np.sqrt((p_br[0] - p_bl[0])**2 + (p_br[1] - p_bl[1])**2)
    assert abs(dist_bottom - 10.0) < 0.05

    # Diagonal length: (10, 10) - (0, 0) = sqrt(200) = 14.142m
    dist_diag = np.sqrt((p_tr[0] - p_bl[0])**2 + (p_tr[1] - p_bl[1])**2)
    assert abs(dist_diag - 14.142) < 0.05


def test_degenerate_and_collinear_point_rejection():
    """
    Verifies that degenerate point sets (collinear image or ground points) are rejected
    with explicit DEGENERATE status instead of computing invalid physical measurements.
    """
    # 3 collinear points on x = y line
    collinear_img = [[100.0, 100.0], [200.0, 200.0], [300.0, 300.0], [500.0, 100.0]]
    collinear_gnd = [[0.0, 0.0], [2.0, 2.0], [4.0, 4.0], [6.0, 0.0]]

    calib = CameraCalibration("cam_test_collinear", image_points=collinear_img, ground_points=collinear_gnd)
    success, msg = calib.compute_homography()

    assert success is False
    assert calib.status == CalibrationStatus.DEGENERATE
    assert "collinear" in msg.lower()
    assert calib.homography_matrix is None


def test_insufficient_points_rejection():
    """Verifies that fewer than 4 points are rejected immediately."""
    calib = CameraCalibration("cam_test_3pts", image_points=[[10.0, 10.0], [20.0, 20.0], [30.0, 30.0]], ground_points=[[0.0, 0.0], [1.0, 1.0], [2.0, 2.0]])
    success, msg = calib.compute_homography()
    assert success is False
    assert calib.status == CalibrationStatus.INSUFFICIENT_POINTS


def test_per_camera_calibration_isolation():
    """
    Verifies that calibrations are strictly isolated: calibrating Camera A
    does not affect Camera B, which remains uncalibrated.
    """
    img_pts = [[200.0, 600.0], [1080.0, 600.0], [800.0, 200.0], [480.0, 200.0]]
    gnd_pts = [[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0]]

    calibration_service.set_calibration("cam_test_camA", image_points=img_pts, ground_points=gnd_pts)
    
    calib_a = calibration_service.get_calibration("cam_test_camA")
    calib_b = calibration_service.get_calibration("cam_test_camB")

    assert calib_a.status == CalibrationStatus.VALID
    assert calib_b.status == CalibrationStatus.UNCALIBRATED
    assert calib_b.homography_matrix is None


def test_points_behind_camera_or_outside_bounds_rejected():
    """
    Verifies that points projecting behind the horizon or outside plausible spatial bounds are rejected.
    """
    img_pts = [[200.0, 600.0], [1080.0, 600.0], [800.0, 200.0], [480.0, 200.0]]
    gnd_pts = [[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0]]
    calib = CameraCalibration("cam_test_valid", image_points=img_pts, ground_points=gnd_pts)
    calib.compute_homography()

    # Point high up in the sky / vanishing horizon
    p_sky = calib.project_image_to_ground(640.0, 10.0)
    # Either None or outside plausible boundary
    assert (p_sky is None) or (abs(p_sky[0]) > 50.0 or abs(p_sky[1]) > 50.0)


def test_physical_crowd_density_over_known_roi_area():
    """
    Verifies that 10 detections inside a 100 m^2 ROI yield exactly 0.10 persons/m^2.
    """
    img_pts = [[200.0, 600.0], [1080.0, 600.0], [800.0, 200.0], [480.0, 200.0]]
    gnd_pts = [[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0]]  # 100 m^2
    calibration_service.set_calibration("cam_test_valid", image_points=img_pts, ground_points=gnd_pts)

    # 10 bounding boxes with contact points (x + w/2, y + h) inside the quad
    boxes = []
    for i in range(10):
        # x between 300 and 900, y between 300 and 450
        bx = 350.0 + i * 50.0
        by = 350.0
        bw = 40.0
        bh = 100.0  # contact point y = 450
        boxes.append([bx, by, bw, bh])

    res = calibration_service.calculate_physical_density("cam_test_valid", boxes)
    assert res["status"] == CalibrationStatus.VALID
    assert res["is_calibrated"] is True
    assert res["ground_occupants"] == 10
    assert res["roi_area_m2"] == 100.0
    assert abs(res["density_persons_per_m2"] - 0.10) < 0.01


def test_uncalibrated_camera_returns_unavailable_status():
    """
    CRITICAL SAFETY REQUIREMENT:
    An uncalibrated camera MUST return status='unavailable' with density_persons_per_m2=None.
    It MUST NEVER return a fabricated 0.0!
    """
    boxes = [[100.0, 100.0, 50.0, 100.0], [200.0, 200.0, 50.0, 100.0]]
    res = calibration_service.calculate_physical_density("cam_never_calibrated_xyz", boxes)
    
    assert res["status"] == CalibrationStatus.UNAVAILABLE
    assert res["is_calibrated"] is False
    assert res["density_persons_per_m2"] is None
    assert res["ground_occupants"] is None


def test_pedestrian_speed_requires_minimum_tracks():
    """
    Verifies that track duration < 3 frames suppresses speed reporting
    to prevent noisy 1-frame spikes.
    """
    img_pts = [[200.0, 600.0], [1080.0, 600.0], [800.0, 200.0], [480.0, 200.0]]
    gnd_pts = [[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0]]
    calibration_service.set_calibration("cam_test_valid", image_points=img_pts, ground_points=gnd_pts)

    # Frame 1
    t0 = 1000.0
    trk1 = [{"track_id": 99, "bbox": [500.0, 400.0, 40.0, 100.0]}]
    res1 = calibration_service.update_and_calculate_speeds("cam_test_valid", trk1, current_mono_time=t0)
    assert res1["mean_speed_m_per_s"] is None  # Frame 1: suppressed

    # Frame 2
    t1 = 1000.1
    trk2 = [{"track_id": 99, "bbox": [502.0, 400.0, 40.0, 100.0]}]
    res2 = calibration_service.update_and_calculate_speeds("cam_test_valid", trk2, current_mono_time=t1)
    assert res2["mean_speed_m_per_s"] is None  # Frame 2: suppressed (< 3 frames)

    # Frame 3
    t2 = 1000.2
    trk3 = [{"track_id": 99, "bbox": [504.0, 400.0, 40.0, 100.0]}]
    res3 = calibration_service.update_and_calculate_speeds("cam_test_valid", trk3, current_mono_time=t2)
    assert res3["mean_speed_m_per_s"] is not None  # Frame 3: valid speed computed


def test_implausible_speed_jump_rejected():
    """
    Verifies that unrealistic jumps (> 8.0 m/s = 28.8 km/h) are rejected as tracking jitter.
    """
    img_pts = [[200.0, 600.0], [1080.0, 600.0], [800.0, 200.0], [480.0, 200.0]]
    gnd_pts = [[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0]]
    calibration_service.set_calibration("cam_test_valid", image_points=img_pts, ground_points=gnd_pts)

    # 3 normal steps
    for step in range(3):
        t = 1000.0 + step * 0.1
        trk = [{"track_id": 7, "bbox": [500.0 + step * 2, 400.0, 40.0, 100.0]}]
        res = calibration_service.update_and_calculate_speeds("cam_test_valid", trk, current_mono_time=t)

    # Sudden teleportation jump to the other side of screen
    t_jump = 1000.3
    trk_jump = [{"track_id": 7, "bbox": [950.0, 400.0, 40.0, 100.0]}]
    res_jump = calibration_service.update_and_calculate_speeds("cam_test_valid", trk_jump, current_mono_time=t_jump)
    
    # Speed must be bounded, not spiking to 40 m/s
    assert res_jump["mean_speed_m_per_s"] <= 8.0


def test_calibration_api_endpoints(test_client):
    """
    Verifies REST API endpoints:
    - GET /api/calibration/{cam_id}
    - POST /api/calibration/{cam_id}
    - POST /api/calibration/{cam_id}/validate
    - DELETE /api/calibration/{cam_id}
    """
    cam_id = "cam_api_test_01"
    
    # 1. Initially uncalibrated
    r_get = test_client.get(f"/api/calibration/{cam_id}")
    assert r_get.status_code == 200
    assert r_get.json()["calibration_status"] == CalibrationStatus.UNCALIBRATED

    # 2. Validate endpoint
    valid_payload = {
        "image_points": [[200.0, 600.0], [1080.0, 600.0], [800.0, 200.0], [480.0, 200.0]],
        "ground_points": [[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0]]
    }
    r_val = test_client.post(f"/api/calibration/{cam_id}/validate", json=valid_payload)
    assert r_val.status_code == 200
    assert r_val.json()["valid"] is True
    assert r_val.json()["reprojection_error_px"] < 1.0

    # 3. Save calibration
    r_save = test_client.post(f"/api/calibration/{cam_id}", json=valid_payload)
    assert r_save.status_code == 200
    assert r_save.json()["success"] is True
    assert r_save.json()["calibration"]["is_calibrated"] is True

    # 4. Check saved state
    r_get_saved = test_client.get(f"/api/calibration/{cam_id}")
    assert r_get_saved.status_code == 200
    assert r_get_saved.json()["calibration_status"] == CalibrationStatus.VALID

    # 5. Delete calibration
    r_del = test_client.delete(f"/api/calibration/{cam_id}")
    assert r_del.status_code == 200
    assert r_del.json()["success"] is True

    # Verify cleared
    r_get_cleared = test_client.get(f"/api/calibration/{cam_id}")
    assert r_get_cleared.json()["calibration_status"] == CalibrationStatus.UNCALIBRATED
