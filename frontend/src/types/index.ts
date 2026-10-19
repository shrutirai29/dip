export interface Video {
  id: string;
  filename: string;
  original_filename: string;
  file_size_bytes: number;
  duration_seconds: number;
  fps: number;
  width: number;
  height: number;
  frame_count: number;
  created_at: string;
}

export interface Analysis {
  id: string;
  video_id: string;
  status: 'pending' | 'processing' | 'paused' | 'completed' | 'failed' | 'cancelled';
  progress_percent: number;
  current_frame: number;
  total_frames: number;
  processing_fps: number;
  error_message?: string;
  annotated_video_path?: string;
  heatmap_preview_path?: string;
  
  conf_threshold: number;
  frame_stride: number;
  inference_size: number;
  perspective_weight: number;
  privacy_mode: string;
  
  peak_count: number;
  avg_count: number;
  max_risk_score: number;
  avg_risk_score: number;
  high_risk_duration_sec: number;
  total_incidents_count: number;
  dominant_pattern: string;
  
  created_at: string;
  completed_at?: string;
}

export interface GridDensityCell {
  name: string;
  population: number;
  normalized_density: number;
  density_level: 'Low' | 'Moderate' | 'High' | 'Critical';
  avg_velocity: number;
  inflow: number;
  outflow: number;
  zone_risk: number;
  pattern: string;
}

export interface FrameRecord {
  id: number;
  frame_index: number;
  timestamp_sec: number;
  person_count: number;
  density_component: number;
  growth_component: number;
  motion_anomaly_component: number;
  congestion_component: number;
  raw_risk_score: number;
  smoothed_risk_score: number;
  risk_band: 'Low' | 'Moderate' | 'High' | 'Critical';
  risk_explanation: string;
  
  forecast_risk_5s: number;
  forecast_risk_10s: number;
  forecast_risk_15s: number;
  forecast_confidence: number;
  forecast_trend: 'STABLE' | 'RISING' | 'SURGING' | 'EASING';
  
  active_tracks_count: number;
  mean_speed_pixels: number;
  mean_acceleration: number;
  optical_flow_magnitude: number;
  directional_entropy: number;
  motion_variance: number;
  detected_pattern: string;
  
  grid_density?: GridDensityCell[];
}

export interface Incident {
  id: string;
  analysis_id: string;
  frame_index: number;
  video_timestamp_sec: number;
  incident_type: string;
  severity: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  risk_score: number;
  forecast_risk: number;
  trigger_reason: string;
  recommended_action?: string;
  measurements?: any;
  relevant_region?: string;
  evidence_frame_path?: string;
  status: 'Open' | 'Acknowledged' | 'Resolved';
  operator_notes?: string;
  created_at: string;
}

export interface AnalyticsSummary {
  total_videos: number;
  total_analyses: number;
  total_incidents: number;
  critical_incidents: number;
  high_incidents: number;
  peak_crowd_overall: number;
  avg_risk_overall: number;
}

export interface CameraSessionStatus {
  state: 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'DEGRADED' | 'RECONNECTING' | 'DISCONNECTED' | 'ERROR';
  source_type?: 'webcam' | 'rtsp' | null;
  device_index?: number | null;
  camera_name?: string | null;
  sanitized_url?: string | null;
  location?: string | null;
  is_active: boolean;
  frames_captured: number;
  frames_consumed: number;
  frames_dropped: number;
  latest_frame_id: number;
  latest_frame_timestamp: number;
  measured_fps: number;
  processing_fps: number;
  uptime_seconds: number;
  error_message: string | null;
  retry_count?: number;
  max_retries?: number;
  next_retry_delay_sec?: number;
}
