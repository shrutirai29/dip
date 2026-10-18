import os
import uuid
import threading
import cv2
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Response
from sqlalchemy.orm import Session
from typing import List

from app.database.session import get_db, SessionLocal
from app.core.config import settings
from app.models.entities import Video, Analysis, FrameRecord, Incident
from app.schemas.schemas import (
    VideoResponse, AnalysisCreate, AnalysisResponse,
    FrameRecordResponse, IncidentResponse, IncidentUpdate
)
from app.services.video_processor import VideoProcessor
from app.services.report_service import ReportService

router = APIRouter()

# Active jobs tracking: analysis_id -> { "cancel_event": Event, "pause_event": Event }
active_jobs: dict[str, dict] = {}

def run_background_analysis(analysis_id: str):
    db = SessionLocal()
    try:
        events = active_jobs.get(analysis_id, {})
        cancel_event = events.get("cancel_event", threading.Event())
        pause_event = events.get("pause_event", threading.Event())
        
        processor = VideoProcessor(db)
        processor.process_analysis_job(
            analysis_id=analysis_id,
            cancel_event=cancel_event,
            pause_event=pause_event
        )
    finally:
        db.close()
        if analysis_id in active_jobs:
            del active_jobs[analysis_id]

@router.get("/health")
def health_check():
    return {
        "status": "healthy",
        "system": "Digital Image Processing Crowd Risk System",
        "version": settings.VERSION
    }

@router.post("/videos/upload", response_model=VideoResponse)
async def upload_video(file: UploadFile = File(...), db: Session = Depends(get_db)):
    safe_filename = os.path.basename(file.filename or "video.mp4")
    ext = os.path.splitext(safe_filename)[1].lower()
    if ext not in ('.mp4', '.avi', '.mov', '.mkv'):
        raise HTTPException(status_code=400, detail="Unsupported video format. Please upload MP4, AVI, MOV, or MKV.")

    video_id = f"vid_{uuid.uuid4().hex[:10]}"
    dest_filename = f"{video_id}{ext}"
    dest_path = os.path.join(settings.UPLOAD_DIR, dest_filename)

    file_size = 0
    try:
        with open(dest_path, "wb") as buffer:
            while chunk := await file.read(1024 * 1024):  # 1MB chunks
                file_size += len(chunk)
                if file_size > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
                    buffer.close()
                    if os.path.exists(dest_path):
                        os.remove(dest_path)
                    raise HTTPException(status_code=400, detail=f"File exceeds maximum allowed size ({settings.MAX_UPLOAD_SIZE_MB}MB)")
                buffer.write(chunk)

        if file_size == 0:
            if os.path.exists(dest_path):
                os.remove(dest_path)
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        # Inspect video metadata with OpenCV
        cap = cv2.VideoCapture(dest_path)
        if not cap.isOpened():
            if os.path.exists(dest_path):
                os.remove(dest_path)
            raise HTTPException(status_code=400, detail="Corrupted or unreadable video file.")

        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        duration = frame_count / fps if fps > 0 else 0.0
        cap.release()

        if frame_count <= 0 or width <= 0 or height <= 0:
            if os.path.exists(dest_path):
                os.remove(dest_path)
            raise HTTPException(status_code=400, detail="Invalid video dimensions or frame count.")

        video_record = Video(
            id=video_id,
            filename=dest_filename,
            original_filename=safe_filename,
            file_path=dest_path,
            file_size_bytes=file_size,
            duration_seconds=round(duration, 2),
            fps=round(fps, 2),
            width=width,
            height=height,
            frame_count=frame_count
        )
        db.add(video_record)
        db.commit()
        db.refresh(video_record)
        return video_record

    except HTTPException:
        raise
    except Exception as e:
        if os.path.exists(dest_path):
            try:
                os.remove(dest_path)
            except OSError:
                pass
        raise HTTPException(status_code=500, detail=f"Video upload processing failed: {str(e)}")

@router.get("/videos/samples")
def list_sample_videos():
    """List preset sample scenario videos available on the server."""
    samples = []
    if os.path.exists(settings.SAMPLE_VIDEOS_DIR):
        for fname in sorted(os.listdir(settings.SAMPLE_VIDEOS_DIR)):
            if fname.lower().endswith(('.mp4', '.avi', '.mov', '.mkv')):
                fpath = os.path.join(settings.SAMPLE_VIDEOS_DIR, fname)
                size_bytes = os.path.getsize(fpath)
                samples.append({
                    "filename": fname,
                    "size_bytes": size_bytes,
                    "url": f"/data/sample_videos/{fname}"
                })
    return samples

@router.post("/videos/samples/{sample_name}/ingest", response_model=VideoResponse)
def ingest_sample_video(sample_name: str, db: Session = Depends(get_db)):
    """Ingest a server-side sample video into the active video catalog."""
    safe_name = os.path.basename(sample_name)
    sample_path = os.path.join(settings.SAMPLE_VIDEOS_DIR, safe_name)
    if not os.path.exists(sample_path):
        raise HTTPException(status_code=404, detail=f"Sample video '{safe_name}' not found.")

    cap = cv2.VideoCapture(sample_path)
    if not cap.isOpened():
        raise HTTPException(status_code=400, detail="Failed to open sample video with OpenCV.")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration = frame_count / fps if fps > 0 else 0.0
    cap.release()

    video_id = f"vid_{uuid.uuid4().hex[:10]}"
    video_record = Video(
        id=video_id,
        filename=safe_name,
        original_filename=safe_name,
        file_path=sample_path,
        file_size_bytes=os.path.getsize(sample_path),
        duration_seconds=round(duration, 2),
        fps=round(fps, 2),
        width=width,
        height=height,
        frame_count=frame_count
    )
    db.add(video_record)
    db.commit()
    db.refresh(video_record)
    return video_record

