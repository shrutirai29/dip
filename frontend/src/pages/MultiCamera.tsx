import React, { useState, useEffect, useCallback } from 'react';
import {
  Camera,
  Radio,
  Plus,
  Play,
  Square,
  RotateCw,
  Trash2,
  Users,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Maximize2,
  X,
  Layers,
  RefreshCw
} from 'lucide-react';
import { multiCameraApi } from '../services/api';
import { CameraSessionStatus, MultiCameraHealth } from '../types';
import { MetricStrip, MetricItem, EmptyState } from '../components/UIComponents';

export const MultiCameraPage: React.FC = () => {
  const [cameras, setCameras] = useState<CameraSessionStatus[]>([]);
  const [health, setHealth] = useState<MultiCameraHealth | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedCameraForView, setSelectedCameraForView] = useState<CameraSessionStatus | null>(null);

  // Form registration state
  const [formName, setFormName] = useState<string>('Live Webcam Node');
  const [formType, setFormType] = useState<'webcam' | 'rtsp'>('webcam');
  const [formDeviceIndex, setFormDeviceIndex] = useState<number>(0);
  const [formRtspUrl, setFormRtspUrl] = useState<string>('rtsp://127.0.0.1:8554/live/stream');
  const [formUsername, setFormUsername] = useState<string>('');
  const [formPassword, setFormPassword] = useState<string>('');
  const [formLocation, setFormLocation] = useState<string>('Main Entrance');
  const [formTargetFps, setFormTargetFps] = useState<number>(25);
  const [formConfThreshold, setFormConfThreshold] = useState<number>(0.30);
  const [formPrivacyMode, setFormPrivacyMode] = useState<string>('none');
  const [formStartImmediately, setFormStartImmediately] = useState<boolean>(true);

  // Validation state in modal
  const [valLoading, setValLoading] = useState<boolean>(false);
  const [valResult, setValResult] = useState<{ is_valid: boolean; sanitized_url: string; error_message?: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Per-camera action loading state: cameraId -> actionName
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});

  const fetchCamerasAndHealth = useCallback(async (isBackground = false) => {
    if (!isBackground) setRefreshing(true);
    try {
      const [camsRes, healthRes] = await Promise.allSettled([
        multiCameraApi.list(),
        multiCameraApi.getHealth(),
      ]);

      if (camsRes.status === 'fulfilled') {
        setCameras(camsRes.value);
        setErrorMessage(null);
      } else {
        console.error('Failed to fetch camera list:', camsRes.reason);
        setErrorMessage('Unable to load multi-camera registry.');
      }

      if (healthRes.status === 'fulfilled') {
        setHealth(healthRes.value);
      }
    } catch (err) {
      console.error('Multi-camera fetch error:', err);
      setErrorMessage('Communication error with multi-camera service.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCamerasAndHealth(false);
    const interval = setInterval(() => {
      fetchCamerasAndHealth(true);
    }, 2500);
    return () => clearInterval(interval);
  }, [fetchCamerasAndHealth]);

  const handleStartCamera = async (id: string) => {
    setActionLoading((prev) => ({ ...prev, [id]: 'starting' }));
    try {
      await multiCameraApi.start(id);
      await fetchCamerasAndHealth(true);
    } catch (err) {
      console.error(`Failed to start camera ${id}:`, err);
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleStopCamera = async (id: string) => {
    setActionLoading((prev) => ({ ...prev, [id]: 'stopping' }));
    try {
      await multiCameraApi.stop(id);
      await fetchCamerasAndHealth(true);
    } catch (err) {
      console.error(`Failed to stop camera ${id}:`, err);
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleRetryCamera = async (id: string) => {
    setActionLoading((prev) => ({ ...prev, [id]: 'retrying' }));
    try {
      await multiCameraApi.retry(id);
      await fetchCamerasAndHealth(true);
    } catch (err) {
      console.error(`Failed to retry camera ${id}:`, err);
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleRemoveCamera = async (id: string, name?: string) => {
    if (!window.confirm(`Are you sure you want to unregister camera "${name || id}"?`)) {
      return;
    }
    setActionLoading((prev) => ({ ...prev, [id]: 'removing' }));
    try {
      await multiCameraApi.remove(id);
      await fetchCamerasAndHealth(true);
    } catch (err) {
      console.error(`Failed to remove camera ${id}:`, err);
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleValidateFormSource = async () => {
    if (formType !== 'rtsp') return;
    setValLoading(true);
    setValResult(null);
    setSubmitError(null);
    try {
      const res = await multiCameraApi.validateSource({
        rtsp_url: formRtspUrl,
        username: formUsername || undefined,
        password: formPassword || undefined,
      });
      setValResult(res);
      if (!res.is_valid && res.error_message) {
        setSubmitError(res.error_message);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Validation request failed');
    } finally {
      setValLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);

    try {
      await multiCameraApi.register({
        name: formName,
        source_type: formType,
        device_index: formType === 'webcam' ? formDeviceIndex : undefined,
        rtsp_url: formType === 'rtsp' ? formRtspUrl : undefined,
        username: formType === 'rtsp' && formUsername ? formUsername : undefined,
        password: formType === 'rtsp' && formPassword ? formPassword : undefined,
        location: formLocation || undefined,
        target_fps: formTargetFps,
        conf_threshold: formConfThreshold,
        privacy_mode: formPrivacyMode,
        start_immediately: formStartImmediately,
      });

      setIsModalOpen(false);
      setValResult(null);
      setFormPassword('');
      await fetchCamerasAndHealth(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const stateColors: Record<string, string> = {
    CONNECTED: 'bg-[#EEF5F5] dark:bg-[#183133] text-[#376E6F] dark:text-[#6EC4C6] border-[#376E6F]/30 dark:border-[#376E6F]/40',
    CONNECTING: 'bg-[#FDF3F5] dark:bg-[#2A161D] text-[#B34D66] dark:text-[#F0A4B8] border-[#DA7B93]/35 animate-pulse',
    RECONNECTING: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 animate-pulse',
    DEGRADED: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300',
    ERROR: 'bg-[#FAF0F2] dark:bg-rose-950/40 text-[#2E151B] dark:text-rose-300 border-[#2E151B]/20',
    DISCONNECTED: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400 border-slate-300',
    IDLE: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400 border-slate-300',
  };

  return (
    <div className="space-y-6 w-full">
      {/* 1. Header with Add Camera Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-[#E2E8EA] dark:border-[#1F3538] gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h2 className="text-xl font-bold tracking-tight text-[#1C3334] dark:text-[#EDF4F5]">
              MULTI-CAMERA COMMAND CENTER
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#376E6F]/10 dark:bg-[#376E6F]/25 text-[#376E6F] dark:text-[#6EB5B6] border border-[#376E6F]/30 font-semibold">
              CONCURRENT SESSIONS
            </span>
          </div>
          <p className="text-xs text-[#5D757E] dark:text-[#A0B7BC] mt-1 max-w-2xl leading-relaxed">
            Manage, ingest, and analyze multiple CCTV surveillance nodes simultaneously. Each camera maintains an independent capture pipeline, isolated ByteTrack tracking IDs, perspective-aware density calculations, and heuristic disaster risk scoring.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => fetchCamerasAndHealth(false)}
            disabled={refreshing}
            aria-label="Refresh Registry"
            className="p-2 bg-white dark:bg-[#152729] hover:bg-[#F1F4F5] dark:hover:bg-[#1C3336] text-[#2F4454] dark:text-[#EDF4F5] border border-[#CBD5D8] dark:border-[#2C4B4E] rounded-xl text-xs transition cursor-pointer shadow-2xs"
            title="Refresh Registry"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-[#376E6F]' : ''}`} />
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-[#2F4454] hover:bg-[#1C3334] dark:bg-[#376E6F] dark:hover:bg-[#4A8E8F] text-white rounded-xl text-xs font-semibold transition cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add Camera Feed</span>
          </button>
        </div>
      </div>

      {/* 2. Aggregate Fleet Telemetry Ribbon */}
      {health && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-[#5D757E] dark:text-[#A0B7BC] px-1">
            <span className="font-semibold tracking-wider uppercase">SURVEILLANCE FLEET TELEMETRY</span>
            <span className="tabular-nums font-semibold text-[#376E6F] dark:text-[#6EC4C6]">
              {health.connected_count} CONNECTED • {health.active_streams} ACTIVE
            </span>
          </div>
          <MetricStrip>
            <MetricItem
              label="Registered Slots"
              value={`${health.total_registered} / ${health.max_registered_limit}`}
              unit="nodes"
              subtext="Capacity Allocation"
              tone="slate"
            />
            <MetricItem
              label="Active Streams"
              value={`${health.active_streams} / ${health.max_active_limit}`}
              unit="active"
              subtext="Ingestion Channels"
              tone="teal"
            />
            <MetricItem
              label="Connected Feeds"
              value={health.connected_count}
              unit="online"
              subtext="Synchronized Capture"
              tone="emerald"
            />
            <MetricItem
              label="Nodes In Recovery"
              value={health.reconnecting_count}
              unit="retrying"
              subtext={health.reconnecting_count > 0 ? 'Backoff Retrying' : 'Zero Failures'}
              tone={health.reconnecting_count > 0 ? 'amber' : 'neutral'}
            />
            <MetricItem
              label="Fleet Observed Crowd"
              value={health.total_observed_persons}
              unit="persons"
              subtext="Multi-Zone Aggregate"
              tone="teal"
            />
            <MetricItem
              label="Peak Fleet Risk"
              value={health.highest_risk_score.toFixed(1)}
              unit="/ 100"
              subtext={`Status: ${health.system_status}`}
              tone={health.highest_risk_score >= 70 ? 'burgundy' : health.highest_risk_score >= 40 ? 'amber' : 'emerald'}
            />
          </MetricStrip>
        </div>
      )}

      {/* Error Message banner */}
      {errorMessage && (
        <div className="p-3.5 bg-[#FAF0F2] dark:bg-rose-950/20 border border-[#2E151B]/20 dark:border-rose-500/30 rounded-xl text-xs text-[#2E151B] dark:text-rose-200 flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-[#2E151B] dark:text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 3. Camera Cards Grid */}
      {loading ? (
        <div className="py-20 text-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#376E6F] border-t-transparent animate-spin mx-auto" />
          <p className="text-xs text-[#5D757E] dark:text-[#A0B7BC] font-mono">Loading camera fleet registry...</p>
        </div>
      ) : cameras.length === 0 ? (
        <EmptyState
          title="No Cameras Registered"
          description="You have not added any local webcams or RTSP network cameras yet. Click 'Add Camera Feed' to register your first surveillance node."
          actionText="Add Camera Feed"
          onAction={() => setIsModalOpen(true)}
          icon={Camera}
        />
      ) : (
        <div className={`grid gap-6 ${
          cameras.length === 1 ? 'grid-cols-1 max-w-4xl mx-auto' :
          cameras.length === 2 ? 'grid-cols-1 lg:grid-cols-2' :
          cameras.length <= 4 ? 'grid-cols-1 md:grid-cols-2' :
          'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
        }`}>
          {cameras.map((cam) => {
            const camId = cam.camera_id || '';
            const isActing = actionLoading[camId];
            const detAge = typeof cam.detection_age_seconds === 'number'
              ? cam.detection_age_seconds
              : (cam.frame_age_seconds ?? 0);
            const isStale = (cam.is_stale || (detAge > 2.0)) && cam.is_active;

            return (
              <div
                key={camId}
                className="bg-white dark:bg-[#152729] border border-[#E2E8EA] dark:border-[#233C3F] rounded-2xl overflow-hidden flex flex-col justify-between hover:border-[#CBD5D8] dark:hover:border-[#376E6F]/50 transition-all shadow-xs"
              >
                {/* Card Header */}
                <div className="p-4 border-b border-[#E2E8EA] dark:border-[#233C3F] flex items-center justify-between">
                  <div className="flex items-center space-x-2.5 truncate">
                    {cam.source_type === 'rtsp' ? (
                      <Radio className="w-4 h-4 text-[#376E6F] dark:text-[#6EB5B6] shrink-0" />
                    ) : (
                      <Camera className="w-4 h-4 text-[#376E6F] dark:text-[#6EB5B6] shrink-0" />
                    )}
                    <div className="truncate">
                      <h3 className="text-sm font-bold text-[#1C3334] dark:text-[#EDF4F5] tracking-wide truncate">
                        {cam.camera_name || 'Unnamed Camera'}
                      </h3>
                      <p className="text-[10px] font-mono text-[#5D757E] dark:text-[#A0B7BC] truncate">
                        {cam.location || cam.sanitized_url || `Device #${cam.device_index}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0">
                    {isStale && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-medium border bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 animate-pulse">
                        STALE
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border ${stateColors[cam.state] || stateColors.IDLE}`}>
                      {cam.state}
                    </span>
                  </div>
                </div>

                {/* Card Viewport Preview */}
                <div className="aspect-video bg-black/95 relative flex items-center justify-center overflow-hidden border-b border-[#E2E8EA] dark:border-[#233C3F]">
                  {cam.state === 'CONNECTED' ? (
                    <>
                      <img
                        src={multiCameraApi.getStreamUrl(camId)}
                        alt={cam.camera_name || 'Live Feed'}
                        className="w-full h-full object-contain"
                        loading="eager"
                      />
                      {/* Live Stale Overlay Badge */}
                      {isStale && (
                        <div className="absolute top-2 left-2 px-2.5 py-1 rounded-lg bg-amber-500/90 dark:bg-amber-950/90 border border-amber-400 dark:border-amber-500/60 text-[10px] text-white dark:text-amber-200 font-mono flex items-center space-x-1.5 shadow-md">
                          <AlertTriangle className="w-3.5 h-3.5 text-white dark:text-amber-400 animate-pulse" />
                          <span>STALE DETECTION ({detAge.toFixed(1)}s)</span>
                        </div>
                      )}
                      <button
                        onClick={() => setSelectedCameraForView(cam)}
                        className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white border border-white/20 transition cursor-pointer shadow-xs"
                        title="Enlarge Feed"
                        aria-label={`Enlarge feed for ${cam.camera_name || 'camera'}`}
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : cam.state === 'CONNECTING' ? (
                    <div className="text-center p-6 space-y-2">
                      <div className="w-8 h-8 rounded-full border-2 border-[#376E6F] border-t-transparent animate-spin mx-auto" />
                      <p className="text-xs text-[#6EB5B6] font-mono">Connecting to stream...</p>
                      <p className="text-[10px] text-slate-400 font-mono truncate max-w-xs mx-auto">
                        {cam.sanitized_url || `Device #${cam.device_index}`}
                      </p>
                    </div>
                  ) : cam.state === 'RECONNECTING' ? (
                    <div className="text-center p-6 space-y-2">
                      <div className="w-8 h-8 rounded-full border-2 border-amber-400 border-t-transparent animate-spin mx-auto" />
                      <p className="text-xs text-amber-300 font-mono">Reconnecting (Attempt {cam.retry_count}/{cam.max_retries})...</p>
                      <p className="text-[10px] text-slate-400 font-mono">Next try in {cam.next_retry_delay_sec?.toFixed(1)}s</p>
                    </div>
                  ) : (
                    <div className="text-center p-6 space-y-2">
                      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-slate-400">
                        {cam.source_type === 'rtsp' ? <Radio className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
                      </div>
                      <p className="text-xs text-slate-400 font-mono">Stream Inactive / Disconnected</p>
                    </div>
                  )}
                </div>

                {/* Precision Surveillance Telemetry Strip */}
                <div className="px-3 py-2 bg-[#F8F9FA] dark:bg-[#112022] border-b border-[#E2E8EA] dark:border-[#233C3F] grid grid-cols-4 divide-x divide-[#E2E8EA] dark:divide-[#233C3F] text-center font-mono">
                  <div className="px-1.5">
                    <span className="text-[9px] uppercase tracking-wider text-[#5D757E] dark:text-[#A0B7BC] block font-sans font-medium">Observed</span>
                    <span className="text-xs font-bold text-[#1C3334] dark:text-[#EDF4F5] mt-0.5 block tabular-nums">
                      {cam.person_count ?? 0}
                      {isStale && <span className="text-[8px] text-amber-700 dark:text-amber-400 block font-sans font-normal">(Preserved)</span>}
                    </span>
                  </div>
                  <div className="px-1.5">
                    <span className="text-[9px] uppercase tracking-wider text-[#5D757E] dark:text-[#A0B7BC] block font-sans font-medium">Risk Score</span>
                    <span className={`text-xs font-bold mt-0.5 block tabular-nums ${
                      (cam.smoothed_risk_score ?? 0) >= 70 ? 'text-[#2E151B] dark:text-rose-400' :
                      (cam.smoothed_risk_score ?? 0) >= 40 ? 'text-amber-700 dark:text-amber-400' : 'text-[#376E6F] dark:text-[#6EC4C6]'
                    }`}>
                      {(cam.smoothed_risk_score ?? 0).toFixed(1)}
                    </span>
                  </div>
                  <div className="px-1.5">
                    <span className="text-[9px] uppercase tracking-wider text-[#5D757E] dark:text-[#A0B7BC] block font-sans font-medium">Cap / Inf</span>
                    <span className="text-xs font-bold text-[#1C3334] dark:text-[#EDF4F5] mt-0.5 block tabular-nums">
                      {cam.measured_fps.toFixed(0)}/{cam.processing_fps.toFixed(0)}
                    </span>
                  </div>
                  <div className="px-1.5">
                    <span className="text-[9px] uppercase tracking-wider text-[#5D757E] dark:text-[#A0B7BC] block font-sans font-medium">Freshness</span>
                    <span className={`text-xs font-bold mt-0.5 block tabular-nums ${isStale ? 'text-amber-700 dark:text-amber-400' : 'text-[#376E6F] dark:text-[#6EC4C6]'}`}>
                      {detAge > 0 ? `${detAge.toFixed(1)}s` : '0.0s'}
                    </span>
                  </div>
                </div>

                {/* Error Banner if any */}
                {cam.error_message && (
                  <div className="p-2.5 bg-[#FAF0F2] dark:bg-rose-950/20 border-b border-[#2E151B]/20 dark:border-rose-500/30 text-[11px] text-[#2E151B] dark:text-rose-300 flex items-center space-x-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-[#2E151B] dark:text-rose-400 shrink-0" />
                    <span className="truncate">{cam.error_message}</span>
                  </div>
                )}

                {/* Card Action Controls */}
                <div className="p-3 bg-white dark:bg-[#152729] flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    {cam.is_active ? (
                      <button
                        onClick={() => handleStopCamera(camId)}
                        disabled={!!isActing}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#FAF0F2] dark:bg-[#2E151B]/40 hover:bg-[#F3E2E6] text-[#2E151B] dark:text-rose-200 border border-[#2E151B]/25 dark:border-rose-500/30 rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                      >
                        <Square className="w-3 h-3 fill-current" />
                        <span>{isActing === 'stopping' ? 'Stopping...' : 'Stop'}</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStartCamera(camId)}
                        disabled={!!isActing}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#2F4454] hover:bg-[#1C3334] dark:bg-[#376E6F] dark:hover:bg-[#4A8E8F] text-white rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-50 shadow-xs"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>{isActing === 'starting' ? 'Starting...' : 'Connect'}</span>
                      </button>
                    )}

                    {cam.state === 'RECONNECTING' && (
                      <button
                        onClick={() => handleRetryCamera(camId)}
                        disabled={!!isActing}
                        aria-label="Retry camera connection"
                        className="p-1.5 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30 rounded-lg text-xs transition cursor-pointer"
                        title="Retry Now"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {!cam.is_active && (
                    <button
                      onClick={() => handleRemoveCamera(camId, cam.camera_name || undefined)}
                      disabled={!!isActing}
                      aria-label="Remove camera"
                      className="p-1.5 text-[#5D757E] hover:text-[#2E151B] dark:hover:text-rose-400 hover:bg-[#FAF0F2] dark:hover:bg-rose-950/20 rounded-lg transition cursor-pointer"
                      title="Remove Camera"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Enlarge Feed Modal View */}
      {selectedCameraForView && (() => {
        const modalDetAge = typeof selectedCameraForView.detection_age_seconds === 'number'
          ? selectedCameraForView.detection_age_seconds
          : (selectedCameraForView.frame_age_seconds ?? 0);
        const modalIsStale = (selectedCameraForView.is_stale || (modalDetAge > 2.0)) && selectedCameraForView.is_active;

        return (
          <div 
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setSelectedCameraForView(null)}
          >
            <div 
              className="bg-white dark:bg-[#122224] border border-[#CBD5D8] dark:border-[#233C3F] rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-[#E2E8EA] dark:border-[#233C3F] flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <h3 className="text-base font-bold text-[#1C3334] dark:text-[#EDF4F5]">
                    {selectedCameraForView.camera_name || 'Enlarged Viewport'}
                  </h3>
                  <span className="text-xs font-mono text-[#376E6F] dark:text-[#6EB5B6] font-semibold">
                    {selectedCameraForView.camera_id}
                  </span>
                  <span className="text-xs text-[#5D757E] dark:text-[#A0B7BC] font-mono">
                    • {selectedCameraForView.location || selectedCameraForView.sanitized_url}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  {modalIsStale && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300">
                      STALE DETECTION ({modalDetAge.toFixed(1)}s)
                    </span>
                  )}
                  <button
                    onClick={() => setSelectedCameraForView(null)}
                    className="p-1.5 text-[#5D757E] dark:text-[#A0B7BC] hover:text-[#1C3334] dark:hover:text-white rounded-lg hover:bg-[#F1F4F5] dark:hover:bg-[#16292B] transition cursor-pointer"
                    aria-label="Close enlarged feed"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="aspect-video bg-black flex items-center justify-center relative">
                <img
                  src={multiCameraApi.getStreamUrl(selectedCameraForView.camera_id || '')}
                  alt="Enlarged Camera Stream"
                  className="w-full h-full object-contain"
                  loading="eager"
                />
              </div>

              {/* Bottom Quick Telemetry Strip */}
              <div className="p-3 bg-[#F8F9FA] dark:bg-[#112022] border-t border-[#E2E8EA] dark:border-[#233C3F] grid grid-cols-4 gap-2 text-center font-mono text-xs">
                <div className="p-2 rounded bg-white dark:bg-[#152729] border border-[#CBD5D8] dark:border-[#233C3F]">
                  <span className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] font-sans block">Observed Crowd</span>
                  <span className="font-bold text-[#1C3334] dark:text-[#EDF4F5] block mt-0.5">
                    {selectedCameraForView.person_count ?? 0}
                    {modalIsStale && <span className="text-[9px] text-amber-700 dark:text-amber-400 block font-sans font-normal">(Preserved)</span>}
                  </span>
                </div>
                <div className="p-2 rounded bg-white dark:bg-[#152729] border border-[#CBD5D8] dark:border-[#233C3F]">
                  <span className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] font-sans block">Risk Assessment</span>
                  <span className={`font-bold block mt-0.5 ${
                    (selectedCameraForView.smoothed_risk_score ?? 0) >= 70 ? 'text-[#2E151B] dark:text-rose-400' :
                    (selectedCameraForView.smoothed_risk_score ?? 0) >= 40 ? 'text-amber-700 dark:text-amber-400' : 'text-[#376E6F] dark:text-emerald-400'
                  }`}>
                    {(selectedCameraForView.smoothed_risk_score ?? 0).toFixed(1)} / 100
                  </span>
                </div>
                <div className="p-2 rounded bg-white dark:bg-[#152729] border border-[#CBD5D8] dark:border-[#233C3F]">
                  <span className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] font-sans block">Throughput</span>
                  <span className="font-bold text-[#1C3334] dark:text-[#EDF4F5] block mt-0.5">
                    {selectedCameraForView.measured_fps.toFixed(0)} Cap / {selectedCameraForView.processing_fps.toFixed(0)} Inf FPS
                  </span>
                </div>
                <div className="p-2 rounded bg-white dark:bg-[#152729] border border-[#CBD5D8] dark:border-[#233C3F]">
                  <span className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] font-sans block">Detection Freshness</span>
                  <span className={`font-bold block mt-0.5 ${modalIsStale ? 'text-amber-700 dark:text-amber-400' : 'text-[#376E6F] dark:text-emerald-400'}`}>
                    {modalDetAge > 0 ? `${modalDetAge.toFixed(1)}s` : 'Fresh'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 5. Add Camera Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#122224] border border-[#CBD5D8] dark:border-[#233C3F] rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl my-8">
            <div className="p-4 border-b border-[#E2E8EA] dark:border-[#233C3F] flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Plus className="w-5 h-5 text-[#376E6F] dark:text-[#6EB5B6]" />
                <h3 className="text-sm font-bold text-[#1C3334] dark:text-[#EDF4F5] uppercase tracking-wider">
                  Register Surveillance Camera
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                aria-label="Close registration modal"
                className="p-1.5 text-[#5D757E] dark:text-[#A0B7BC] hover:text-[#1C3334] dark:hover:text-white rounded-lg hover:bg-[#F1F4F5] dark:hover:bg-[#16292B] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRegisterSubmit} className="p-6 space-y-4 text-xs">
              {submitError && (
                <div className="p-3 bg-[#FAF0F2] dark:bg-rose-950/30 border border-[#2E151B]/20 dark:border-rose-500/40 rounded-xl text-[#2E151B] dark:text-rose-300 flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 text-[#2E151B] dark:text-rose-400 shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Source Type Selector */}
              <div>
                <label className="text-[11px] font-bold text-[#1C3334] dark:text-[#EDF4F5] block mb-1.5">
                  Source Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormType('rtsp')}
                    className={`p-3 rounded-xl border flex items-center space-x-2.5 transition cursor-pointer ${
                      formType === 'rtsp'
                        ? 'border-[#376E6F] bg-[#EEF5F5] dark:bg-[#183133] text-[#1C3334] dark:text-white font-semibold'
                        : 'border-[#CBD5D8] dark:border-[#233C3F] bg-[#F8F9FA] dark:bg-[#112022] text-[#5D757E] dark:text-[#A0B7BC]'
                    }`}
                  >
                    <Radio className="w-4 h-4 text-[#376E6F] dark:text-[#6EB5B6]" />
                    <span className="font-medium">Network CCTV (RTSP)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormType('webcam')}
                    className={`p-3 rounded-xl border flex items-center space-x-2.5 transition cursor-pointer ${
                      formType === 'webcam'
                        ? 'border-[#376E6F] bg-[#EEF5F5] dark:bg-[#183133] text-[#1C3334] dark:text-white font-semibold'
                        : 'border-[#CBD5D8] dark:border-[#233C3F] bg-[#F8F9FA] dark:bg-[#112022] text-[#5D757E] dark:text-[#A0B7BC]'
                    }`}
                  >
                    <Camera className="w-4 h-4 text-[#376E6F] dark:text-[#6EB5B6]" />
                    <span className="font-medium">Local Hardware Webcam</span>
                  </button>
                </div>
              </div>

              {/* Common Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-[#1C3334] dark:text-[#EDF4F5] block mb-1">
                    Camera Display Name
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. North Gate CCTV"
                    className="w-full bg-[#F8F9FA] dark:bg-[#112022] border border-[#CBD5D8] dark:border-[#233C3F] rounded-xl px-3 py-2 text-[#1C3334] dark:text-[#EDF4F5] font-mono focus:border-[#376E6F] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#1C3334] dark:text-[#EDF4F5] block mb-1">
                    Location / Zone
                  </label>
                  <input
                    type="text"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    placeholder="e.g. Sector 4 - Main Entrance"
                    className="w-full bg-[#F8F9FA] dark:bg-[#112022] border border-[#CBD5D8] dark:border-[#233C3F] rounded-xl px-3 py-2 text-[#1C3334] dark:text-[#EDF4F5] font-mono focus:border-[#376E6F] focus:outline-none"
                  />
                </div>
              </div>

              {/* Conditional: RTSP vs Webcam fields */}
              {formType === 'rtsp' ? (
                <div className="space-y-3 p-4 bg-[#F8F9FA] dark:bg-[#112022] rounded-xl border border-[#CBD5D8] dark:border-[#233C3F]">
                  <div>
                    <label className="text-[11px] font-bold text-[#1C3334] dark:text-[#EDF4F5] block mb-1">
                      RTSP Stream URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={formRtspUrl}
                        onChange={(e) => setFormRtspUrl(e.target.value)}
                        placeholder="rtsp://192.168.1.100:554/live/ch0"
                        className="flex-1 bg-white dark:bg-[#152729] border border-[#CBD5D8] dark:border-[#233C3F] rounded-xl px-3 py-2 text-[#1C3334] dark:text-[#EDF4F5] font-mono focus:border-[#376E6F] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleValidateFormSource}
                        disabled={valLoading}
                        className="px-3 py-2 bg-[#F1F4F5] dark:bg-[#16292B] hover:bg-[#E4EAEB] text-[#2F4454] dark:text-[#EDF4F5] border border-[#CBD5D8] dark:border-[#233C3F] rounded-xl font-semibold transition cursor-pointer"
                      >
                        {valLoading ? 'Validating...' : 'Validate'}
                      </button>
                    </div>
                  </div>

                  {valResult && (
                    <div className={`p-2.5 rounded-lg border text-[11px] font-mono flex items-center space-x-2 ${
                      valResult.is_valid
                        ? 'bg-[#EEF5F5] dark:bg-[#183133] border-[#376E6F]/30 text-[#376E6F] dark:text-[#6EC4C6]'
                        : 'bg-[#FAF0F2] dark:bg-rose-950/20 border-[#2E151B]/20 text-[#2E151B] dark:text-rose-300'
                    }`}>
                      {valResult.is_valid ? <CheckCircle2 className="w-4 h-4 text-[#376E6F] dark:text-[#6EC4C6] shrink-0" /> : <AlertTriangle className="w-4 h-4 text-[#2E151B] dark:text-rose-400 shrink-0" />}
                      <span className="truncate">{valResult.sanitized_url} ({valResult.is_valid ? 'Authorized destination' : valResult.error_message})</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-[#1C3334] dark:text-[#EDF4F5] block mb-1">
                        Username (Optional)
                      </label>
                      <input
                        type="text"
                        value={formUsername}
                        onChange={(e) => setFormUsername(e.target.value)}
                        placeholder="admin"
                        className="w-full bg-white dark:bg-[#152729] border border-[#CBD5D8] dark:border-[#233C3F] rounded-xl px-3 py-2 text-[#1C3334] dark:text-[#EDF4F5] font-mono focus:border-[#376E6F] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-[#1C3334] dark:text-[#EDF4F5] block mb-1">
                        Password (Optional)
                      </label>
                      <input
                        type="password"
                        value={formPassword}
                        onChange={(e) => setFormPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-white dark:bg-[#152729] border border-[#CBD5D8] dark:border-[#233C3F] rounded-xl px-3 py-2 text-[#1C3334] dark:text-[#EDF4F5] font-mono focus:border-[#376E6F] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-[#F8F9FA] dark:bg-[#112022] rounded-xl border border-[#CBD5D8] dark:border-[#233C3F]">
                  <label className="text-[11px] font-bold text-[#1C3334] dark:text-[#EDF4F5] block mb-1">
                    Hardware Device Index
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={formDeviceIndex}
                    onChange={(e) => setFormDeviceIndex(parseInt(e.target.value, 10))}
                    className="w-full bg-white dark:bg-[#152729] border border-[#CBD5D8] dark:border-[#233C3F] rounded-xl px-3 py-2 text-[#1C3334] dark:text-[#EDF4F5] font-mono focus:border-[#376E6F] focus:outline-none"
                  />
                  <p className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] mt-1">Default integrated webcam is typically index 0.</p>
                </div>
              )}

              {/* Hyperparameters */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-[#1C3334] dark:text-[#EDF4F5] block mb-1">Target FPS</label>
                  <input
                    type="number"
                    min={5}
                    max={60}
                    value={formTargetFps}
                    onChange={(e) => setFormTargetFps(parseFloat(e.target.value))}
                    className="w-full bg-[#F8F9FA] dark:bg-[#112022] border border-[#CBD5D8] dark:border-[#233C3F] rounded-xl px-3 py-2 text-[#1C3334] dark:text-[#EDF4F5] font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#1C3334] dark:text-[#EDF4F5] block mb-1">Conf Threshold</label>
                  <input
                    type="number"
                    step={0.05}
                    min={0.1}
                    max={0.9}
                    value={formConfThreshold}
                    onChange={(e) => setFormConfThreshold(parseFloat(e.target.value))}
                    className="w-full bg-[#F8F9FA] dark:bg-[#112022] border border-[#CBD5D8] dark:border-[#233C3F] rounded-xl px-3 py-2 text-[#1C3334] dark:text-[#EDF4F5] font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#1C3334] dark:text-[#EDF4F5] block mb-1">Privacy Mode</label>
                  <select
                    value={formPrivacyMode}
                    onChange={(e) => setFormPrivacyMode(e.target.value)}
                    className="w-full bg-[#F8F9FA] dark:bg-[#112022] border border-[#CBD5D8] dark:border-[#233C3F] rounded-xl px-3 py-2 text-[#1C3334] dark:text-[#EDF4F5] font-mono cursor-pointer"
                  >
                    <option value="none">None (Raw)</option>
                    <option value="face_blur">Face Blur</option>
                    <option value="full_anonymize">Full Silhouette</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="startImmediately"
                  checked={formStartImmediately}
                  onChange={(e) => setFormStartImmediately(e.target.checked)}
                  className="rounded border-[#CBD5D8] dark:border-[#233C3F] text-[#2F4454] focus:ring-0 cursor-pointer"
                />
                <label htmlFor="startImmediately" className="text-[#1C3334] dark:text-[#EDF4F5] cursor-pointer font-medium">
                  Start ingestion immediately upon registration
                </label>
              </div>

              <div className="pt-4 border-t border-[#E2E8EA] dark:border-[#233C3F] flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-[#F1F4F5] dark:bg-[#16292B] hover:bg-[#E4EAEB] text-[#5D757E] dark:text-[#A0B7BC] rounded-xl font-medium transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-[#2F4454] hover:bg-[#1C3334] dark:bg-[#376E6F] dark:hover:bg-[#4A8E8F] text-white rounded-xl font-semibold transition cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Registering...' : 'Register Camera'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiCameraPage;
