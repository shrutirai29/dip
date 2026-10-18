import time
import threading
import logging
from typing import Optional, Tuple, Dict, Any
import cv2
import numpy as np

logger = logging.getLogger("crowdguard.camera")

class CameraState:
    IDLE = "IDLE"
    CONNECTING = "CONNECTING"
    CONNECTED = "CONNECTED"
    DEGRADED = "DEGRADED"
    DISCONNECTED = "DISCONNECTED"


class CameraIngestionService:
    """
    Thread-safe local webcam acquisition service with strict lifecycle management,
    paced frame acquisition, monotonic frame sequence IDs, bounded frame drop accounting,
    and automatic resource release.
    """

    MAX_CONSECUTIVE_FAILURES = 10
    DEGRADED_THRESHOLD = 3
    DEFAULT_TARGET_FPS = 25.0

    def __init__(self):
        self._lock = threading.Lock()
        self._state_lock = threading.Lock()
        self._frame_lock = threading.Lock()
        self._frame_available = threading.Condition(self._frame_lock)

        self._state: str = CameraState.IDLE
        self._device_index: Optional[int] = None
        self._target_fps: float = self.DEFAULT_TARGET_FPS

        self._capture_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._cap: Optional[cv2.VideoCapture] = None

        # Telemetry & Drop Accounting
        self._frames_captured: int = 0
        self._frames_dropped: int = 0
        self._frames_consumed: int = 0
        self._consecutive_failures: int = 0
        self._error_message: Optional[str] = None
        self._started_at: Optional[float] = None
        self._last_frame_time: Optional[float] = None
        self._measured_fps: float = 0.0

        # Latest frame buffer (bounded to 1 frame)
        self._latest_raw_frame: Optional[np.ndarray] = None
        self._latest_frame_id: int = 0
        self._latest_frame_timestamp: float = 0.0
        self._frame_has_been_read: bool = True

    @property
    def state(self) -> str:
        with self._state_lock:
            return self._state

    def _set_state(self, new_state: str, error_msg: Optional[str] = None):
        with self._state_lock:
            self._state = new_state
            if error_msg is not None:
                self._error_message = error_msg

    def get_status(self) -> Dict[str, Any]:
        with self._state_lock:
            current_state = self._state
            err = self._error_message
            dev_idx = self._device_index
            started = self._started_at

        with self._frame_lock:
            captured = self._frames_captured
            dropped = self._frames_dropped
            consumed = self._frames_consumed
            latest_id = self._latest_frame_id
            latest_ts = self._latest_frame_timestamp
            measured_fps = self._measured_fps

        uptime_sec = round(time.time() - started, 2) if started and current_state == CameraState.CONNECTED else 0.0

        return {
            "state": current_state,
            "device_index": dev_idx,
            "is_active": current_state in (CameraState.CONNECTING, CameraState.CONNECTED, CameraState.DEGRADED),
            "frames_captured": captured,
            "frames_consumed": consumed,
            "frames_dropped": dropped,
            "latest_frame_id": latest_id,
            "latest_frame_timestamp": round(latest_ts, 3),
            "measured_fps": round(measured_fps, 1),
            "uptime_seconds": uptime_sec,
            "error_message": err,
        }

    def start(self, device_index: int = 0, target_fps: float = 25.0) -> Dict[str, Any]:
        """
        Starts the webcam capture worker on the specified device index.
        Idempotent: if already connected to the same device, returns current status.
        """
        if not isinstance(device_index, int) or device_index < 0:
            raise ValueError(f"Invalid camera device index: {device_index}. Must be a non-negative integer.")

        with self._lock:
            # Check if already running on same device
            if self._state in (CameraState.CONNECTED, CameraState.CONNECTING) and self._device_index == device_index:
                logger.info(f"Camera session already active on device index {device_index}")
                return self.get_status()

            # If running on another device or degraded, stop first
            if self._state in (CameraState.CONNECTED, CameraState.CONNECTING, CameraState.DEGRADED):
                self._stop_internal()

            self._device_index = device_index
            self._target_fps = max(1.0, min(60.0, float(target_fps)))
            self._stop_event.clear()
            self._set_state(CameraState.CONNECTING, None)

            # Reset counters
            with self._frame_lock:
                self._frames_captured = 0
                self._frames_dropped = 0
                self._frames_consumed = 0
                self._consecutive_failures = 0
                self._latest_raw_frame = None
                self._latest_frame_id = 0
                self._latest_frame_timestamp = 0.0
                self._frame_has_been_read = True

            self._started_at = time.time()
            self._capture_thread = threading.Thread(
                target=self._capture_loop,
                name=f"CameraIngestionWorker-{device_index}",
                daemon=True
            )
            self._capture_thread.start()

        return self.get_status()

    def stop(self) -> Dict[str, Any]:
        """
        Stops the camera capture worker and reliably releases camera hardware resources.
        Idempotent.
        """
        with self._lock:
            self._stop_internal()
        return self.get_status()

    def _stop_internal(self):
        self._stop_event.set()
        with self._frame_available:
            self._frame_available.notify_all()

        if self._capture_thread and self._capture_thread.is_alive():
            self._capture_thread.join(timeout=2.0)
            self._capture_thread = None

        self._release_camera()
        self._set_state(CameraState.IDLE, None)
        self._started_at = None
        with self._frame_lock:
            self._latest_raw_frame = None
            self._measured_fps = 0.0

    def _release_camera(self):
        if self._cap is not None:
            try:
                self._cap.release()
            except Exception as e:
                logger.warning(f"Error releasing VideoCapture: {e}")
            finally:
                self._cap = None

    def _capture_loop(self):
        """
        Paced acquisition loop with bounded error handling and latest-frame buffering.
        """
        device_idx = self._device_index
        interval = 1.0 / self._target_fps

        try:
            # Attempt to open video capture
            cap = cv2.VideoCapture(device_idx)
            if not cap.isOpened():
                error_msg = f"Unable to open camera device index {device_idx}. Device may be disconnected or in use by another application."
                logger.error(error_msg)
                self._set_state(CameraState.DISCONNECTED, error_msg)
                self._release_camera()
                return

            self._cap = cap
            self._set_state(CameraState.CONNECTED, None)
            logger.info(f"Camera successfully connected on device index {device_idx}")

            fps_calc_start = time.time()
            fps_frame_counter = 0

            while not self._stop_event.is_set():
                cycle_start = time.time()

                ret, frame = cap.read()

                if not ret or frame is None or frame.size == 0:
                    self._consecutive_failures += 1
                    logger.warning(f"Frame read failure on device {device_idx} ({self._consecutive_failures}/{self.MAX_CONSECUTIVE_FAILURES})")

                    if self._consecutive_failures >= self.MAX_CONSECUTIVE_FAILURES:
                        error_msg = f"Camera device {device_idx} disconnected: exceeded {self.MAX_CONSECUTIVE_FAILURES} consecutive read failures."
                        logger.error(error_msg)
                        self._set_state(CameraState.DISCONNECTED, error_msg)
                        break
                    elif self._consecutive_failures >= self.DEGRADED_THRESHOLD:
                        self._set_state(CameraState.DEGRADED, f"Read failure count: {self._consecutive_failures}")

                    time.sleep(min(0.2, interval))
                    continue

                # Successful read: reset failure counter and update state
                if self._consecutive_failures > 0:
                    self._consecutive_failures = 0
                    if self.state != CameraState.CONNECTED:
                        self._set_state(CameraState.CONNECTED, None)

                now = time.time()
                with self._frame_lock:
                    self._frames_captured += 1
                    self._latest_frame_id += 1
                    self._latest_frame_timestamp = now

                    # Drop accounting: if consumer hasn't consumed the previous frame, record drop
                    if not self._frame_has_been_read and self._latest_raw_frame is not None:
                        self._frames_dropped += 1

                    self._latest_raw_frame = frame
                    self._frame_has_been_read = False
                    self._frame_available.notify_all()

                # Measured FPS tracking (1-second rolling calculation)
                fps_frame_counter += 1
                fps_elapsed = now - fps_calc_start
                if fps_elapsed >= 1.0:
                    with self._frame_lock:
                        self._measured_fps = fps_frame_counter / fps_elapsed
                    fps_calc_start = now
                    fps_frame_counter = 0

                # Pace the capture loop to target FPS
                elapsed = time.time() - cycle_start
                sleep_time = interval - elapsed
                if sleep_time > 0.001:
                    time.sleep(sleep_time)

        except Exception as e:
            err_msg = f"Unexpected camera capture error on device {device_idx}: {str(e)}"
            logger.exception(err_msg)
            self._set_state(CameraState.DISCONNECTED, err_msg)
        finally:
            self._release_camera()
            if not self._stop_event.is_set() and self.state not in (CameraState.DISCONNECTED, CameraState.DEGRADED):
                self._set_state(CameraState.DISCONNECTED, "Camera stream closed.")

    def get_latest_frame(self, timeout: float = 0.5) -> Optional[Tuple[int, float, np.ndarray]]:
        """
        Retrieves the latest available frame from the capture buffer.
        Returns: (frame_id, timestamp_sec, frame_bgr) or None if no frame is available.
        Marks the frame as consumed for drop accounting.
        """
        with self._frame_lock:
            if self._latest_raw_frame is None:
                if timeout > 0:
                    self._frame_available.wait(timeout=timeout)
                if self._latest_raw_frame is None:
                    return None

            frame = self._latest_raw_frame.copy()
            fid = self._latest_frame_id
            ts = self._latest_frame_timestamp
            self._frame_has_been_read = True
            self._frames_consumed += 1
            return fid, ts, frame


# Global singleton instance for camera ingestion
camera_ingestion_service = CameraIngestionService()
