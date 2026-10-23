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
  Clock,
  RefreshCw,
  Video
} from 'lucide-react';
import { multiCameraApi } from '../services/api';
import { CameraSessionStatus, MultiCameraHealth } from '../types';
import { KPICard, StatusPill, EmptyState, RiskBadge } from '../components/UIComponents';

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
      const [cams, hlth] = await Promise.all([
        multiCameraApi.list(),
        multiCameraApi.getHealth().catch(() => null)
      ]);
      setCameras(cams);
      setHealth(hlth);
      setErrorMessage(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to query camera registry.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCamerasAndHealth();
    const interval = window.setInterval(() => fetchCamerasAndHealth(true), 2000);
    return () => clearInterval(interval);
  }, [fetchCamerasAndHealth]);

  // Camera action handlers
  const handleStartCamera = async (cameraId: string) => {
    setActionLoading((prev) => ({ ...prev, [cameraId]: 'starting' }));
    try {
      await multiCameraApi.start(cameraId);
      await fetchCamerasAndHealth(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to start camera.');
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[cameraId];
        return next;
      });
    }
  };

  const handleStopCamera = async (cameraId: string) => {
    setActionLoading((prev) => ({ ...prev, [cameraId]: 'stopping' }));
    try {
      await multiCameraApi.stop(cameraId);
      await fetchCamerasAndHealth(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to stop camera.');
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[cameraId];
        return next;
      });
    }
  };

  const handleRetryCamera = async (cameraId: string) => {
    setActionLoading((prev) => ({ ...prev, [cameraId]: 'retrying' }));
    try {
      await multiCameraApi.retry(cameraId);
      await fetchCamerasAndHealth(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to retry camera.');
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[cameraId];
        return next;
      });
    }
  };

  const handleRemoveCamera = async (cameraId: string, name?: string) => {
    if (!window.confirm(`Are you sure you want to remove ${name || cameraId}?`)) return;
    setActionLoading((prev) => ({ ...prev, [cameraId]: 'removing' }));
    try {
      await multiCameraApi.remove(cameraId);
      await fetchCamerasAndHealth(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to remove camera.');
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[cameraId];
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
        password: formPassword || undefined
      });
      setValResult(res);
      if (!res.is_valid && res.error_message) {
        setSubmitError(res.error_message);
      }
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Validation failed.');
    } finally {
      setValLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
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
        start_immediately: formStartImmediately
      });
      setIsModalOpen(false);
      // Reset form sensitive fields
      setFormPassword('');
      await fetchCamerasAndHealth(false);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to register camera.');
    } finally {
      setSubmitting(false);
    }
  };

  const stateColors: Record<string, string> = {
    IDLE: 'bg-slate-800 text-slate-300 border-slate-700',
    CONNECTING: 'bg-cyan-950/40 text-cyan-300 border-cyan-500/30 animate-pulse',
    CONNECTED: 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30',
    DEGRADED: 'bg-amber-950/40 text-amber-300 border-amber-500/30',
    RECONNECTING: 'bg-amber-950/40 text-amber-300 border-amber-500/30 animate-pulse',
    ERROR: 'bg-rose-950/40 text-rose-300 border-rose-500/30',
    DISCONNECTED: 'bg-rose-950/40 text-rose-300 border-rose-500/30',
    STOPPING: 'bg-slate-800 text-slate-400 border-slate-700',
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Global Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-[#192638] gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h2 className="text-xl font-bold tracking-tight text-white">
              MULTI-CAMERA COMMAND CENTER
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/25">
              CONCURRENT SESSIONS
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Manage, ingest, and analyze multiple CCTV surveillance nodes simultaneously. Each camera maintains an independent capture pipeline, isolated ByteTrack tracking IDs, perspective-aware density calculations, and heuristic disaster risk scoring.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => fetchCamerasAndHealth(false)}
            disabled={refreshing}
            aria-label="Refresh Registry"
            className="p-2 bg-[#0A1018] hover:bg-[#121C2B] text-slate-300 hover:text-white border border-[#192638] rounded-xl text-xs transition cursor-pointer"
            title="Refresh Registry"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold transition cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add Camera Feed</span>
          </button>
        </div>
      </div>

      {/* 2. Aggregate Fleet Health & Capacity HUD */}
      {health && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <KPICard
            label="Registered Feeds"
            value={`${health.total_registered} / ${health.max_registered_limit}`}
            unit="nodes"
            icon={Layers}
            tone="cyan"
            subtext="Allocated Slots"
          />
          <KPICard
            label="Active Streams"
            value={`${health.active_streams} / ${health.max_active_limit}`}
            unit="live"
            icon={Radio}
            tone="emerald"
            subtext="Concurrent Ingestion"
          />
          <KPICard
            label="Connected Nodes"
            value={health.connected_count}
            unit="healthy"
            icon={CheckCircle2}
            tone="emerald"
            subtext="Stable Frame Delivery"
          />
          <KPICard
            label="Nodes In Recovery"
            value={health.reconnecting_count}
            unit="retrying"
            icon={AlertTriangle}
            tone={health.reconnecting_count > 0 ? 'amber' : 'neutral'}
            subtext="Exponential Backoff"
          />
          <KPICard
            label="Fleet Observed Crowd"
            value={health.total_observed_persons}
            unit="persons"
            icon={Users}
            tone="cyan"
            subtext="Across All Sectors"
          />
          <KPICard
            label="Peak Fleet Risk"
            value={health.highest_risk_score.toFixed(1)}
            unit="/ 100"
            icon={ShieldAlert}
            tone={health.highest_risk_score >= 70 ? 'rose' : health.highest_risk_score >= 40 ? 'amber' : 'emerald'}
            subtext={`Status: ${health.system_status}`}
          />
        </div>
      )}

      {/* 3. Camera Cards Grid */}
      {loading ? (
        <div className="py-20 text-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin mx-auto" />
          <p className="text-xs text-slate-400 font-mono">Loading camera fleet registry...</p>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
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
                className="bg-[#0A1018] border border-[#192638] rounded-2xl overflow-hidden flex flex-col justify-between hover:border-slate-700 transition-all shadow-sm"
              >
                {/* Card Header */}
                <div className="p-4 border-b border-[#192638] flex items-center justify-between">
                  <div className="flex items-center space-x-2.5 truncate">
                    {cam.source_type === 'rtsp' ? (
                      <Radio className="w-4 h-4 text-cyan-400 shrink-0" />
                    ) : (
                      <Camera className="w-4 h-4 text-cyan-400 shrink-0" />
                    )}
                    <div className="truncate">
                      <h3 className="text-sm font-semibold text-white tracking-wide truncate">
                        {cam.camera_name || 'Unnamed Camera'}
                      </h3>
                      <p className="text-[10px] font-mono text-slate-400 truncate">
                        {cam.location || cam.sanitized_url || `Device #${cam.device_index}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0">
                    {isStale && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-medium border bg-amber-950/40 text-amber-300 border-amber-500/40 animate-pulse">
                        STALE
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border ${stateColors[cam.state] || stateColors.IDLE}`}>
                      {cam.state}
                    </span>
                  </div>
                </div>

                {/* Card Viewport Preview */}
                <div className="aspect-video bg-[#05080E] relative flex items-center justify-center overflow-hidden border-b border-[#192638]">
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
                        <div className="absolute top-2 left-2 px-2.5 py-1 rounded-lg bg-amber-950/90 border border-amber-500/60 text-[10px] text-amber-200 font-mono flex items-center space-x-1.5 shadow-md">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                          <span>STALE DETECTION ({detAge.toFixed(1)}s)</span>
                        </div>
                      )}
                      <button
                        onClick={() => setSelectedCameraForView(cam)}
                        className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white border border-white/20 transition cursor-pointer"
                        title="Enlarge Feed"
                        aria-label={`Enlarge feed for ${cam.camera_name || 'camera'}`}
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : cam.state === 'CONNECTING' ? (
                    <div className="text-center p-6 space-y-2">
                      <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin mx-auto" />
                      <p className="text-xs text-cyan-300 font-mono">Connecting to stream...</p>
                      <p className="text-[10px] text-slate-500 font-mono truncate max-w-xs mx-auto">
                        {cam.sanitized_url || `Device #${cam.device_index}`}
                      </p>
                    </div>
                  ) : cam.state === 'RECONNECTING' ? (
                    <div className="text-center p-6 space-y-2">
                      <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin mx-auto" />
                      <p className="text-xs text-amber-300 font-mono">Reconnecting (Attempt {cam.retry_count}/{cam.max_retries})...</p>
                      <p className="text-[10px] text-slate-400 font-mono">Next try in {cam.next_retry_delay_sec?.toFixed(1)}s</p>
                    </div>
                  ) : (
                    <div className="text-center p-6 space-y-2">
                      <div className="w-10 h-10 rounded-xl bg-[#0E1622] border border-[#1E2D40] flex items-center justify-center mx-auto text-slate-500">
                        {cam.source_type === 'rtsp' ? <Radio className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
                      </div>
                      <p className="text-xs text-slate-400 font-mono">Stream Inactive / Disconnected</p>
                    </div>
                  )}
                </div>

                {/* Card Telemetry Strip */}
                <div className="p-3 grid grid-cols-4 gap-2 bg-[#070B11] border-b border-[#192638] text-center font-mono">
                  <div className="p-1.5 rounded-lg bg-[#0A1018] border border-[#192638]">
                    <span className="text-[10px] text-slate-400 block font-sans">Observed</span>
                    <span className="text-sm font-bold text-white mt-0.5 block">
                      {cam.person_count ?? 0}
                      {isStale && <span className="text-[9px] text-amber-400 block font-sans font-normal">(Preserved)</span>}
                    </span>
                  </div>
                  <div className="p-1.5 rounded-lg bg-[#0A1018] border border-[#192638]">
                    <span className="text-[10px] text-slate-400 block font-sans">Risk Score</span>
                    <span className={`text-sm font-bold mt-0.5 block ${
                      (cam.smoothed_risk_score ?? 0) >= 70 ? 'text-rose-400' :
                      (cam.smoothed_risk_score ?? 0) >= 40 ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {(cam.smoothed_risk_score ?? 0).toFixed(1)}
                    </span>
                  </div>
                  <div className="p-1.5 rounded-lg bg-[#0A1018] border border-[#192638]">
                    <span className="text-[10px] text-slate-400 block font-sans">FPS (Cap/Inf)</span>
                    <span className="text-[11px] font-bold text-slate-200 mt-1 block">
                      {cam.measured_fps.toFixed(0)} / {cam.processing_fps.toFixed(0)}
                    </span>
                  </div>
                  <div className="p-1.5 rounded-lg bg-[#0A1018] border border-[#192638]">
                    <span className="text-[10px] text-slate-400 block font-sans">Freshness</span>
                    <span className={`text-[11px] font-bold mt-1 block ${isStale ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {detAge > 0 ? `${detAge.toFixed(1)}s` : 'Fresh'}
                    </span>
                  </div>
                </div>

                {/* Error Banner if any */}
                {cam.error_message && (
                  <div className="p-2.5 bg-rose-950/20 border-b border-rose-500/30 text-[11px] text-rose-300 flex items-center space-x-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span className="truncate">{cam.error_message}</span>
                  </div>
                )}

                {/* Card Action Controls */}
                <div className="p-3 bg-[#0A1018] flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    {cam.is_active ? (
                      <button
                        onClick={() => handleStopCamera(camId)}
                        disabled={!!isActing}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-medium transition cursor-pointer disabled:opacity-50"
                      >
                        <Square className="w-3 h-3 fill-current" />
                        <span>{isActing === 'stopping' ? 'Stopping...' : 'Stop'}</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStartCamera(camId)}
                        disabled={!!isActing}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-50 shadow-xs"
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
                        className="p-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-lg text-xs transition cursor-pointer"
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
                      className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/20 rounded-lg transition cursor-pointer"
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
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setSelectedCameraForView(null)}
          >
            <div 
              className="bg-[#0A1018] border border-[#192638] rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-[#192638] flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <h3 className="text-base font-bold text-white">
                    {selectedCameraForView.camera_name || 'Enlarged Viewport'}
                  </h3>
                  <span className="text-xs font-mono text-cyan-400">
                    {selectedCameraForView.camera_id}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    • {selectedCameraForView.location || selectedCameraForView.sanitized_url}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  {modalIsStale && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950/60 text-amber-300 border border-amber-500/40">
                      STALE DETECTION ({modalDetAge.toFixed(1)}s)
                    </span>
                  )}
                  <button
                    onClick={() => setSelectedCameraForView(null)}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-[#121C2B] transition cursor-pointer"
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
              <div className="p-3 bg-[#070B11] border-t border-[#192638] grid grid-cols-4 gap-2 text-center font-mono text-xs">
                <div className="p-2 rounded bg-[#0A1018] border border-[#192638]">
                  <span className="text-[10px] text-slate-400 font-sans block">Observed Crowd</span>
                  <span className="font-bold text-white block mt-0.5">
                    {selectedCameraForView.person_count ?? 0}
                    {modalIsStale && <span className="text-[9px] text-amber-400 block font-sans font-normal">(Preserved)</span>}
                  </span>
                </div>
                <div className="p-2 rounded bg-[#0A1018] border border-[#192638]">
                  <span className="text-[10px] text-slate-400 font-sans block">Risk Assessment</span>
                  <span className={`font-bold block mt-0.5 ${
                    (selectedCameraForView.smoothed_risk_score ?? 0) >= 70 ? 'text-rose-400' :
                    (selectedCameraForView.smoothed_risk_score ?? 0) >= 40 ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {(selectedCameraForView.smoothed_risk_score ?? 0).toFixed(1)} / 100
                  </span>
                </div>
                <div className="p-2 rounded bg-[#0A1018] border border-[#192638]">
                  <span className="text-[10px] text-slate-400 font-sans block">Throughput</span>
                  <span className="font-bold text-slate-200 block mt-0.5">
                    {selectedCameraForView.measured_fps.toFixed(0)} Cap / {selectedCameraForView.processing_fps.toFixed(0)} Inf FPS
                  </span>
                </div>
                <div className="p-2 rounded bg-[#0A1018] border border-[#192638]">
                  <span className="text-[10px] text-slate-400 font-sans block">Detection Freshness</span>
                  <span className={`font-bold block mt-0.5 ${modalIsStale ? 'text-amber-400' : 'text-emerald-400'}`}>
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0A1018] border border-[#192638] rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl my-8">
            <div className="p-4 border-b border-[#192638] flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Plus className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Register Surveillance Camera
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                aria-label="Close registration modal"
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-[#121C2B] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRegisterSubmit} className="p-6 space-y-4 text-xs">
              {submitError && (
                <div className="p-3 bg-rose-950/30 border border-rose-500/40 rounded-xl text-rose-300 flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Source Type Selector */}
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
                  Source Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormType('rtsp')}
                    className={`p-3 rounded-xl border flex items-center space-x-2.5 transition cursor-pointer ${
                      formType === 'rtsp'
                        ? 'border-cyan-500 bg-cyan-950/20 text-white'
                        : 'border-[#192638] bg-[#070B11] text-slate-400'
                    }`}
                  >
                    <Radio className="w-4 h-4 text-cyan-400" />
                    <span className="font-medium">Network CCTV (RTSP)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormType('webcam')}
                    className={`p-3 rounded-xl border flex items-center space-x-2.5 transition cursor-pointer ${
                      formType === 'webcam'
                        ? 'border-cyan-500 bg-cyan-950/20 text-white'
                        : 'border-[#192638] bg-[#070B11] text-slate-400'
                    }`}
                  >
                    <Camera className="w-4 h-4 text-cyan-400" />
                    <span className="font-medium">Local Hardware Webcam</span>
                  </button>
                </div>
              </div>

              {/* Common Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Camera Display Name
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. North Gate CCTV"
                    className="w-full bg-[#070B11] border border-[#192638] rounded-xl px-3 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Location / Zone
                  </label>
                  <input
                    type="text"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    placeholder="e.g. Sector 4 - Main Entrance"
                    className="w-full bg-[#070B11] border border-[#192638] rounded-xl px-3 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Conditional: RTSP vs Webcam fields */}
              {formType === 'rtsp' ? (
                <div className="space-y-3 p-4 bg-[#070B11] rounded-xl border border-[#192638]">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      RTSP Stream URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={formRtspUrl}
                        onChange={(e) => setFormRtspUrl(e.target.value)}
                        placeholder="rtsp://192.168.1.100:554/live/ch0"
                        className="flex-1 bg-[#0A1018] border border-[#192638] rounded-xl px-3 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleValidateFormSource}
                        disabled={valLoading}
                        className="px-3 py-2 bg-[#121C2B] hover:bg-[#1A2638] text-cyan-300 border border-[#192638] rounded-xl font-medium transition cursor-pointer"
                      >
                        {valLoading ? 'Validating...' : 'Validate'}
                      </button>
                    </div>
                  </div>

                  {valResult && (
                    <div className={`p-2.5 rounded-lg border text-[11px] font-mono flex items-center space-x-2 ${
                      valResult.is_valid
                        ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                        : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                    }`}>
                      {valResult.is_valid ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />}
                      <span className="truncate">{valResult.sanitized_url} ({valResult.is_valid ? 'Authorized destination' : valResult.error_message})</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                        Username (Optional)
                      </label>
                      <input
                        type="text"
                        value={formUsername}
                        onChange={(e) => setFormUsername(e.target.value)}
                        placeholder="admin"
                        className="w-full bg-[#0A1018] border border-[#192638] rounded-xl px-3 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                        Password (Optional)
                      </label>
                      <input
                        type="password"
                        value={formPassword}
                        onChange={(e) => setFormPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-[#0A1018] border border-[#192638] rounded-xl px-3 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-[#070B11] rounded-xl border border-[#192638]">
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Hardware Device Index
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={formDeviceIndex}
                    onChange={(e) => setFormDeviceIndex(parseInt(e.target.value, 10))}
                    className="w-full bg-[#0A1018] border border-[#192638] rounded-xl px-3 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Default integrated webcam is typically index 0.</p>
                </div>
              )}

              {/* Hyperparameters */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Target FPS</label>
                  <input
                    type="number"
                    min={5}
                    max={60}
                    value={formTargetFps}
                    onChange={(e) => setFormTargetFps(parseFloat(e.target.value))}
                    className="w-full bg-[#070B11] border border-[#192638] rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Conf Threshold</label>
                  <input
                    type="number"
                    step={0.05}
                    min={0.1}
                    max={0.9}
                    value={formConfThreshold}
                    onChange={(e) => setFormConfThreshold(parseFloat(e.target.value))}
                    className="w-full bg-[#070B11] border border-[#192638] rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Privacy Mode</label>
                  <select
                    value={formPrivacyMode}
                    onChange={(e) => setFormPrivacyMode(e.target.value)}
                    className="w-full bg-[#070B11] border border-[#192638] rounded-xl px-3 py-2 text-white font-mono cursor-pointer"
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
                  className="rounded border-[#192638] text-cyan-600 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="startImmediately" className="text-slate-300 cursor-pointer">
                  Start ingestion immediately upon registration
                </label>
              </div>

              <div className="pt-4 border-t border-[#192638] flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-[#0E1622] hover:bg-[#141E2B] text-slate-300 rounded-xl font-medium transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-semibold transition cursor-pointer shadow-xs disabled:opacity-50"
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
