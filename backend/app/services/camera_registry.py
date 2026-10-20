import uuid
import logging
import threading
from typing import Dict, List, Optional, Any

from app.core.config import settings
from app.services.detection_service import DetectionService
from app.services.camera_session import CameraSession, CameraConfig, CameraState, CameraSourceType
from app.services.rtsp_security import validate_rtsp_url

logger = logging.getLogger("crowdguard.camera_registry")


class CameraRegistryService:
    """
    Central registry and coordinator for all CROWDGUARD camera sessions.
    Enforces:
    - Maximum registered cameras (default 16).
    - Maximum simultaneously active streams (default 4).
    - Shared thread-safe YOLOv8 DetectionService to prevent multi-GB VRAM/RAM duplication.
    - Independent camera lifecycle operations (start, stop, retry, remove).
    - Aggregate multi-camera health monitoring.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._sessions: Dict[str, CameraSession] = {}
        # Shared thread-safe detector for all cameras
        self._shared_detector = DetectionService()
        self._custom_max_registered: Optional[int] = None
        self._custom_max_active: Optional[int] = None

    @property
    def max_registered(self) -> int:
        if self._custom_max_registered is not None:
            return self._custom_max_registered
        return getattr(settings, "MAX_REGISTERED_CAMERAS", 16)

    @max_registered.setter
    def max_registered(self, val: int):
        self._custom_max_registered = val

    @max_registered.deleter
    def max_registered(self):
        self._custom_max_registered = None

    @property
    def max_active(self) -> int:
        if self._custom_max_active is not None:
            return self._custom_max_active
        return getattr(settings, "MAX_ACTIVE_STREAMS", 4)

    @max_active.setter
    def max_active(self, val: int):
        self._custom_max_active = val

    @max_active.deleter
    def max_active(self):
        self._custom_max_active = None

    def list_cameras(self) -> List[Dict[str, Any]]:
        """Returns status summaries for all registered cameras."""
        with self._lock:
            return [session.get_status() for session in self._sessions.values()]

    def get_camera(self, camera_id: str) -> Optional[CameraSession]:
        with self._lock:
            return self._sessions.get(camera_id)

    def register_camera(
        self,
        name: str,
        source_type: str,
        device_index: Optional[int] = 0,
        rtsp_url: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        location: Optional[str] = None,
        target_fps: float = 25.0,
        conf_threshold: float = 0.30,
        inference_size: int = 640,
        perspective_weight: float = 1.0,
        privacy_mode: str = "none",
        timeout_seconds: float = 5.0,
        max_retries: int = 5,
        start_immediately: bool = False,
    ) -> CameraSession:
        """
        Registers a new camera session into the registry.
        Validates source parameters and capacity limits before creation.
        """
        with self._lock:
            if len(self._sessions) >= self.max_registered:
                raise ValueError(f"Maximum registered camera limit reached ({self.max_registered}). Remove an unused camera first.")

            source_type_clean = source_type.lower().strip()
            if source_type_clean not in (CameraSourceType.WEBCAM, CameraSourceType.RTSP):
                raise ValueError(f"Invalid source_type '{source_type}'. Must be 'webcam' or 'rtsp'.")

            # Validate RTSP parameters if source is RTSP
            if source_type_clean == CameraSourceType.RTSP:
                if not rtsp_url:
                    raise ValueError("rtsp_url is required for RTSP camera sources.")
                is_valid, err_msg, _ = validate_rtsp_url(rtsp_url)
                if not is_valid:
                    raise ValueError(f"Invalid RTSP URL: {err_msg}")

            camera_id = f"cam_{uuid.uuid4().hex[:10]}"
            config = CameraConfig(
                camera_id=camera_id,
                name=name,
                source_type=source_type_clean,
                device_index=device_index,
                rtsp_url=rtsp_url,
                username=username,
                password=password,
                location=location,
                target_fps=target_fps,
                conf_threshold=conf_threshold,
                inference_size=inference_size,
                perspective_weight=perspective_weight,
                privacy_mode=privacy_mode,
                timeout_seconds=timeout_seconds,
                max_retries=max_retries,
            )

            session = CameraSession(config, shared_detection_service=self._shared_detector)
            self._sessions[camera_id] = session
            logger.info(f"Registered new camera: {camera_id} ({config.name})")

        if start_immediately:
            self.start_camera(camera_id)

        return session

    def start_camera(self, camera_id: str) -> Dict[str, Any]:
        """Starts an individual camera session, enforcing active stream limit."""
        with self._lock:
            session = self._sessions.get(camera_id)
            if not session:
                raise KeyError(f"Camera '{camera_id}' not found.")

            # Count currently active cameras
            active_count = sum(1 for s in self._sessions.values() if s.is_active)
            if not session.is_active and active_count >= self.max_active:
                raise ValueError(
                    f"Active camera stream limit reached ({self.max_active} active). "
                    "Stop an active camera before starting a new stream."
                )

        session.start()
        return session.get_status()

    def stop_camera(self, camera_id: str) -> Dict[str, Any]:
        """Stops an individual camera session without affecting others."""
        with self._lock:
            session = self._sessions.get(camera_id)
            if not session:
                raise KeyError(f"Camera '{camera_id}' not found.")

        session.stop()
        return session.get_status()

    def retry_camera(self, camera_id: str) -> Dict[str, Any]:
        """Triggers immediate reconnect attempt on a single camera session."""
        with self._lock:
            session = self._sessions.get(camera_id)
            if not session:
                raise KeyError(f"Camera '{camera_id}' not found.")

        session.trigger_retry()
        return session.get_status()

    def remove_camera(self, camera_id: str) -> bool:
        """Safely removes an inactive camera session from the registry."""
        with self._lock:
            session = self._sessions.get(camera_id)
            if not session:
                raise KeyError(f"Camera '{camera_id}' not found.")

            if session.is_active:
                raise ValueError(f"Cannot remove active camera '{camera_id}'. Stop the camera first.")

            del self._sessions[camera_id]
            logger.info(f"Removed camera session {camera_id}.")
            return True

    def get_aggregate_health(self) -> Dict[str, Any]:
        """Returns aggregate system-wide health and capacity stats across all cameras."""
        with self._lock:
            total_registered = len(self._sessions)
            active_count = 0
            connected_count = 0
            degraded_count = 0
            reconnecting_count = 0
            error_count = 0
            total_persons = 0
            max_risk = 0.0

            for session in self._sessions.values():
                st = session.state
                if session.is_active:
                    active_count += 1
                if st == CameraState.CONNECTED:
                    connected_count += 1
                elif st == CameraState.DEGRADED:
                    degraded_count += 1
                elif st == CameraState.RECONNECTING:
                    reconnecting_count += 1
                elif st in (CameraState.ERROR, CameraState.DISCONNECTED):
                    error_count += 1

                telem = session.get_telemetry()
                if telem:
                    total_persons += telem.get("person_count", 0)
                    risk = telem.get("smoothed_risk_score", 0.0)
                    if risk > max_risk:
                        max_risk = risk

            return {
                "total_registered": total_registered,
                "max_registered_limit": self.max_registered,
                "active_streams": active_count,
                "max_active_limit": self.max_active,
                "connected_count": connected_count,
                "degraded_count": degraded_count,
                "reconnecting_count": reconnecting_count,
                "error_or_disconnected_count": error_count,
                "total_observed_persons": total_persons,
                "highest_risk_score": round(max_risk, 1),
                "system_status": (
                    "OPERATIONAL" if (error_count == 0 and reconnecting_count == 0)
                    else "DEGRADED" if connected_count > 0
                    else "OFFLINE" if total_registered > 0
                    else "IDLE"
                )
            }


# Global singleton registry instance
camera_registry_service = CameraRegistryService()
