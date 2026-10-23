import os
import time
import random
import threading
import logging
from typing import Optional, Tuple, Dict, Any
import cv2
import numpy as np

from app.services.rtsp_security import sanitize_rtsp_url, build_authenticated_rtsp_url

logger = logging.getLogger("crowdguard.camera")


class CameraState:
    IDLE = "IDLE"
    CONNECTING = "CONNECTING"
    CONNECTED = "CONNECTED"
    DEGRADED = "DEGRADED"
    RECONNECTING = "RECONNECTING"
    DISCONNECTED = "DISCONNECTED"
    ERROR = "ERROR"


class CameraSourceType:
    WEBCAM = "webcam"
    RTSP = "rtsp"


class RtspCameraConfig:
    """
    Validated configuration for an RTSP network camera session.
    Secrets are kept in-memory for the lifetime of the session and never exposed in logs or APIs.
    """
    def __init__(
        self,
        name: str,
        rtsp_url: str,
        username: Optional[str] = None,
        password: Optional[str] = None,
        timeout_seconds: float = 5.0,
        max_retries: int = 5,
        initial_backoff_sec: float = 1.0,
        max_backoff_sec: float = 16.0,
        target_fps: float = 25.0,
        location: Optional[str] = None,
    ):
        self.name = (name or "").strip() or "CCTV Camera"
        self.rtsp_url = (rtsp_url or "").strip()
        self.username = username.strip() if username else None
        self.password = password.strip() if password else None
        self.timeout_seconds = max(1.0, min(30.0, float(timeout_seconds)))
        self.max_retries = max(0, min(50, int(max_retries)))
        self.initial_backoff_sec = max(0.5, float(initial_backoff_sec))
        self.max_backoff_sec = max(self.initial_backoff_sec, float(max_backoff_sec))
        self.target_fps = max(1.0, min(60.0, float(target_fps)))
        self.location = location.strip() if location else None
        self.sanitized_url = sanitize_rtsp_url(self.rtsp_url)


