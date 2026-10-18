import time
import threading
import logging
from typing import Optional, Dict, Any, List
import cv2
import numpy as np

from app.core.config import settings
from app.services.camera_service import camera_ingestion_service, CameraState
from app.services.detection_service import DetectionService
from app.services.tracking_service import SimpleByteTracker
from app.services.density_service import DensityService
from app.services.risk_engine import CrowdRiskEngine
from app.services.dip_service import DIPProcessor
from app.services.forecasting_service import PatternAndForecastingEngine

logger = logging.getLogger("crowdguard.live_pipeline")


class LivePipelineProcessor:
    """
    Incremental frame-by-frame live pipeline runner that consumes from CameraIngestionService,
    executing the identical DIP + CV + Heuristic Risk pipeline without writing raw files to disk.
    Maintains thread-safe latest telemetry and latest JPEG snapshot.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._worker_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

        # Pipeline configuration
        self.conf_threshold: float = settings.DEFAULT_CONF_THRESHOLD
        self.inference_size: int = settings.DEFAULT_INFERENCE_SIZE
        self.perspective_weight: float = 1.0
        self.privacy_mode: str = settings.DEFAULT_PRIVACY_MODE
        self.weight_density: float = settings.WEIGHT_DENSITY
        self.weight_growth: float = settings.WEIGHT_GROWTH
        self.weight_motion_anomaly: float = settings.WEIGHT_MOTION_ANOMALY
        self.weight_congestion: float = settings.WEIGHT_CONGESTION

        # Reusable service instances
        self.detection_service = DetectionService()
        self.density_service = DensityService(grid_rows=3, grid_cols=3)
        self.tracker: Optional[SimpleByteTracker] = None
        self.forecasting_engine: Optional[PatternAndForecastingEngine] = None
        self.risk_engine: Optional[CrowdRiskEngine] = None

        # Thread-safe live outputs
        self._telemetry_lock = threading.Lock()
        self._latest_telemetry: Optional[Dict[str, Any]] = None
        self._latest_jpeg: Optional[bytes] = None
        self._frames_processed_count: int = 0
        self._processing_fps: float = 0.0

    def start(
        self,
        conf_threshold: float = 0.25,
        inference_size: int = 640,
        perspective_weight: float = 1.0,
        privacy_mode: str = "none",
        weight_density: float = 0.35,
        weight_growth: float = 0.20,
        weight_motion_anomaly: float = 0.25,
        weight_congestion: float = 0.20,
    ):
        with self._lock:
            if self._worker_thread and self._worker_thread.is_alive():
                logger.info("Live pipeline worker already running.")
                return

            self.conf_threshold = conf_threshold
            self.inference_size = inference_size
            self.perspective_weight = perspective_weight
            self.privacy_mode = privacy_mode
            self.weight_density = weight_density
            self.weight_growth = weight_growth
            self.weight_motion_anomaly = weight_motion_anomaly
            self.weight_congestion = weight_congestion

            # Re-initialize stateful tracking and risk engines
            self.tracker = SimpleByteTracker(max_lost_frames=15, iou_threshold=0.3)
            self.forecasting_engine = PatternAndForecastingEngine(history_window=25)
            self.risk_engine = CrowdRiskEngine(
                weight_density=self.weight_density,
                weight_growth=self.weight_growth,
                weight_motion_anomaly=self.weight_motion_anomaly,
                weight_congestion=self.weight_congestion,
            )

            with self._telemetry_lock:
                self._latest_telemetry = None
                self._latest_jpeg = None
                self._frames_processed_count = 0
                self._processing_fps = 0.0

            self._stop_event.clear()
            self._worker_thread = threading.Thread(
                target=self._processing_loop,
                name="LivePipelineWorker",
                daemon=True,
            )
            self._worker_thread.start()
            logger.info("Live pipeline worker thread started.")

    def stop(self):
        with self._lock:
            self._stop_event.set()
            if self._worker_thread and self._worker_thread.is_alive():
                self._worker_thread.join(timeout=2.0)
                self._worker_thread = None
            logger.info("Live pipeline worker thread stopped.")

    def get_latest_telemetry(self) -> Optional[Dict[str, Any]]:
        with self._telemetry_lock:
            if self._latest_telemetry is None:
                return None
            return dict(self._latest_telemetry)

    def get_latest_jpeg(self) -> Optional[bytes]:
        with self._telemetry_lock:
            return self._latest_jpeg

    def get_processing_stats(self) -> Dict[str, Any]:
        with self._telemetry_lock:
            return {
                "frames_processed": self._frames_processed_count,
                "processing_fps": round(self._processing_fps, 1),
                "is_running": self._worker_thread is not None and self._worker_thread.is_alive(),
            }

    def _processing_loop(self):
        prev_gray = None
        fps_start = time.time()
        fps_counter = 0
        last_timestamp_sec = 0.0

        while not self._stop_event.is_set():
            # Wait for the next unconsumed frame from CameraIngestionService
            frame_data = camera_ingestion_service.get_latest_frame(timeout=0.25)
            if frame_data is None:
                continue

            frame_id, timestamp_sec, frame = frame_data
            if frame is None or frame.size == 0:
                continue

            sample_interval = max(0.02, timestamp_sec - last_timestamp_sec) if last_timestamp_sec > 0 else 0.04
            last_timestamp_sec = timestamp_sec
            height, width = frame.shape[:2]

            try:
                # 1. DIP Preprocessing & Edge-Preserving Denoise
                frame_clean = DIPProcessor.preprocess_frame(frame, apply_denoise=True)

                # 2. Gunnar Farneback Dense Optical Flow & Directional Shannon Entropy
                curr_gray = cv2.cvtColor(frame_clean, cv2.COLOR_BGR2GRAY)
                curr_gray_small = cv2.resize(curr_gray, (320, 240))
                flow_data = DIPProcessor.compute_optical_flow_dynamics(prev_gray, curr_gray_small)
                prev_gray = curr_gray_small

                flow_mag = flow_data["mean_magnitude"]
                flow_entropy = flow_data["directional_entropy"]
                motion_var = flow_data["motion_variance"]

                # 3. YOLOv8 Person Detection (Class 0 strict filter)
                detections = self.detection_service.detect_persons(
                    frame_clean, imgsz=self.inference_size
                )
                person_count = len(detections)

                # 4. Multi-Object ByteTrack
                active_tracks = self.tracker.update(detections, timestamp_sec, width, height)
                speeds = [t["speed"] for t in active_tracks]
                accels = [t["acceleration"] for t in active_tracks]
                mean_speed = float(np.mean(speeds)) if speeds else 0.0
                mean_accel = float(np.mean(accels)) if accels else 0.0

                # 5. Spatial 3x3 Quadrant Inflow/Outflow Telemetry
                grid_cells = self.density_service.compute_zone_telemetry(
                    width, height, detections, active_tracks, flow_data, self.perspective_weight
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

                # 9. Perspective Density Heatmap Splatting
                heatmap_overlay = DIPProcessor.generate_density_heatmap(
                    (height, width),
                    detections,
                    kernel_size=61,
                    sigma_base=14.0,
                    perspective_weight=self.perspective_weight,
                )
                annotated_frame = DIPProcessor.blend_heatmap_on_frame(frame_clean, heatmap_overlay, alpha=0.45)

                # 10. Privacy Anonymization Filter (Face Blur or Silhouette)
                annotated_frame = DIPProcessor.apply_privacy_filter(
                    annotated_frame, detections, mode=self.privacy_mode
                )

                # 11. Spatial Grid Overlay
                annotated_frame = self.density_service.draw_grid_overlay(annotated_frame, grid_cells, alpha=0.22)

                # 12. Draw Tracks & Velocity Vectors
                for trk in active_tracks:
                    bx1, by1, bx2, by2 = [int(v) for v in trk["bbox"]]
                    tid = trk["id"]
                    hist = trk.get("history", [])
                    if len(hist) > 1:
                        pts = np.array([(int(p[0]), int(p[1])) for p in hist], np.int32).reshape((-1, 1, 2))
                        cv2.polylines(annotated_frame, [pts], False, (0, 220, 255), 2)

                    cv2.rectangle(annotated_frame, (bx1, by1), (bx2, by2), (0, 255, 128), 2)
                    label = f"ID:{tid} v:{trk['speed']:.1f}px/s"
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

                # 13. HUD Surveillance Header
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

                hud_line1 = f"LIVE CROWD: {person_count} | RISK: {score:.1f} ({risk_data['band']}) | FORECAST +10s: {forecast_data['forecast_10s']:.1f} ({forecast_data['trend']})"
                cv2.putText(annotated_frame, hud_line1, (12, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (244, 247, 250), 1, cv2.LINE_AA)

                hud_line2 = f"PATTERN: {detected_pattern} | ENTROPY: {flow_entropy:.2f} | OPT-FLOW: {flow_mag:.1f}px | LIVE STREAM"
                cv2.putText(annotated_frame, hud_line2, (12, 38), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (140, 154, 170), 1, cv2.LINE_AA)

                cv2.circle(annotated_frame, (width - 20, 23), 9, risk_color, -1)

                # Encode JPEG in-memory
                success, encoded_jpeg = cv2.imencode(".jpg", annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                jpeg_bytes = encoded_jpeg.tobytes() if success else None

                # Assemble Telemetry Object
                telemetry = {
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
                    "camera_state": camera_ingestion_service.state,
                }

                # Update published state thread-safely
                fps_counter += 1
                now = time.time()
                elapsed = now - fps_start
                with self._telemetry_lock:
                    self._latest_telemetry = telemetry
                    if jpeg_bytes:
                        self._latest_jpeg = jpeg_bytes
                    self._frames_processed_count += 1
                    if elapsed >= 1.0:
                        self._processing_fps = fps_counter / elapsed
                        fps_start = now
                        fps_counter = 0

            except Exception as e:
                logger.exception(f"Error in live pipeline processing frame {frame_id}: {e}")


# Global singleton instance for live processing
live_pipeline_processor = LivePipelineProcessor()
