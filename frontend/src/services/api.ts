import axios from 'axios';
import { Video, Analysis, FrameRecord, Incident, AnalyticsSummary, CameraSessionStatus } from '../types';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

export const videoApi = {
  upload: async (file: File): Promise<Video> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post<Video>('/videos/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  getAll: async (): Promise<Video[]> => {
    const res = await api.get<Video[]>('/videos');
    return res.data;
  },

  getById: async (id: string): Promise<Video> => {
    const res = await api.get<Video>(`/videos/${id}`);
    return res.data;
  },

  getSamples: async (): Promise<{ filename: string; size_bytes: number; url: string }[]> => {
    const res = await api.get<{ filename: string; size_bytes: number; url: string }[]>('/videos/samples');
    return res.data;
  },

  ingestSample: async (sampleName: string): Promise<Video> => {
    const res = await api.post<Video>(`/videos/samples/${sampleName}/ingest`);
    return res.data;
  },
};

export const analysisApi = {
  create: async (params: {
    video_id: string;
    conf_threshold?: number;
    frame_stride?: number;
    inference_size?: number;
    weight_density?: number;
    weight_growth?: number;
    weight_motion_anomaly?: number;
    weight_congestion?: number;
    perspective_weight?: number;
    privacy_mode?: string;
  }): Promise<Analysis> => {
    const res = await api.post<Analysis>('/analyses', params);
    return res.data;
  },

  getAll: async (): Promise<Analysis[]> => {
    const res = await api.get<Analysis[]>('/analyses');
    return res.data;
  },

  getById: async (id: string): Promise<Analysis> => {
    const res = await api.get<Analysis>(`/analyses/${id}`);
    return res.data;
  },

  getResults: async (id: string): Promise<FrameRecord[]> => {
    const res = await api.get<FrameRecord[]>(`/analyses/${id}/results`);
    return res.data;
  },

  pause: async (id: string) => {
    const res = await api.post(`/analyses/${id}/pause`);
    return res.data;
  },

  resume: async (id: string) => {
    const res = await api.post(`/analyses/${id}/resume`);
    return res.data;
  },

  cancel: async (id: string) => {
    const res = await api.post(`/analyses/${id}/cancel`);
    return res.data;
  },

  getExportUrl: (id: string) => `/api/analyses/${id}/export`,
  getVideoUrl: (id: string) => `/api/analyses/${id}/video`,
};

export const resolveMediaUrl = (path?: string | null, analysisId?: string): string => {
  if (analysisId) {
    return `/api/analyses/${analysisId}/video`;
  }
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return path.startsWith('/') ? path : `/${path}`;
};

export const incidentApi = {
  getAll: async (filter?: { severity?: string; status?: string; camera_id?: string; analysis_id?: string }): Promise<Incident[]> => {
    const res = await api.get<Incident[]>('/incidents', { params: filter });
    return res.data;
  },

  getById: async (id: string): Promise<Incident> => {
    const res = await api.get<Incident>(`/incidents/${id}`);
    return res.data;
  },

  getEvidenceUrl: (id: string): string => `/api/incidents/${id}/evidence`,

  update: async (id: string, data: { status?: string; operator_notes?: string }): Promise<Incident> => {
    const res = await api.patch<Incident>(`/incidents/${id}`, data);
    return res.data;
  },
};

export const analyticsApi = {
  getSummary: async (): Promise<AnalyticsSummary> => {
    const res = await api.get<AnalyticsSummary>('/analytics/summary');
    return res.data;
  },
};

export const cameraApi = {
  start: async (params?: {
    device_index?: number;
    conf_threshold?: number;
    inference_size?: number;
    perspective_weight?: number;
    privacy_mode?: string;
    target_fps?: number;
  }): Promise<CameraSessionStatus> => {
    const res = await api.post<CameraSessionStatus>('/camera/session/start', params || {});
    return res.data;
  },

  validateRtsp: async (params: {
    rtsp_url: string;
    username?: string;
    password?: string;
  }): Promise<{
    is_valid: boolean;
    sanitized_url: string;
    host?: string;
    port?: number;
    error_message?: string;
  }> => {
    const res = await api.post('/camera/rtsp/validate', params);
    return res.data;
  },

  startRtsp: async (params: {
    name: string;
    rtsp_url: string;
    username?: string;
    password?: string;
    timeout_seconds?: number;
    max_retries?: number;
    target_fps?: number;
    conf_threshold?: number;
    inference_size?: number;
    perspective_weight?: number;
    privacy_mode?: string;
    location?: string;
  }): Promise<CameraSessionStatus> => {
    const res = await api.post<CameraSessionStatus>('/camera/rtsp/start', params);
    return res.data;
  },

  retryRtsp: async (): Promise<CameraSessionStatus> => {
    const res = await api.post<CameraSessionStatus>('/camera/rtsp/retry');
    return res.data;
  },

  getStatus: async (): Promise<CameraSessionStatus> => {
    const res = await api.get<CameraSessionStatus>('/camera/session/status');
    return res.data;
  },

  stop: async (): Promise<CameraSessionStatus> => {
    const res = await api.post<CameraSessionStatus>('/camera/session/stop');
    return res.data;
  },

  getLatestTelemetry: async (): Promise<FrameRecord> => {
    const res = await api.get<FrameRecord>('/camera/latest-frame');
    return res.data;
  },

  getDiagnostics: async (): Promise<any> => {
    const res = await api.get<any>('/camera/diagnostics');
    return res.data;
  },

  getStreamUrl: (): string => '/api/camera/stream',
  getSnapshotUrl: (): string => `/api/camera/snapshot?t=${Date.now()}`,
};

