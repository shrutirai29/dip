import os
import time
import datetime
import cv2
import numpy as np
import threading
from typing import Dict, Any, Callable
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entities import Video, Analysis, FrameRecord
from app.services.detection_service import DetectionService
from app.services.tracking_service import SimpleByteTracker
from app.services.density_service import DensityService
from app.services.risk_engine import CrowdRiskEngine
from app.services.dip_service import DIPProcessor
from app.services.forecasting_service import PatternAndForecastingEngine
from app.services.incident_service import IncidentService

class VideoProcessor:
    """
    Complete Upgraded Computer Vision & DIP Video Processing Pipeline:
    1. Video Decoding & Preprocessing (Dual-stage bilateral noise reduction)
    2. Temporal Frame Differencing (Motion thresholding & morphological noise cleanup)
    3. YOLOv8 Person Detection (Class 0 strict filter, CPU/CUDA device auto-selection)
    4. Multi-Object ByteTracker (Foot points, velocity px/s, acceleration, zone transitions)
    5. Farneback Dense Optical Flow (Mean magnitude, variance, and directional Shannon entropy)
    6. Perspective-Aware 2D Continuous Gaussian Density Splatting (Y-axis perspective normalization)
    7. Intelligent 3x3 Spatial Quadrant Telemetry (Population, density, inflow/outflow)
    8. Pattern Detection (Normal flow, counterflow, convergence, divergence, bottleneck, surge)
    9. Heuristic Risk Scoring (0-100 explainable index with EMA temporal smoothing)
    10. Short-term Risk Forecasting (+5s, +10s, +15s horizons with statistical gradient fit)
    11. Sustained Event Incident Triggering with Actionable Operator Advisories
    12. Privacy Preserving Surveillance Mode (Face blurring or solid anonymization)
    13. Real-time H.264 Annotated Video Composition & Evidence Keyframe Capture
    """

    def __init__(self, db: Session, detection_service: DetectionService = None):
        self.db = db
        self.detection_service = detection_service or DetectionService()
        self.density_service = DensityService(grid_rows=3, grid_cols=3)

    def process_analysis_job(
        self,
        analysis_id: str,
        cancel_event: threading.Event,
        pause_event: threading.Event,
        progress_callback: Callable[[Dict[str, Any]], None] = None
    ):
        analysis = self.db.query(Analysis).filter(Analysis.id == analysis_id).first()
        if not analysis:
            print(f"[VideoProcessor] Analysis {analysis_id} not found.")
            return

        video = self.db.query(Video).filter(Video.id == analysis.video_id).first()
        if not video or not os.path.exists(video.file_path):
            analysis.status = "failed"
            analysis.error_message = "Source video file not found on disk."
            self.db.commit()
            return

        risk_engine = CrowdRiskEngine(
            weight_density=analysis.weight_density,
            weight_growth=analysis.weight_growth,
            weight_motion_anomaly=analysis.weight_motion_anomaly,
            weight_congestion=analysis.weight_congestion
        )
        tracker = SimpleByteTracker(max_lost_frames=15, iou_threshold=0.3)
        forecasting_engine = PatternAndForecastingEngine(history_window=25)
        incident_service = IncidentService(self.db, sustenance_frames=2, cooldown_sec=4.0)

        output_filename = f"{analysis.id}_annotated.mp4"
        output_path = os.path.join(settings.PROCESSED_DIR, output_filename)
        analysis.annotated_video_path = f"/data/processed/{output_filename}"
        analysis.status = "processing"
        self.db.commit()

        cap = cv2.VideoCapture(video.file_path)
        if not cap.isOpened():
            analysis.status = "failed"
            analysis.error_message = "Failed to open video codec with OpenCV."
            self.db.commit()
            return

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        orig_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        analysis.total_frames = total_frames
        self.db.commit()

        stride = max(1, analysis.frame_stride)
        out_fps = max(1.0, orig_fps / stride)
        # Universal MP4 encoding
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(output_path, fourcc, out_fps, (width, height))
        if not writer.isOpened():
            fourcc = cv2.VideoWriter_fourcc(*'XVID')
            writer = cv2.VideoWriter(output_path, fourcc, out_fps, (width, height))

        prev_gray = None
        frame_idx = 0
        processed_count = 0
        start_time = time.time()
        
        counts = []
        risks = []
        pattern_votes: Dict[str, int] = {}
        high_risk_frames = 0
        first_heatmap_saved = False

        try:
            while cap.isOpened():
                if cancel_event.is_set():
                    analysis.status = "cancelled"
                    break

                while pause_event.is_set():
                    time.sleep(0.5)
                    if cancel_event.is_set():
                        break

                ret, frame = cap.read()
                if not ret:
                    break

                current_frame_idx = frame_idx
                frame_idx += 1

                if current_frame_idx % stride != 0:
                    continue

                timestamp_sec = current_frame_idx / orig_fps

                # 1. DIP Preprocessing & Filtering
                frame_clean = DIPProcessor.preprocess_frame(frame, apply_denoise=True)

                # 2. Dense Optical Flow & Directional Shannon Entropy
                curr_gray = cv2.cvtColor(frame_clean, cv2.COLOR_BGR2GRAY)
                curr_gray_small = cv2.resize(curr_gray, (320, 240))
                flow_data = DIPProcessor.compute_optical_flow_dynamics(prev_gray, curr_gray_small)
                prev_gray = curr_gray_small

                flow_mag = flow_data["mean_magnitude"]
                flow_entropy = flow_data["directional_entropy"]
                motion_var = flow_data["motion_variance"]

                # 3. YOLO Person Detection
                detections = self.detection_service.detect_persons(
                    frame_clean,
                    imgsz=analysis.inference_size
                )
                person_count = len(detections)

                # 4. Object Tracking
                active_tracks = tracker.update(detections, timestamp_sec, width, height)
                speeds = [t["speed"] for t in active_tracks]
                accels = [t["acceleration"] for t in active_tracks]
                mean_speed = float(np.mean(speeds)) if speeds else 0.0
                mean_accel = float(np.mean(accels)) if accels else 0.0

                # 5. Intelligent 3x3 Spatial Quadrant Telemetry
                grid_cells = self.density_service.compute_zone_telemetry(
                    width, height, detections, active_tracks, flow_data, analysis.perspective_weight
                )
                grid_densities = [c["normalized_density"] for c in grid_cells]

                # 6. Crowd Pattern Recognition
                pattern_data = forecasting_engine.detect_crowd_patterns(
                    active_tracks, grid_cells, flow_entropy, mean_speed, person_count
                )
                detected_pattern = pattern_data["pattern"]
                pattern_votes[detected_pattern] = pattern_votes.get(detected_pattern, 0) + 1

                # 7. Explainable Heuristic Risk Index
                risk_data = risk_engine.compute_risk(
                    current_count=person_count,
                    optical_flow_mag=flow_mag,
                    mean_speed=mean_speed,
                    grid_densities=grid_densities
                )

                # 8. Multivariate Short-Term Risk Forecast (+5s, +10s, +15s)
                forecast_data = forecasting_engine.compute_short_term_forecast(
                    current_risk=risk_data["smoothed_score"],
                    current_density_comp=risk_data["density_comp"],
                    current_entropy=flow_entropy,
                    current_speed=mean_speed,
                    detected_pattern=detected_pattern
                )

                counts.append(person_count)
                risks.append(risk_data["smoothed_score"])
                if risk_data["smoothed_score"] >= 50.0:
                    high_risk_frames += 1

                # 9. Perspective-Aware Continuous 2D Gaussian Density Splatting
                heatmap_overlay = DIPProcessor.generate_density_heatmap(
                    (height, width), detections, kernel_size=61, sigma_base=14.0, perspective_weight=analysis.perspective_weight
                )
                annotated_frame = DIPProcessor.blend_heatmap_on_frame(frame_clean, heatmap_overlay, alpha=0.45)

                # 10. Privacy Anonymization Filter (if configured)
                annotated_frame = DIPProcessor.apply_privacy_filter(annotated_frame, detections, mode=analysis.privacy_mode)

                # 11. Draw Spatial Quadrant Grid
                annotated_frame = self.density_service.draw_grid_overlay(annotated_frame, grid_cells, alpha=0.22)

                # 12. Draw Tracks & Velocity Vectors
                for trk in active_tracks:
                    bx1, by1, bx2, by2 = [int(v) for v in trk["bbox"]]
                    tid = trk["id"]
                    hist = trk.get("history", [])
                    if len(hist) > 1:
                        pts = np.array([(int(p[0]), int(p[1])) for p in hist], np.int32).reshape((-1, 1, 2))
                        cv2.polylines(annotated_frame, [pts], False, (0, 220, 255), 2)

                    # Bounding Box
                    cv2.rectangle(annotated_frame, (bx1, by1), (bx2, by2), (0, 255, 128), 2)
                    label = f"ID:{tid} v:{trk['speed']:.1f}px/s"
                    cv2.putText(annotated_frame, label, (bx1, max(14, by1 - 5)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 255, 128), 1, cv2.LINE_AA)

                # 13. HUD Surveillance Status Header
                cv2.rectangle(annotated_frame, (0, 0), (width, 46), (10, 15, 24), -1)
                score = risk_data["smoothed_score"]
                risk_color = (34, 197, 94) if score < 25 else (245, 158, 11) if score < 50 else (249, 115, 22) if score < 75 else (239, 68, 68)
                
                hud_line1 = f"CROWD: {person_count} | RISK: {score:.1f} ({risk_data['band']}) | FORECAST +10s: {forecast_data['forecast_10s']:.1f} ({forecast_data['trend']})"
                cv2.putText(annotated_frame, hud_line1, (12, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (244, 247, 250), 1, cv2.LINE_AA)
                
                hud_line2 = f"PATTERN: {detected_pattern} | ENTROPY: {flow_entropy:.2f} | OPT-FLOW: {flow_mag:.1f}px | FPS: {orig_fps:.1f}"
                cv2.putText(annotated_frame, hud_line2, (12, 38), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (140, 154, 170), 1, cv2.LINE_AA)
                
                cv2.circle(annotated_frame, (width - 20, 23), 9, risk_color, -1)

                writer.write(annotated_frame)

                # 14. Save Evidence Snapshots & Thumbnail
                evidence_path = None
                if not first_heatmap_saved:
                    thumb_name = f"{analysis.id}_preview.jpg"
                    thumb_full = os.path.join(settings.PROCESSED_DIR, thumb_name)
                    cv2.imwrite(thumb_full, annotated_frame)
                    analysis.heatmap_preview_path = f"/data/processed/{thumb_name}"
                    first_heatmap_saved = True

                if risk_data["smoothed_score"] >= 50.0 or forecast_data["forecast_10s"] >= 65.0:
                    ev_name = f"ev_{analysis.id}_{current_frame_idx}.jpg"
                    ev_path = os.path.join(settings.PROCESSED_DIR, ev_name)
                    cv2.imwrite(ev_path, annotated_frame)
                    evidence_path = f"/data/processed/{ev_name}"

                # 15. Sustained Incident Evaluation
                incident_service.check_and_create_incidents(
                    analysis_id=analysis.id,
                    frame_idx=current_frame_idx,
                    timestamp_sec=timestamp_sec,
                    risk_data=risk_data,
                    current_count=person_count,
                    grid_cells=grid_cells,
                    pattern_data=pattern_data,
                    forecast_data=forecast_data,
                    evidence_frame_path=evidence_path
                )

                # 16. Record Complete Frame Telemetry in SQLite
                record = FrameRecord(
                    analysis_id=analysis.id,
                    frame_index=current_frame_idx,
                    timestamp_sec=round(timestamp_sec, 2),
                    person_count=person_count,
                    density_component=risk_data["density_comp"],
                    growth_component=risk_data["growth_comp"],
                    motion_anomaly_component=risk_data["motion_anomaly_comp"],
                    congestion_component=risk_data["congestion_comp"],
                    raw_risk_score=risk_data["raw_score"],
                    smoothed_risk_score=risk_data["smoothed_score"],
                    risk_band=risk_data["band"],
                    risk_explanation=risk_data["explanation"],
                    forecast_risk_5s=forecast_data["forecast_5s"],
                    forecast_risk_10s=forecast_data["forecast_10s"],
                    forecast_risk_15s=forecast_data["forecast_15s"],
                    forecast_confidence=forecast_data["confidence"],
                    forecast_trend=forecast_data["trend"],
                    active_tracks_count=len(active_tracks),
                    mean_speed_pixels=round(mean_speed, 2),
                    mean_acceleration=round(mean_accel, 2),
                    optical_flow_magnitude=round(flow_mag, 2),
                    directional_entropy=round(flow_entropy, 3),
                    motion_variance=round(motion_var, 2),
                    detected_pattern=detected_pattern,
                    grid_density=[{
                        "name": c["name"],
                        "population": c["population"],
                        "normalized_density": c["normalized_density"],
                        "density_level": c["density_level"],
                        "avg_velocity": c["avg_velocity"],
                        "inflow": c["inflow"],
                        "outflow": c["outflow"],
                        "zone_risk": c["zone_risk"],
                        "pattern": c["pattern"]
                    } for c in grid_cells]
                )
                self.db.add(record)

                processed_count += 1
                progress = (current_frame_idx / max(1, total_frames)) * 100.0
                elapsed = time.time() - start_time
                curr_fps = processed_count / max(0.1, elapsed)

                if processed_count % 5 == 0:
                    analysis.progress_percent = round(progress, 1)
                    analysis.current_frame = current_frame_idx
                    analysis.processing_fps = round(curr_fps, 1)
                    self.db.commit()

                    if progress_callback:
                        progress_callback({
                            "analysis_id": analysis.id,
                            "progress": analysis.progress_percent,
                            "frame": current_frame_idx,
                            "fps": analysis.processing_fps,
                            "person_count": person_count,
                            "risk_score": risk_data["smoothed_score"],
                            "risk_band": risk_data["band"],
                            "forecast_risk": forecast_data["forecast_10s"],
                            "pattern": detected_pattern
                        })

            # Completed
            if not cancel_event.is_set():
                analysis.status = "completed"
                analysis.progress_percent = 100.0
            
            # Dominant pattern
            if pattern_votes:
                analysis.dominant_pattern = max(pattern_votes, key=pattern_votes.get)

            if counts:
                analysis.peak_count = max(counts)
                analysis.avg_count = round(float(np.mean(counts)), 2)
            if risks:
                analysis.max_risk_score = round(max(risks), 1)
                analysis.avg_risk_score = round(float(np.mean(risks)), 1)
            
            analysis.high_risk_duration_sec = round((high_risk_frames * stride) / orig_fps, 2)
            analysis.total_incidents_count = len(analysis.incidents)
            analysis.completed_at = datetime.datetime.utcnow()
            self.db.commit()

        except Exception as e:
            import traceback
            traceback.print_exc()
            analysis.status = "failed"
            analysis.error_message = str(e)
            self.db.commit()
            print(f"[VideoProcessor] Exception: {e}")
        finally:
            cap.release()
            writer.release()
