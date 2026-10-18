import os
import time
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
from app.services.incident_service import IncidentService

class VideoProcessor:
    """
    Coordinates frame-by-frame end-to-end processing:
    1. Decoding video via OpenCV
    2. DIP preprocessing (denoising, optical flow, frame differencing)
    3. Person Detection via YOLOv8
    4. Centroid & IoU Persistent Tracking
    5. Grid Density Mapping & Spatial Continuous Heatmap Splatting
    6. Heuristic Crowd-Risk Evaluation
    7. Incident Rule Validation & Alerting
    8. Annotated Video Composition with standard H.264/MP4 encoding
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
            print(f"[VideoProcessor] Analysis {analysis_id} not found in database.")
            return

        video = self.db.query(Video).filter(Video.id == analysis.video_id).first()
        if not video or not os.path.exists(video.file_path):
            analysis.status = "failed"
            analysis.error_message = "Source video file not found on disk."
            self.db.commit()
            return

        # Initialize Risk Engine with this analysis's weights
        risk_engine = CrowdRiskEngine(
            weight_density=analysis.weight_density,
            weight_growth=analysis.weight_growth,
            weight_motion_anomaly=analysis.weight_motion_anomaly,
            weight_congestion=analysis.weight_congestion
        )
        tracker = SimpleByteTracker(max_lost_frames=15, iou_threshold=0.3)
        incident_service = IncidentService(self.db)

        # Output video paths
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

        # Target video writer
        stride = max(1, analysis.frame_stride)
        out_fps = max(1.0, orig_fps / stride)
        fourcc = cv2.VideoWriter_fourcc(*'avc1') if os.name == 'nt' else cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(output_path, fourcc, out_fps, (width, height))
        
        # Fallback to mp4v if avc1 fails
        if not writer.isOpened():
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            writer = cv2.VideoWriter(output_path, fourcc, out_fps, (width, height))

        prev_gray = None
        frame_idx = 0
        processed_count = 0
        start_time = time.time()
        
        counts = []
        risks = []
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

                # Frame sampling / stride
                if current_frame_idx % stride != 0:
                    continue

                timestamp_sec = current_frame_idx / orig_fps

                # 1. DIP Preprocessing & Optical Flow
                curr_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                curr_gray_small = cv2.resize(curr_gray, (320, 240))
                if prev_gray is not None:
                    flow_mag, _, _ = DIPProcessor.compute_optical_flow(prev_gray, curr_gray_small)
                else:
                    flow_mag = 0.0
                prev_gray = curr_gray_small

                # 2. YOLO Person Detection
                detections = self.detection_service.detect_persons(
                    frame,
                    imgsz=analysis.inference_size
                )
                person_count = len(detections)

                # 3. Object Tracking
                active_tracks = tracker.update(detections, timestamp_sec)
                mean_speed = float(np.mean([t["speed"] for t in active_tracks])) if active_tracks else 0.0

                # 4. Grid Density
                grid_cells = self.density_service.compute_grid_density(width, height, detections)
                grid_counts = [c["count"] for c in grid_cells]

                # 5. Risk Calculation
                risk_data = risk_engine.compute_risk(
                    current_count=person_count,
                    optical_flow_mag=flow_mag,
                    mean_speed=mean_speed,
                    grid_densities=grid_counts
                )

                counts.append(person_count)
                risks.append(risk_data["smoothed_score"])
                if risk_data["smoothed_score"] >= 50.0:
                    high_risk_frames += 1

                # 6. Generate Density Heatmap (DIP continuous Gaussian splatting)
                heatmap_overlay = DIPProcessor.generate_density_heatmap((height, width), detections)
                annotated_frame = DIPProcessor.blend_heatmap_on_frame(frame, heatmap_overlay, alpha=0.45)

                # Draw grid lines & annotations
                annotated_frame = self.density_service.draw_grid_overlay(annotated_frame, grid_cells, alpha=0.20)

                # Draw Bounding Boxes and Track Tails
                for trk in active_tracks:
                    bx1, by1, bx2, by2 = trk["bbox"]
                    tid = trk["id"]
                    # Draw trajectory tail
                    hist = trk.get("history", [])
                    if len(hist) > 1:
                        pts = np.array([(int(p[0]), int(p[1])) for p in hist], np.int32).reshape((-1, 1, 2))
                        cv2.polylines(annotated_frame, [pts], False, (0, 220, 255), 2)

                    # Bounding box
                    cv2.rectangle(annotated_frame, (bx1, by1), (bx2, by2), (0, 255, 128), 2)
                    label = f"ID:{tid} {trk.get('confidence', 0):.2f}"
                    cv2.putText(annotated_frame, label, (bx1, max(15, by1 - 6)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 128), 1, cv2.LINE_AA)

                # Draw HUD Status bar on top
                hud_bg = (15, 20, 30)
                cv2.rectangle(annotated_frame, (0, 0), (width, 42), hud_bg, -1)
                
                # Risk color tag
                score = risk_data["smoothed_score"]
                risk_color = (0, 220, 0) if score < 25 else (0, 215, 255) if score < 50 else (0, 140, 255) if score < 75 else (0, 0, 255)
                hud_text = f"CROWD: {person_count} | TRACKS: {len(active_tracks)} | RISK: {score:.1f} ({risk_data['band']}) | OPT-FLOW: {flow_mag:.1f}px"
                cv2.putText(annotated_frame, hud_text, (15, 27), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2, cv2.LINE_AA)
                cv2.circle(annotated_frame, (width - 25, 21), 10, risk_color, -1)

                writer.write(annotated_frame)

                # Save sample evidence frame if critical or first frame for thumbnail
                evidence_path = None
                if not first_heatmap_saved:
                    thumb_name = f"{analysis.id}_preview.jpg"
                    thumb_full = os.path.join(settings.PROCESSED_DIR, thumb_name)
                    cv2.imwrite(thumb_full, annotated_frame)
                    analysis.heatmap_preview_path = f"/data/processed/{thumb_name}"
                    first_heatmap_saved = True

                if risk_data["smoothed_score"] >= 50.0:
                    ev_name = f"ev_{analysis.id}_{current_frame_idx}.jpg"
                    ev_path = os.path.join(settings.PROCESSED_DIR, ev_name)
                    cv2.imwrite(ev_path, annotated_frame)
                    evidence_path = f"/data/processed/{ev_name}"

                # 7. Check Incidents
                incident_service.check_and_create_incidents(
                    analysis_id=analysis.id,
                    frame_idx=current_frame_idx,
                    timestamp_sec=timestamp_sec,
                    risk_data=risk_data,
                    current_count=person_count,
                    grid_cells=grid_cells,
                    evidence_frame_path=evidence_path
                )

                # 8. Store Frame Record in DB
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
                    active_tracks_count=len(active_tracks),
                    mean_speed_pixels=round(mean_speed, 2),
                    optical_flow_magnitude=round(flow_mag, 2),
                    grid_density=[{"name": c["name"], "count": c["count"]} for c in grid_cells]
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
                            "risk_band": risk_data["band"]
                        })

            # Completed
            if not cancel_event.is_set():
                analysis.status = "completed"
                analysis.progress_percent = 100.0
            
            # Compute Final Aggregated Summary
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
            analysis.status = "failed"
            analysis.error_message = str(e)
            self.db.commit()
            print(f"[VideoProcessor] Exception during processing: {e}")
        finally:
            cap.release()
            writer.release()