export const multiCameraApi = {
  list: async (): Promise<CameraSessionStatus[]> => {
    const res = await api.get<CameraSessionStatus[]>('/cameras');
    return res.data;
  },

  getDetails: async (cameraId: string): Promise<CameraSessionStatus> => {
    const res = await api.get<CameraSessionStatus>(`/cameras/${cameraId}`);
    return res.data;
  },

  register: async (payload: any): Promise<CameraSessionStatus> => {
    const res = await api.post<CameraSessionStatus>('/cameras', payload);
    return res.data;
  },

  start: async (cameraId: string): Promise<CameraSessionStatus> => {
    const res = await api.post<CameraSessionStatus>(`/cameras/${cameraId}/start`);
    return res.data;
  },

  stop: async (cameraId: string): Promise<CameraSessionStatus> => {
    const res = await api.post<CameraSessionStatus>(`/cameras/${cameraId}/stop`);
    return res.data;
  },

  retry: async (cameraId: string): Promise<CameraSessionStatus> => {
    const res = await api.post<CameraSessionStatus>(`/cameras/${cameraId}/retry`);
    return res.data;
  },

  remove: async (cameraId: string): Promise<{ status: string; message: string }> => {
    const res = await api.delete<{ status: string; message: string }>(`/cameras/${cameraId}`);
    return res.data;
  },

  getTelemetry: async (cameraId: string): Promise<FrameRecord> => {
    const res = await api.get<FrameRecord>(`/cameras/${cameraId}/telemetry`);
    return res.data;
  },

  getHealth: async (): Promise<any> => {
    const res = await api.get<any>('/cameras/health');
    return res.data;
  },

  validateSource: async (params: { rtsp_url: string; username?: string; password?: string }): Promise<{
    is_valid: boolean;
    sanitized_url: string;
    host?: string;
    port?: number;
    error_message?: string;
  }> => {
    const res = await api.post('/cameras/validate-source', params);
    return res.data;
  },

  getStreamUrl: (cameraId: string): string => `/api/cameras/${cameraId}/stream`,
  getSnapshotUrl: (cameraId: string): string => `/api/cameras/${cameraId}/snapshot?t=${Date.now()}`,
};

export const systemApi = {
  healthCheck: async (): Promise<{ status: string; system: string; version: string }> => {
    const res = await api.get<{ status: string; system: string; version: string }>('/health');
    return res.data;
  },
};

