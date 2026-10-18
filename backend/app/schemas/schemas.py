from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class VideoResponse(BaseModel):
    id: str
    filename: str
    original_filename: str
    file_size_bytes: int
    duration_seconds: float
    fps: float
    width: int
    height: int
    frame_count: int
    created_at: datetime

    class Config:
        from_attributes = True

class AnalysisCreate(BaseModel):
    video_id: str
    conf_threshold: float = Field(0.25, ge=0.05, le=1.0)
    frame_stride: int = Field(2, ge=1, le=10)
    inference_size: int = Field(640, ge=320, le=1280)
    weight_density: float = Field(0.35, ge=0.0, le=1.0)
    weight_growth: float = Field(0.20, ge=0.0, le=1.0)
    weight_motion_anomaly: float = Field(0.25, ge=0.0, le=1.0)
    weight_congestion: float = Field(0.20, ge=0.0, le=1.0)

class AnalysisResponse(BaseModel):
    id: str
    video_id: str
    status: str
    progress_percent: float
    current_frame: int
    total_frames: int
    processing_fps: float
    error_message: Optional[str]
    annotated_video_path: Optional[str]
    heatmap_preview_path: Optional[str]
    
    conf_threshold: float
    frame_stride: int
    inference_size: int
    
    peak_count: int
    avg_count: float
    max_risk_score: float
    avg_risk_score: float
    high_risk_duration_sec: float
    total_incidents_count: int
    
    created_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True

class FrameRecordResponse(BaseModel):
    id: int
    frame_index: int
    timestamp_sec: float
    person_count: int
    density_component: float
    growth_component: float
    motion_anomaly_component: float
    congestion_component: float
    raw_risk_score: float
    smoothed_risk_score: float
    risk_band: str
    risk_explanation: str
    active_tracks_count: int
    mean_speed_pixels: float
    optical_flow_magnitude: float
    grid_density: Optional[List[Dict[str, Any]]]

    class Config:
        from_attributes = True

class IncidentResponse(BaseModel):
    id: str
    analysis_id: str
    frame_index: int
    video_timestamp_sec: float
    incident_type: str
    severity: str
    risk_score: float
    trigger_reason: str
    measurements: Optional[Dict[str, Any]]
    relevant_region: Optional[str]
    evidence_frame_path: Optional[str]
    status: str
    operator_notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

class IncidentUpdate(BaseModel):
    status: Optional[str] = None
    operator_notes: Optional[str] = None
