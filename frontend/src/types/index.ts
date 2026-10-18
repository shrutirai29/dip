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
  
  peak_count: number;
  avg_count: number;
  max_risk_score: number;
  avg_risk_score: number;
  high_risk_duration_sec: number;
  total_incidents_count: number;
  
  created_at: string;
  completed_at?: string;
}

export interface GridDensityCell {
  name: string;
  count: number;
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
  active_tracks_count: number;
  mean_speed_pixels: number;
  optical_flow_magnitude: number;
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
  trigger_reason: string;
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