export const benchmarkApi = {
  getDataset: async (): Promise<any> => {
    const res = await api.get('/benchmark/dataset');
    return res.data;
  },
  getAccuracy: async (confThreshold = 0.30, iouThreshold = 0.50): Promise<any> => {
    const res = await api.get('/benchmark/accuracy', {
      params: { conf_threshold: confThreshold, iou_threshold: iouThreshold }
    });
    return res.data;
  },
  getDetectionRobustness: async (): Promise<any> => {
    const res = await api.get('/benchmark/detection-robustness');
    return res.data;
  },
  runDetectionRobustness: async (confThreshold = 0.30, iouThreshold = 0.50, subset?: string): Promise<any> => {
    const res = await api.post('/benchmark/run-detection-robustness', null, {
      params: {
        conf_threshold: confThreshold,
        iou_threshold: iouThreshold,
        subset: subset,
      }
    });
    return res.data;
  },
  getRiskValidation: async (): Promise<any> => {
    const res = await api.get('/benchmark/risk-validation');
    return res.data;
  },
  getPhase48RiskValidation: async (): Promise<any> => {
    const res = await api.get('/benchmark/risk-validation-phase48');
    return res.data;
  },
  runPhase48RiskValidation: async (): Promise<any> => {
    const res = await api.post('/benchmark/run-risk-validation-phase48');
    return res.data;
  },
  getPhase49IncidentLifecycle: async (): Promise<any> => {
    const res = await api.get('/benchmark/incident-lifecycle-phase49');
    return res.data;
  },
  runPhase49IncidentLifecycle: async (): Promise<any> => {
    const res = await api.post('/benchmark/run-incident-lifecycle-phase49');
    return res.data;
  },
  getPhase50OperationalReadiness: async (): Promise<any> => {
    const res = await api.get('/benchmark/operational-readiness-phase50');
    return res.data;
  },
  runPhase50OperationalReadiness: async (): Promise<any> => {
    const res = await api.post('/benchmark/run-operational-readiness-phase50');
    return res.data;
  },
  getPerformance: async (): Promise<any> => {
    const res = await api.get('/benchmark/performance');
    return res.data;
  },
  runPerformance: async (maxCameras = 4, durationSec = 5.0): Promise<any> => {
    const res = await api.post('/benchmark/run-performance', null, {
      params: { max_cameras: maxCameras, duration_sec: durationSec }
    });
    return res.data;
  },
  getExperiments: async (): Promise<any> => {
    const res = await api.get('/benchmark/experiments');
    return res.data;
  },
  getProfiling: async (): Promise<any> => {
    const res = await api.get('/benchmark/profiling');
    return res.data;
  },
  getDatasetValidation: async (): Promise<any> => {
    const res = await api.get('/benchmark/dataset-validation');
    return res.data;
  },
  runOptimizationComparison: async (maxCameras = 4, durationSec = 4.0): Promise<any> => {
    const res = await api.post('/benchmark/run-optimization-comparison', null, {
      params: { max_cameras: maxCameras, duration_sec: durationSec }
    });
    return res.data;
  },
  getSustained: async (): Promise<any> => {
    const res = await api.get('/benchmark/sustained');
    return res.data;
  },
  runSustained: async (maxCameras = 4, measurementDurationSec = 60.0, warmupDurationSec = 10.0): Promise<any> => {
    const res = await api.post('/benchmark/run-sustained', null, {
      params: {
        max_cameras: maxCameras,
        measurement_duration_sec: measurementDurationSec,
        warmup_duration_sec: warmupDurationSec,
      }
    });
    return res.data;
  },
  getAdaptivePolicy: async (): Promise<any> => {
    const res = await api.get('/benchmark/adaptive-policy');
    return res.data;
  },
  updateAdaptivePolicy: async (data: { policy?: string; max_pending_age_sec?: number }): Promise<any> => {
    const res = await api.post('/benchmark/adaptive-policy', data);
    return res.data;
  },
  getAdaptiveReport: async (): Promise<any> => {
    const res = await api.get('/benchmark/adaptive-report');
    return res.data;
  },
  getColdStart: async (): Promise<any> => {
    const res = await api.get('/benchmark/cold-start');
    return res.data;
  },
  getReliable: async (): Promise<any> => {
    const res = await api.get('/benchmark/reliable');
    return res.data;
  },
  runReliable: async (maxCameras = 4, durationSec = 5.0, warmupSec = 4.0, repetitions = 3): Promise<any> => {
    const res = await api.post('/benchmark/run-reliable', null, {
      params: {
        max_cameras: maxCameras,
        duration_sec: durationSec,
        warmup_sec: warmupSec,
        repetitions: repetitions,
      }
    });
    return res.data;
  },
  getPhase51Resilience: async (): Promise<any> => {
    const res = await api.get('/benchmark/phase51-resilience');
    return res.data;
  },
  runPhase51Resilience: async (): Promise<any> => {
    const res = await api.post('/benchmark/run-phase51-resilience');
    return res.data;
  },
  getPhase52Reliability: async (): Promise<any> => {
    const res = await api.get('/benchmark/phase52-reliability');
    return res.data;
  },
  runPhase52Reliability: async (): Promise<any> => {
    const res = await api.post('/benchmark/run-phase52-reliability');
    return res.data;
  },
  getExportUrl: (): string => '/api/benchmark/export',
};

export const calibrationApi = {
  get: async (cameraId: string): Promise<any> => {
    const res = await api.get(`/calibration/${cameraId}`);
    return res.data;
  },
  set: async (cameraId: string, payload: {
    image_points: number[][];
    ground_points: number[][];
    image_width?: number;
    image_height?: number;
    units?: string;
    ground_roi_polygon?: number[][];
    notes?: string;
  }): Promise<any> => {
    const res = await api.post(`/calibration/${cameraId}`, payload);
    return res.data;
  },
  validate: async (cameraId: string, payload: {
    image_points: number[][];
    ground_points: number[][];
    image_width?: number;
    image_height?: number;
  }): Promise<any> => {
    const res = await api.post(`/calibration/${cameraId}/validate`, payload);
    return res.data;
  },
  reset: async (cameraId: string): Promise<any> => {
    const res = await api.delete(`/calibration/${cameraId}`);
    return res.data;
  },
  getReferenceFrameUrl: (cameraId: string): string => `/api/calibration/${cameraId}/reference-frame`,
};

export const eventApi = {
  getRecent: async (lastEventId?: string, limit = 50): Promise<{ count: number; last_event_id: string | null; events: any[] }> => {
    const res = await api.get('/events/recent', {
      params: { last_event_id: lastEventId, limit }
    });
    return res.data;
  },
  getStatus: async (): Promise<any> => {
    const res = await api.get('/events/status');
    return res.data;
  }
};

export default api;
