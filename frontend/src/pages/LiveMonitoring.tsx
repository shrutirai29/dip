import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { 
  FileSpreadsheet, 
  Activity, 
  Users, 
  TrendingUp, 
  Compass, 
  RefreshCw, 
  Video as VideoIcon,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Info,
  AlertTriangle,
  Camera,
  Square,
  AlertCircle
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  CartesianGrid,
  ReferenceLine
} from 'recharts';
import { analysisApi, incidentApi, cameraApi } from '../services/api';
import { Analysis, FrameRecord, Incident, GridDensityCell, CameraSessionStatus } from '../types';
import { 
  KPICard, 
  RiskBadge, 
  StatusPill, 
  EmptyState, 
  ErrorState, 
  LoadingBlock 
} from '../components/UIComponents';
import { useSystem } from '../context/SystemContext';

export const LiveMonitoring: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryAnalysisId = searchParams.get('analysisId');
  const sourceParam = searchParams.get('source');
  const { 
    selectedAnalysis: contextAnalysis, 
    setSelectedAnalysis: setContextAnalysis,
    cameraSessionStatus
  } = useSystem();

  // Primary source toggle: 'recorded' | 'webcam' derived from URL
  const activeSource = sourceParam === 'webcam' ? 'webcam' : 'recorded';

  // Recorded Sessions State
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<Analysis | null>(null);
  const [results, setResults] = useState<FrameRecord[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<number>(0);
  const [selectedZone, setSelectedZone] = useState<GridDensityCell | null>(null);

  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Live Webcam Feed State - initialized from context to prevent layout flicker
  const [cameraStatus, setCameraStatus] = useState<CameraSessionStatus | null>(() => cameraSessionStatus);
  const [liveTelemetry, setLiveTelemetry] = useState<FrameRecord | null>(null);
  const [liveHistory, setLiveHistory] = useState<FrameRecord[]>([]);
  const [selectedLiveZone, setSelectedLiveZone] = useState<GridDensityCell | null>(null);
  const [cameraActionLoading, setCameraActionLoading] = useState<boolean>(false);
  const [cameraActionError, setCameraActionError] = useState<string | null>(null);
  const [isBackendOffline, setIsBackendOffline] = useState<boolean>(false);
  const [streamKey, setStreamKey] = useState<number>(0);
  const [telemetryAge, setTelemetryAge] = useState<number | null>(null);

  // Keep cameraStatus in sync if context updates
  useEffect(() => {
    if (cameraSessionStatus && !cameraStatus) {
      setCameraStatus(cameraSessionStatus);
    }
  }, [cameraSessionStatus, cameraStatus]);

  // Handle URL source parameter synchronization
  const handleSourceChange = (source: 'recorded' | 'webcam') => {
    if (source === 'webcam') {
      setSearchParams({ source: 'webcam' });
    } else {
      if (selectedAnalysis) {
        setSearchParams({ analysisId: selectedAnalysis.id });
      } else {
        setSearchParams({});
      }
    }
  };

  // Load detailed telemetry and incidents for a chosen recorded session
  const loadSessionDetails = useCallback(async (id: string) => {
    setLoadingDetails(true);
    try {
      const [resData, incData] = await Promise.allSettled([
        analysisApi.getResults(id),
        incidentApi.getAll(),
      ]);

      if (resData.status === 'fulfilled') {
        const frames = resData.value;
        setResults(frames);
        if (frames.length > 0) {
          const idx = frames.length - 1;
          setSelectedFrameIndex(idx);
          const latest = frames[idx];
          if (latest.grid_density && latest.grid_density.length > 0) {
            setSelectedZone(latest.grid_density[4] || latest.grid_density[0]);
          } else {
            setSelectedZone(null);
          }
        } else {
          setSelectedFrameIndex(0);
          setSelectedZone(null);
        }
      } else {
        setResults([]);
      }

      if (incData.status === 'fulfilled') {
        setIncidents(incData.value.filter((i) => i.analysis_id === id));
      } else {
        setIncidents([]);
      }
    } catch (err) {
      console.error('Failed to load session details:', err);
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  // Context analysis ref to avoid recreating loadAnalyses when contextAnalysis changes
  const contextAnalysisRef = useRef(contextAnalysis);
  useEffect(() => {
    contextAnalysisRef.current = contextAnalysis;
  }, [contextAnalysis]);

  // Load available analysis sessions
  const loadAnalyses = useCallback(async () => {
    setLoadingList(true);
    setErrorMessage(null);
    try {
      const data = await analysisApi.getAll();
      setAnalyses(data);
      if (data.length > 0) {
        const currentContextId = contextAnalysisRef.current?.id;
        const target = queryAnalysisId 
          ? data.find((a) => a.id === queryAnalysisId) || data[0]
          : currentContextId 
            ? data.find((a) => a.id === currentContextId) || data[0]
            : data[0];
        
        setSelectedAnalysis(target);
        if (currentContextId !== target.id) {
          setContextAnalysis(target);
        }
        loadSessionDetails(target.id);
      } else {
        setSelectedAnalysis(null);
        setResults([]);
        setIncidents([]);
      }
    } catch (err) {
      console.error('Failed to load analyses:', err);
      setErrorMessage('Unable to retrieve surveillance analysis catalog from the backend.');
    } finally {
      setLoadingList(false);
    }
  }, [queryAnalysisId, setContextAnalysis, loadSessionDetails]);

  useEffect(() => {
    loadAnalyses();
  }, [loadAnalyses]);

  // Live polling concurrency guard
  const isPollingRef = useRef<boolean>(false);

  // Live polling for webcam telemetry & status
  const fetchLiveTelemetry = useCallback(async () => {
    if (isPollingRef.current) return;
    isPollingRef.current = true;
    try {
      const [statusRes, telemRes] = await Promise.allSettled([
        cameraApi.getStatus(),
        cameraApi.getLatestTelemetry(),
      ]);

      if (statusRes.status === 'fulfilled') {
        setCameraStatus(statusRes.value);
        setIsBackendOffline(false);
      } else {
        setIsBackendOffline(true);
      }

      if (telemRes.status === 'fulfilled') {
        const frame = telemRes.value;
        const now = Date.now() / 1000;
        setTelemetryAge(Math.max(0, now - frame.timestamp_sec));
        setLiveTelemetry(frame);
        setLiveHistory((prev) => {
          if (prev.length > 0 && prev[prev.length - 1].frame_index === frame.frame_index) {
            return prev;
          }
          const updated = [...prev, frame];
          return updated.length > 60 ? updated.slice(updated.length - 60) : updated;
        });

        if (frame.grid_density && frame.grid_density.length > 0) {
          setSelectedLiveZone((prevZone) => {
            if (!prevZone) return frame.grid_density![4] || frame.grid_density![0];
            const matching = frame.grid_density!.find((z) => z.name === prevZone.name);
            return matching || frame.grid_density![4] || frame.grid_density![0];
          });
        }
      }
    } catch {
      setIsBackendOffline(true);
    } finally {
      isPollingRef.current = false;
    }
  }, []);

  // Poll live webcam feed only when activeSource is 'webcam'
  useEffect(() => {
    if (activeSource !== 'webcam') return;

    fetchLiveTelemetry();
    const interval = setInterval(fetchLiveTelemetry, 1200);
    return () => clearInterval(interval);
  }, [activeSource, fetchLiveTelemetry]);

  // Start webcam ingestion directly
  const handleStartWebcam = async () => {
    setCameraActionLoading(true);
    setCameraActionError(null);
    try {
      const res = await cameraApi.start({
        device_index: 0,
        target_fps: 25.0,
        conf_threshold: 0.25,
        perspective_weight: 1.0,
        privacy_mode: 'none',
      });
      setCameraStatus(res);
      setStreamKey((prev) => prev + 1);
      fetchLiveTelemetry();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect to local webcam device.';
      setCameraActionError(msg);
    } finally {
      setCameraActionLoading(false);
    }
  };

  // Stop webcam ingestion directly
  const handleStopWebcam = async () => {
    setCameraActionLoading(true);
    setCameraActionError(null);
    try {
      const res = await cameraApi.stop();
      setCameraStatus(res);
      setLiveTelemetry(null);
      setLiveHistory([]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to stop camera session.';
      setCameraActionError(msg);
    } finally {
      setCameraActionLoading(false);
    }
  };

  const handleSelectAnalysis = (id: string) => {
    const found = analyses.find((a) => a.id === id);
    if (found) {
      setSelectedAnalysis(found);
      setContextAnalysis(found);
      setSearchParams({ analysisId: found.id });
      loadSessionDetails(found.id);
    }
  };

  const currentFrame: FrameRecord | null = results[selectedFrameIndex] || null;

  // Sync selected zone when active frame changes if none is selected (for recorded mode)
  useEffect(() => {
    if (currentFrame?.grid_density && currentFrame.grid_density.length > 0) {
      if (!selectedZone) {
        setSelectedZone(currentFrame.grid_density[4] || currentFrame.grid_density[0]);
      } else {
        const matching = currentFrame.grid_density.find(z => z.name === selectedZone.name);
        if (matching) setSelectedZone(matching);
      }
    }
  }, [currentFrame, selectedZone]);

  // Playback timer for frame timeline scrubbing (recorded mode)
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying && results.length > 1) {
      interval = setInterval(() => {
        setSelectedFrameIndex((prev) => {
          if (prev >= results.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isPlaying, results.length]);

  // Click on chart to jump to specific frame (recorded mode)
  const handleChartClick = (e: any) => {
    if (e && e.activePayload && e.activePayload.length > 0) {
      const record = e.activePayload[0].payload as FrameRecord;
      const idx = results.findIndex((f) => f.frame_index === record.frame_index);
      if (idx !== -1) {
        setSelectedFrameIndex(idx);
        setIsPlaying(false);
      }
    }
  };

  // Telemetry Freshness computation for live webcam feed
  const isStale = telemetryAge !== null && telemetryAge > 3.0;

  if (loadingList && analyses.length === 0 && activeSource === 'recorded') {
    return (
      <div className="space-y-6">
        <LoadingBlock text="Connecting to surveillance telemetry bus..." height="h-96" />
      </div>
    );
  }

  if (errorMessage && activeSource === 'recorded') {
    return (
      <div className="space-y-6">
        <ErrorState message={errorMessage} onRetry={loadAnalyses} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* -------------------------------------------------------------------------
          1. HEADER WITH FEED SOURCE SWITCHER & TELEMETRY CONTROLS
          ------------------------------------------------------------------------- */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-4 border-b border-[#1E2D40] gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-xl font-bold text-white tracking-tight">
              {activeSource === 'webcam' ? 'LIVE HARDWARE WEBCAM MONITORING' : 'TELEMETRY & SPATIAL REPLAY'}
            </h1>

            {activeSource === 'webcam' ? (
              isBackendOffline ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-950/40 text-rose-300 border border-rose-500/30">
                  BACKEND_OFFLINE
                </span>
              ) : (
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border ${
                  cameraStatus?.state === 'CONNECTED' ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30' :
                  cameraStatus?.state === 'CONNECTING' ? 'bg-cyan-950/40 text-cyan-300 border-cyan-500/30 animate-pulse' :
                  cameraStatus?.state === 'DEGRADED' ? 'bg-amber-950/40 text-amber-300 border-amber-500/30' :
                  cameraStatus?.state === 'DISCONNECTED' ? 'bg-rose-950/40 text-rose-300 border-rose-500/30' :
                  'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {cameraStatus?.state || 'IDLE'}
                </span>
              )
            ) : (
              selectedAnalysis && <StatusPill status={selectedAnalysis.status} />
            )}

            {/* Freshness / Stale Warning in Live Mode */}
            {activeSource === 'webcam' && cameraStatus?.is_active && (
              isStale ? (
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950/50 text-amber-300 border border-amber-500/40 animate-pulse">
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  <span>STALE TELEMETRY ({telemetryAge?.toFixed(1)}s age)</span>
                </span>
              ) : telemetryAge !== null ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950/30 text-cyan-300 border border-cyan-500/20">
                  Freshness: {telemetryAge.toFixed(1)}s
                </span>
              ) : null
            )}

            {activeSource === 'recorded' && incidents.length > 0 && (
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-mono font-medium bg-rose-950/30 border-rose-500/30 text-rose-300">
                <AlertTriangle className="w-3 h-3 text-rose-400" />
                <span>{incidents.length} Alert{incidents.length > 1 ? 's' : ''}</span>
              </span>
            )}
          </div>

          <p className="text-xs text-slate-400 mt-1">
            {activeSource === 'webcam'
              ? 'Real-time local hardware webcam video acquisition, YOLOv8 ByteTrack multi-object tracking, and continuous Farneback velocity telemetry'
              : 'Synchronized video playback, Farneback velocity vector field, and localized 3×3 quadrant density analysis'}
          </p>
        </div>

        {/* Action Controls & Feed Switcher */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Source Toggle */}
          <div className="flex items-center space-x-1 p-1 bg-[#0A1018] rounded-xl border border-[#1E2D40]">
            <button
              onClick={() => handleSourceChange('recorded')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center space-x-1.5 ${
                activeSource === 'recorded'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <VideoIcon className="w-3.5 h-3.5" />
              <span>Recorded Replays ({analyses.length})</span>
            </button>
            <button
              onClick={() => handleSourceChange('webcam')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center space-x-1.5 ${
                activeSource === 'webcam'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Live Webcam Feed</span>
              {cameraStatus?.is_active && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
              )}
            </button>
          </div>

          {/* Context-Specific Controls */}
          {activeSource === 'recorded' ? (
            <>
              {/* Analysis Switcher */}
              {analyses.length > 0 && (
                <div className="flex items-center space-x-2 bg-[#0E1622] border border-[#1E2D40] rounded-lg px-2.5 py-1.5">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Session:</span>
                  <select
                    value={selectedAnalysis?.id || ''}
                    onChange={(e) => handleSelectAnalysis(e.target.value)}
                    className="bg-transparent text-xs font-mono text-cyan-300 focus:outline-none cursor-pointer"
                  >
                    {analyses.map((a) => (
                      <option key={a.id} value={a.id} className="bg-[#0E1622] text-white">
                        {a.id.slice(0, 16)}... ({a.status.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                onClick={() => selectedAnalysis && loadSessionDetails(selectedAnalysis.id)}
                disabled={loadingDetails}
                className="p-2 bg-[#0E1622] hover:bg-[#141E2B] text-slate-300 hover:text-white border border-[#1E2D40] rounded-lg text-xs transition cursor-pointer"
                title="Refresh Telemetry"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingDetails ? 'animate-spin text-cyan-400' : ''}`} />
              </button>

              {selectedAnalysis && (
                <a
                  href={analysisApi.getExportUrl(selectedAnalysis.id)}
                  download
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-950/30 hover:bg-cyan-900/40 text-cyan-300 rounded-lg text-xs font-medium border border-cyan-500/30 transition"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Export CSV</span>
                </a>
              )}
            </>
          ) : (
            <>
              {/* Webcam Controls */}
              {cameraStatus?.is_active ? (
                <button
                  onClick={handleStopWebcam}
                  disabled={cameraActionLoading}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-medium transition cursor-pointer disabled:opacity-50"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>{cameraActionLoading ? 'Stopping...' : 'Disconnect'}</span>
                </button>
              ) : (
                <button
                  onClick={handleStartWebcam}
                  disabled={cameraActionLoading}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{cameraActionLoading ? 'Starting...' : 'Connect Camera'}</span>
                </button>
              )}

              <button
                onClick={fetchLiveTelemetry}
                className="p-2 bg-[#0E1622] hover:bg-[#141E2B] text-slate-300 hover:text-white border border-[#1E2D40] rounded-lg text-xs transition cursor-pointer"
                title="Poll Latest Telemetry"
              >
                <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Action Error Notice */}
      {cameraActionError && activeSource === 'webcam' && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3.5 text-xs text-rose-200 flex items-start space-x-2.5">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-0.5">
            <span className="font-semibold block">Hardware Webcam Ingestion Notice:</span>
            <p className="text-[11px] text-rose-300">{cameraActionError}</p>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------------
          2. LIVE HARDWARE WEBCAM SURVEILLANCE VIEWPORT & TELEMETRY
          ------------------------------------------------------------------------- */}
      {activeSource === 'webcam' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Live Video Stream & HUD */}
            <div className="lg:col-span-2 bg-[#0E1622] border border-[#1E2D40] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    cameraStatus?.is_active ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'
                  }`} />
                  <h3 className="text-sm font-semibold text-white tracking-wide">
                    Live Hardware Surveillance Viewport
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950/40 text-cyan-300 border border-cyan-500/30">
                    LIVE MJPEG STREAM
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                    Standard Surveillance (Unfiltered)
                  </span>
                </div>

                <div className="flex items-center space-x-3 text-xs font-mono text-slate-400">
                  {cameraStatus && (
                    <span>
                      Cap: <strong className="text-slate-200">{cameraStatus.measured_fps.toFixed(1)}</strong> / Inf: <strong className="text-emerald-400">{cameraStatus.processing_fps.toFixed(1)}</strong> FPS
                    </span>
                  )}
                  {liveTelemetry && (
                    <>
                      <span>•</span>
                      <span>Frame #{liveTelemetry.frame_index}</span>
                      <span>•</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        liveTelemetry.detected_pattern === 'BOTTLENECK' 
                          ? 'bg-rose-950/40 text-rose-300 border border-rose-500/30' 
                          : 'bg-cyan-950/40 text-cyan-300 border border-cyan-500/30'
                      }`}>
                        {liveTelemetry.detected_pattern}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Viewport Display Frame */}
              <div className="aspect-video bg-[#070B10] rounded-lg overflow-hidden border border-[#1E2D40] relative flex items-center justify-center">
                {cameraStatus?.is_active ? (
                  <img
                    key={streamKey}
                    src={cameraApi.getStreamUrl()}
                    alt="Live Hardware Webcam Surveillance Feed"
                    className="w-full h-full object-contain"
                  />
                ) : cameraStatus === null ? (
                  <div className="text-center p-8 space-y-3">
                    <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin mx-auto" />
                    <p className="text-xs text-slate-400 font-mono">Connecting to camera feed...</p>
                  </div>
                ) : (
                  <div className="text-center p-8 space-y-3">
                    <div className="w-12 h-12 rounded-xl bg-[#111923] border border-[#1E2D40] flex items-center justify-center mx-auto text-slate-500">
                      <Camera className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xs font-semibold text-white">Live Camera Feed Inactive</h4>
                      <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                        Hardware webcam ingestion is currently idle. Connect your local camera to stream real-time YOLOv8 person tracking and DIP optical flow telemetry.
                      </p>
                    </div>
                    <div className="pt-2 flex items-center justify-center space-x-3">
                      <button
                        onClick={handleStartWebcam}
                        disabled={cameraActionLoading}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Start Camera #0</span>
                      </button>
                      <Link
                        to="/video-analysis"
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#141E2B] hover:bg-[#1E2D40] text-slate-300 border border-[#1E2D40] rounded-lg text-xs font-medium transition cursor-pointer"
                      >
                        <span>Webcam Ingestion Studio</span>
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              {/* Live Quick Telemetry Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KPICard
                  label="Observed Count"
                  value={liveTelemetry?.person_count ?? (cameraStatus?.is_active ? 'Measuring...' : '—')}
                  unit="persons"
                  icon={Users}
                  tone="cyan"
                  subtext="YOLOv8 Class 0"
                />
                <KPICard
                  label="Current Risk"
                  value={
                    liveTelemetry && typeof liveTelemetry.smoothed_risk_score === 'number'
                      ? liveTelemetry.smoothed_risk_score.toFixed(1)
                      : (cameraStatus?.is_active ? 'Computing...' : '—')
                  }
                  unit="/ 100"
                  icon={Activity}
                  tone={
                    (liveTelemetry?.smoothed_risk_score || 0) >= 70 ? 'rose' :
                    (liveTelemetry?.smoothed_risk_score || 0) >= 40 ? 'amber' : 'emerald'
                  }
                  subtext={liveTelemetry?.risk_band ? `Band: ${liveTelemetry.risk_band}` : 'Heuristic 4-factor'}
                />
                <KPICard
                  label="Forecast (+10s)"
                  value={
                    liveTelemetry && typeof liveTelemetry.forecast_risk_10s === 'number'
                      ? liveTelemetry.forecast_risk_10s.toFixed(1)
                      : (cameraStatus?.is_active ? 'Computing...' : '—')
                  }
                  unit="/ 100"
                  icon={TrendingUp}
                  tone={
                    (liveTelemetry?.forecast_risk_10s || 0) >= 70 ? 'rose' :
                    (liveTelemetry?.forecast_risk_10s || 0) >= 40 ? 'amber' : 'neutral'
                  }
                  subtext={liveTelemetry?.forecast_trend ? `Trend: ${liveTelemetry.forecast_trend}` : 'Linear Extrapolation'}
                />
                <KPICard
                  label="Directional Entropy"
                  value={
                    liveTelemetry && typeof liveTelemetry.directional_entropy === 'number'
                      ? liveTelemetry.directional_entropy.toFixed(3)
                      : (cameraStatus?.is_active ? 'Measuring...' : '—')
                  }
                  unit="Shannon H"
                  icon={Compass}
                  tone="neutral"
                  subtext="Flow Turbulence"
                />
              </div>
            </div>

            {/* Right Col: Interactive 3x3 Spatial Grid Matrix */}
            <div className="bg-[#0E1622] border border-[#1E2D40] rounded-xl p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#1E2D40]">
                  <div>
                    <h3 className="text-sm font-semibold text-white tracking-wide">
                      Live 3×3 Grid Matrix
                    </h3>
                    <p className="text-[10px] text-slate-400">Interactive localized quadrant telemetry</p>
                  </div>
                  <span className="text-[10px] font-mono text-cyan-400 px-2 py-0.5 rounded bg-cyan-950/40 border border-cyan-500/30">
                    9 Sectors (A1–C3)
                  </span>
                </div>

                {/* 3x3 Matrix Grid */}
                <div className="grid grid-cols-3 gap-2">
                  {liveTelemetry?.grid_density && liveTelemetry.grid_density.length > 0 ? (
                    liveTelemetry.grid_density.map((zone) => {
                      const isSelected = selectedLiveZone?.name === zone.name;
                      const isCritical = zone.density_level === 'Critical';
                      const isHigh = zone.density_level === 'High';
                      const isMod = zone.density_level === 'Moderate';

                      return (
                        <button
                          key={zone.name}
                          onClick={() => setSelectedLiveZone(zone)}
                          className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer relative ${
                            isSelected
                              ? 'border-cyan-400 bg-cyan-950/30 ring-1 ring-cyan-400/50 shadow-sm'
                              : isCritical
                              ? 'border-rose-500/40 bg-rose-950/20 hover:border-rose-500/70'
                              : isHigh
                              ? 'border-amber-500/40 bg-amber-950/20 hover:border-amber-500/70'
                              : isMod
                              ? 'border-amber-500/20 bg-[#121C2B] hover:border-amber-500/40'
                              : 'border-[#1E2D40] bg-[#0A1018] hover:border-slate-600'
                          }`}
                        >
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="font-bold text-white font-mono">{zone.name.replace('Zone ', '')}</span>
                            <span className={`w-2 h-2 rounded-full ${
                              isCritical ? 'bg-rose-400 animate-pulse' :
                              isHigh ? 'bg-orange-400' :
                              isMod ? 'bg-amber-400' : 'bg-emerald-400'
                            }`} />
                          </div>

                          <div className="mt-1.5 flex items-baseline justify-between">
                            <span className="text-base font-bold font-mono text-white">{zone.population}</span>
                            <span className="text-[9px] font-mono text-slate-400">
                              r:{zone.zone_risk}
                            </span>
                          </div>

                          <div className="w-full bg-[#141E2B] h-1 rounded-full mt-1.5 overflow-hidden">
                            <div
                              className={`h-full ${
                                isCritical ? 'bg-rose-500' :
                                isHigh ? 'bg-orange-500' :
                                isMod ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(5, zone.normalized_density * 100))}%` }}
                            />
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="col-span-3 py-10 text-center text-xs text-slate-500 border border-dashed border-[#1E2D40] rounded-lg">
                      {cameraStatus?.is_active
                        ? 'Acquiring live spatial quadrant data...'
                        : 'Webcam feed inactive. Start camera to inspect spatial density.'}
                    </div>
                  )}
                </div>

                {/* Selected Sector Telemetry Detail */}
                {selectedLiveZone ? (
                  <div className="p-3.5 bg-[#0A1018] rounded-xl border border-[#1E2D40] space-y-2.5 text-xs">
                    <div className="flex items-center justify-between pb-2 border-b border-[#1E2D40]">
                      <span className="font-bold font-mono text-white text-xs">
                        Sector {selectedLiveZone.name}
                      </span>
                      <RiskBadge band={selectedLiveZone.density_level} size="sm" />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 text-[11px] font-mono">
                      <div className="p-2 rounded bg-[#0E1622] border border-[#1E2D40]">
                        <span className="text-[10px] text-slate-400 block font-sans">Density Population</span>
                        <span className="text-sm font-bold text-white mt-0.5 block">{selectedLiveZone.population} persons</span>
                      </div>
                      <div className="p-2 rounded bg-[#0E1622] border border-[#1E2D40]">
                        <span className="text-[10px] text-slate-400 block font-sans">Normalized Density</span>
                        <span className="text-sm font-bold text-cyan-400 mt-0.5 block">
                          {(selectedLiveZone.normalized_density * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="p-2 rounded bg-[#0E1622] border border-[#1E2D40]">
                        <span className="text-[10px] text-slate-400 block font-sans">Mean Flow Velocity</span>
                        <span className="text-sm font-bold text-white mt-0.5 block">{selectedLiveZone.avg_velocity} px/s</span>
                      </div>
                      <div className="p-2 rounded bg-[#0E1622] border border-[#1E2D40]">
                        <span className="text-[10px] text-slate-400 block font-sans">Inflow / Outflow</span>
                        <span className="text-sm font-bold text-slate-200 mt-0.5 block">
                          <span className="text-emerald-400">+{selectedLiveZone.inflow}</span> / <span className="text-rose-400">-{selectedLiveZone.outflow}</span>
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#1E2D40] flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Sector Motion Pattern:</span>
                      <span className={`font-semibold font-mono px-2 py-0.5 rounded text-[10px] ${
                        selectedLiveZone.pattern === 'BOTTLENECK' 
                          ? 'bg-rose-950/40 text-rose-300 border border-rose-500/30' 
                          : 'bg-cyan-950/40 text-cyan-300 border border-cyan-500/30'
                      }`}>
                        {selectedLiveZone.pattern || 'LAMINAR_FLOW'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 text-center text-xs text-slate-500 border border-dashed border-[#1E2D40] rounded-lg">
                    Select any quadrant sector above to inspect live velocity & inflow dynamics.
                  </div>
                )}
              </div>

              <div className="p-2.5 rounded-lg bg-[#0A1018] border border-[#1E2D40] text-[10px] text-slate-400 flex items-center space-x-2">
                <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Live spatial telemetry is calculated continuously without saving raw footage to disk.</span>
              </div>
            </div>
          </div>

          {/* Real-time Rolling Telemetry Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Live Risk Chart */}
            <div className="bg-[#0E1622] border border-[#1E2D40] rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                    Live Risk Dynamics vs Short-Term Forecast (+10s)
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Rolling window of recent live camera frames (max 60 points)</p>
                </div>
                <span className="text-[10px] font-mono text-cyan-400 px-2 py-0.5 rounded bg-cyan-950/40 border border-cyan-500/30">
                  REAL-TIME FEED
                </span>
              </div>

              <div className="h-60">
                {liveHistory.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={liveHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E2D40" />
                      <XAxis 
                        dataKey="frame_index" 
                        stroke="#64748B" 
                        tick={{ fontSize: 10, fill: '#64748B' }} 
                        unit="f" 
                      />
                      <YAxis 
                        stroke="#64748B" 
                        domain={[0, 100]} 
                        tick={{ fontSize: 10, fill: '#64748B' }} 
                      />
                      <Tooltip
                        contentStyle={{ 
                          backgroundColor: '#0E1622', 
                          borderColor: '#1E2D40', 
                          borderRadius: '8px', 
                          fontSize: '11px',
                          color: '#F8FAFC' 
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="smoothed_risk_score"
                        name="Live Risk Score"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="forecast_risk_10s"
                        name="Projected Risk (+10s)"
                        stroke="#ef4444"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-xs text-slate-500">
                    <Activity className="w-6 h-6 text-slate-600 mb-2" />
                    <span>Awaiting live camera telemetry frames...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Live Optical Flow & Directional Entropy Chart */}
            <div className="bg-[#0E1622] border border-[#1E2D40] rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                    Live Optical Flow & Directional Shannon Entropy
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Motion magnitude vs angular vector disorder</p>
                </div>
                <span className="text-[10px] font-mono text-purple-400 px-2 py-0.5 rounded bg-purple-950/40 border border-purple-500/30">
                  Turbulence Heuristic
                </span>
              </div>

              <div className="h-60">
                {liveHistory.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={liveHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E2D40" />
                      <XAxis 
                        dataKey="frame_index" 
                        stroke="#64748B" 
                        tick={{ fontSize: 10, fill: '#64748B' }} 
                        unit="f" 
                      />
                      <YAxis 
                        stroke="#64748B" 
                        tick={{ fontSize: 10, fill: '#64748B' }} 
                      />
                      <Tooltip
                        contentStyle={{ 
                          backgroundColor: '#0E1622', 
                          borderColor: '#1E2D40', 
                          borderRadius: '8px', 
                          fontSize: '11px',
                          color: '#F8FAFC' 
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="optical_flow_magnitude"
                        name="Flow Mag (px/frame)"
                        stroke="#06b6d4"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="directional_entropy"
                        name="Entropy (0-1)"
                        stroke="#a855f7"
                        strokeWidth={1.75}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-xs text-slate-500">
                    <Compass className="w-6 h-6 text-slate-600 mb-2" />
                    <span>Awaiting optical flow telemetry records...</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : analyses.length === 0 ? (
        /* -------------------------------------------------------------------------
            EMPTY STATE WHEN NO RECORDED ANALYSES EXIST
            ------------------------------------------------------------------------- */
        <EmptyState
          title="No Recorded Surveillance Sessions Available"
          description="There are currently no processed video analyses in the database. Ingest footage in the Video Ingestion Studio, or switch to Live Webcam Feed to monitor your local camera."
          actionText="Switch to Live Webcam Feed"
          onAction={() => handleSourceChange('webcam')}
          icon={VideoIcon}
        />
      ) : (
        /* -------------------------------------------------------------------------
            3. RECORDED SURVEILLANCE REPLAY & SPATIAL MATRIX VIEW
            ------------------------------------------------------------------------- */
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Video Stream / Annotated Replay with Scrubbing */}
            <div className="lg:col-span-2 bg-[#0E1622] border border-[#1E2D40] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    selectedAnalysis?.status === 'processing' 
                      ? 'bg-cyan-400 animate-pulse' 
                      : selectedAnalysis?.status === 'completed'
                      ? 'bg-emerald-400'
                      : 'bg-amber-400'
                  }`} />
                  <h3 className="text-sm font-semibold text-white tracking-wide">
                    Annotated Surveillance Feed
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                    {selectedAnalysis?.status === 'processing' ? 'LIVE PIPELINE' : 'SYNCHRONIZED AUDIT'}
                  </span>
                </div>

                <div className="flex items-center space-x-3 text-xs font-mono text-slate-400">
                  <span>t={currentFrame?.timestamp_sec?.toFixed(1) || '0.0'}s</span>
                  <span>Frame #{currentFrame?.frame_index || 0}</span>
                  {currentFrame?.detected_pattern && (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      currentFrame.detected_pattern === 'BOTTLENECK' 
                        ? 'bg-rose-950/40 text-rose-300 border border-rose-500/30' 
                        : 'bg-cyan-950/40 text-cyan-300 border border-cyan-500/30'
                    }`}>
                      {currentFrame.detected_pattern}
                    </span>
                  )}
                </div>
              </div>

              {/* Video Player Display Container */}
              <div className="aspect-video bg-[#070B10] rounded-lg overflow-hidden border border-[#1E2D40] relative flex items-center justify-center">
                {selectedAnalysis?.annotated_video_path ? (
                  <video
                    key={selectedAnalysis.annotated_video_path}
                    src={selectedAnalysis.annotated_video_path}
                    controls
                    autoPlay
                    loop
                    className="w-full h-full object-contain"
                  />
                ) : selectedAnalysis?.heatmap_preview_path ? (
                  <div className="relative w-full h-full flex items-center justify-center">
                    <img
                      src={selectedAnalysis.heatmap_preview_path}
                      alt="Perspective Density Heatmap"
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute bottom-2 left-2 px-2.5 py-1 bg-black/80 rounded border border-slate-800 text-[10px] font-mono text-slate-300">
                      Heatmap Preview (Video generation pending)
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-6 space-y-2">
                    <VideoIcon className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="text-xs text-slate-400">No rendered video stream available for this session.</p>
                    <p className="text-[10px] text-slate-500 font-mono">Telemetry metrics remain accessible below.</p>
                  </div>
                )}
              </div>

              {/* Timeline Scrub Controls */}
              {results.length > 0 && (
                <div className="p-3 bg-[#0A1018] rounded-lg border border-[#1E2D40] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="p-1.5 rounded bg-[#141E2B] hover:bg-[#1E2D40] text-cyan-400 border border-[#1E2D40] transition cursor-pointer"
                        title={isPlaying ? 'Pause Scrubbing' : 'Play Scrubbing'}
                      >
                        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => {
                          setIsPlaying(false);
                          setSelectedFrameIndex(prev => Math.max(0, prev - 1));
                        }}
                        disabled={selectedFrameIndex === 0}
                        className="p-1.5 rounded bg-[#141E2B] hover:bg-[#1E2D40] text-slate-300 disabled:opacity-40 border border-[#1E2D40] transition cursor-pointer"
                        title="Previous Frame"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setIsPlaying(false);
                          setSelectedFrameIndex(prev => Math.min(results.length - 1, prev + 1));
                        }}
                        disabled={selectedFrameIndex >= results.length - 1}
                        className="p-1.5 rounded bg-[#141E2B] hover:bg-[#1E2D40] text-slate-300 disabled:opacity-40 border border-[#1E2D40] transition cursor-pointer"
                        title="Next Frame"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[11px] font-mono text-slate-300">
                        Step: {selectedFrameIndex + 1} / {results.length}
                      </span>
                    </div>

                    <div className="text-[11px] font-mono text-cyan-400">
                      t = {currentFrame?.timestamp_sec?.toFixed(1) || '0.0'}s / {results[results.length - 1]?.timestamp_sec?.toFixed(1) || '0.0'}s
                    </div>
                  </div>

                  {/* Slider Scrub Bar */}
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, results.length - 1)}
                    value={selectedFrameIndex}
                    onChange={(e) => {
                      setIsPlaying(false);
                      setSelectedFrameIndex(Number(e.target.value));
                    }}
                    className="w-full h-1.5 bg-[#141E2B] rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                </div>
              )}

              {/* Quick Telemetry Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KPICard
                  label="Observed Count"
                  value={currentFrame?.person_count ?? '—'}
                  unit="persons"
                  icon={Users}
                  tone="cyan"
                  subtext="YOLOv8 Class 0"
                />
                <KPICard
                  label="Current Risk"
                  value={currentFrame?.smoothed_risk_score !== undefined ? currentFrame.smoothed_risk_score.toFixed(1) : '—'}
                  unit="/ 100"
                  icon={Activity}
                  tone={
                    (currentFrame?.smoothed_risk_score || 0) >= 70 ? 'rose' :
                    (currentFrame?.smoothed_risk_score || 0) >= 40 ? 'amber' : 'emerald'
                  }
                  subtext="Heuristic 4-factor"
                />
                <KPICard
                  label="Forecast (+10s)"
                  value={currentFrame?.forecast_risk_10s !== undefined ? currentFrame.forecast_risk_10s.toFixed(1) : '—'}
                  unit="/ 100"
                  icon={TrendingUp}
                  tone={
                    (currentFrame?.forecast_risk_10s || 0) >= 70 ? 'rose' :
                    (currentFrame?.forecast_risk_10s || 0) >= 40 ? 'amber' : 'neutral'
                  }
                  subtext="Trend Extrapolation"
                />
                <KPICard
                  label="Directional Entropy"
                  value={currentFrame?.directional_entropy !== undefined ? currentFrame.directional_entropy.toFixed(3) : '—'}
                  unit="Shannon H"
                  icon={Compass}
                  tone="neutral"
                  subtext="Flow Turbulence"
                />
              </div>
            </div>

            {/* Right Col: Interactive 3x3 Spatial Grid Matrix */}
            <div className="bg-[#0E1622] border border-[#1E2D40] rounded-xl p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#1E2D40]">
                  <div>
                    <h3 className="text-sm font-semibold text-white tracking-wide">
                      Spatial 3×3 Grid Matrix
                    </h3>
                    <p className="text-[10px] text-slate-400">Select any quadrant to inspect localized telemetry</p>
                  </div>
                  <span className="text-[10px] font-mono text-cyan-400 px-2 py-0.5 rounded bg-cyan-950/40 border border-cyan-500/30">
                    9 Sectors (A1–C3)
                  </span>
                </div>

                {/* 3x3 Interactive Grid HUD */}
                <div className="grid grid-cols-3 gap-2">
                  {currentFrame?.grid_density && currentFrame.grid_density.length > 0 ? (
                    currentFrame.grid_density.map((zone) => {
                      const isSelected = selectedZone?.name === zone.name;
                      const isCritical = zone.density_level === 'Critical';
                      const isHigh = zone.density_level === 'High';
                      const isMod = zone.density_level === 'Moderate';

                      return (
                        <button
                          key={zone.name}
                          onClick={() => setSelectedZone(zone)}
                          className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer relative ${
                            isSelected
                              ? 'border-cyan-400 bg-cyan-950/30 ring-1 ring-cyan-400/50 shadow-sm'
                              : isCritical
                              ? 'border-rose-500/40 bg-rose-950/20 hover:border-rose-500/70'
                              : isHigh
                              ? 'border-amber-500/40 bg-amber-950/20 hover:border-amber-500/70'
                              : isMod
                              ? 'border-amber-500/20 bg-[#121C2B] hover:border-amber-500/40'
                              : 'border-[#1E2D40] bg-[#0A1018] hover:border-slate-600'
                          }`}
                        >
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="font-bold text-white font-mono">{zone.name.replace('Zone ', '')}</span>
                            <span className={`w-2 h-2 rounded-full ${
                              isCritical ? 'bg-rose-400 animate-pulse' :
                              isHigh ? 'bg-orange-400' :
                              isMod ? 'bg-amber-400' : 'bg-emerald-400'
                            }`} />
                          </div>

                          <div className="mt-1.5 flex items-baseline justify-between">
                            <span className="text-base font-bold font-mono text-white">{zone.population}</span>
                            <span className="text-[9px] font-mono text-slate-400">
                              r:{zone.zone_risk}
                            </span>
                          </div>

                          {/* Normalized density mini-bar */}
                          <div className="w-full bg-[#141E2B] h-1 rounded-full mt-1.5 overflow-hidden">
                            <div
                              className={`h-full ${
                                isCritical ? 'bg-rose-500' :
                                isHigh ? 'bg-orange-500' :
                                isMod ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(5, zone.normalized_density * 100))}%` }}
                            />
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="col-span-3 py-10 text-center text-xs text-slate-500 border border-dashed border-[#1E2D40] rounded-lg">
                      No spatial grid density data recorded for this timestamp.
                    </div>
                  )}
                </div>

                {/* Selected Zone Deep Dive */}
                {selectedZone ? (
                  <div className="p-3.5 bg-[#0A1018] rounded-xl border border-[#1E2D40] space-y-2.5 text-xs">
                    <div className="flex items-center justify-between pb-2 border-b border-[#1E2D40]">
                      <span className="font-bold font-mono text-white text-xs">
                        Sector {selectedZone.name}
                      </span>
                      <RiskBadge band={selectedZone.density_level} size="sm" />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 text-[11px] font-mono">
                      <div className="p-2 rounded bg-[#0E1622] border border-[#1E2D40]">
                        <span className="text-[10px] text-slate-400 block font-sans">Density Population</span>
                        <span className="text-sm font-bold text-white mt-0.5 block">{selectedZone.population} persons</span>
                      </div>
                      <div className="p-2 rounded bg-[#0E1622] border border-[#1E2D40]">
                        <span className="text-[10px] text-slate-400 block font-sans">Normalized Density</span>
                        <span className="text-sm font-bold text-cyan-400 mt-0.5 block">
                          {(selectedZone.normalized_density * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="p-2 rounded bg-[#0E1622] border border-[#1E2D40]">
                        <span className="text-[10px] text-slate-400 block font-sans">Mean Flow Velocity</span>
                        <span className="text-sm font-bold text-white mt-0.5 block">{selectedZone.avg_velocity} px/s</span>
                      </div>
                      <div className="p-2 rounded bg-[#0E1622] border border-[#1E2D40]">
                        <span className="text-[10px] text-slate-400 block font-sans">Inflow / Outflow</span>
                        <span className="text-sm font-bold text-slate-200 mt-0.5 block">
                          <span className="text-emerald-400">+{selectedZone.inflow}</span> / <span className="text-rose-400">-{selectedZone.outflow}</span>
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#1E2D40] flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Sector Motion Pattern:</span>
                      <span className={`font-semibold font-mono px-2 py-0.5 rounded text-[10px] ${
                        selectedZone.pattern === 'BOTTLENECK' 
                          ? 'bg-rose-950/40 text-rose-300 border border-rose-500/30' 
                          : 'bg-cyan-950/40 text-cyan-300 border border-cyan-500/30'
                      }`}>
                        {selectedZone.pattern || 'LAMINAR_FLOW'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 text-center text-xs text-slate-500 border border-dashed border-[#1E2D40] rounded-lg">
                    Click any sector above to examine localized velocity & inflow dynamics.
                  </div>
                )}
              </div>

              <div className="p-2.5 rounded-lg bg-[#0A1018] border border-[#1E2D40] text-[10px] text-slate-400 flex items-center space-x-2">
                <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Click any timestamp on the charts below to scrub telemetry directly to that moment.</span>
              </div>
            </div>
          </div>

          {/* Synchronized Recorded Telemetry Recharts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Risk & Short-Term Forecast Chart */}
            <div className="bg-[#0E1622] border border-[#1E2D40] rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                    Risk Dynamics vs Short-Term Forecast (+10s)
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Click any coordinate to inspect frame telemetry</p>
                </div>
                <span className="text-[10px] font-mono text-cyan-400 px-2 py-0.5 rounded bg-cyan-950/40 border border-cyan-500/30">
                  Interactive Scrub
                </span>
              </div>

              <div className="h-60">
                {results.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={results} onClick={handleChartClick} className="cursor-pointer">
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E2D40" />
                      <XAxis 
                        dataKey="timestamp_sec" 
                        stroke="#64748B" 
                        tick={{ fontSize: 10, fill: '#64748B' }} 
                        unit="s" 
                      />
                      <YAxis 
                        stroke="#64748B" 
                        domain={[0, 100]} 
                        tick={{ fontSize: 10, fill: '#64748B' }} 
                      />
                      <Tooltip
                        contentStyle={{ 
                          backgroundColor: '#0E1622', 
                          borderColor: '#1E2D40', 
                          borderRadius: '8px', 
                          fontSize: '11px',
                          color: '#F8FAFC' 
                        }}
                      />
                      {currentFrame && (
                        <ReferenceLine 
                          x={currentFrame.timestamp_sec} 
                          stroke="#06b6d4" 
                          strokeDasharray="3 3" 
                          label={{ value: 'Current', fill: '#06b6d4', fontSize: 10, position: 'top' }} 
                        />
                      )}
                      <Line
                        type="monotone"
                        dataKey="smoothed_risk_score"
                        name="Current Risk Score"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="forecast_risk_10s"
                        name="Projected Risk (+10s)"
                        stroke="#ef4444"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
                    No telemetry time-series points recorded for this session.
                  </div>
                )}
              </div>
            </div>

            {/* Farneback Optical Flow & Directional Entropy Chart */}
            <div className="bg-[#0E1622] border border-[#1E2D40] rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                    Farneback Optical Flow & Directional Shannon Entropy
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Motion magnitude vs angular vector disorder</p>
                </div>
                <span className="text-[10px] font-mono text-purple-400 px-2 py-0.5 rounded bg-purple-950/40 border border-purple-500/30">
                  Turbulence Heuristic
                </span>
              </div>

              <div className="h-60">
                {results.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={results} onClick={handleChartClick} className="cursor-pointer">
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E2D40" />
                      <XAxis 
                        dataKey="timestamp_sec" 
                        stroke="#64748B" 
                        tick={{ fontSize: 10, fill: '#64748B' }} 
                        unit="s" 
                      />
                      <YAxis 
                        stroke="#64748B" 
                        tick={{ fontSize: 10, fill: '#64748B' }} 
                      />
                      <Tooltip
                        contentStyle={{ 
                          backgroundColor: '#0E1622', 
                          borderColor: '#1E2D40', 
                          borderRadius: '8px', 
                          fontSize: '11px',
                          color: '#F8FAFC' 
                        }}
                      />
                      {currentFrame && (
                        <ReferenceLine 
                          x={currentFrame.timestamp_sec} 
                          stroke="#06b6d4" 
                          strokeDasharray="3 3" 
                        />
                      )}
                      <Line
                        type="monotone"
                        dataKey="optical_flow_magnitude"
                        name="Flow Magnitude (px/frame)"
                        stroke="#06b6d4"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="directional_entropy"
                        name="Directional Entropy (0-1)"
                        stroke="#a855f7"
                        strokeWidth={1.75}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
                    No optical flow telemetry records available.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveMonitoring;