@router.get("/videos", response_model=List[VideoResponse])
def list_videos(db: Session = Depends(get_db)):
    return db.query(Video).order_by(Video.created_at.desc()).all()

@router.get("/videos/{video_id}", response_model=VideoResponse)
def get_video(video_id: str, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return video

@router.post("/analyses", response_model=AnalysisResponse)
def create_analysis(payload: AnalysisCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == payload.video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    analysis_id = f"anl_{uuid.uuid4().hex[:10]}"
    analysis = Analysis(
        id=analysis_id,
        video_id=payload.video_id,
        status="pending",
        conf_threshold=payload.conf_threshold,
        frame_stride=payload.frame_stride,
        inference_size=payload.inference_size,
        weight_density=payload.weight_density,
        weight_growth=payload.weight_growth,
        weight_motion_anomaly=payload.weight_motion_anomaly,
        weight_congestion=payload.weight_congestion,
        perspective_weight=payload.perspective_weight,
        privacy_mode=payload.privacy_mode
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)

    # Register events
    cancel_event = threading.Event()
    pause_event = threading.Event()
    active_jobs[analysis_id] = {
        "cancel_event": cancel_event,
        "pause_event": pause_event
    }

    background_tasks.add_task(run_background_analysis, analysis_id)
    return analysis

@router.get("/analyses", response_model=List[AnalysisResponse])
def list_analyses(db: Session = Depends(get_db)):
    return db.query(Analysis).order_by(Analysis.created_at.desc()).all()

@router.get("/analyses/{analysis_id}", response_model=AnalysisResponse)
def get_analysis(analysis_id: str, db: Session = Depends(get_db)):
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return analysis

@router.get("/analyses/{analysis_id}/results", response_model=List[FrameRecordResponse])
def get_analysis_results(analysis_id: str, db: Session = Depends(get_db)):
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return db.query(FrameRecord).filter(FrameRecord.analysis_id == analysis_id).order_by(FrameRecord.frame_index.asc()).all()

@router.post("/analyses/{analysis_id}/pause")
def pause_analysis(analysis_id: str, db: Session = Depends(get_db)):
    job = active_jobs.get(analysis_id)
    if not job:
        raise HTTPException(status_code=400, detail="Analysis job is not actively running")
    job["pause_event"].set()
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if analysis:
        analysis.status = "paused"
        db.commit()
    return {"status": "paused", "analysis_id": analysis_id}

@router.post("/analyses/{analysis_id}/resume")
def resume_analysis(analysis_id: str, db: Session = Depends(get_db)):
    job = active_jobs.get(analysis_id)
    if not job:
        raise HTTPException(status_code=400, detail="Analysis job is not actively running")
    job["pause_event"].clear()
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if analysis:
        analysis.status = "processing"
        db.commit()
    return {"status": "resumed", "analysis_id": analysis_id}

@router.post("/analyses/{analysis_id}/cancel")
def cancel_analysis(analysis_id: str, db: Session = Depends(get_db)):
    job = active_jobs.get(analysis_id)
    if not job:
        raise HTTPException(status_code=400, detail="Analysis job is not actively running")
    job["cancel_event"].set()
    job["pause_event"].clear()
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if analysis:
        analysis.status = "cancelled"
        db.commit()
    return {"status": "cancelled", "analysis_id": analysis_id}

@router.get("/analyses/{analysis_id}/export")
def export_analysis_csv(analysis_id: str, db: Session = Depends(get_db)):
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    frames = db.query(FrameRecord).filter(FrameRecord.analysis_id == analysis_id).order_by(FrameRecord.frame_index.asc()).all()
    incidents = db.query(Incident).filter(Incident.analysis_id == analysis_id).order_by(Incident.frame_index.asc()).all()
    
    csv_content = ReportService.generate_analysis_csv(analysis, frames, incidents)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=crowd_audit_{analysis_id}.csv"}
    )

@router.get("/incidents", response_model=List[IncidentResponse])
def list_incidents(severity: str = None, status: str = None, db: Session = Depends(get_db)):
    query = db.query(Incident)
    if severity:
        query = query.filter(Incident.severity == severity.upper())
    if status:
        query = query.filter(Incident.status == status)
    return query.order_by(Incident.created_at.desc()).all()

@router.get("/incidents/{incident_id}", response_model=IncidentResponse)
def get_incident(incident_id: str, db: Session = Depends(get_db)):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    return inc

@router.patch("/incidents/{incident_id}", response_model=IncidentResponse)
def update_incident(incident_id: str, payload: IncidentUpdate, db: Session = Depends(get_db)):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    if payload.status:
        inc.status = payload.status
    if payload.operator_notes is not None:
        inc.operator_notes = payload.operator_notes
    db.commit()
    db.refresh(inc)
    return inc

@router.get("/analytics/summary")
def get_analytics_summary(db: Session = Depends(get_db)):
    analyses = db.query(Analysis).all()
    incidents = db.query(Incident).all()
    
    total_videos = db.query(Video).count()
    total_analyses = len(analyses)
    total_incidents = len(incidents)
    
    critical_incidents = len([i for i in incidents if i.severity == "CRITICAL"])
    high_incidents = len([i for i in incidents if i.severity == "HIGH"])
    
    peak_crowd_overall = max([a.peak_count for a in analyses], default=0)
    avg_risk_overall = round(float(sum([a.avg_risk_score for a in analyses]) / max(1, total_analyses)), 1)
    
    return {
        "total_videos": total_videos,
        "total_analyses": total_analyses,
        "total_incidents": total_incidents,
        "critical_incidents": critical_incidents,
        "high_incidents": high_incidents,
        "peak_crowd_overall": peak_crowd_overall,
        "avg_risk_overall": avg_risk_overall
    }