class CameraIngestionService:
    """
    Thread-safe camera ingestion service supporting both hardware local webcams and
    resilient RTSP CCTV network feeds. Features:
    - Bounded single-frame buffer for real-time inference without queue lag.
    - Decoupled acquisition thread with strict pace matching.
    - Automatic exponential backoff with jitter on network stream drop.
    - Stalled stream detection and bounded consecutive read failure tracking.
    - Safe credential handling (zero passwords in logs or state responses).
    - Resource release and idempotent start/stop.
    """

    MAX_CONSECUTIVE_FAILURES = 10
    DEGRADED_THRESHOLD = 3
    DEFAULT_TARGET_FPS = 25.0
    STALL_TIMEOUT_SEC = 5.0

    def __init__(self):
        self._lock = threading.Lock()
        self._state_lock = threading.Lock()
        self._frame_lock = threading.Lock()
        self._frame_available = threading.Condition(self._frame_lock)

        self._state: str = CameraState.IDLE
        self._source_type: Optional[str] = None
        self._device_index: Optional[int] = None
        self._rtsp_config: Optional[RtspCameraConfig] = None
        self._target_fps: float = self.DEFAULT_TARGET_FPS

        self._capture_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._retry_interrupt_event = threading.Event()
        self._cap: Optional[cv2.VideoCapture] = None

        # Telemetry & Drop Accounting
        self._frames_captured: int = 0
        self._frames_dropped: int = 0
        self._frames_consumed: int = 0
        self._consecutive_failures: int = 0
        self._consecutive_successes: int = 0
        self._retry_count: int = 0
        self._next_retry_delay_sec: float = 0.0
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

    @property
    def source_type(self) -> Optional[str]:
        with self._state_lock:
            return self._source_type

    def _set_state(self, new_state: str, error_msg: Optional[str] = None):
        with self._state_lock:
            self._state = new_state
            if error_msg is not None:
                self._error_message = error_msg

    def get_status(self) -> Dict[str, Any]:
        with self._state_lock:
            current_state = self._state
            err = self._error_message
            src_type = self._source_type
            dev_idx = self._device_index
            rtsp_conf = self._rtsp_config
            started = self._started_at
            retry_cnt = self._retry_count
            next_retry_delay = self._next_retry_delay_sec

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
            "source_type": src_type,
            "device_index": dev_idx,
            "camera_name": rtsp_conf.name if rtsp_conf else ("Local Webcam" if dev_idx is not None else None),
            "sanitized_url": rtsp_conf.sanitized_url if rtsp_conf else None,
            "location": rtsp_conf.location if rtsp_conf else None,
            "is_active": current_state in (
                CameraState.CONNECTING,
                CameraState.CONNECTED,
                CameraState.DEGRADED,
                CameraState.RECONNECTING
            ),
            "frames_captured": captured,
            "frames_consumed": consumed,
            "frames_dropped": dropped,
            "latest_frame_id": latest_id,
            "latest_frame_timestamp": round(latest_ts, 3),
            "measured_fps": round(measured_fps, 1),
            "uptime_seconds": uptime_sec,
            "error_message": err,
            "retry_count": retry_cnt if src_type == CameraSourceType.RTSP else 0,
            "max_retries": rtsp_conf.max_retries if rtsp_conf else 0,
            "next_retry_delay_sec": round(next_retry_delay, 1) if current_state == CameraState.RECONNECTING else 0.0,
        }

    def start(self, device_index: int = 0, target_fps: float = 25.0) -> Dict[str, Any]:
        """Backward-compatible entry point for local webcam capture."""
        return self.start_webcam(device_index=device_index, target_fps=target_fps)

    def start_webcam(self, device_index: int = 0, target_fps: float = 25.0) -> Dict[str, Any]:
        """Starts local hardware webcam acquisition on the specified device index."""
        if not isinstance(device_index, int) or device_index < 0:
            raise ValueError(f"Invalid camera device index: {device_index}. Must be a non-negative integer.")

        with self._lock:
            # Idempotency check
            if (
                self._state in (CameraState.CONNECTED, CameraState.CONNECTING, CameraState.DEGRADED)
                and self._source_type == CameraSourceType.WEBCAM
                and self._device_index == device_index
            ):
                logger.info(f"Webcam session already active on device index {device_index}")
                return self.get_status()

            if self._state in (CameraState.CONNECTED, CameraState.CONNECTING, CameraState.DEGRADED, CameraState.RECONNECTING):
                self._stop_internal()

            self._source_type = CameraSourceType.WEBCAM
            self._device_index = device_index
            self._rtsp_config = None
            self._target_fps = max(1.0, min(60.0, float(target_fps)))
            self._retry_count = 0
            self._next_retry_delay_sec = 0.0
            self._stop_event.clear()
            self._retry_interrupt_event.clear()
            self._set_state(CameraState.CONNECTING, None)

            self._reset_frame_counters()
            self._started_at = time.time()
            self._capture_thread = threading.Thread(
                target=self._webcam_capture_loop,
                name=f"WebcamCaptureWorker-{device_index}",
                daemon=True
            )
            self._capture_thread.start()

        return self.get_status()

    def start_rtsp(self, config: RtspCameraConfig) -> Dict[str, Any]:
        """Starts network RTSP CCTV stream ingestion with resilient reconnection."""
        with self._lock:
            # Idempotency check: same active RTSP stream
            if (
                self._state in (CameraState.CONNECTED, CameraState.CONNECTING, CameraState.DEGRADED, CameraState.RECONNECTING)
                and self._source_type == CameraSourceType.RTSP
                and self._rtsp_config
                and self._rtsp_config.rtsp_url == config.rtsp_url
            ):
                logger.info(f"RTSP session already active for {config.sanitized_url}")
                return self.get_status()

            if self._state in (CameraState.CONNECTED, CameraState.CONNECTING, CameraState.DEGRADED, CameraState.RECONNECTING):
                self._stop_internal()

            self._source_type = CameraSourceType.RTSP
            self._device_index = None
            self._rtsp_config = config
            self._target_fps = config.target_fps
            self._retry_count = 0
            self._next_retry_delay_sec = 0.0
            self._stop_event.clear()
            self._retry_interrupt_event.clear()
            self._set_state(CameraState.CONNECTING, None)

            self._reset_frame_counters()
            self._started_at = time.time()
            self._capture_thread = threading.Thread(
                target=self._rtsp_capture_loop,
                name=f"RTSPCaptureWorker-{config.name[:16]}",
                daemon=True
            )
            self._capture_thread.start()

        return self.get_status()

    def stop(self) -> Dict[str, Any]:
        """Stops any active camera worker (webcam or RTSP) and releases resources."""
        with self._lock:
            self._stop_internal()
        return self.get_status()

    def trigger_immediate_retry(self) -> Dict[str, Any]:
        """Manually interrupts backoff sleep to trigger an immediate reconnect attempt."""
        with self._lock:
            if self._source_type == CameraSourceType.RTSP and self._state in (CameraState.RECONNECTING, CameraState.DISCONNECTED, CameraState.ERROR):
                logger.info("Operator triggered immediate RTSP reconnect.")
                self._retry_count = 0
                self._next_retry_delay_sec = 0.0
                self._retry_interrupt_event.set()
                if self._state in (CameraState.DISCONNECTED, CameraState.ERROR) and self._rtsp_config:
                    return self.start_rtsp(self._rtsp_config)
            return self.get_status()

    def _reset_frame_counters(self):
        with self._frame_lock:
            self._frames_captured = 0
            self._frames_dropped = 0
            self._frames_consumed = 0
            self._consecutive_failures = 0
            self._consecutive_successes = 0
            self._latest_raw_frame = None
            self._latest_frame_id = 0
            self._latest_frame_timestamp = 0.0
            self._frame_has_been_read = True

    def _stop_internal(self):
        self._stop_event.set()
        self._retry_interrupt_event.set()
        with self._frame_available:
            self._frame_available.notify_all()

        if self._capture_thread and self._capture_thread.is_alive():
            self._capture_thread.join(timeout=2.5)
            self._capture_thread = None

        self._release_camera()
        self._set_state(CameraState.IDLE, None)
        self._started_at = None
        self._source_type = None
        self._device_index = None
        self._rtsp_config = None
        self._retry_count = 0
        self._next_retry_delay_sec = 0.0

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

    def _webcam_capture_loop(self):
        """Paced acquisition loop for local hardware webcam."""
        device_idx = self._device_index
        interval = 1.0 / self._target_fps

        try:
            cap = cv2.VideoCapture(device_idx)
            if not cap.isOpened():
                error_msg = f"Unable to open camera device index {device_idx}. Device may be disconnected or in use by another application."
                logger.error(error_msg)
                self._set_state(CameraState.DISCONNECTED, error_msg)
                self._release_camera()
                return

            self._cap = cap
            self._set_state(CameraState.CONNECTED, None)
            logger.info(f"Webcam successfully connected on device index {device_idx}")

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

                if self._consecutive_failures > 0:
                    self._consecutive_failures = 0
                    if self.state != CameraState.CONNECTED:
                        self._set_state(CameraState.CONNECTED, None)

                now = time.time()
                self._record_successful_frame(frame, now)

                # FPS tracking
                fps_frame_counter += 1
                fps_elapsed = now - fps_calc_start
                if fps_elapsed >= 1.0:
                    with self._frame_lock:
                        self._measured_fps = fps_frame_counter / fps_elapsed
                    fps_calc_start = now
                    fps_frame_counter = 0

                elapsed = time.time() - cycle_start
                sleep_time = interval - elapsed
                if sleep_time > 0.001:
                    time.sleep(sleep_time)

        except Exception as e:
            err_msg = f"Unexpected webcam capture error on device {device_idx}: {str(e)}"
            logger.exception(err_msg)
            self._set_state(CameraState.DISCONNECTED, err_msg)
        finally:
            self._release_camera()
            if not self._stop_event.is_set() and self.state not in (CameraState.DISCONNECTED, CameraState.DEGRADED):
                self._set_state(CameraState.DISCONNECTED, "Webcam stream closed.")

    def _rtsp_capture_loop(self):
        """
        Resilient acquisition loop for network RTSP CCTV feeds with bounded exponential backoff.
        """
        config = self._rtsp_config
        if not config:
            return

        interval = 1.0 / config.target_fps
        auth_url = build_authenticated_rtsp_url(config.rtsp_url, config.username, config.password)

        # Configure OpenCV FFmpeg environment options for robust RTSP streaming
        timeout_us = int(config.timeout_seconds * 1_000_000)
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = f"rtsp_transport;tcp|stimeout;{timeout_us}|max_delay;500000"

        fps_calc_start = time.time()
        fps_frame_counter = 0

        while not self._stop_event.is_set():
            # 1. Connection Phase
            self._set_state(
                CameraState.RECONNECTING if self._retry_count > 0 else CameraState.CONNECTING,
                f"Connecting to {config.sanitized_url}..." if self._retry_count == 0 else f"Reconnecting (Attempt {self._retry_count}/{config.max_retries})..."
            )
            logger.info(f"Connecting to RTSP feed: {config.sanitized_url} (Attempt {self._retry_count}/{config.max_retries})")

            try:
                cap = cv2.VideoCapture(auth_url, cv2.CAP_FFMPEG)
                # Apply OpenCV timeout properties if supported
                try:
                    cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, int(config.timeout_seconds * 1000))
                    cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, int(config.timeout_seconds * 1000))
                except Exception:
                    pass

                if not cap.isOpened():
                    raise ConnectionError(f"Failed to open RTSP stream at {config.sanitized_url}. Destination may be unreachable or credentials rejected.")

                # Probe initial frame to confirm stream is actively delivering frames
                ret, frame = cap.read()
                if not ret or frame is None or frame.size == 0:
                    raise ConnectionError(f"RTSP stream opened at {config.sanitized_url} but returned no initial frame data.")

                # Connection Verified
                self._cap = cap
                self._set_state(CameraState.CONNECTED, None)
                self._consecutive_failures = 0
                self._consecutive_successes = 1
                logger.info(f"RTSP stream successfully connected: {config.sanitized_url}")

                now = time.time()
                self._record_successful_frame(frame, now)
                last_frame_rx_time = now

                # 2. Continuous Read Loop
                while not self._stop_event.is_set():
                    cycle_start = time.time()
                    ret, frame = cap.read()

                    if not ret or frame is None or frame.size == 0:
                        self._consecutive_failures += 1
                        logger.warning(
                            f"RTSP frame drop/failure on {config.sanitized_url} "
                            f"({self._consecutive_failures}/{self.MAX_CONSECUTIVE_FAILURES})"
                        )

                        # Check stalled stream timeout
                        time_since_last_frame = time.time() - last_frame_rx_time
                        if self._consecutive_failures >= self.MAX_CONSECUTIVE_FAILURES or time_since_last_frame >= self.STALL_TIMEOUT_SEC:
                            error_msg = f"RTSP stream stalled or disconnected (no valid frames for {time_since_last_frame:.1f}s)."
                            logger.error(error_msg)
                            self._set_state(CameraState.DEGRADED, error_msg)
                            break
                        elif self._consecutive_failures >= self.DEGRADED_THRESHOLD:
                            self._set_state(CameraState.DEGRADED, f"Transient network jitter: {self._consecutive_failures} dropped frames.")

                        time.sleep(min(0.2, interval))
                        continue

                    # Frame successfully received
                    now = time.time()
                    last_frame_rx_time = now
                    self._consecutive_failures = 0
                    self._consecutive_successes += 1

                    # After stable frame reception, reset retry counter
                    if self._consecutive_successes >= 15 and self._retry_count > 0:
                        self._retry_count = 0
                        logger.debug("RTSP frame delivery stabilized; reset retry counter to 0.")

                    if self.state != CameraState.CONNECTED:
                        self._set_state(CameraState.CONNECTED, None)

                    self._record_successful_frame(frame, now)

                    # Rolling FPS calculation
                    fps_frame_counter += 1
                    fps_elapsed = now - fps_calc_start
                    if fps_elapsed >= 1.0:
                        with self._frame_lock:
                            self._measured_fps = fps_frame_counter / fps_elapsed
                        fps_calc_start = now
                        fps_frame_counter = 0

                    elapsed = time.time() - cycle_start
                    sleep_time = interval - elapsed
                    if sleep_time > 0.001:
                        time.sleep(sleep_time)

            except Exception as e:
                err_msg = f"RTSP connection error for {config.sanitized_url}: {str(e)}"
                logger.warning(err_msg)
                self._error_message = err_msg
            finally:
                self._release_camera()

            if self._stop_event.is_set():
                break

            # 3. Reconnection Backoff Evaluation
            if self._retry_count >= config.max_retries:
                final_err = f"RTSP stream at {config.sanitized_url} disconnected. Exceeded maximum retry attempts ({config.max_retries})."
                logger.error(final_err)
                self._set_state(CameraState.DISCONNECTED, final_err)
                break

            self._retry_count += 1

            # Calculate exponential backoff with +/- 20% random jitter
            base_backoff = min(config.max_backoff_sec, config.initial_backoff_sec * (2 ** (self._retry_count - 1)))
            jitter = random.uniform(-0.2, 0.2) * base_backoff
            delay = max(0.5, round(base_backoff + jitter, 2))
            self._next_retry_delay_sec = delay

            reconnect_msg = f"Stream interrupted. Retrying in {delay:.1f}s (Attempt {self._retry_count}/{config.max_retries})..."
            logger.info(reconnect_msg)
            self._set_state(CameraState.RECONNECTING, reconnect_msg)

            # Interruptible sleep: wakes up on stop_event or trigger_immediate_retry
            self._retry_interrupt_event.clear()
            interrupted = self._retry_interrupt_event.wait(timeout=delay)
            if self._stop_event.is_set():
                break
            if interrupted:
                logger.info("RTSP backoff delay interrupted by manual retry trigger.")

        if not self._stop_event.is_set() and self.state not in (CameraState.DISCONNECTED, CameraState.ERROR):
            self._set_state(CameraState.DISCONNECTED, "RTSP camera session terminated.")

    def _record_successful_frame(self, frame: np.ndarray, timestamp_sec: float):
        """Thread-safe update of latest frame buffer and drop accounting."""
        with self._frame_lock:
            self._frames_captured += 1
            self._latest_frame_id += 1
            self._latest_frame_timestamp = timestamp_sec

            if not self._frame_has_been_read and self._latest_raw_frame is not None:
                self._frames_dropped += 1

            self._latest_raw_frame = frame
            self._frame_has_been_read = False
            self._frame_available.notify_all()

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
