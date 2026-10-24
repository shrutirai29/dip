"""
CROWDGUARD v2.0 — Phase 5.2 Calibration & Physical Metrology Service
Planar Homography Ground-Plane Mapping, Physical Density & Pedestrian Speed
"""

import os
import json
import time
import logging
import threading
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import cv2

logger = logging.getLogger("crowdguard.calibration")


class CalibrationStatus:
    UNAVAILABLE = "unavailable"
    UNCALIBRATED = "uncalibrated"
    VALID = "valid"
    DEGENERATE = "degenerate"
    INSUFFICIENT_POINTS = "insufficient_points"
    ERROR = "error"


class CameraCalibration:
    """
    Planar homography calibration model for a specific camera.
    Maps 2D image coordinates (u, v) to physical ground-plane coordinates (X, Y) in meters.
    
    Assumptions & Limitations:
    1. Planar Homography: Assumes all mapped points lie strictly on the defined ground plane.
       Elevated points (e.g. human heads, shoulders, raised arms) do NOT map directly to their
       true ground coordinates and will suffer perspective parallax displacement.
    2. Ground-Contact Approximation: Uses the bottom-center of pedestrian bounding boxes
       ((x + w/2), (y + h)) as the contact proxy on the ground plane.
    3. Metrology Accuracy: Real-world physical speeds and densities require surveyor tape
       or ground-truth measured landmarks for metric validation.
    """

    def __init__(
        self,
        camera_id: str,
        image_width: int = 1280,
        image_height: int = 720,
        image_points: Optional[List[List[float]]] = None,
        ground_points: Optional[List[List[float]]] = None,
        units: str = "meters",
        ground_roi_polygon: Optional[List[List[float]]] = None,
        version: str = "1.0.0",
        notes: str = ""
    ):
        self.camera_id = camera_id
        self.image_width = image_width
        self.image_height = image_height
        self.image_points = image_points or []
        self.ground_points = ground_points or []
        self.units = units
        self.ground_roi_polygon = ground_roi_polygon or []
        self.version = version
        self.notes = notes
        
        self.status: str = CalibrationStatus.UNCALIBRATED
        self.status_message: str = "Camera has not been calibrated."
        self.homography_matrix: Optional[np.ndarray] = None
        self.inv_homography_matrix: Optional[np.ndarray] = None
        self.reprojection_error_px: Optional[float] = None
        self.reprojection_error_m: Optional[float] = None
        self.ground_roi_area_m2: Optional[float] = None
        self.updated_at: str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        # If points provided, attempt automatic computation
        if len(self.image_points) >= 4 and len(self.ground_points) >= 4:
            self.compute_homography()

    def compute_homography(self) -> Tuple[bool, str]:
        """
        Computes 3x3 planar homography matrix from image and ground reference points.
        Validates non-collinearity, numerical conditioning, and reprojection error.
        """
        if len(self.image_points) < 4 or len(self.ground_points) < 4:
            self.status = CalibrationStatus.INSUFFICIENT_POINTS
            self.status_message = f"Requires at least 4 point pairs (got img={len(self.image_points)}, gnd={len(self.ground_points)})."
            self.homography_matrix = None
            return False, self.status_message

        if len(self.image_points) != len(self.ground_points):
            self.status = CalibrationStatus.DEGENERATE
            self.status_message = "Point count mismatch between image and ground points."
            self.homography_matrix = None
            return False, self.status_message

        pts_src = np.array(self.image_points, dtype=np.float32)
        pts_dst = np.array(self.ground_points, dtype=np.float32)

        # 1. Non-collinearity check: No 3 points can be collinear
        for pts, label in [(pts_src, "image"), (pts_dst, "ground")]:
            n = len(pts)
            for i in range(n):
                for j in range(i + 1, n):
                    for k in range(j + 1, n):
                        # Cross product magnitude of (p2-p1) and (p3-p1)
                        v1 = pts[j] - pts[i]
                        v2 = pts[k] - pts[i]
                        area = abs(float(v1[0] * v2[1] - v1[1] * v2[0]))
                        if area < 1e-4:
                            self.status = CalibrationStatus.DEGENERATE
                            self.status_message = f"Degenerate calibration: 3 {label} points are collinear."
                            self.homography_matrix = None
                            return False, self.status_message

        # 2. Compute Homography Matrix H mapping (u, v, 1) -> (X', Y', W')
        H, mask = cv2.findHomography(pts_src, pts_dst, cv2.RANSAC if len(pts_src) > 4 else 0)
        if H is None:
            self.status = CalibrationStatus.DEGENERATE
            self.status_message = "OpenCV failed to solve homography matrix (singular or degenerate points)."
            self.homography_matrix = None
            return False, self.status_message

        # 3. Check condition number and determinant
        det = float(np.linalg.det(H))
        if abs(det) < 1e-9:
            self.status = CalibrationStatus.DEGENERATE
            self.status_message = f"Homography matrix is non-invertible (det={det:.2e})."
            self.homography_matrix = None
            return False, self.status_message

        cond = float(np.linalg.cond(H))
        if cond > 1e8:
            self.status = CalibrationStatus.DEGENERATE
            self.status_message = f"Homography matrix is numerically ill-conditioned (cond={cond:.2e})."
            self.homography_matrix = None
            return False, self.status_message

        # Normalize so H[2, 2] == 1.0 if possible
        if abs(H[2, 2]) > 1e-7:
            H = H / H[2, 2]

        try:
            H_inv = np.linalg.inv(H)
            if abs(H_inv[2, 2]) > 1e-7:
                H_inv = H_inv / H_inv[2, 2]
        except Exception:
            self.status = CalibrationStatus.DEGENERATE
            self.status_message = "Failed to invert homography matrix."
            return False, self.status_message

        # 4. Compute Reprojection Error
        # Forward error (image -> ground)
        src_homo = np.hstack([pts_src, np.ones((len(pts_src), 1), dtype=np.float32)])
        proj_gnd_homo = (H @ src_homo.T).T
        proj_w = proj_gnd_homo[:, 2:3]
        if np.any(np.abs(proj_w) < 1e-7):
            self.status = CalibrationStatus.DEGENERATE
            self.status_message = "Homography projects reference points through horizon/infinity."
            return False, self.status_message

        proj_gnd = proj_gnd_homo[:, :2] / proj_w
        error_gnd_m = float(np.sqrt(np.mean(np.sum((proj_gnd - pts_dst) ** 2, axis=1))))

        # Inverse error (ground -> image)
        dst_homo = np.hstack([pts_dst, np.ones((len(pts_dst), 1), dtype=np.float32)])
        proj_img_homo = (H_inv @ dst_homo.T).T
        proj_img_w = proj_img_homo[:, 2:3]
        if np.any(np.abs(proj_img_w) < 1e-7):
            self.status = CalibrationStatus.DEGENERATE
            self.status_message = "Inverse homography projection degenerate."
            return False, self.status_message

        proj_img = proj_img_homo[:, :2] / proj_img_w
        error_img_px = float(np.sqrt(np.mean(np.sum((proj_img - pts_src) ** 2, axis=1))))

        # Threshold check: reprojection error should be reasonable
        if error_img_px > 30.0:
            self.status = CalibrationStatus.DEGENERATE
            self.status_message = f"High reprojection error ({error_img_px:.2f} px > 30.0 px threshold)."
            return False, self.status_message

        self.homography_matrix = H
        self.inv_homography_matrix = H_inv
        self.reprojection_error_px = round(error_img_px, 3)
        self.reprojection_error_m = round(error_gnd_m, 4)
        self.status = CalibrationStatus.VALID
        self.status_message = f"Calibration valid. Reprojection error: {self.reprojection_error_px} px ({self.reprojection_error_m} m)."
        self.updated_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        # 5. Compute Ground ROI Area if polygon provided
        if self.ground_roi_polygon and len(self.ground_roi_polygon) >= 3:
            self.ground_roi_area_m2 = round(self._calculate_polygon_area(self.ground_roi_polygon), 2)
        elif len(self.ground_points) >= 4:
            # Default ROI from convex hull of ground reference points
            self.ground_roi_area_m2 = round(self._calculate_polygon_area(self.ground_points), 2)

        return True, self.status_message

    @staticmethod
    def _calculate_polygon_area(points: List[List[float]]) -> float:
        """Calculates area of 2D polygon using Shoelace formula."""
        n = len(points)
        if n < 3:
            return 0.0
        area = 0.0
        for i in range(n):
            j = (i + 1) % n
            area += points[i][0] * points[j][1]
            area -= points[j][0] * points[i][1]
        return abs(area) / 2.0

    def project_image_to_ground(self, u: float, v: float) -> Optional[Tuple[float, float]]:
        """
        Projects image pixel (u, v) onto ground-plane (X, Y) in meters.
        Returns None if uncalibrated, behind camera (W <= 0), or outside plausible ground limits.
        """
        if self.status != CalibrationStatus.VALID or self.homography_matrix is None:
            return None

        vec = np.array([u, v, 1.0], dtype=np.float32)
        proj = self.homography_matrix @ vec
        w = float(proj[2])
        if w <= 1e-6:
            # Point is on or behind camera horizon plane
            return None

        x = float(proj[0] / w)
        y = float(proj[1] / w)

        # Plausible ground-plane boundary filter (-200m to +200m)
        if abs(x) > 200.0 or abs(y) > 200.0:
            return None

        return round(x, 3), round(y, 3)

    def project_ground_to_image(self, x: float, y: float) -> Optional[Tuple[float, float]]:
        """Projects ground coordinates (X, Y) back into image pixels (u, v)."""
        if self.status != CalibrationStatus.VALID or self.inv_homography_matrix is None:
            return None

        vec = np.array([x, y, 1.0], dtype=np.float32)
        proj = self.inv_homography_matrix @ vec
        w = float(proj[2])
        if abs(w) <= 1e-6:
            return None

        u = float(proj[0] / w)
        v = float(proj[1] / w)
        return round(u, 2), round(v, 2)

    def to_dict(self) -> Dict[str, Any]:
        """Serializes calibration model to JSON-compatible dictionary."""
        return {
            "camera_id": self.camera_id,
            "calibration_status": self.status,
            "status_message": self.status_message,
            "is_calibrated": self.status == CalibrationStatus.VALID,
            "image_width": self.image_width,
            "image_height": self.image_height,
            "units": self.units,
            "image_points": self.image_points,
            "ground_points": self.ground_points,
            "homography_matrix": self.homography_matrix.tolist() if self.homography_matrix is not None else None,
            "reprojection_error_px": self.reprojection_error_px,
            "reprojection_error_m": self.reprojection_error_m,
            "ground_roi_polygon": self.ground_roi_polygon,
            "ground_roi_area_m2": self.ground_roi_area_m2,
            "version": self.version,
            "updated_at": self.updated_at,
            "notes": self.notes
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "CameraCalibration":
        """Instantiates CameraCalibration from dictionary."""
        calib = cls(
            camera_id=data.get("camera_id", "cam_default"),
            image_width=data.get("image_width", 1280),
            image_height=data.get("image_height", 720),
            image_points=data.get("image_points"),
            ground_points=data.get("ground_points"),
            units=data.get("units", "meters"),
            ground_roi_polygon=data.get("ground_roi_polygon"),
            version=data.get("version", "1.0.0"),
            notes=data.get("notes", "")
        )
        return calib


class CalibrationService:
    """
    Central thread-safe service managing camera calibrations, physical density calculation,
    and ground-plane pedestrian velocity tracking.
    """

    def __init__(self, storage_dir: str = "data/calibration"):
        self.storage_dir = storage_dir
        self._lock = threading.Lock()
        self._calibrations: Dict[str, CameraCalibration] = {}
        
        # Per-camera, per-track speed history: camera_id -> track_id -> deque of (t_mono, x, y)
        self._track_histories: Dict[str, Dict[int, List[Tuple[float, float, float]]]] = {}
        self._smoothed_speeds: Dict[str, Dict[int, float]] = {}

        os.makedirs(self.storage_dir, exist_ok=True)
        self._load_all_calibrations()

    def _get_file_path(self, camera_id: str) -> str:
        safe_id = "".join([c if c.isalnum() or c in ("-", "_") else "_" for c in camera_id])
        return os.path.join(self.storage_dir, f"{safe_id}_calibration.json")

    def _load_all_calibrations(self):
        with self._lock:
            if not os.path.exists(self.storage_dir):
                return
            for fname in os.listdir(self.storage_dir):
                if fname.endswith("_calibration.json"):
                    fpath = os.path.join(self.storage_dir, fname)
                    try:
                        with open(fpath, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            calib = CameraCalibration.from_dict(data)
                            self._calibrations[calib.camera_id] = calib
                    except Exception as e:
                        logger.warning(f"Failed to load calibration {fname}: {e}")

    def get_calibration(self, camera_id: str) -> CameraCalibration:
        """Returns the calibration for a camera. If none exists, returns an UNCALIBRATED model."""
        with self._lock:
            if camera_id in self._calibrations:
                return self._calibrations[camera_id]
            # Return new uncalibrated instance
            uncal = CameraCalibration(camera_id=camera_id)
            self._calibrations[camera_id] = uncal
            return uncal

    def set_calibration(
        self,
        camera_id: str,
        image_points: List[List[float]],
        ground_points: List[List[float]],
        image_width: int = 1280,
        image_height: int = 720,
        units: str = "meters",
        ground_roi_polygon: Optional[List[List[float]]] = None,
        notes: str = ""
    ) -> Tuple[bool, CameraCalibration, str]:
        """
        Creates, validates, and persists a camera planar homography calibration.
        """
        calib = CameraCalibration(
            camera_id=camera_id,
            image_width=image_width,
            image_height=image_height,
            image_points=image_points,
            ground_points=ground_points,
            units=units,
            ground_roi_polygon=ground_roi_polygon,
            notes=notes
        )

        success, msg = calib.compute_homography()
        
        with self._lock:
            self._calibrations[camera_id] = calib
            # Reset speed history on calibration change
            if camera_id in self._track_histories:
                self._track_histories[camera_id].clear()
            if camera_id in self._smoothed_speeds:
                self._smoothed_speeds[camera_id].clear()

            # Save to disk
            fpath = self._get_file_path(camera_id)
            try:
                with open(fpath, "w", encoding="utf-8") as f:
                    json.dump(calib.to_dict(), f, indent=2)
            except Exception as e:
                logger.error(f"Failed to save calibration file {fpath}: {e}")

        return success, calib, msg

    def delete_calibration(self, camera_id: str) -> bool:
        """Resets camera to uncalibrated state and deletes saved file."""
        with self._lock:
            uncal = CameraCalibration(camera_id=camera_id)
            self._calibrations[camera_id] = uncal
            if camera_id in self._track_histories:
                self._track_histories[camera_id].clear()
            if camera_id in self._smoothed_speeds:
                self._smoothed_speeds[camera_id].clear()

            fpath = self._get_file_path(camera_id)
            if os.path.exists(fpath):
                try:
                    os.remove(fpath)
                except Exception as e:
                    logger.warning(f"Failed to delete {fpath}: {e}")
        return True

    def calculate_physical_density(
        self,
        camera_id: str,
        detected_boxes: List[List[float]]
    ) -> Dict[str, Any]:
        """
        Calculates physical crowd density (persons / m^2) inside calibrated ground ROI.
        
        Guarantees:
        - If camera is uncalibrated or calibration is invalid, returns explicit 'unavailable' status
          with density_persons_per_m2=None. Never invents 0.0!
        - Distinguishes raw image count from ground-mapped ROI count.
        """
        calib = self.get_calibration(camera_id)
        if calib.status != CalibrationStatus.VALID:
            return {
                "status": CalibrationStatus.UNAVAILABLE,
                "is_calibrated": False,
                "reason": f"Camera is {calib.status}: {calib.status_message}",
                "image_detection_count": len(detected_boxes),
                "ground_occupants": None,
                "roi_area_m2": None,
                "density_persons_per_m2": None,
                "units": "persons/m2"
            }

        roi_area = calib.ground_roi_area_m2 or 0.0
        if roi_area <= 0.0:
            return {
                "status": CalibrationStatus.UNAVAILABLE,
                "is_calibrated": True,
                "reason": "Calibrated ground-plane ROI area is zero or undefined.",
                "image_detection_count": len(detected_boxes),
                "ground_occupants": None,
                "roi_area_m2": None,
                "density_persons_per_m2": None,
                "units": "persons/m2"
            }

        # Project ground-contact point (bottom-center) for each bounding box [x, y, w, h]
        ground_points = []
        for box in detected_boxes:
            if len(box) >= 4:
                bx, by, bw, bh = box[0], box[1], box[2], box[3]
                u_contact = bx + (bw / 2.0)
                v_contact = by + bh
                g_pt = calib.project_image_to_ground(u_contact, v_contact)
                if g_pt is not None:
                    ground_points.append(g_pt)

        # Check occupancy inside ground ROI polygon
        roi_pts = calib.ground_roi_polygon or calib.ground_points
        if roi_pts and len(roi_pts) >= 3:
            poly_np = np.array(roi_pts, dtype=np.float32)
            occupants = 0
            for pt in ground_points:
                # cv2.pointPolygonTest returns positive if inside, 0 on edge, negative if outside
                dist = cv2.pointPolygonTest(poly_np, (pt[0], pt[1]), False)
                if dist >= 0:
                    occupants += 1
        else:
            occupants = len(ground_points)

        density = occupants / roi_area
        return {
            "status": CalibrationStatus.VALID,
            "is_calibrated": True,
            "reason": "Physical density successfully estimated via validated planar homography.",
            "image_detection_count": len(detected_boxes),
            "ground_occupants": occupants,
            "roi_area_m2": round(roi_area, 2),
            "density_persons_per_m2": round(density, 3),
            "units": "persons/m2"
        }

    def update_and_calculate_speeds(
        self,
        camera_id: str,
        tracks: List[Dict[str, Any]],
        current_mono_time: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Calculates physical pedestrian ground speed (m/s) per active track.
        
        Guarantees:
        - Rejects tracks with < 3 history frames.
        - Rejects implausible jumps (> 8.0 m/s for walking/running crowd).
        - Applies conservative exponential smoothing (alpha=0.35).
        - If uncalibrated, returns explicit 'unavailable' status with mean_speed_m_per_s=None.
        """
        now_mono = current_mono_time if current_mono_time is not None else time.perf_counter()
        calib = self.get_calibration(camera_id)
        
        if calib.status != CalibrationStatus.VALID:
            return {
                "status": CalibrationStatus.UNAVAILABLE,
                "is_calibrated": False,
                "reason": f"Camera is {calib.status}: {calib.status_message}",
                "mean_speed_m_per_s": None,
                "p95_speed_m_per_s": None,
                "max_speed_m_per_s": None,
                "active_speed_tracks": 0,
                "speeds_by_track": {}
            }

        with self._lock:
            if camera_id not in self._track_histories:
                self._track_histories[camera_id] = {}
            if camera_id not in self._smoothed_speeds:
                self._smoothed_speeds[camera_id] = {}

            cam_hist = self._track_histories[camera_id]
            cam_speeds = self._smoothed_speeds[camera_id]
            active_track_ids = set()

            valid_speeds: List[float] = []
            track_speed_map: Dict[int, float] = {}

            for trk in tracks:
                tid = trk.get("track_id")
                box = trk.get("bbox")
                if tid is None or not box or len(box) < 4:
                    continue

                active_track_ids.add(tid)
                bx, by, bw, bh = box[0], box[1], box[2], box[3]
                u_contact = bx + (bw / 2.0)
                v_contact = by + bh
                g_pt = calib.project_image_to_ground(u_contact, v_contact)

                if g_pt is None:
                    continue

                gx, gy = g_pt
                if tid not in cam_hist:
                    cam_hist[tid] = []

                history = cam_hist[tid]
                history.append((now_mono, gx, gy))

                # Keep history bounded to last 10 observations
                if len(history) > 10:
                    history.pop(0)

                # Need at least 3 points for reliable speed calculation
                if len(history) >= 3:
                    # Calculate velocity between oldest and newest in small window
                    t_prev, x_prev, y_prev = history[0]
                    dt = now_mono - t_prev
                    if 0.05 <= dt <= 2.0:
                        dist = float(np.sqrt((gx - x_prev) ** 2 + (gy - y_prev) ** 2))
                        raw_speed = dist / dt

                        # Filter implausible speed jumps (> 8.0 m/s = 28.8 km/h)
                        if raw_speed <= 8.0:
                            # Conservative exponential moving average
                            prev_smooth = cam_speeds.get(tid, raw_speed)
                            smooth_speed = 0.35 * raw_speed + 0.65 * prev_smooth
                            cam_speeds[tid] = smooth_speed
                            valid_speeds.append(smooth_speed)
                            track_speed_map[tid] = round(smooth_speed, 2)
                        else:
                            # Outlier jump: do not update smooth speed
                            if tid in cam_speeds:
                                valid_speeds.append(cam_speeds[tid])
                                track_speed_map[tid] = round(cam_speeds[tid], 2)

            # Purge stale tracks that disappeared
            stale_ids = [tid for tid in cam_hist if tid not in active_track_ids]
            for tid in stale_ids:
                del cam_hist[tid]
                if tid in cam_speeds:
                    del cam_speeds[tid]

        if not valid_speeds:
            return {
                "status": CalibrationStatus.VALID,
                "is_calibrated": True,
                "reason": "Calibration valid, but insufficient track duration (<3 frames) to compute speeds.",
                "mean_speed_m_per_s": None,
                "p95_speed_m_per_s": None,
                "max_speed_m_per_s": None,
                "active_speed_tracks": 0,
                "speeds_by_track": {}
            }

        valid_speeds.sort()
        mean_v = float(np.mean(valid_speeds))
        p95_idx = int(len(valid_speeds) * 0.95)
        p95_v = float(valid_speeds[min(p95_idx, len(valid_speeds) - 1)])
        max_v = float(valid_speeds[-1])

        return {
            "status": CalibrationStatus.VALID,
            "is_calibrated": True,
            "reason": "Pedestrian speeds estimated using planar ground-plane tracking.",
            "mean_speed_m_per_s": round(mean_v, 2),
            "p95_speed_m_per_s": round(p95_v, 2),
            "max_speed_m_per_s": round(max_v, 2),
            "active_speed_tracks": len(valid_speeds),
            "speeds_by_track": track_speed_map
        }


# Global singleton
calibration_service = CalibrationService()
