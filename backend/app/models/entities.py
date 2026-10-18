import datetime
from sqlalchemy import Column, String, Integer, Float, DateTime, Text, JSON, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from app.database.session import Base

class Video(Base):
    __tablename__ = "videos"

    id = Column(String, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    original_filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    duration_seconds = Column(Float, default=0.0)
    fps = Column(Float, default=0.0)
    width = Column(Integer, default=0)
    height = Column(Integer, default=0)
    frame_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    analyses = relationship("Analysis", back_populates="video", cascade="all, delete-orphan")

class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(String, primary_key=True, index=True)
    video_id = Column(String, ForeignKey("videos.id"), nullable=False)
    status = Column(String, default="pending")  # pending, processing, paused, completed, failed, cancelled
    progress_percent = Column(Float, default=0.0)
    current_frame = Column(Integer, default=0)
    total_frames = Column(Integer, default=0)
    processing_fps = Column(Float, default=0.0)
    error_message = Column(Text, nullable=True)
    
    # Processed artifact paths
    annotated_video_path = Column(String, nullable=True)
    heatmap_preview_path = Column(String, nullable=True)
    
    # Configuration used
    conf_threshold = Column(Float, default=0.25)
    frame_stride = Column(Integer, default=2)
    inference_size = Column(Integer, default=640)
    weight_density = Column(Float, default=0.35)
    weight_growth = Column(Float, default=0.20)
    weight_motion_anomaly = Column(Float, default=0.25)
    weight_congestion = Column(Float, default=0.20)
    
    # Aggregated Summary Metrics
    peak_count = Column(Integer, default=0)
    avg_count = Column(Float, default=0.0)
    max_risk_score = Column(Float, default=0.0)
    avg_risk_score = Column(Float, default=0.0)
    high_risk_duration_sec = Column(Float, default=0.0)
    total_incidents_count = Column(Integer, default=0)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    video = relationship("Video", back_populates="analyses")
    frame_records = relationship("FrameRecord", back_populates="analysis", cascade="all, delete-orphan")
    incidents = relationship("Incident", back_populates="analysis", cascade="all, delete-orphan")

class FrameRecord(Base):
    __tablename__ = "frame_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    analysis_id = Column(String, ForeignKey("analyses.id"), index=True, nullable=False)
    frame_index = Column(Integer, nullable=False)
    timestamp_sec = Column(Float, nullable=False)
    
    person_count = Column(Integer, default=0)
    density_component = Column(Float, default=0.0)
    growth_component = Column(Float, default=0.0)
    motion_anomaly_component = Column(Float, default=0.0)
    congestion_component = Column(Float, default=0.0)
    raw_risk_score = Column(Float, default=0.0)
    smoothed_risk_score = Column(Float, default=0.0)
    risk_band = Column(String, default="Low")  # Low, Moderate, High, Critical
    risk_explanation = Column(Text, default="")
    
    # Detailed tracking/motion payload
    active_tracks_count = Column(Integer, default=0)
    mean_speed_pixels = Column(Float, default=0.0)
    optical_flow_magnitude = Column(Float, default=0.0)
    
    # Regions grid density JSON
    grid_density = Column(JSON, nullable=True)

    analysis = relationship("Analysis", back_populates="frame_records")

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(String, primary_key=True, index=True)
    analysis_id = Column(String, ForeignKey("analyses.id"), index=True, nullable=False)
    frame_index = Column(Integer, nullable=False)
    video_timestamp_sec = Column(Float, nullable=False)
    
    incident_type = Column(String, nullable=False)  # HIGH_CROWD_DENSITY, RAPID_GROWTH, ABNORMAL_MOTION, CONVERGING_FLOW, CRITICAL_RISK
    severity = Column(String, nullable=False)  # LOW, MODERATE, HIGH, CRITICAL
    risk_score = Column(Float, nullable=False)
    
    trigger_reason = Column(Text, nullable=False)
    measurements = Column(JSON, nullable=True)
    relevant_region = Column(String, nullable=True)
    evidence_frame_path = Column(String, nullable=True)
    
    status = Column(String, default="Open")  # Open, Acknowledged, Resolved
    operator_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    analysis = relationship("Analysis", back_populates="incidents")
