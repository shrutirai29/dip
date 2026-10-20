import os
import time
import random
import threading
import logging
from typing import Optional, Dict, Any, List, Tuple
import cv2
import numpy as np

from app.core.config import settings
from app.services.rtsp_security import sanitize_rtsp_url, build_authenticated_rtsp_url
from app.services.tracking_service import SimpleByteTracker
from app.services.density_service import DensityService
from app.services.risk_engine import CrowdRiskEngine
from app.services.dip_service import DIPProcessor
from app.services.forecasting_service import PatternAndForecastingEngine

logger = logging.getLogger("crowdguard.camera_session")


class CameraState:
    IDLE = "IDLE"
    CONNECTING = "CONNECTING"
    CONNECTED = "CONNECTED"
    DEGRADED = "DEGRADED"
    RECONNECTING = "RECONNECTING"
    DISCONNECTED = "DISCONNECTED"
    ERROR = "ERROR"
    STOPPING = "STOPPING"


class CameraSourceType:
    WEBCAM = "webcam"
    RTSP = "rtsp"


class CameraConfig:
    """
    Configuration model for a registered camera.
    Sensitive credentials are kept server-side in-memory and sanitized for external output.
    """
    def __init__(
        self,
        camera_id: str,
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
    ):
        self.camera_id = camera_id
        self.name = (name or "").strip() or f"Camera {camera_id[:8]}"
        self.source_type = source_type.lower()
        self.device_index = int(device_index) if device_index is not None else 0
        self.rtsp_url = (rtsp_url or "").strip() if rtsp_url else None
        self.username = username.strip() if username else None
        self.password = password.strip() if password else None
        self.location = location.strip() if location else None
        self.target_fps = max(1.0, min(60.0, float(target_fps)))
        self.conf_threshold = max(0.05, min(1.0, float(conf_threshold)))
        self.inference_size = int(inference_size)
        self.perspective_weight = max(0.0, min(3.0, float(perspective_weight)))
        self.privacy_mode = privacy_mode if privacy_mode in ("none", "face_blur", "full_anonymize") else "none"
        self.timeout_seconds = max(1.0, min(30.0, float(timeout_seconds)))
        self.max_retries = max(0, min(50, int(max_retries)))
        self.sanitized_url = sanitize_rtsp_url(self.rtsp_url) if self.rtsp_url else None


