import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  Radio,
  Square,
  AlertCircle,
  Loader2
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
import { analysisApi, incidentApi, cameraApi, resolveMediaUrl } from '../services/api';
import { Analysis, FrameRecord, Incident, GridDensityCell, CameraSessionStatus } from '../types';
import { 
  MetricStrip, 
  MetricItem, 
  RiskBadge, 
  StatusPill, 
  EmptyState, 
  ErrorState, 
  LoadingBlock 
} from '../components/UIComponents';
import { SpatialDensity3D } from '../components/SpatialDensity3D';
import { useSystem } from '../context/SystemContext';
import { useTheme } from '../context/ThemeContext';

export const LiveMonitoring: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryAnalysisId = searchParams.get('analysisId');
  const sourceParam = searchParams.get('source');
  const { 
    selectedAnalysis: contextAnalysis, 
    setSelectedAnalysis: setContextAnalysis,
    cameraSessionStatus
  } = useSystem();
  const { isDark } = useTheme();

  // Primary source toggle: 'recorded' | 'webcam' derived from URL
  const activeSource = sourceParam === 'webcam' ? 'webcam' : 'recorded';

  // Recorded Sessions State
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<Analysis | null>(null);
  const [results, setResults] = useState<FrameRecord[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<number>(0);
  const [selectedZone, setSelectedZone] = useState<GridDensityCell | null>(null);
  const [liveSpatialMode, setLiveSpatialMode] = useState<'3d' | '2d'>('3d');
  const [replaySpatialMode, setReplaySpatialMode] = useState<'3d' | '2d'>('3d');

  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Video Replay & Timeline Scrubbing State
  const videoRef = useRef<HTMLVideoElement>(null);
  const isSeekingRef = useRef<boolean>(false);
  const [videoLoading, setVideoLoading] = useState<boolean>(true);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);

  const videoSrc = useMemo(() => {
    if (!selectedAnalysis) return '';
    return resolveMediaUrl(selectedAnalysis.annotated_video_path, selectedAnalysis.id);
  }, [selectedAnalysis]);

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

  // Reset video state when selected analysis changes
  useEffect(() => {
    setVideoLoading(true);
    setVideoError(null);
    setIsPlaying(false);
  }, [selectedAnalysis?.id]);

  // Synchronize telemetry with video playback
  const handleTimeUpdate = useCallback(() => {
    if (isSeekingRef.current) return;
    const video = videoRef.current;
    if (!video || results.length === 0) return;
    const t = video.currentTime;

    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < results.length; i++) {
      const diff = Math.abs(results[i].timestamp_sec - t);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      } else if (results[i].timestamp_sec > t && diff > minDiff) {
        break;
      }
    }
    setSelectedFrameIndex(closestIdx);
  }, [results]);

  // Scrub or jump to frame and seek video
  const handleSeekFrame = useCallback((newIdx: number) => {
    const clamped = Math.max(0, Math.min(newIdx, results.length - 1));
    setSelectedFrameIndex(clamped);
    const target = results[clamped];
    if (target && videoRef.current) {
      isSeekingRef.current = true;
      videoRef.current.currentTime = target.timestamp_sec;
      setTimeout(() => {
        isSeekingRef.current = false;
      }, 80);
    }
  }, [results]);

  const handleStepFrame = useCallback((step: number) => {
    handleSeekFrame(selectedFrameIndex + step);
  }, [handleSeekFrame, selectedFrameIndex]);

  // Toggle Play / Pause on video element
  const handleTogglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      if (video.paused || video.ended) {
        if (video.ended) {
          video.currentTime = 0;
        }
        video.play().catch((err) => {
          console.warn('Playback request prevented:', err);
        });
      } else {
        video.pause();
      }
    } else {
      setIsPlaying((prev) => !prev);
    }
  }, []);

  // Fallback timer only if no video element is mounted (e.g. preview image mode)
  useEffect(() => {
    if (videoRef.current) return;
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
        handleSeekFrame(idx);
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
    <div className="space-y-6 w-full">
      {/* -------------------------------------------------------------------------
          1. HEADER WITH FEED SOURCE SWITCHER & TELEMETRY CONTROLS
          ------------------------------------------------------------------------- */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-4 border-b border-[#E2E8EA] dark:border-[#203638] gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-xl font-bold text-[#1C3334] dark:text-[#EDF4F5] tracking-tight">
              {activeSource === 'webcam' ? 'LIVE HARDWARE WEBCAM MONITORING' : 'TELEMETRY & SPATIAL REPLAY'}
            </h1>

            {activeSource === 'webcam' ? (
              isBackendOffline ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-500/30">
                  BACKEND_OFFLINE
                </span>
              ) : (
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border ${
                  cameraStatus?.state === 'CONNECTED' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/30' :
                  cameraStatus?.state === 'CONNECTING' ? 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border-cyan-300 dark:border-cyan-500/30 animate-pulse' :
                  cameraStatus?.state === 'DEGRADED' ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-500/30' :
                  cameraStatus?.state === 'DISCONNECTED' ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-500/30' :
                  'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
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
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40 animate-pulse">
                  <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  <span>STALE TELEMETRY ({telemetryAge?.toFixed(1)}s age)</span>
                </span>
              ) : telemetryAge !== null ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#376E6F]/10 text-[#376E6F] dark:text-[#6EB5B6] border border-[#376E6F]/30">
                  Freshness: {telemetryAge.toFixed(1)}s
                </span>
              ) : null
            )}

            {activeSource === 'recorded' && incidents.length > 0 && (
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-mono font-medium bg-[#2E151B]/10 dark:bg-[#2E151B]/30 border-[#2E151B]/30 text-[#2E151B] dark:text-[#F0B3C1]">
                <AlertTriangle className="w-3 h-3 text-[#DA7B93]" />
                <span>{incidents.length} Alert{incidents.length > 1 ? 's' : ''}</span>
              </span>
            )}
          </div>

          <p className="text-xs text-[#5D757E] dark:text-[#A0B7BC] mt-1">
            {activeSource === 'webcam'
              ? 'Real-time local hardware webcam video acquisition, YOLOv8 ByteTrack multi-object tracking, and continuous Farneback velocity telemetry'
              : 'Synchronized video playback, Farneback velocity vector field, and localized 3×3 quadrant density analysis'}
          </p>
        </div>

        {/* Action Controls & Feed Switcher */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Source Toggle */}
          <div className="flex items-center space-x-1 p-1 bg-[#F1F4F5] dark:bg-[#0B1415] rounded-xl border border-[#CBD5D8] dark:border-[#233C3F] shadow-2xs">
            <button
              onClick={() => handleSourceChange('recorded')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center space-x-1.5 ${
                activeSource === 'recorded'
                  ? 'bg-[#2F4454] dark:bg-[#376E6F] text-white shadow-xs'
                  : 'text-[#5D757E] dark:text-[#A0B7BC] hover:text-[#1C3334] dark:hover:text-white'
              }`}
            >
              <VideoIcon className="w-3.5 h-3.5" />
              <span>Recorded Replays ({analyses.length})</span>
            </button>
            <button
              onClick={() => handleSourceChange('webcam')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center space-x-1.5 ${
                activeSource === 'webcam'
                  ? 'bg-[#2F4454] dark:bg-[#376E6F] text-white shadow-xs'
                  : 'text-[#5D757E] dark:text-[#A0B7BC] hover:text-[#1C3334] dark:hover:text-white'
              }`}
            >
              {cameraStatus?.source_type === 'rtsp' ? (
                <Radio className="w-3.5 h-3.5 text-cyan-200" />
              ) : (
                <Camera className="w-3.5 h-3.5" />
              )}
              <span>
                {cameraStatus?.source_type === 'rtsp'
                  ? `Network CCTV (${cameraStatus.camera_name || 'RTSP'})`
                  : 'Live Webcam Feed'}
              </span>
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
                <div className="flex items-center space-x-2 bg-white dark:bg-[#152729] border border-[#CBD5D8] dark:border-[#2C4B4E] rounded-lg px-2.5 py-1.5 shadow-2xs">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-[#5D757E] dark:text-[#A0B7BC]">Session:</span>
                  <select
                    value={selectedAnalysis?.id || ''}
                    onChange={(e) => handleSelectAnalysis(e.target.value)}
                    className="bg-transparent text-xs font-mono text-[#376E6F] dark:text-[#6EB5B6] font-semibold focus:outline-none cursor-pointer"
                  >
                    {analyses.map((a) => (
                      <option key={a.id} value={a.id} className="bg-white dark:bg-[#152729] text-[#1C3334] dark:text-[#EEF4F5]">
                        {a.id.slice(0, 16)}... ({a.status.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                onClick={() => selectedAnalysis && loadSessionDetails(selectedAnalysis.id)}
                disabled={loadingDetails}
                className="p-2 bg-white dark:bg-[#152729] hover:bg-[#F1F4F5] dark:hover:bg-[#1C3336] text-[#2F4454] dark:text-[#EDF4F5] border border-[#CBD5D8] dark:border-[#2C4B4E] rounded-lg text-xs transition cursor-pointer shadow-2xs"
                title="Refresh Telemetry"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingDetails ? 'animate-spin text-[#376E6F]' : ''}`} />
              </button>

              {selectedAnalysis && (
                <a
                  href={analysisApi.getExportUrl(selectedAnalysis.id)}
                  download
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#376E6F]/10 hover:bg-[#376E6F]/20 text-[#376E6F] dark:text-[#6EB5B6] rounded-lg text-xs font-medium border border-[#376E6F]/30 dark:border-[#376E6F]/40 transition shadow-2xs"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[#376E6F] dark:text-[#6EB5B6]" />
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
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-rose-50 dark:bg-rose-600/20 hover:bg-rose-100 dark:hover:bg-rose-600/30 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-500/30 rounded-lg text-xs font-medium transition cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>{cameraActionLoading ? 'Stopping...' : 'Disconnect'}</span>
                </button>
              ) : (
                <button
                  onClick={handleStartWebcam}
                  disabled={cameraActionLoading}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#2F4454] hover:bg-[#1C3334] text-white dark:bg-[#376E6F] dark:hover:bg-[#4A8E8F] rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{cameraActionLoading ? 'Starting...' : 'Connect Camera'}</span>
                </button>
              )}

              <button
                onClick={fetchLiveTelemetry}
                className="p-2 bg-white dark:bg-[#152729] hover:bg-[#F1F4F5] dark:hover:bg-[#1C3336] text-[#2F4454] dark:text-[#EDF4F5] border border-[#CBD5D8] dark:border-[#2C4B4E] rounded-lg text-xs transition cursor-pointer shadow-2xs"
                title="Poll Latest Telemetry"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#376E6F]" />
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
            <div className="lg:col-span-2 bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    cameraStatus?.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                  }`} />
                  <h3 className="text-sm font-semibold text-[#1C3334] dark:text-white tracking-wide">
                    {cameraStatus?.source_type === 'rtsp'
                      ? `CCTV Feed: ${cameraStatus.camera_name || 'RTSP Stream'}`
                      : 'Live Hardware Surveillance Viewport'}
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#376E6F]/10 text-[#376E6F] dark:text-[#6EB5B6] border border-[#376E6F]/30">
                    {cameraStatus?.source_type === 'rtsp' ? 'RTSP/H.264 → MJPEG' : 'LIVE MJPEG STREAM'}
                  </span>
                  {cameraStatus?.sanitized_url && (
                    <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-mono bg-[#F1F4F5] dark:bg-slate-800 text-[#5D757E] dark:text-slate-300 border border-[#CBD5D8] dark:border-slate-700 truncate max-w-xs" title={cameraStatus.sanitized_url}>
                      {cameraStatus.sanitized_url}
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-3 text-xs font-mono text-[#5D757E] dark:text-slate-400">
                  {cameraStatus && (
                    <span>
                      Cap: <strong className="text-[#1C3334] dark:text-slate-200">{cameraStatus.measured_fps.toFixed(1)}</strong> / Inf: <strong className="text-emerald-600 dark:text-emerald-400">{cameraStatus.processing_fps.toFixed(1)}</strong> FPS
                    </span>
                  )}
                  {liveTelemetry && (
                    <>
                      <span>•</span>
                      <span>Frame #{liveTelemetry.frame_index}</span>
                      <span>•</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        liveTelemetry.detected_pattern === 'BOTTLENECK' 
                          ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-500/30' 
                          : 'bg-[#376E6F]/10 text-[#376E6F] dark:text-[#6EB5B6] border border-[#376E6F]/30'
                      }`}>
                        {liveTelemetry.detected_pattern}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Viewport Display Frame - Kept Dark for High Video Contrast */}
              <div className="aspect-video bg-black rounded-lg overflow-hidden border border-[#CBD5D8] dark:border-[#203638] relative flex items-center justify-center shadow-inner">
                {cameraStatus?.is_active ? (
                  <img
                    key={streamKey}
                    src={cameraApi.getStreamUrl()}
                    alt="Live Hardware Webcam Surveillance Feed"
                    className="w-full h-full object-contain"
                  />
                ) : cameraStatus === null ? (
                  <div className="text-center p-8 space-y-3">
                    <div className="w-8 h-8 rounded-full border-2 border-[#376E6F] border-t-transparent animate-spin mx-auto" />
                    <p className="text-xs text-slate-400 font-mono">Connecting to camera feed...</p>
                  </div>
                ) : (
                  <div className="text-center p-8 space-y-3">
                    <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
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
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#2F4454] hover:bg-[#1C3334] text-white dark:bg-[#376E6F] dark:hover:bg-[#4A8E8F] rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Start Camera #0</span>
                      </button>
                      <Link
                        to="/video-analysis"
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition cursor-pointer"
                      >
                        <span>Webcam Ingestion Studio</span>
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              {/* Live Precision Telemetry Strip */}
              <MetricStrip>
                <MetricItem
                  label="Observed Count"
                  value={liveTelemetry?.person_count ?? (cameraStatus?.is_active ? 'Measuring...' : '—')}
                  unit="persons"
                  icon={Users}
                  tone="teal"
                  subtext="YOLOv8 Class 0"
                />
                <MetricItem
                  label="Current Risk"
                  value={
                    liveTelemetry && typeof liveTelemetry.smoothed_risk_score === 'number'
                      ? liveTelemetry.smoothed_risk_score.toFixed(1)
                      : (cameraStatus?.is_active ? 'Computing...' : '—')
                  }
                  unit="/ 100"
                  icon={Activity}
                  tone={
                    (liveTelemetry?.smoothed_risk_score || 0) >= 70 ? 'burgundy' :
                    (liveTelemetry?.smoothed_risk_score || 0) >= 40 ? 'rose' : 'teal'
                  }
                  subtext={liveTelemetry?.risk_band ? `Band: ${liveTelemetry.risk_band}` : 'Heuristic 4-factor'}
                />
                <MetricItem
                  label="Forecast (+10s)"
                  value={
                    liveTelemetry && typeof liveTelemetry.forecast_risk_10s === 'number'
                      ? liveTelemetry.forecast_risk_10s.toFixed(1)
                      : (cameraStatus?.is_active ? 'Computing...' : '—')
                  }
                  unit="/ 100"
                  icon={TrendingUp}
                  tone={
                    (liveTelemetry?.forecast_risk_10s || 0) >= 70 ? 'burgundy' :
                    (liveTelemetry?.forecast_risk_10s || 0) >= 40 ? 'rose' : 'slate'
                  }
                  subtext={liveTelemetry?.forecast_trend ? `Trend: ${liveTelemetry.forecast_trend}` : 'Linear Projection'}
                />
                <MetricItem
                  label="Directional Entropy"
                  value={
                    liveTelemetry && typeof liveTelemetry.directional_entropy === 'number'
                      ? liveTelemetry.directional_entropy.toFixed(3)
                      : (cameraStatus?.is_active ? 'Measuring...' : '—')
                  }
                  unit="Shannon H"
                  icon={Compass}
                  tone="deepteal"
                  subtext="Flow Turbulence"
                />
              </MetricStrip>
            </div>

            {/* Right Col: Interactive 3x3 Spatial Grid Matrix */}
            <div className="bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl p-5 flex flex-col justify-between space-y-4 shadow-xs">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#E2E8EA] dark:border-[#203638]">
                  <div>
                    <h3 className="text-sm font-semibold text-[#1C3334] dark:text-white tracking-wide">
                      Spatial Quadrant Intelligence
                    </h3>
                    <p className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC]">Interactive localized quadrant telemetry</p>
                  </div>
                  <div className="flex items-center space-x-1 p-0.5 rounded-lg bg-[#EDE8E1] dark:bg-[#0B1415] border border-[#CBD5D8] dark:border-[#233C3F] text-[10px] font-mono">
                    <button
                      onClick={() => setLiveSpatialMode('3d')}
                      className={`px-2 py-0.5 rounded transition cursor-pointer ${
                        liveSpatialMode === '3d' ? 'bg-white dark:bg-[#183133] text-[#376E6F] dark:text-[#6EC4C6] font-bold shadow-2xs' : 'text-[#5D757E] dark:text-[#A0B7BC]'
                      }`}
                    >
                      3D Plaza
                    </button>
                    <button
                      onClick={() => setLiveSpatialMode('2d')}
                      className={`px-2 py-0.5 rounded transition cursor-pointer ${
                        liveSpatialMode === '2d' ? 'bg-white dark:bg-[#183133] text-[#376E6F] dark:text-[#6EC4C6] font-bold shadow-2xs' : 'text-[#5D757E] dark:text-[#A0B7BC]'
                      }`}
                    >
                      2D Grid
                    </button>
                  </div>
                </div>

                {liveSpatialMode === '3d' ? (
                  <SpatialDensity3D
                    gridData={liveTelemetry?.grid_density}
                    onSelectZone={setSelectedLiveZone}
                    selectedZoneName={selectedLiveZone?.name}
                    cameraName={cameraStatus?.camera_name || 'HARDWARE WEBCAM'}
                  />
                ) : (
                /* 3x3 Matrix Grid */
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
                              ? 'border-[#376E6F] bg-[#376E6F]/15 ring-2 ring-[#376E6F]/40 shadow-xs'
                              : isCritical
                              ? 'border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/20 hover:border-rose-400'
                              : isHigh
                              ? 'border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 hover:border-amber-400'
                              : isMod
                              ? 'border-amber-200 dark:border-amber-500/20 bg-amber-50/50 dark:bg-[#121C2B] hover:border-amber-300'
                              : 'border-[#E2E8EA] dark:border-[#1E2D40] bg-[#F8F9FA] dark:bg-[#0A1018] hover:border-[#CBD5D8] dark:hover:border-slate-600'
                          }`}
                        >
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="font-bold text-[#1C3334] dark:text-white font-mono">{zone.name.replace('Zone ', '')}</span>
                            <span className={`w-2 h-2 rounded-full ${
                              isCritical ? 'bg-rose-500 animate-pulse' :
                              isHigh ? 'bg-orange-500' :
                              isMod ? 'bg-amber-500' : 'bg-emerald-500'
                            }`} />
                          </div>

                          <div className="mt-1.5 flex items-baseline justify-between">
                            <span className="text-base font-bold font-mono text-[#1C3334] dark:text-white">{zone.population}</span>
                            <span className="text-[9px] font-mono text-[#5D757E] dark:text-slate-400">
                              r:{zone.zone_risk}
                            </span>
                          </div>

                          <div className="w-full bg-[#E2E8EA] dark:bg-[#141E2B] h-1 rounded-full mt-1.5 overflow-hidden">
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
                    <div className="col-span-3 py-10 text-center text-xs text-[#5D757E] dark:text-slate-500 border border-dashed border-[#CBD5D8] dark:border-[#1E2D40] rounded-lg">
                      {cameraStatus?.is_active
                        ? 'Acquiring live spatial quadrant data...'
                        : 'Webcam feed inactive. Start camera to inspect spatial density.'}
                    </div>
                  )}
                </div>
                )}

                {/* Selected Sector Telemetry Detail */}
                {selectedLiveZone ? (
                  <div className="p-3.5 bg-[#F8F9FA] dark:bg-[#0A1018] rounded-xl border border-[#E2E8EA] dark:border-[#1E2D40] space-y-2.5 text-xs">
                    <div className="flex items-center justify-between pb-2 border-b border-[#E2E8EA] dark:border-[#1E2D40]">
                      <span className="font-bold font-mono text-[#1C3334] dark:text-white text-xs">
                        Sector {selectedLiveZone.name}
                      </span>
                      <RiskBadge band={selectedLiveZone.density_level} size="sm" />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 text-[11px] font-mono">
                      <div className="p-2 rounded bg-white dark:bg-[#0E1622] border border-[#CBD5D8] dark:border-[#1E2D40]">
                        <span className="text-[10px] text-[#5D757E] dark:text-slate-400 block font-sans">Density Population</span>
                        <span className="text-sm font-bold text-[#1C3334] dark:text-white mt-0.5 block">{selectedLiveZone.population} persons</span>
                      </div>
                      <div className="p-2 rounded bg-white dark:bg-[#0E1622] border border-[#CBD5D8] dark:border-[#1E2D40]">
                        <span className="text-[10px] text-[#5D757E] dark:text-slate-400 block font-sans">Normalized Density</span>
                        <span className="text-sm font-bold text-[#376E6F] dark:text-cyan-400 mt-0.5 block">
                          {(selectedLiveZone.normalized_density * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="p-2 rounded bg-white dark:bg-[#0E1622] border border-[#CBD5D8] dark:border-[#1E2D40]">
                        <span className="text-[10px] text-[#5D757E] dark:text-slate-400 block font-sans">Mean Flow Velocity</span>
                        <span className="text-sm font-bold text-[#1C3334] dark:text-white mt-0.5 block">{selectedLiveZone.avg_velocity} px/s</span>
                      </div>
                      <div className="p-2 rounded bg-white dark:bg-[#0E1622] border border-[#CBD5D8] dark:border-[#1E2D40]">
                        <span className="text-[10px] text-[#5D757E] dark:text-slate-400 block font-sans">Inflow / Outflow</span>
                        <span className="text-sm font-bold text-[#1C3334] dark:text-slate-200 mt-0.5 block">
                          <span className="text-emerald-600 dark:text-emerald-400">+{selectedLiveZone.inflow}</span> / <span className="text-rose-600 dark:text-rose-400">-{selectedLiveZone.outflow}</span>
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#E2E8EA] dark:border-[#1E2D40] flex items-center justify-between text-[11px]">
                      <span className="text-[#5D757E] dark:text-slate-400">Sector Motion Pattern:</span>
                      <span className={`font-semibold font-mono px-2 py-0.5 rounded text-[10px] ${
                        selectedLiveZone.pattern === 'BOTTLENECK' 
                          ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-500/30' 
                          : 'bg-[#376E6F]/10 text-[#376E6F] dark:text-[#6EB5B6] border border-[#376E6F]/30'
                      }`}>
                        {selectedLiveZone.pattern || 'LAMINAR_FLOW'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 text-center text-xs text-[#5D757E] dark:text-slate-500 border border-dashed border-[#CBD5D8] dark:border-[#1E2D40] rounded-lg">
                    Select any quadrant sector above to inspect live velocity & inflow dynamics.
                  </div>
                )}
              </div>

              <div className="p-2.5 rounded-lg bg-[#F8F9FA] dark:bg-[#0A1018] border border-[#E2E8EA] dark:border-[#1E2D40] text-[10px] text-[#5D757E] dark:text-slate-400 flex items-center space-x-2">
                <Info className="w-3.5 h-3.5 text-[#376E6F] shrink-0" />
                <span>Live spatial telemetry is calculated continuously without saving raw footage to disk.</span>
              </div>
            </div>
          </div>

          {/* Real-time Rolling Telemetry Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Live Risk Chart */}
            <div className="bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl p-5 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-[#1C3334] dark:text-white uppercase tracking-wider">
                    Live Risk Dynamics vs Short-Term Forecast (+10s)
                  </h3>
                  <p className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] mt-0.5">Rolling window of recent live camera frames (max 60 points)</p>
                </div>
                <span className="text-[10px] font-mono text-[#376E6F] dark:text-[#6EB5B6] px-2 py-0.5 rounded bg-[#376E6F]/10 border border-[#376E6F]/30">
                  REAL-TIME FEED
                </span>
              </div>

              <div className="h-60">
                {liveHistory.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={liveHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#203638' : '#E2E8EA'} />
                      <XAxis 
                        dataKey="frame_index" 
                        stroke={isDark ? '#8AA1A7' : '#5D757E'} 
                        tick={{ fontSize: 10, fill: isDark ? '#8AA1A7' : '#5D757E' }} 
                        unit="f" 
                      />
                      <YAxis 
                        stroke={isDark ? '#8AA1A7' : '#5D757E'} 
                        domain={[0, 100]} 
                        tick={{ fontSize: 10, fill: isDark ? '#8AA1A7' : '#5D757E' }} 
                      />
                      <Tooltip
                        contentStyle={{ 
                          backgroundColor: isDark ? '#152729' : '#FFFFFF', 
                          borderColor: isDark ? '#233C3F' : '#E2E8EA', 
                          borderRadius: '8px', 
                          boxShadow: isDark ? '0 4px 6px -1px rgba(0,0,0,0.5)' : '0 4px 6px -1px rgba(28,51,52,0.08)',
                          fontSize: '11px',
                          color: isDark ? '#EEF4F5' : '#1C3334' 
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="smoothed_risk_score"
                        name="Live Risk Score"
                        stroke="#DA7B93"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="forecast_risk_10s"
                        name="Projected Risk (+10s)"
                        stroke="#2F4454"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-xs text-[#5D757E] dark:text-slate-500">
                    <Activity className="w-6 h-6 text-slate-400 mb-2" />
                    <span>Awaiting live camera telemetry frames...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Live Optical Flow & Directional Entropy Chart */}
            <div className="bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl p-5 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-[#1C3334] dark:text-white uppercase tracking-wider">
                    Live Optical Flow & Directional Shannon Entropy
                  </h3>
                  <p className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] mt-0.5">Motion magnitude vs angular vector disorder</p>
                </div>
                <span className="text-[10px] font-mono text-[#DA7B93] px-2 py-0.5 rounded bg-[#DA7B93]/10 border border-[#DA7B93]/30">
                  Turbulence Heuristic
                </span>
              </div>

              <div className="h-60">
                {liveHistory.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={liveHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#203638' : '#E2E8EA'} />
                      <XAxis 
                        dataKey="frame_index" 
                        stroke={isDark ? '#8AA1A7' : '#5D757E'} 
                        tick={{ fontSize: 10, fill: isDark ? '#8AA1A7' : '#5D757E' }} 
                        unit="f" 
                      />
                      <YAxis 
                        stroke={isDark ? '#8AA1A7' : '#5D757E'} 
                        tick={{ fontSize: 10, fill: isDark ? '#8AA1A7' : '#5D757E' }} 
                      />
                      <Tooltip
                        contentStyle={{ 
                          backgroundColor: isDark ? '#152729' : '#FFFFFF', 
                          borderColor: isDark ? '#233C3F' : '#E2E8EA', 
                          borderRadius: '8px', 
                          boxShadow: isDark ? '0 4px 6px -1px rgba(0,0,0,0.5)' : '0 4px 6px -1px rgba(28,51,52,0.08)',
                          fontSize: '11px',
                          color: isDark ? '#EEF4F5' : '#1C3334' 
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="optical_flow_magnitude"
                        name="Flow Mag (px/frame)"
                        stroke="#376E6F"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="directional_entropy"
                        name="Entropy (0-1)"
                        stroke="#DA7B93"
                        strokeWidth={1.75}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-xs text-[#5D757E] dark:text-slate-500">
                    <Compass className="w-6 h-6 text-slate-400 mb-2" />
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
            <div className="lg:col-span-2 bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    selectedAnalysis?.status === 'processing' 
                      ? 'bg-[#376E6F] animate-pulse' 
                      : selectedAnalysis?.status === 'completed'
                      ? 'bg-emerald-500'
                      : 'bg-amber-500'
                  }`} />
                  <h3 className="text-sm font-semibold text-[#1C3334] dark:text-white tracking-wide">
                    Annotated Surveillance Feed
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#376E6F]/10 text-[#376E6F] dark:text-[#6EB5B6] border border-[#376E6F]/30">
                    {selectedAnalysis?.status === 'processing' ? 'LIVE PIPELINE' : 'SYNCHRONIZED AUDIT'}
                  </span>
                </div>

                <div className="flex items-center space-x-3 text-xs font-mono text-[#5D757E] dark:text-slate-400">
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
                {selectedAnalysis?.status === 'processing' || selectedAnalysis?.status === 'pending' ? (
                  <div className="text-center p-6 space-y-3 max-w-sm">
                    <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
                    <div>
                      <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
                        Rendering Surveillance Video
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Footage is currently being processed ({selectedAnalysis.progress_percent || 0}%).
                      </p>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="bg-cyan-400 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${selectedAnalysis.progress_percent || 0}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono">Telemetry metrics stream dynamically as frames complete.</p>
                  </div>
                ) : selectedAnalysis?.status === 'failed' && !selectedAnalysis.annotated_video_path ? (
                  <div className="text-center p-6 space-y-2 max-w-sm">
                    <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
                    <h4 className="text-xs font-semibold text-rose-400 uppercase tracking-wider">Analysis Failed</h4>
                    <p className="text-xs text-slate-400">{selectedAnalysis.error_message || 'Video processing encountered an error.'}</p>
                    <Link
                      to="/video-analysis"
                      className="inline-block mt-2 px-3 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 transition"
                    >
                      Re-run Analysis
                    </Link>
                  </div>
                ) : videoSrc ? (
                  <div className="relative w-full h-full flex items-center justify-center bg-black">
                    <video
                      ref={videoRef}
                      key={videoSrc}
                      src={videoSrc}
                      controls
                      autoPlay
                      playsInline
                      className="w-full h-full object-contain"
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => setIsPlaying(false)}
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={(e) => {
                        const video = e.currentTarget;
                        setVideoLoading(false);
                        setVideoError(null);
                        setVideoDuration(video.duration || 0);
                        const target = results[selectedFrameIndex];
                        if (target && target.timestamp_sec > 0) {
                          video.currentTime = target.timestamp_sec;
                        }
                      }}
                      onWaiting={() => setVideoLoading(true)}
                      onPlaying={() => setVideoLoading(false)}
                      onError={(e) => {
                        const err = (e.currentTarget as HTMLVideoElement).error;
                        let message = 'Unable to play surveillance video artifact.';
                        if (err?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
                          message = 'Video stream codec or container format is unsupported by this browser.';
                        } else if (err?.code === MediaError.MEDIA_ERR_NETWORK) {
                          message = 'Network error encountered while streaming video.';
                        }
                        setVideoError(message);
                        setVideoLoading(false);
                        setIsPlaying(false);
                      }}
                    />

                    {/* Video loading spinner overlay */}
                    {videoLoading && !videoError && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center pointer-events-none">
                        <div className="flex items-center space-x-2 text-cyan-400 text-xs font-mono">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Buffering surveillance feed...</span>
                        </div>
                      </div>
                    )}

                    {/* Video error fallback overlay */}
                    {videoError && (
                      <div className="absolute inset-0 bg-[#070B10]/95 flex flex-col items-center justify-center p-6 text-center space-y-3">
                        <AlertCircle className="w-8 h-8 text-amber-400" />
                        <div>
                          <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Video Stream Error</h4>
                          <p className="text-xs text-slate-400 max-w-md mt-1">{videoError}</p>
                        </div>
                        <button
                          onClick={() => {
                            setVideoError(null);
                            setVideoLoading(true);
                            if (videoRef.current) {
                              videoRef.current.load();
                            }
                          }}
                          className="px-3 py-1.5 rounded bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-500/40 text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Retry Stream Load</span>
                        </button>
                      </div>
                    )}
                  </div>
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
                <div className="p-3 bg-[#F8F9FA] dark:bg-[#0A1018] rounded-lg border border-[#E2E8EA] dark:border-[#1E2D40] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={handleTogglePlayback}
                        className="p-1.5 rounded bg-white dark:bg-[#141E2B] hover:bg-[#F1F4F5] dark:hover:bg-[#1E2D40] text-[#2F4454] dark:text-cyan-400 border border-[#CBD5D8] dark:border-[#1E2D40] transition cursor-pointer shadow-2xs"
                        title={isPlaying ? 'Pause Scrubbing' : 'Play Scrubbing'}
                      >
                        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => handleStepFrame(-1)}
                        disabled={selectedFrameIndex === 0}
                        className="p-1.5 rounded bg-white dark:bg-[#141E2B] hover:bg-[#F1F4F5] dark:hover:bg-[#1E2D40] text-[#5D757E] dark:text-slate-300 disabled:opacity-40 border border-[#CBD5D8] dark:border-[#1E2D40] transition cursor-pointer shadow-2xs"
                        title="Previous Frame"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleStepFrame(1)}
                        disabled={selectedFrameIndex >= results.length - 1}
                        className="p-1.5 rounded bg-white dark:bg-[#141E2B] hover:bg-[#F1F4F5] dark:hover:bg-[#1E2D40] text-[#5D757E] dark:text-slate-300 disabled:opacity-40 border border-[#CBD5D8] dark:border-[#1E2D40] transition cursor-pointer shadow-2xs"
                        title="Next Frame"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[11px] font-mono text-[#1C3334] dark:text-slate-300 font-medium">
                        Step: {selectedFrameIndex + 1} / {results.length}
                      </span>
                    </div>

                    <div className="text-[11px] font-mono text-[#376E6F] dark:text-cyan-400 font-semibold">
                      t = {currentFrame?.timestamp_sec?.toFixed(1) || '0.0'}s / {videoDuration > 0 ? videoDuration.toFixed(1) : (results[results.length - 1]?.timestamp_sec?.toFixed(1) || '0.0')}s
                    </div>
                  </div>

                  {/* Slider Scrub Bar */}
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, results.length - 1)}
                    value={selectedFrameIndex}
                    onChange={(e) => handleSeekFrame(Number(e.target.value))}
                    className="w-full h-1.5 bg-[#CBD5D8] dark:bg-[#141E2B] rounded-lg appearance-none cursor-pointer accent-[#376E6F]"
                  />
                </div>
              )}

              {/* Synchronized Replay Telemetry Strip */}
              <MetricStrip>
                <MetricItem
                  label="Observed Count"
                  value={currentFrame?.person_count ?? '—'}
                  unit="persons"
                  icon={Users}
                  tone="teal"
                  subtext="YOLOv8 Class 0"
                />
                <MetricItem
                  label="Current Risk"
                  value={currentFrame?.smoothed_risk_score !== undefined ? currentFrame.smoothed_risk_score.toFixed(1) : '—'}
                  unit="/ 100"
                  icon={Activity}
                  tone={
                    (currentFrame?.smoothed_risk_score || 0) >= 70 ? 'burgundy' :
                    (currentFrame?.smoothed_risk_score || 0) >= 40 ? 'rose' : 'teal'
                  }
                  subtext="Heuristic 4-factor"
                />
                <MetricItem
                  label="Forecast (+10s)"
                  value={currentFrame?.forecast_risk_10s !== undefined ? currentFrame.forecast_risk_10s.toFixed(1) : '—'}
                  unit="/ 100"
                  icon={TrendingUp}
                  tone={
                    (currentFrame?.forecast_risk_10s || 0) >= 70 ? 'burgundy' :
                    (currentFrame?.forecast_risk_10s || 0) >= 40 ? 'rose' : 'slate'
                  }
                  subtext="Trend Projection"
                />
                <MetricItem
                  label="Directional Entropy"
                  value={currentFrame?.directional_entropy !== undefined ? currentFrame.directional_entropy.toFixed(3) : '—'}
                  unit="Shannon H"
                  icon={Compass}
                  tone="deepteal"
                  subtext="Flow Turbulence"
                />
              </MetricStrip>
            </div>

            {/* Right Col: Interactive 3x3 Spatial Grid Matrix */}
            <div className="bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl p-5 flex flex-col justify-between space-y-4 shadow-xs">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#E2E8EA] dark:border-[#203638]">
                  <div>
                    <h3 className="text-sm font-semibold text-[#1C3334] dark:text-white tracking-wide">
                      Spatial Quadrant Intelligence
                    </h3>
                    <p className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC]">Select any quadrant to inspect localized telemetry</p>
                  </div>
                  <div className="flex items-center space-x-1 p-0.5 rounded-lg bg-[#EDE8E1] dark:bg-[#0B1415] border border-[#CBD5D8] dark:border-[#233C3F] text-[10px] font-mono">
                    <button
                      onClick={() => setReplaySpatialMode('3d')}
                      className={`px-2 py-0.5 rounded transition cursor-pointer ${
                        replaySpatialMode === '3d' ? 'bg-white dark:bg-[#183133] text-[#376E6F] dark:text-[#6EC4C6] font-bold shadow-2xs' : 'text-[#5D757E] dark:text-[#A0B7BC]'
                      }`}
                    >
                      3D Plaza
                    </button>
                    <button
                      onClick={() => setReplaySpatialMode('2d')}
                      className={`px-2 py-0.5 rounded transition cursor-pointer ${
                        replaySpatialMode === '2d' ? 'bg-white dark:bg-[#183133] text-[#376E6F] dark:text-[#6EC4C6] font-bold shadow-2xs' : 'text-[#5D757E] dark:text-[#A0B7BC]'
                      }`}
                    >
                      2D Grid
                    </button>
                  </div>
                </div>

                {replaySpatialMode === '3d' ? (
                  <SpatialDensity3D
                    gridData={currentFrame?.grid_density}
                    onSelectZone={setSelectedZone}
                    selectedZoneName={selectedZone?.name}
                    cameraName={selectedAnalysis?.id || 'REPLAY SESSION'}
                  />
                ) : (
                /* 3x3 Interactive Grid HUD */
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
                              ? 'border-[#376E6F] bg-[#376E6F]/15 ring-2 ring-[#376E6F]/40 shadow-xs'
                              : isCritical
                              ? 'border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/20 hover:border-rose-400'
                              : isHigh
                              ? 'border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 hover:border-amber-400'
                              : isMod
                              ? 'border-amber-200 dark:border-amber-500/20 bg-amber-50/50 dark:bg-[#121C2B] hover:border-amber-300'
                              : 'border-[#E2E8EA] dark:border-[#1E2D40] bg-[#F8F9FA] dark:bg-[#0A1018] hover:border-[#CBD5D8] dark:hover:border-slate-600'
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
                )}

                {/* Selected Zone Deep Dive */}
                {selectedZone ? (
                  <div className="p-3.5 bg-[#F8F9FA] dark:bg-[#0A1018] rounded-xl border border-[#E2E8EA] dark:border-[#1E2D40] space-y-2.5 text-xs">
                    <div className="flex items-center justify-between pb-2 border-b border-[#E2E8EA] dark:border-[#1E2D40]">
                      <span className="font-bold font-mono text-[#1C3334] dark:text-white text-xs">
                        Sector {selectedZone.name}
                      </span>
                      <RiskBadge band={selectedZone.density_level} size="sm" />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 text-[11px] font-mono">
                      <div className="p-2 rounded bg-white dark:bg-[#0E1622] border border-[#CBD5D8] dark:border-[#1E2D40]">
                        <span className="text-[10px] text-[#5D757E] dark:text-slate-400 block font-sans">Density Population</span>
                        <span className="text-sm font-bold text-[#1C3334] dark:text-white mt-0.5 block">{selectedZone.population} persons</span>
                      </div>
                      <div className="p-2 rounded bg-white dark:bg-[#0E1622] border border-[#CBD5D8] dark:border-[#1E2D40]">
                        <span className="text-[10px] text-[#5D757E] dark:text-slate-400 block font-sans">Normalized Density</span>
                        <span className="text-sm font-bold text-[#376E6F] dark:text-cyan-400 mt-0.5 block">
                          {(selectedZone.normalized_density * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="p-2 rounded bg-white dark:bg-[#0E1622] border border-[#CBD5D8] dark:border-[#1E2D40]">
                        <span className="text-[10px] text-[#5D757E] dark:text-slate-400 block font-sans">Mean Flow Velocity</span>
                        <span className="text-sm font-bold text-[#1C3334] dark:text-white mt-0.5 block">{selectedZone.avg_velocity} px/s</span>
                      </div>
                      <div className="p-2 rounded bg-white dark:bg-[#0E1622] border border-[#CBD5D8] dark:border-[#1E2D40]">
                        <span className="text-[10px] text-[#5D757E] dark:text-slate-400 block font-sans">Inflow / Outflow</span>
                        <span className="text-sm font-bold text-[#1C3334] dark:text-slate-200 mt-0.5 block">
                          <span className="text-emerald-600 dark:text-emerald-400">+{selectedZone.inflow}</span> / <span className="text-rose-600 dark:text-rose-400">-{selectedZone.outflow}</span>
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#E2E8EA] dark:border-[#1E2D40] flex items-center justify-between text-[11px]">
                      <span className="text-[#5D757E] dark:text-slate-400">Sector Motion Pattern:</span>
                      <span className={`font-semibold font-mono px-2 py-0.5 rounded text-[10px] ${
                        selectedZone.pattern === 'BOTTLENECK' 
                          ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-500/30' 
                          : 'bg-[#376E6F]/10 text-[#376E6F] dark:text-[#6EB5B6] border border-[#376E6F]/30'
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

              <div className="p-2.5 rounded-lg bg-[#F8F9FA] dark:bg-[#0A1018] border border-[#E2E8EA] dark:border-[#1E2D40] text-[10px] text-[#5D757E] dark:text-slate-400 flex items-center space-x-2">
                <Info className="w-3.5 h-3.5 text-[#376E6F] shrink-0" />
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
