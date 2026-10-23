import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { 
  Users, 
  Activity, 
  TrendingUp, 
  AlertTriangle, 
  PlayCircle,
  ArrowRight,
  Video,
  Grid3X3,
  ExternalLink,
  ShieldAlert,
  Info,
  RefreshCw,
  AlertCircle,
  Camera,
  Radio,
  Clock
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';

import { analyticsApi, analysisApi, incidentApi, videoApi, cameraApi, multiCameraApi } from '../services/api';
import { AnalyticsSummary, Analysis, Incident, FrameRecord, Video as VideoType, CameraSessionStatus, MultiCameraHealth } from '../types';
import { 
  KPICard, 
  StatusPill, 
  EmptyState, 
  ErrorState, 
  LoadingBlock 
} from '../components/UIComponents';
import { useSystem } from '../context/SystemContext';
import { useTheme } from '../context/ThemeContext';

interface PartialEndpointErrors {
  summary?: string;
  analyses?: string;
  incidents?: string;
  frames?: string;
  video?: string;
}

export const Overview: React.FC = () => {
  const { setSelectedAnalysis, refreshCounter } = useSystem();
  const { isDark } = useTheme();

  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [allAnalyses, setAllAnalyses] = useState<Analysis[] | null>(null);
  const [latestAnalysis, setLatestAnalysis] = useState<Analysis | null>(null);
  const [analysisVideo, setAnalysisVideo] = useState<VideoType | null>(null);
  const [recentIncidents, setRecentIncidents] = useState<Incident[] | null>(null);
  const [frameHistory, setFrameHistory] = useState<FrameRecord[] | null>(null);
  const [latestFrame, setLatestFrame] = useState<FrameRecord | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraSessionStatus | null>(null);
  const [fleetHealth, setFleetHealth] = useState<MultiCameraHealth | null>(null);
  const [fleetCameras, setFleetCameras] = useState<CameraSessionStatus[]>([]);
  const [lastSyncedTime, setLastSyncedTime] = useState<string>(() => new Date().toLocaleTimeString());

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [partialErrors, setPartialErrors] = useState<PartialEndpointErrors>({});

  const overviewRequestIdRef = useRef<number>(0);

  const loadOverviewData = useCallback(async (isSilentRefresh = false) => {
    const currentRequestId = ++overviewRequestIdRef.current;
    
    if (isSilentRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setFatalError(null);

    const detectedErrors: PartialEndpointErrors = {};

    try {
      const [sumResult, analysesResult, incidentsResult, camResult, fleetHealthResult, fleetCamsResult] = await Promise.allSettled([
        analyticsApi.getSummary(),
        analysisApi.getAll(),
        incidentApi.getAll(),
        cameraApi.getStatus(),
        multiCameraApi.getHealth(),
        multiCameraApi.list(),
      ]);

      if (currentRequestId !== overviewRequestIdRef.current) return;

      if (fleetHealthResult.status === 'fulfilled') {
        setFleetHealth(fleetHealthResult.value);
      }
      if (fleetCamsResult.status === 'fulfilled') {
        setFleetCameras(fleetCamsResult.value);
      }

      if (camResult.status === 'fulfilled') {
        setCameraStatus(camResult.value);
      } else {
        setCameraStatus(null);
      }

      setLastSyncedTime(new Date().toLocaleTimeString());

      if (sumResult.status === 'fulfilled') {
        setSummary(sumResult.value);
      } else {
        detectedErrors.summary = 'Summary metrics unavailable.';
        setSummary(null);
      }

      if (incidentsResult.status === 'fulfilled') {
        setRecentIncidents(incidentsResult.value.slice(0, 5));
      } else {
        detectedErrors.incidents = 'Incident warnings could not be retrieved.';
        setRecentIncidents(null);
      }

      let activeAnalysis: Analysis | null = null;
      if (analysesResult.status === 'fulfilled') {
        const analyses = analysesResult.value;
        setAllAnalyses(analyses);

        if (analyses.length > 0) {
          const processing = analyses.find((a) => a.status === 'processing');
          const completed = analyses.find((a) => a.status === 'completed');
          activeAnalysis = processing || completed || analyses[0];
          setLatestAnalysis(activeAnalysis);
          setSelectedAnalysis(activeAnalysis);
        } else {
          setLatestAnalysis(null);
          setSelectedAnalysis(null);
        }
      } else {
        detectedErrors.analyses = 'Surveillance catalog could not be retrieved.';
        setAllAnalyses(null);
        setLatestAnalysis(null);
        setSelectedAnalysis(null);
      }

      if (
        sumResult.status === 'rejected' &&
        analysesResult.status === 'rejected' &&
        incidentsResult.status === 'rejected'
      ) {
        setFatalError('Unable to connect to the CROWDGUARD surveillance backend. Ensure the API server is running on port 8000.');
        setPartialErrors({});
        return;
      }

      if (activeAnalysis) {
        const targetId = activeAnalysis.id;
        const targetVideoId = activeAnalysis.video_id;

        const [videoRes, framesRes] = await Promise.allSettled([
          targetVideoId ? videoApi.getById(targetVideoId) : Promise.reject(new Error('No video_id')),
          analysisApi.getResults(targetId),
        ]);

        if (currentRequestId !== overviewRequestIdRef.current) return;

        if (videoRes.status === 'fulfilled') {
          setAnalysisVideo(videoRes.value);
        } else {
          setAnalysisVideo(null);
          detectedErrors.video = 'Video metadata unavailable.';
        }

        if (framesRes.status === 'fulfilled') {
          const frames = framesRes.value;
          setFrameHistory(frames);
          setLatestFrame(frames.length > 0 ? frames[frames.length - 1] : null);
        } else {
          setFrameHistory(null);
          setLatestFrame(null);
          detectedErrors.frames = 'Frame telemetry results unavailable.';
        }
      } else {
        setAnalysisVideo(null);
        setFrameHistory([]);
        setLatestFrame(null);
      }

      setPartialErrors(detectedErrors);
    } catch (err: unknown) {
      if (currentRequestId !== overviewRequestIdRef.current) return;
      const msg = err instanceof Error ? err.message : 'Communication error with surveillance engine.';
      setFatalError(msg);
    } finally {
      if (currentRequestId === overviewRequestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [setSelectedAnalysis]);

  useEffect(() => {
    loadOverviewData(false);
  }, [loadOverviewData]);

  useEffect(() => {
    if (refreshCounter > 0) {
      loadOverviewData(true);
    }
  }, [refreshCounter, loadOverviewData]);

  useEffect(() => {
    if (!cameraStatus?.is_active) return;
    const interval = setInterval(async () => {
      try {
        const stat = await cameraApi.getStatus();
        setCameraStatus(stat);
      } catch {
        // Silent poll guard
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [cameraStatus?.is_active]);

  const chartData = useMemo(() => {
    if (!frameHistory || frameHistory.length === 0) return [];
    const step = Math.max(1, Math.floor(frameHistory.length / 50));
    return frameHistory
      .filter((_, idx) => idx % step === 0)
      .map((f) => ({
        time: `${f.timestamp_sec.toFixed(1)}s`,
        risk: typeof f.smoothed_risk_score === 'number' ? Number(f.smoothed_risk_score.toFixed(1)) : null,
        forecast: typeof f.forecast_risk_10s === 'number' ? Number(f.forecast_risk_10s.toFixed(1)) : null,
        count: f.person_count,
        entropy: typeof f.directional_entropy === 'number' ? Number(f.directional_entropy.toFixed(2)) : null,
      }));
  }, [frameHistory]);

  const zoneCells = useMemo(() => {
    if (latestFrame && latestFrame.grid_density && latestFrame.grid_density.length === 9) {
      return latestFrame.grid_density;
    }
    return null;
  }, [latestFrame]);

  if (loading) {
    return <LoadingBlock text="Connecting to surveillance telemetry stream..." height="h-96" />;
  }

  if (fatalError) {
    return (
      <div className="space-y-4">
        <ErrorState message={fatalError} onRetry={() => loadOverviewData(false)} />
      </div>
    );
  }

  const hasPartialFailures = Object.keys(partialErrors).length > 0;
  const hasAnalyses = allAnalyses !== null && allAnalyses.length > 0;

  return (
    <div className="space-y-6 w-full">
      {/* -------------------------------------------------------------------------
          1. HEADER WITH ACTIONS & REFRESH STATUS
          ------------------------------------------------------------------------- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-[#E2E8EA] dark:border-[#1F3538] gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h2 className="text-xl font-bold tracking-tight text-[#1C3334] dark:text-[#EDF4F5]">
              CROWD SURVEILLANCE & FORECAST COMMAND CENTER
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#376E6F]/10 dark:bg-[#376E6F]/25 text-[#376E6F] dark:text-[#6EB5B6] border border-[#376E6F]/30 font-semibold">
              DIP OPS
            </span>
            {refreshing && (
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono bg-[#DA7B93]/15 text-[#B34D66] dark:text-[#DA7B93] border border-[#DA7B93]/30 animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Updating Telemetry...</span>
              </span>
            )}
          </div>
          <p className="text-xs text-[#5D757E] dark:text-[#A0B7BC] mt-1 max-w-3xl leading-relaxed">
            Multi-stage Digital Image Processing surveillance system evaluating Farneback optical flow velocity fields,
            directional Shannon entropy disorder, 2D continuous Gaussian density splatting, and +10s risk projections.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <span className="hidden sm:inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#152729] border border-[#CBD5D8] dark:border-[#2C4B4E] text-[11px] font-mono text-[#5D757E] dark:text-[#A0B7BC] shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-[#376E6F] dark:text-[#6EB5B6]" />
            <span>Synced: {lastSyncedTime}</span>
          </span>
          <button
            onClick={() => loadOverviewData(true)}
            disabled={refreshing}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white dark:bg-[#152729] hover:bg-[#F1F4F5] dark:hover:bg-[#1C3336] text-[#2F4454] dark:text-[#EDF4F5] border border-[#CBD5D8] dark:border-[#2C4B4E] rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
            title="Refresh current dashboard data"
            aria-label="Refresh overview dashboard data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#376E6F]' : ''}`} />
            <span>Refresh</span>
          </button>
          <Link
            to="/cameras"
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white dark:bg-[#152729] hover:bg-[#EEF5F5] dark:hover:bg-[#183133] text-[#376E6F] dark:text-[#6EB5B6] border border-[#376E6F]/30 dark:border-[#376E6F]/40 rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
          >
            <Radio className="w-3.5 h-3.5 text-[#376E6F] dark:text-[#6EB5B6]" />
            <span>Multi-Camera Fleet</span>
          </Link>
          <Link
            to="/video-analysis"
            className="inline-flex items-center space-x-2 px-3.5 py-2 bg-[#2F4454] hover:bg-[#1C3334] dark:bg-[#376E6F] dark:hover:bg-[#4A8E8F] text-white rounded-lg text-xs font-semibold transition-colors shadow-xs cursor-pointer"
          >
            <PlayCircle className="w-4 h-4" />
            <span>Video Ingestion Studio</span>
          </Link>
          {latestAnalysis && (
            <Link
              to={`/monitoring?analysisId=${latestAnalysis.id}`}
              className="inline-flex items-center space-x-1.5 px-3 py-2 bg-[#F1F4F5] dark:bg-[#182E30] hover:bg-[#E4EAEB] text-[#2F4454] dark:text-[#EDF4F5] border border-[#CBD5D8] dark:border-[#2C4B4E] rounded-lg text-xs font-medium transition-colors cursor-pointer shadow-2xs"
            >
              <Activity className="w-4 h-4 text-[#376E6F] dark:text-[#6EB5B6]" />
              <span>Open Telemetry Stream</span>
            </Link>
          )}
        </div>
      </div>

      {/* Partial Errors Banner */}
      {hasPartialFailures && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-3.5 text-xs text-amber-900 dark:text-amber-200 flex items-start space-x-2.5 shadow-xs">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <span className="font-semibold block text-amber-900 dark:text-amber-300">Telemetry Stream Partially Degraded:</span>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800 dark:text-amber-300/80">
              {Object.entries(partialErrors).map(([key, msg]) => (
                <li key={key}>{msg}</li>
              ))}
            </ul>
          </div>
          <button
            onClick={() => loadOverviewData(true)}
            className="px-2.5 py-1 bg-amber-200 dark:bg-amber-900/40 hover:bg-amber-300 dark:hover:bg-amber-900/60 border border-amber-400 dark:border-amber-500/30 rounded text-[11px] text-amber-900 dark:text-amber-200 font-medium cursor-pointer shrink-0"
          >
            Retry Telemetry
          </button>
        </div>
      )}

      {/* -------------------------------------------------------------------------
          MULTI-CAMERA FLEET STATUS BANNER
          ------------------------------------------------------------------------- */}
      {fleetHealth && fleetHealth.total_registered > 0 && (
        <div className="rounded-xl border border-[#376E6F]/30 dark:border-[#376E6F]/40 bg-white dark:bg-[#122224] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-10 h-10 rounded-lg bg-[#EEF5F5] dark:bg-[#1A3336] border border-[#376E6F]/30 dark:border-[#376E6F]/50 flex items-center justify-center text-[#376E6F] dark:text-[#6EB5B6] shrink-0 relative">
              <Radio className="w-5 h-5" />
              {fleetHealth.active_streams > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </div>
            <div className="truncate">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-[#1C3334] dark:text-[#EDF4F5]">Multi-Camera Surveillance Fleet:</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#EEF5F5] dark:bg-[#16292B] text-[#376E6F] dark:text-[#6EB5B6] border border-[#376E6F]/25 font-semibold">
                  {fleetHealth.active_streams} Active / {fleetHealth.total_registered} Registered
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border ${
                  fleetHealth.system_status === 'OPERATIONAL' ? 'bg-[#EEF5F5] dark:bg-[#183133] text-[#376E6F] dark:text-[#6EC4C6] border-[#376E6F]/30' :
                  fleetHealth.system_status === 'DEGRADED' ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300' :
                  'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400 border-slate-300'
                }`}>
                  {fleetHealth.system_status}
                </span>
                {fleetHealth.reconnecting_count > 0 && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300 animate-pulse">
                    {fleetHealth.reconnecting_count} in Recovery
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#5D757E] dark:text-[#A0B7BC] mt-1">
                <span>
                  Connected: <strong className="text-emerald-700 dark:text-emerald-400 font-mono">{fleetHealth.connected_count} nodes</strong>
                </span>
                <span>•</span>
                <span>
                  Observed Crowd: <strong className="text-[#1C3334] dark:text-[#EDF4F5] font-mono">{fleetHealth.total_observed_persons} persons</strong>
                </span>
                <span>•</span>
                <span>
                  Peak Fleet Risk: <strong className={`font-mono ${
                    fleetHealth.highest_risk_score >= 70 ? 'text-[#2E151B] dark:text-rose-400' : fleetHealth.highest_risk_score >= 40 ? 'text-amber-700 dark:text-amber-400' : 'text-[#376E6F] dark:text-emerald-400'
                  }`}>
                    {fleetHealth.highest_risk_score.toFixed(1)} / 100
                  </strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <Link
              to="/cameras"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#2F4454] hover:bg-[#1C3334] dark:bg-[#376E6F] dark:hover:bg-[#4A8E8F] text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-xs"
            >
              <span>Manage Camera Fleet</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------------
          LIVE WEBCAM STREAM BANNER
          ------------------------------------------------------------------------- */}
      {cameraStatus && cameraStatus.is_active && (
        <div className="rounded-xl border border-[#376E6F]/30 dark:border-[#376E6F]/40 bg-white dark:bg-[#122224] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-10 h-10 rounded-lg bg-[#EEF5F5] dark:bg-[#1A3336] border border-[#376E6F]/30 dark:border-[#376E6F]/50 flex items-center justify-center text-[#376E6F] dark:text-[#6EB5B6] shrink-0 relative">
              <Camera className="w-5 h-5" />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="truncate">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-[#1C3334] dark:text-[#EDF4F5]">Live Hardware Webcam Feed:</span>
                <span className="text-xs font-mono text-[#376E6F] dark:text-[#6EB5B6] font-semibold">
                  Device #{cameraStatus.device_index ?? 0}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border ${
                  cameraStatus.state === 'CONNECTED' ? 'bg-[#EEF5F5] dark:bg-[#183133] text-[#376E6F] dark:text-[#6EC4C6] border-[#376E6F]/30' :
                  cameraStatus.state === 'CONNECTING' ? 'bg-[#FDF3F5] dark:bg-[#2A161D] text-[#B34D66] dark:text-[#F0A4B8] border-[#DA7B93]/35 animate-pulse' :
                  'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300'
                }`}>
                  {cameraStatus.state}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#EEF5F5] dark:bg-[#16292B] text-[#376E6F] dark:text-[#6EB5B6] border border-[#376E6F]/25 font-semibold">
                  LIVE STREAM
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#5D757E] dark:text-[#A0B7BC] mt-1">
                <span>
                  Capture: <strong className="text-[#1C3334] dark:text-[#EDF4F5] font-mono">{cameraStatus.measured_fps.toFixed(1)} FPS</strong>
                </span>
                <span>•</span>
                <span>
                  Inference: <strong className="text-emerald-700 dark:text-emerald-400 font-mono">{cameraStatus.processing_fps.toFixed(1)} FPS</strong>
                </span>
                <span>•</span>
                <span>
                  Frames: <strong className="text-[#1C3334] dark:text-[#EDF4F5] font-mono">#{cameraStatus.latest_frame_id}</strong> ({cameraStatus.frames_captured} capt, {cameraStatus.frames_dropped} drop)
                </span>
                <span>•</span>
                <span>
                  Uptime: <strong className="text-[#1C3334] dark:text-[#EDF4F5] font-mono">{cameraStatus.uptime_seconds}s</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <Link
              to="/monitoring?source=webcam"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#2F4454] hover:bg-[#1C3334] dark:bg-[#376E6F] dark:hover:bg-[#4A8E8F] text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-xs"
            >
              <span>Open Live Surveillance Feed</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------------
          2. ACTIVE / LATEST SESSION BANNER
          ------------------------------------------------------------------------- */}
      {latestAnalysis ? (
        <div className="rounded-xl border border-[#E2E8EA] dark:border-[#233C3F] bg-white dark:bg-[#152729] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-10 h-10 rounded-lg bg-[#EEF5F5] dark:bg-[#1A3336] border border-[#376E6F]/30 flex items-center justify-center text-[#376E6F] dark:text-[#6EB5B6] shrink-0">
              <Video className="w-5 h-5" />
            </div>
            <div className="truncate">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-[#1C3334] dark:text-[#EDF4F5]">Active Catalog Session:</span>
                <span className="text-xs font-mono text-[#2F4454] dark:text-[#A3CBD4] font-semibold">
                  {latestAnalysis.id}
                </span>
                <StatusPill status={latestAnalysis.status} />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#5D757E] dark:text-[#A0B7BC] mt-1">
                <span>
                  Source: <strong className="text-[#1C3334] dark:text-[#EDF4F5]">{analysisVideo?.original_filename || analysisVideo?.filename || 'Surveillance Clip'}</strong>
                </span>
                <span>•</span>
                <span>
                  Dominant Pattern: <strong className="text-[#1C3334] dark:text-[#EDF4F5] uppercase font-mono">{latestAnalysis.dominant_pattern || 'NORMAL_FLOW'}</strong>
                </span>
                <span>•</span>
                <span>
                  Peak Crowd: <strong className="text-[#1C3334] dark:text-[#EDF4F5] font-mono">{typeof latestAnalysis.peak_count === 'number' ? latestAnalysis.peak_count : '—'}</strong>
                </span>
                <span>•</span>
                <span>
                  Max Risk: <strong className="text-[#1C3334] dark:text-[#EDF4F5] font-mono">{typeof latestAnalysis.max_risk_score === 'number' ? `${latestAnalysis.max_risk_score.toFixed(1)}/100` : '—'}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <Link
              to={`/monitoring?analysisId=${latestAnalysis.id}`}
              className="inline-flex items-center space-x-1.5 text-xs text-[#376E6F] dark:text-[#6EB5B6] hover:text-[#2F4454] dark:hover:text-white font-semibold"
            >
              <span>Inspect Replay</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <EmptyState
          title="No Video Surveillance Sessions Active"
          description="The surveillance catalog is currently unpopulated. Ingest a video or select a demonstration scenario to begin tracking crowd density and risk telemetry."
          actionText="Go to Video Ingestion Studio"
          onAction={() => window.location.assign('/video-analysis')}
          icon={Video}
        />
      )}

      {/* -------------------------------------------------------------------------
          3. SURVEILLANCE KPI TILES
          ------------------------------------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Total Catalog Videos"
          value={
            summary && typeof summary.total_videos === 'number'
              ? summary.total_videos
              : 'Unavailable'
          }
          unit={summary && typeof summary.total_videos === 'number' ? 'files' : undefined}
          subtext={
            summary && typeof summary.total_analyses === 'number'
              ? `${summary.total_analyses} total surveillance audits`
              : (partialErrors.summary || 'Summary metrics unavailable')
          }
          icon={Video}
          tone="slate"
        />

        <KPICard
          label="Current / Sample Risk"
          value={
            latestFrame && typeof latestFrame.smoothed_risk_score === 'number'
              ? latestFrame.smoothed_risk_score.toFixed(1)
              : latestAnalysis && typeof latestAnalysis.avg_risk_score === 'number'
              ? latestAnalysis.avg_risk_score.toFixed(1)
              : (partialErrors.frames ? 'Unavailable' : 'No telemetry')
          }
          unit={latestFrame || latestAnalysis ? '/ 100' : undefined}
          subtext={
            latestFrame
              ? `Band: ${latestFrame.risk_band}`
              : latestAnalysis
              ? 'Average session score'
              : 'Requires frame telemetry'
          }
          icon={Activity}
          tone={
            latestFrame
              ? latestFrame.smoothed_risk_score >= 50 ? 'burgundy' : latestFrame.smoothed_risk_score >= 25 ? 'amber' : 'teal'
              : 'neutral'
          }
        />

        <KPICard
          label="Short-Term Forecast (+10s)"
          value={
            latestFrame && typeof latestFrame.forecast_risk_10s === 'number'
              ? latestFrame.forecast_risk_10s.toFixed(1)
              : (partialErrors.frames ? 'Unavailable' : 'No telemetry')
          }
          unit={latestFrame ? '/ 100' : undefined}
          subtext={
            latestFrame
              ? `Trend: ${latestFrame.forecast_trend || 'STABLE'} • ${latestFrame.forecast_confidence ? `${latestFrame.forecast_confidence}% conf` : 'heuristic'}`
              : 'Uncalibrated trend heuristic'
          }
          icon={TrendingUp}
          tone={latestFrame && latestFrame.forecast_risk_10s >= 60 ? 'rose' : 'neutral'}
        />

        <KPICard
          label="Sustained Incidents"
          value={
            summary && typeof summary.total_incidents === 'number'
              ? summary.total_incidents
              : 'Unavailable'
          }
          unit={summary && typeof summary.total_incidents === 'number' ? 'events' : undefined}
          subtext={
            summary && typeof summary.critical_incidents === 'number'
              ? `${summary.critical_incidents} critical priority alerts`
              : (partialErrors.summary || 'Incident counts unavailable')
          }
          icon={AlertTriangle}
          tone={summary && summary.critical_incidents > 0 ? 'burgundy' : 'amber'}
        />
      </div>

      {/* -------------------------------------------------------------------------
          4. PRIMARY RISK TRAJECTORY & 3X3 SPATIAL QUADRANT MATRIX
          ------------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Risk Trend Chart Panel */}
        <div className="lg:col-span-2 rounded-xl border border-[#E2E8EA] dark:border-[#233C3F] bg-white dark:bg-[#152729] p-5 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8EA] dark:border-[#233C3F] mb-4">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-[#376E6F] dark:text-[#6EB5B6]" />
                <h3 className="text-sm font-bold text-[#1C3334] dark:text-[#EDF4F5]">
                  Temporal Risk Trajectory & Point-in-Time Projections
                </h3>
              </div>
              <div className="flex items-center space-x-3 text-xs">
                <span className="flex items-center space-x-1 text-[#376E6F] dark:text-[#6EB5B6] text-[11px] font-mono">
                  <span className="w-2.5 h-0.5 bg-[#376E6F] dark:bg-[#6EB5B6] inline-block" />
                  <span>Observed Composite Risk (t)</span>
                </span>
                <span className="flex items-center space-x-1 text-[#DA7B93] text-[11px] font-mono">
                  <span className="w-2.5 h-0.5 bg-[#DA7B93] inline-block border-t border-dashed" />
                  <span>Point Projection (+10s at frame t)</span>
                </span>
              </div>
            </div>

            {chartData.length > 0 ? (
              <div className="h-64 min-h-[256px] w-full min-w-0 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={isDark ? "#4A8E8F" : "#376E6F"} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={isDark ? "#4A8E8F" : "#376E6F"} stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#DA7B93" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#DA7B93" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#233C3F" : "#E2E8EA"} vertical={false} />
                    <XAxis 
                      dataKey="time" 
                      stroke={isDark ? "#A0B7BC" : "#5D757E"} 
                      fontSize={11} 
                      tickLine={false} 
                      axisLine={{ stroke: isDark ? "#233C3F" : "#E2E8EA" }} 
                    />
                    <YAxis 
                      stroke={isDark ? "#A0B7BC" : "#5D757E"} 
                      fontSize={11} 
                      domain={[0, 100]} 
                      tickLine={false} 
                      axisLine={{ stroke: isDark ? "#233C3F" : "#E2E8EA" }} 
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: isDark ? '#152729' : '#FFFFFF',
                        borderColor: isDark ? '#2C4B4E' : '#CBD5D8',
                        borderRadius: '8px',
                        fontSize: '11px',
                        color: isDark ? '#EDF4F5' : '#1C3334',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                      }}
                      formatter={(val: any, name: any) => [
                        val !== null && typeof val === 'number' ? `${val.toFixed(1)}/100` : 'Not recorded',
                        name === 'risk' ? 'Observed Risk (t)' : name === 'forecast' ? 'Point-in-Time Projection (t + 10s)' : String(name),
                      ]}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="risk" 
                      stroke={isDark ? "#6EB5B6" : "#376E6F"} 
                      strokeWidth={2} 
                      fill="url(#riskGrad)" 
                      isAnimationActive={false}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="forecast" 
                      stroke="#DA7B93" 
                      strokeWidth={1.5} 
                      strokeDasharray="4 4" 
                      fill="url(#forecastGrad)" 
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : frameHistory === null && partialErrors.frames ? (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-[#2E151B] dark:text-rose-300">
                <AlertCircle className="w-8 h-8 text-[#2E151B] dark:text-rose-400 mb-2" />
                <p className="text-xs font-semibold">Frame Telemetry Unavailable</p>
                <p className="text-[11px] opacity-80 mt-1 max-w-sm">
                  {partialErrors.frames}
                </p>
                <button
                  onClick={() => loadOverviewData(true)}
                  className="mt-3 px-3 py-1 bg-[#2E151B]/10 hover:bg-[#2E151B]/20 dark:bg-rose-900/30 dark:hover:bg-rose-900/50 border border-[#2E151B]/25 dark:border-rose-500/30 rounded text-xs text-[#2E151B] dark:text-rose-200 cursor-pointer"
                >
                  Retry Telemetry
                </button>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-[#5D757E] dark:text-[#A0B7BC]">
                <Activity className="w-8 h-8 text-[#5D757E] dark:text-[#A0B7BC] mb-2" />
                <p className="text-xs font-medium text-[#1C3334] dark:text-[#EDF4F5]">No frame telemetry recorded for this session</p>
                <p className="text-[11px] text-[#5D757E] dark:text-[#A0B7BC] mt-1 max-w-sm">
                  The active session has not recorded any frame telemetry records yet, or is currently pending.
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-[#E2E8EA] dark:border-[#233C3F] flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-[#5D757E] dark:text-[#A0B7BC] gap-2">
            <span className="flex items-center space-x-1.5">
              <Info className="w-3.5 h-3.5 text-[#376E6F] dark:text-[#6EB5B6] shrink-0" />
              <span>
                Risk scores (0–100) are heuristic decision-support metrics (Farneback flow, Shannon entropy, 2D Gaussian density, congestion), not actuarial disaster probabilities.
              </span>
            </span>
            {latestAnalysis && (
              <Link 
                to={`/analytics?analysisId=${latestAnalysis.id}`}
                className="text-[#376E6F] dark:text-[#6EB5B6] hover:text-[#2F4454] dark:hover:text-white font-semibold inline-flex items-center space-x-1 shrink-0"
              >
                <span>Full dynamics analytics</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>
        </div>

        {/* 3x3 Spatial Grid Quadrant Telemetry */}
        <div className="rounded-xl border border-[#E2E8EA] dark:border-[#233C3F] bg-white dark:bg-[#152729] p-5 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8EA] dark:border-[#233C3F] mb-3">
              <div className="flex items-center space-x-2">
                <Grid3X3 className="w-4 h-4 text-[#376E6F] dark:text-[#6EB5B6]" />
                <h3 className="text-sm font-bold text-[#1C3334] dark:text-[#EDF4F5]">Spatial 3×3 Density Matrix</h3>
              </div>
              <span className="text-[10px] font-mono text-[#5D757E] dark:text-[#A0B7BC]">
                {latestFrame ? `t=${latestFrame.timestamp_sec.toFixed(1)}s` : 'No Frame'}
              </span>
            </div>

            <p className="text-[11px] text-[#5D757E] dark:text-[#A0B7BC] mb-3">
              Zone occupancy and perspective-weighted congestion across quadrants (Zones A1–C3):
            </p>

            {zoneCells !== null ? (
              <div className="grid grid-cols-3 gap-2 aspect-square">
                {zoneCells.map((zone) => {
                  const isHigh = zone.density_level === 'High' || zone.density_level === 'Critical';
                  const isMod = zone.density_level === 'Moderate';
                  return (
                    <div
                      key={zone.name}
                      className={`rounded-lg border p-2 flex flex-col justify-between transition-colors shadow-2xs ${
                        isHigh
                          ? 'border-[#2E151B]/30 dark:border-rose-500/40 bg-[#FAF0F2] dark:bg-rose-950/20 text-[#2E151B] dark:text-rose-300'
                          : isMod
                          ? 'border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300'
                          : 'border-[#E2E8EA] dark:border-[#233C3F] bg-[#F8F9FA] dark:bg-[#112022] text-[#1C3334] dark:text-[#EDF4F5]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold">{zone.name}</span>
                        <span className={`text-[9px] px-1 rounded font-mono font-semibold ${
                          isHigh ? 'bg-[#2E151B]/15 dark:bg-rose-500/30 text-[#2E151B] dark:text-rose-200' : isMod ? 'bg-amber-200 dark:bg-amber-500/30 text-amber-900 dark:text-amber-200' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400'
                        }`}>
                          {zone.density_level}
                        </span>
                      </div>

                      <div className="my-1">
                        <div className="text-lg font-bold font-mono text-[#1C3334] dark:text-[#EDF4F5]">
                          {zone.population}
                        </div>
                        <span className="text-[9px] text-[#5D757E] dark:text-[#A0B7BC] font-mono block">
                          density: {(zone.normalized_density * 100).toFixed(0)}%
                        </span>
                      </div>

                      <div className="text-[9px] font-mono text-[#5D757E] dark:text-[#A0B7BC] border-t border-[#E2E8EA] dark:border-[#233C3F] pt-1 flex justify-between">
                        <span>v: {zone.avg_velocity.toFixed(1)}px</span>
                        {zone.pattern !== 'NORMAL' && (
                          <span className="text-[#DA7B93] font-bold uppercase">{zone.pattern}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="aspect-square rounded-lg border border-dashed border-[#CBD5D8] dark:border-[#233C3F] bg-[#F8F9FA] dark:bg-[#112022] flex flex-col items-center justify-center p-6 text-center text-[#5D757E] dark:text-[#A0B7BC]">
                <Grid3X3 className="w-8 h-8 text-[#5D757E] dark:text-[#A0B7BC] mb-2" />
                <p className="text-xs font-semibold text-[#1C3334] dark:text-[#EDF4F5]">Spatial Telemetry Unavailable</p>
                <p className="text-[11px] text-[#5D757E] dark:text-[#A0B7BC] mt-1 max-w-xs">
                  {partialErrors.frames
                    ? 'Frame telemetry request failed.'
                    : 'No processed frame records exist to construct the 3×3 quadrant density matrix.'}
                </p>
              </div>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-[#E2E8EA] dark:border-[#233C3F] text-[11px] text-[#5D757E] dark:text-[#A0B7BC] flex items-center justify-between">
            <span>Perspective Scale: {latestAnalysis?.perspective_weight ? `${latestAnalysis.perspective_weight}×` : '1.0×'}</span>
            <Link
              to={latestAnalysis ? `/monitoring?analysisId=${latestAnalysis.id}` : '/monitoring'}
              className="text-[#376E6F] dark:text-[#6EB5B6] hover:text-[#2F4454] dark:hover:text-white font-semibold inline-flex items-center space-x-1"
            >
              <span>Inspect grid flow</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------------
          5. SUSTAINED INCIDENTS & HISTORICAL AUDIT SESSIONS
          ------------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sustained Incidents */}
        <div className="rounded-xl border border-[#E2E8EA] dark:border-[#233C3F] bg-white dark:bg-[#152729] p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#E2E8EA] dark:border-[#233C3F] mb-3">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-[#DA7B93]" />
              <h3 className="text-sm font-bold text-[#1C3334] dark:text-[#EDF4F5]">
                Recent Sustained Incidents & Early Warnings
              </h3>
            </div>
            {recentIncidents && (
              <Link
                to="/incidents"
                className="text-xs text-[#376E6F] dark:text-[#6EB5B6] hover:text-[#2F4454] dark:hover:text-white font-semibold inline-flex items-center space-x-1"
              >
                <span>View all ({recentIncidents.length})</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>

          {recentIncidents === null && partialErrors.incidents ? (
            <div className="py-12 text-center text-[#2E151B] dark:text-rose-300">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-[#2E151B] dark:text-rose-400" />
              <p className="text-xs font-semibold">Incident Retrieval Failed</p>
              <p className="text-[11px] opacity-80 mt-1 max-w-xs mx-auto">
                {partialErrors.incidents}
              </p>
              <button
                onClick={() => loadOverviewData(true)}
                className="mt-3 px-3 py-1 bg-[#2E151B]/10 hover:bg-[#2E151B]/20 dark:bg-rose-900/30 dark:hover:bg-rose-900/50 border border-[#2E151B]/25 dark:border-rose-500/30 rounded text-xs text-[#2E151B] dark:text-rose-200 cursor-pointer"
              >
                Retry Incidents
              </button>
            </div>
          ) : recentIncidents && recentIncidents.length > 0 ? (
            <div className="space-y-2.5">
              {recentIncidents.map((inc) => (
                <div
                  key={inc.id}
                  className="rounded-lg border border-[#E2E8EA] dark:border-[#233C3F] bg-[#F8F9FA] dark:bg-[#112022] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:border-[#CBD5D8] dark:hover:border-[#376E6F]/40 transition-colors shadow-2xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                        inc.severity === 'CRITICAL' ? 'bg-[#FAF0F2] dark:bg-rose-950/30 text-[#2E151B] dark:text-rose-300 border border-[#2E151B]/30 dark:border-rose-500/30' :
                        inc.severity === 'HIGH' ? 'bg-[#FDF3F5] dark:bg-[#2A161D] text-[#B34D66] dark:text-[#F0A4B8] border border-[#DA7B93]/35' :
                        'bg-amber-50 dark:bg-amber-950/25 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30'
                      }`}>
                        {inc.severity}
                      </span>
                      <span className="text-xs font-bold text-[#1C3334] dark:text-[#EDF4F5] font-mono">
                        {inc.incident_type}
                      </span>
                      <span className="text-[11px] text-[#5D757E] dark:text-[#A0B7BC] font-mono">
                        @ {typeof inc.video_timestamp_sec === 'number' ? `${inc.video_timestamp_sec.toFixed(1)}s` : '—'}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#2F4454] dark:text-[#C5D5D8] line-clamp-1">
                      {inc.trigger_reason}
                    </p>
                    <div className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] font-mono">
                      Region: <span className="text-[#1C3334] dark:text-[#EDF4F5]">{inc.relevant_region || 'Monitored Scene'}</span> • Score: {typeof inc.risk_score === 'number' ? `${inc.risk_score.toFixed(1)}/100` : '—'}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center space-x-2">
                    <Link
                      to={`/incidents?selected=${inc.id}`}
                      className="px-2.5 py-1 rounded bg-white dark:bg-[#16292B] hover:bg-[#EEF5F5] dark:hover:bg-[#1E3538] border border-[#CBD5D8] dark:border-[#2C4B4E] text-[11px] text-[#376E6F] dark:text-[#6EB5B6] font-semibold inline-flex items-center space-x-1 transition-colors shadow-2xs"
                    >
                      <span>Review</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-[#5D757E] dark:text-[#A0B7BC]">
              <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-[#5D757E] dark:text-[#A0B7BC]" />
              <p className="text-xs font-semibold text-[#1C3334] dark:text-[#EDF4F5]">No incidents recorded in the current catalog.</p>
              <p className="text-[11px] text-[#5D757E] dark:text-[#A0B7BC] mt-1 max-w-xs mx-auto">
                Any automated threshold violations or sustained risk conditions will appear here with evidentiary keyframes.
              </p>
            </div>
          )}
        </div>

        {/* Catalog Audit Sessions */}
        <div className="rounded-xl border border-[#E2E8EA] dark:border-[#233C3F] bg-white dark:bg-[#152729] p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#E2E8EA] dark:border-[#233C3F] mb-3">
            <div className="flex items-center space-x-2">
              <Users className="w-4 h-4 text-[#376E6F] dark:text-[#6EB5B6]" />
              <h3 className="text-sm font-bold text-[#1C3334] dark:text-[#EDF4F5]">Recent Catalog Audit Sessions</h3>
            </div>
            {allAnalyses && (
              <Link
                to="/history"
                className="text-xs text-[#376E6F] dark:text-[#6EB5B6] hover:text-[#2F4454] dark:hover:text-white font-semibold inline-flex items-center space-x-1"
              >
                <span>Full archive ({allAnalyses.length})</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>

          {allAnalyses === null && partialErrors.analyses ? (
            <div className="py-12 text-center text-[#2E151B] dark:text-rose-300">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-[#2E151B] dark:text-rose-400" />
              <p className="text-xs font-semibold">Catalog Sessions Unavailable</p>
              <p className="text-[11px] opacity-80 mt-1 max-w-xs mx-auto">
                {partialErrors.analyses}
              </p>
              <button
                onClick={() => loadOverviewData(true)}
                className="mt-3 px-3 py-1 bg-[#2E151B]/10 hover:bg-[#2E151B]/20 dark:bg-rose-900/30 dark:hover:bg-rose-900/50 border border-[#2E151B]/25 dark:border-rose-500/30 rounded text-xs text-[#2E151B] dark:text-rose-200 cursor-pointer"
              >
                Retry Sessions
              </button>
            </div>
          ) : hasAnalyses ? (
            <div className="space-y-2.5">
              {allAnalyses!.slice(0, 5).map((anl) => (
                <div
                  key={anl.id}
                  className="rounded-lg border border-[#E2E8EA] dark:border-[#233C3F] bg-[#F8F9FA] dark:bg-[#112022] p-3 flex items-center justify-between hover:border-[#CBD5D8] dark:hover:border-[#376E6F]/40 transition-colors shadow-2xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono font-bold text-[#1C3334] dark:text-[#EDF4F5]">
                        {anl.id.slice(0, 14)}...
                      </span>
                      <StatusPill status={anl.status} />
                    </div>
                    <div className="flex items-center space-x-3 text-[11px] text-[#5D757E] dark:text-[#A0B7BC] font-mono">
                      <span>Frames: {typeof anl.current_frame === 'number' ? anl.current_frame : 0}/{anl.total_frames || '—'}</span>
                      <span>•</span>
                      <span>Peak: {typeof anl.peak_count === 'number' ? anl.peak_count : 0}</span>
                      <span>•</span>
                      <span>Avg Risk: {typeof anl.avg_risk_score === 'number' ? anl.avg_risk_score.toFixed(1) : '—'}</span>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center space-x-2">
                    <Link
                      to={`/monitoring?analysisId=${anl.id}`}
                      className="px-2.5 py-1 rounded bg-white dark:bg-[#16292B] hover:bg-[#EEF5F5] dark:hover:bg-[#1E3538] border border-[#CBD5D8] dark:border-[#2C4B4E] text-[11px] text-[#2F4454] dark:text-[#A0B7BC] hover:text-[#1C3334] dark:hover:text-white font-medium inline-flex items-center space-x-1 transition-colors shadow-2xs"
                    >
                      <span>Replay</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-[#5D757E] dark:text-[#A0B7BC]">
              <PlayCircle className="w-8 h-8 mx-auto mb-2 text-[#5D757E] dark:text-[#A0B7BC]" />
              <p className="text-xs font-semibold text-[#1C3334] dark:text-[#EDF4F5]">No session history in database</p>
              <p className="text-[11px] text-[#5D757E] dark:text-[#A0B7BC] mt-1 max-w-xs mx-auto">
                Uploaded videos and completed computer vision runs will persist here for post-event forensic replay.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Overview;