class CameraSession:
    """
    An isolated, self-contained camera acquisition and incremental analytics session.
    Guarantees strict isolation of:
    - Capture device/network handles.
    - Bounded single-frame buffer.
    - YOLO tracking Kalman filters & track IDs (SimpleByteTracker).
    - DIP optical flow history & density matrix (DensityService).
    - Heuristic crowd risk scores & temporal forecasting (CrowdRiskEngine, PatternAndForecastingEngine).
    - Reconnection watchdogs & exponential backoff timers.
    """

    MAX_CONSECUTIVE_FAILURES = 10
    DEGRADED_THRESHOLD = 3
    STALL_TIMEOUT_SEC = 5.0

    def __init__(self, config: CameraConfig, shared_detection_service=None):
        self.config = config
        self.camera_id = config.camera_id
        self._shared_detector = shared_detection_service

        self._lock = threading.Lock()
        self._state_lock = threading.Lock()
        self._state: str = CameraState.IDLE
        self._error_message: Optional[str] = None
        self._created_at: float = time.time()
        self._started_at: Optional[float] = None

        # Capture resources
        self._cap: Optional[cv2.VideoCapture] = None
        self._capture_thread: Optional[threading.Thread] = None
        self._inference_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._retry_interrupt_event = threading.Event()

        # Frame Buffer (strictly latest-frame bounded buffer)
        self._frame_lock = threading.Lock()
        self._frame_available = threading.Condition(self._frame_lock)
        self._latest_raw_frame: Optional[np.ndarray] = None
        self._latest_frame_id: int = 0
        self._latest_frame_timestamp: float = 0.0
        self._frames_captured: int = 0
        self._frames_consumed: int = 0
        self._frames_dropped: int = 0
        self._consecutive_failures: int = 0
        self._consecutive_successes: int = 0
        self._measured_fps: float = 0.0

        # Isolated tracking and analytics instances
        self.tracker = SimpleByteTracker(
            max_lost_frames=settings.TRACKER_MAX_LOST,
            iou_threshold=0.3,
            min_hits=settings.TRACKER_MIN_HITS,
            instant_confirm_conf=settings.TRACKER_INSTANT_CONFIRM_CONF
        )
        self.density_service = DensityService(grid_rows=3, grid_cols=3)
        self.forecasting_engine = PatternAndForecastingEngine(history_window=25)
        self.risk_engine = CrowdRiskEngine(
            weight_density=settings.WEIGHT_DENSITY,
            weight_growth=settings.WEIGHT_GROWTH,
            weight_motion_anomaly=settings.WEIGHT_MOTION_ANOMALY,
            weight_congestion=settings.WEIGHT_CONGESTION,
        )

        # Thread-safe processed outputs
        self._telemetry_lock = threading.Lock()
        self._latest_telemetry: Optional[Dict[str, Any]] = None
        self._latest_jpeg: Optional[bytes] = None
        self._latest_seq: int = 0
        self._processing_fps: float = 0.0
        self._last_inference_timestamp: float = 0.0

        # Reconnection accounting
        self._retry_count: int = 0
        self._next_retry_delay_sec: float = 0.0

    @property
    def state(self) -> str:
        with self._state_lock:
            return self._state

    @property
    def is_active(self) -> bool:
        with self._state_lock:
            return self._state in (
                CameraState.CONNECTING,
                CameraState.CONNECTED,
                CameraState.DEGRADED,
                CameraState.RECONNECTING
            )

    def _set_state(self, new_state: str, error_msg: Optional[str] = None):
        with self._state_lock:
            self._state = new_state
            self._error_message = error_msg
            if new_state in (CameraState.IDLE, CameraState.DISCONNECTED, CameraState.ERROR):
                self._measured_fps = 0.0
                self._processing_fps = 0.0

    def start(self):
        """Starts the capture and inference threads for this camera session."""
        with self._lock:
            if self.is_active:
                logger.info(f"Camera session {self.camera_id} is already active.")
                return

            self._stop_event.clear()
            self._retry_interrupt_event.clear()
            self._retry_count = 0
            self._next_retry_delay_sec = 0.0
            self._consecutive_failures = 0
            self._consecutive_successes = 0
            self._set_state(CameraState.CONNECTING, "Initializing camera stream...")
            self._started_at = time.time()

            # Launch capture worker
            self._capture_thread = threading.Thread(
                target=self._capture_worker,
                name=f"CaptureWorker-{self.camera_id[:8]}",
                daemon=True
            )
            self._capture_thread.start()

            # Launch isolated inference worker
            self._inference_thread = threading.Thread(
                target=self._inference_worker,
                name=f"InferenceWorker-{self.camera_id[:8]}",
                daemon=True
            )
            self._inference_thread.start()
            logger.info(f"Started camera session {self.camera_id} ({self.config.name}).")

    def stop(self):
        """Gracefully stops capture and inference workers, releasing handles."""
        with self._lock:
            if self.state in (CameraState.IDLE, CameraState.STOPPING):
                return
            self._set_state(CameraState.STOPPING, "Stopping camera session...")
            self._stop_event.set()
            self._retry_interrupt_event.set()

            with self._frame_available:
                self._frame_available.notify_all()

            if self._capture_thread and self._capture_thread.is_alive():
                self._capture_thread.join(timeout=2.0)
                self._capture_thread = None

            if self._inference_thread and self._inference_thread.is_alive():
                self._inference_thread.join(timeout=2.0)
                self._inference_thread = None

            self._release_capture()
            self._set_state(CameraState.IDLE, None)
            logger.info(f"Stopped camera session {self.camera_id}.")

    def trigger_retry(self):
        """Manually interrupts backoff delay to trigger an immediate reconnect attempt."""
        with self._lock:
            if self.state in (CameraState.RECONNECTING, CameraState.DISCONNECTED, CameraState.ERROR):
                logger.info(f"Triggering immediate retry for camera {self.camera_id}.")
                self._retry_count = 0
                self._next_retry_delay_sec = 0.0
                self._retry_interrupt_event.set()
                if self.state in (CameraState.DISCONNECTED, CameraState.ERROR):
                    self.start()

    def _release_capture(self):
        if self._cap is not None:
            try:
                self._cap.release()
            except Exception as e:
                logger.warning(f"Error releasing VideoCapture on camera {self.camera_id}: {e}")
            finally:
                self._cap = None

    def _capture_worker(self):
        """Per-camera acquisition worker supporting hardware webcam or RTSP feeds."""
        if self.config.source_type == CameraSourceType.WEBCAM:
            self._webcam_capture_loop()
        else:
            self._rtsp_capture_loop()

    def _webcam_capture_loop(self):
        device_idx = self.config.device_index
        interval = 1.0 / self.config.target_fps
        fps_calc_start = time.time()
        fps_frame_counter = 0

        try:
            backend_api = cv2.CAP_DSHOW if os.name == 'nt' else cv2.CAP_ANY
            cap = cv2.VideoCapture(device_idx, backend_api)
            if not cap.isOpened():
                raise RuntimeError(f"Unable to access local webcam device index {device_idx}.")

            cap.set(cv2.CAP_PROP_FPS, self.config.target_fps)
            self._cap = cap
            self._set_state(CameraState.CONNECTED, None)
            logger.info(f"Webcam session {self.camera_id} connected on device index {device_idx}.")

            while not self._stop_event.is_set():
                cycle_start = time.time()
                ret, frame = cap.read()
                if not ret or frame is None or frame.size == 0:
                    self._consecutive_failures += 1
                    if self._consecutive_failures >= self.MAX_CONSECUTIVE_FAILURES:
                        self._set_state(CameraState.DISCONNECTED, "Webcam disconnected or failed to read frames.")
                        break
                    elif self._consecutive_failures >= self.DEGRADED_THRESHOLD:
                        self._set_state(CameraState.DEGRADED, f"Webcam unstable ({self._consecutive_failures} dropped frames).")
                    time.sleep(min(0.2, interval))
                    continue

                now = time.time()
                self._consecutive_failures = 0
                if self.state != CameraState.CONNECTED:
                    self._set_state(CameraState.CONNECTED, None)

                self._record_frame(frame, now)
                fps_frame_counter += 1
                fps_elapsed = now - fps_calc_start
                if fps_elapsed >= 1.0:
                    with self._frame_lock:
                        self._measured_fps = fps_frame_counter / fps_elapsed
                    fps_calc_start = now
                    fps_frame_counter = 0

                sleep_time = interval - (time.time() - cycle_start)
                if sleep_time > 0.001:
                    time.sleep(sleep_time)

        except Exception as e:
            err = f"Webcam capture error on camera {self.camera_id}: {e}"
            logger.warning(err)
            self._set_state(CameraState.ERROR, err)
        finally:
            self._release_capture()
            if not self._stop_event.is_set() and self.state not in (CameraState.DISCONNECTED, CameraState.ERROR):
                self._set_state(CameraState.DISCONNECTED, "Webcam stream stopped.")

    def _rtsp_capture_loop(self):
        auth_url = build_authenticated_rtsp_url(
            self.config.rtsp_url or "",
            self.config.username,
            self.config.password
        )
        interval = 1.0 / self.config.target_fps
        timeout_us = int(self.config.timeout_seconds * 1_000_000)
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = f"rtsp_transport;tcp|stimeout;{timeout_us}|max_delay;500000"

        fps_calc_start = time.time()
        fps_frame_counter = 0

        while not self._stop_event.is_set():
            self._set_state(
                CameraState.RECONNECTING if self._retry_count > 0 else CameraState.CONNECTING,
                f"Connecting to {self.config.sanitized_url}..." if self._retry_count == 0 else f"Reconnecting (Attempt {self._retry_count}/{self.config.max_retries})..."
            )

            try:
                cap = cv2.VideoCapture(auth_url, cv2.CAP_FFMPEG)
                try:
                    cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, int(self.config.timeout_seconds * 1000))
                    cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, int(self.config.timeout_seconds * 1000))
                except Exception:
                    pass

                if not cap.isOpened():
                    raise ConnectionError(f"Failed to open RTSP stream at {self.config.sanitized_url}.")

                ret, frame = cap.read()
                if not ret or frame is None or frame.size == 0:
                    raise ConnectionError(f"RTSP stream opened at {self.config.sanitized_url} but returned no initial frame.")

                self._cap = cap
                self._set_state(CameraState.CONNECTED, None)
                self._consecutive_failures = 0
                self._consecutive_successes = 1
                now = time.time()
                last_frame_rx_time = now
                self._record_frame(frame, now)

                while not self._stop_event.is_set():
                    cycle_start = time.time()
                    ret, frame = cap.read()

                    if not ret or frame is None or frame.size == 0:
                        self._consecutive_failures += 1
                        time_since_last_frame = time.time() - last_frame_rx_time
                        if self._consecutive_failures >= self.MAX_CONSECUTIVE_FAILURES or time_since_last_frame >= self.STALL_TIMEOUT_SEC:
                            err_msg = f"RTSP stream stalled or disconnected (no frames for {time_since_last_frame:.1f}s)."
                            self._set_state(CameraState.DEGRADED, err_msg)
                            break
                        elif self._consecutive_failures >= self.DEGRADED_THRESHOLD:
                            self._set_state(CameraState.DEGRADED, f"Transient network jitter: {self._consecutive_failures} dropped frames.")
                        time.sleep(min(0.2, interval))
                        continue

                    now = time.time()
                    last_frame_rx_time = now
                    self._consecutive_failures = 0
                    self._consecutive_successes += 1

                    if self._consecutive_successes >= 15 and self._retry_count > 0:
                        self._retry_count = 0

                    if self.state != CameraState.CONNECTED:
                        self._set_state(CameraState.CONNECTED, None)

                    self._record_frame(frame, now)
                    fps_frame_counter += 1
                    fps_elapsed = now - fps_calc_start
                    if fps_elapsed >= 1.0:
                        with self._frame_lock:
                            self._measured_fps = fps_frame_counter / fps_elapsed
                        fps_calc_start = now
                        fps_frame_counter = 0

                    sleep_time = interval - (time.time() - cycle_start)
                    if sleep_time > 0.001:
                        time.sleep(sleep_time)

            except Exception as e:
                err = f"RTSP connection error on {self.config.sanitized_url}: {e}"
                logger.warning(err)
                self._error_message = err
            finally:
                self._release_capture()

            if self._stop_event.is_set():
                break

            if self._retry_count >= self.config.max_retries:
                err = f"RTSP stream at {self.config.sanitized_url} disconnected. Exceeded maximum retry attempts ({self.config.max_retries})."
                logger.error(err)
                self._set_state(CameraState.DISCONNECTED, err)
                break

            self._retry_count += 1
            base_backoff = min(16.0, 1.0 * (2 ** (self._retry_count - 1)))
            jitter = random.uniform(-0.2, 0.2) * base_backoff
            delay = max(0.5, round(base_backoff + jitter, 2))
            self._next_retry_delay_sec = delay
            reconnect_msg = f"Stream interrupted. Retrying in {delay:.1f}s (Attempt {self._retry_count}/{self.config.max_retries})..."
            self._set_state(CameraState.RECONNECTING, reconnect_msg)

            self._retry_interrupt_event.clear()
            interrupted = self._retry_interrupt_event.wait(timeout=delay)
            if self._stop_event.is_set():
                break
            if interrupted:
                logger.info(f"Manual retry interrupted backoff for camera {self.camera_id}.")

        if not self._stop_event.is_set() and self.state not in (CameraState.DISCONNECTED, CameraState.ERROR):
            self._set_state(CameraState.DISCONNECTED, "RTSP stream session ended.")

    def _record_frame(self, frame: np.ndarray, timestamp_sec: float):
        with self._frame_lock:
            if self._latest_raw_frame is not None:
                self._frames_dropped += 1
            self._latest_raw_frame = frame
            self._latest_frame_id += 1
            self._latest_frame_timestamp = timestamp_sec
            self._frames_captured += 1
            self._frame_available.notify_all()

    def get_latest_raw_frame(self, timeout: float = 0.5) -> Optional[Tuple[int, float, np.ndarray]]:
        with self._frame_lock:
            if self._latest_raw_frame is None:
                if timeout > 0:
                    self._frame_available.wait(timeout=timeout)
                if self._latest_raw_frame is None:
                    return None
            frame = self._latest_raw_frame.copy()
            fid = self._latest_frame_id
            ts = self._latest_frame_timestamp
            self._frames_consumed += 1
            return fid, ts, frame

    def _inference_worker(self):
        """Camera-specific inference loop executing isolated tracking, DIP, and risk calculations."""
        prev_gray = None
        last_time = time.time()
        fps_start = time.time()
        fps_counter = 0

        while not self._stop_event.is_set():
            frame_data = self.get_latest_raw_frame(timeout=0.2)
            if frame_data is None:
                time.sleep(0.01)
                continue

            frame_id, timestamp_sec, frame_bgr = frame_data
            h, w = frame_bgr.shape[:2]
            width, height = w, h
            now_t = time.time()
            sample_interval = max(0.01, now_t - last_time)
            last_time = now_t

            try:
                # 1. DIP Preprocessing & Edge-Preserving Denoise
                frame_clean = DIPProcessor.preprocess_frame(frame_bgr, apply_denoise=True)

                # 2. Gunnar Farneback Dense Optical Flow & Directional Shannon Entropy
                curr_gray = cv2.cvtColor(frame_clean, cv2.COLOR_BGR2GRAY)
                curr_gray_small = cv2.resize(curr_gray, (320, 240))
                flow_data = DIPProcessor.compute_optical_flow_dynamics(prev_gray, curr_gray_small)
                prev_gray = curr_gray_small

                flow_mag = flow_data["mean_magnitude"]
                flow_entropy = flow_data["directional_entropy"]
                motion_var = flow_data["motion_variance"]

                # 3. Detection: run person inference (thread-safe shared detector)
                if self._shared_detector is not None:
                    raw_detections = self._shared_detector.detect_persons(
                        frame=frame_clean,
                        imgsz=self.config.inference_size,
                        conf_threshold=self.config.conf_threshold
                    )
                else:
                    raw_detections = []

                # 4. Tracking: per-camera isolated ByteTracker (Confirmed Tracks State Machine)
                active_tracks = self.tracker.update(raw_detections, timestamp_sec, width, height)
                confirmed_detections = [
                    {
                        "bbox": t["bbox"],
                        "confidence": t.get("confidence", 1.0),
                        "class_id": 0,
                        "class_name": "person"
                    }
                    for t in active_tracks
                ]
                person_count = len(active_tracks)

                speeds = [t["speed"] for t in active_tracks]
                accels = [t["acceleration"] for t in active_tracks]
                mean_speed = float(np.mean(speeds)) if speeds else 0.0
                mean_accel = float(np.mean(accels)) if accels else 0.0

                # 5. Spatial 3x3 Quadrant Inflow/Outflow Telemetry (Confirmed Persons Only)
                grid_cells = self.density_service.compute_zone_telemetry(
                    width, height, confirmed_detections, active_tracks, flow_data, self.config.perspective_weight
                )
                grid_densities = [c["normalized_density"] for c in grid_cells]

                # 6. Crowd Pattern Recognition
                pattern_data = self.forecasting_engine.detect_crowd_patterns(
                    active_tracks, grid_cells, flow_entropy, mean_speed, person_count
                )
                detected_pattern = pattern_data["pattern"]

                # 7. Heuristic Explainable Risk Index
                risk_data = self.risk_engine.compute_risk(
                    current_count=person_count,
                    optical_flow_mag=flow_mag,
                    mean_speed=mean_speed,
                    grid_densities=grid_densities,
                )

                # 8. Multi-Horizon Risk Forecast (+5s, +10s, +15s)
                forecast_data = self.forecasting_engine.compute_short_term_forecast(
                    current_risk=risk_data["smoothed_score"],
                    current_density_comp=risk_data["density_comp"],
                    current_entropy=flow_entropy,
                    current_speed=mean_speed,
                    detected_pattern=detected_pattern,
                    sample_interval_sec=sample_interval,
                )

                # 9. Perspective Density Heatmap Splatting (Confirmed Persons Only)
                heatmap_overlay = DIPProcessor.generate_density_heatmap(
                    (height, width),
                    confirmed_detections,
                    kernel_size=61,
                    sigma_base=14.0,
                    perspective_weight=self.config.perspective_weight,
                )
                annotated_frame = DIPProcessor.blend_heatmap_on_frame(frame_clean, heatmap_overlay, alpha=0.45)

                # 10. Privacy Anonymization Filter (Face Blur or Silhouette on Confirmed Persons)
                if self.config.privacy_mode != "none":
                    annotated_frame = DIPProcessor.apply_privacy_filter(
                        annotated_frame, confirmed_detections, mode=self.config.privacy_mode
                    )

                # 11. Spatial Grid Overlay
                annotated_frame = self.density_service.draw_grid_overlay(annotated_frame, grid_cells, alpha=0.22)

                # 12. Draw Confirmed Tracks & Velocity Vectors with Class & Confidence
                for trk in active_tracks:
                    bx1, by1, bx2, by2 = [int(v) for v in trk["bbox"]]
                    tid = trk["id"]
                    t_conf = trk.get("confidence", 0.0)
                    hist = trk.get("history", [])
                    if len(hist) > 1:
                        pts = np.array([(int(p[0]), int(p[1])) for p in hist], np.int32).reshape((-1, 1, 2))
                        cv2.polylines(annotated_frame, [pts], False, (0, 220, 255), 2)

                    cv2.rectangle(annotated_frame, (bx1, by1), (bx2, by2), (0, 255, 128), 2)
                    label = f"person #{tid} {t_conf:.2f} v:{trk['speed']:.1f}px/s"
                    cv2.putText(
                        annotated_frame,
                        label,
                        (bx1, max(14, by1 - 5)),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.42,
                        (0, 255, 128),
                        1,
                        cv2.LINE_AA,
                    )

                # 13. HUD Surveillance Header (include Camera Name & State)
                cv2.rectangle(annotated_frame, (0, 0), (width, 46), (10, 15, 24), -1)
                score = risk_data["smoothed_score"]
                risk_color = (
                    (34, 197, 94)
                    if score < 25
                    else (245, 158, 11)
                    if score < 50
                    else (249, 115, 22)
                    if score < 75
                    else (239, 68, 68)
                )

                hud_line1 = f"[{self.config.name}] CROWD: {person_count} | RISK: {score:.1f} ({risk_data['band']}) | +10s: {forecast_data['forecast_10s']:.1f}"
                cv2.putText(annotated_frame, hud_line1, (12, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.46, (244, 247, 250), 1, cv2.LINE_AA)

                hud_line2 = f"PATTERN: {detected_pattern} | ENTROPY: {flow_entropy:.2f} | OPT-FLOW: {flow_mag:.1f}px"
                cv2.putText(annotated_frame, hud_line2, (12, 38), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (140, 154, 170), 1, cv2.LINE_AA)

                cv2.circle(annotated_frame, (width - 20, 23), 9, risk_color, -1)

                # Encode JPEG in-memory
                success, encoded_jpeg = cv2.imencode(".jpg", annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                jpeg_bytes = encoded_jpeg.tobytes() if success else None

                # Assemble Telemetry Object
                telemetry = {
                    "camera_id": self.camera_id,
                    "camera_name": self.config.name,
                    "frame_index": frame_id,
                    "timestamp_sec": round(timestamp_sec, 3),
                    "person_count": person_count,
                    "density_component": risk_data["density_comp"],
                    "growth_component": risk_data["growth_comp"],
                    "motion_anomaly_component": risk_data["motion_anomaly_comp"],
                    "congestion_component": risk_data["congestion_comp"],
                    "raw_risk_score": risk_data["raw_score"],
                    "smoothed_risk_score": risk_data["smoothed_score"],
                    "risk_band": risk_data["band"],
                    "risk_explanation": risk_data["explanation"],
                    "forecast_risk_5s": forecast_data["forecast_5s"],
                    "forecast_risk_10s": forecast_data["forecast_10s"],
                    "forecast_risk_15s": forecast_data["forecast_15s"],
                    "forecast_confidence": forecast_data["confidence"],
                    "forecast_trend": forecast_data["trend"],
                    "active_tracks_count": len(active_tracks),
                    "mean_speed_pixels": round(mean_speed, 1),
                    "mean_acceleration": round(mean_accel, 2),
                    "optical_flow_magnitude": round(flow_mag, 2),
                    "directional_entropy": round(flow_entropy, 3),
                    "motion_variance": round(motion_var, 3),
                    "detected_pattern": detected_pattern,
                    "grid_density": grid_cells,
                    "camera_state": self.state,
                }

                # Update published state thread-safely
                fps_counter += 1
                now_t = time.time()
                elapsed = now_t - fps_start
                with self._telemetry_lock:
                    self._latest_telemetry = telemetry
                    if jpeg_bytes:
                        self._latest_jpeg = jpeg_bytes
                    self._latest_seq += 1
                    self._last_inference_timestamp = now_t
                    if elapsed >= 1.0:
                        self._processing_fps = fps_counter / elapsed
                        fps_start = now_t
                        fps_counter = 0

            except Exception as e:
                logger.exception(f"Error in inference worker on camera {self.camera_id}: {e}")

    def get_status(self) -> Dict[str, Any]:
        """Returns connection and performance metrics for this camera."""
        now = time.time()
        with self._frame_lock:
            captured = self._frames_captured
            consumed = self._frames_consumed
            dropped = self._frames_dropped
            latest_id = self._latest_frame_id
            latest_ts = self._latest_frame_timestamp
            measured_fps = round(self._measured_fps, 1)

        with self._telemetry_lock:
            proc_fps = round(self._processing_fps, 1)
            last_inf_ts = self._last_inference_timestamp
            latest_telem = self._latest_telemetry

        uptime = round(now - self._started_at, 2) if (self._started_at and self.is_active) else 0.0
        frame_age = round(now - latest_ts, 2) if latest_ts > 0 else None

        return {
            "camera_id": self.camera_id,
            "camera_name": self.config.name,
            "source_type": self.config.source_type,
            "device_index": self.config.device_index if self.config.source_type == CameraSourceType.WEBCAM else None,
            "sanitized_url": self.config.sanitized_url,
            "location": self.config.location,
            "state": self.state,
            "is_active": self.is_active,
            "frames_captured": captured,
            "frames_consumed": consumed,
            "frames_dropped": dropped,
            "latest_frame_id": latest_id,
            "latest_frame_timestamp": latest_ts,
            "frame_age_seconds": frame_age,
            "measured_fps": measured_fps,
            "processing_fps": proc_fps,
            "uptime_seconds": uptime,
            "error_message": self._error_message,
            "retry_count": self._retry_count,
            "max_retries": self.config.max_retries,
            "next_retry_delay_sec": self._next_retry_delay_sec,
            "person_count": latest_telem.get("person_count", 0) if latest_telem else 0,
            "smoothed_risk_score": latest_telem.get("smoothed_risk_score", 0.0) if latest_telem else 0.0,
            "risk_band": latest_telem.get("risk_band", "Low") if latest_telem else "Low",
        }

    def get_telemetry(self) -> Optional[Dict[str, Any]]:
        with self._telemetry_lock:
            return self._latest_telemetry.copy() if self._latest_telemetry else None

    def get_latest_jpeg_with_sequence(self) -> Tuple[int, Optional[bytes]]:
        with self._telemetry_lock:
            return self._latest_seq, self._latest_jpeg
