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
};

export const incidentApi = {
  getAll: async (filter?: { severity?: string; status?: string }): Promise<Incident[]> => {
    const res = await api.get<Incident[]>('/incidents', { params: filter });
    return res.data;
  },

  getById: async (id: string): Promise<Incident> => {
    const res = await api.get<Incident>(`/incidents/${id}`);
    return res.data;
  },

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

  getStreamUrl: (): string => '/api/camera/stream',
  getSnapshotUrl: (): string => `/api/camera/snapshot?t=${Date.now()}`,
};

export const systemApi = {
  healthCheck: async (): Promise<{ status: string; system: string; version: string }> => {
    const res = await api.get<{ status: string; system: string; version: string }>('/health');
    return res.data;
  },
};

export default api;
