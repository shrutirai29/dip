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
  Clock,
  Layers,
  CheckCircle2
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
  StatusPill, 
  MetricStrip,
  MetricItem,
  RiskBadge,
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
  const { isDark } = useTheme();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [allAnalyses, setAllAnalyses] = useState<Analysis[] | null>(null);
  const [latestAnalysis, setLatestAnalysis] = useState<Analysis | null>(null);
  const [recentIncidents, setRecentIncidents] = useState<Incident[] | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraSessionStatus | null>(null);
  const [fleetHealth, setFleetHealth] = useState<MultiCameraHealth | null>(null);
  const [fleetCameras, setFleetCameras] = useState<CameraSessionStatus[]>([]);
  
  const [latestFrame, setLatestFrame] = useState<FrameRecord | null>(null);
  const [frameHistory, setFrameHistory] = useState<FrameRecord[] | null>(null);
  const [analysisVideo, setAnalysisVideo] = useState<VideoType | null>(null);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [lastSyncedTime, setLastSyncedTime] = useState<string>(() => new Date().toLocaleTimeString());
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
        const sorted = [...incidentsResult.value].sort((a, b) => {
          const timeA = new Date(a.created_at || '').getTime();
          const timeB = new Date(b.created_at || '').getTime();
          return timeB - timeA;
        });
        setRecentIncidents(sorted.slice(0, 5));
      } else {
        detectedErrors.incidents = 'Incident log unavailable.';
        setRecentIncidents(null);
      }

      if (analysesResult.status === 'fulfilled') {
        const data = analysesResult.value;
        setAllAnalyses(data);
        if (data.length > 0) {
          const sorted = [...data].sort((a, b) => {
            const timeA = new Date(a.created_at || '').getTime();
            const timeB = new Date(b.created_at || '').getTime();
            return timeB - timeA;
          });
          const mostRecent = sorted[0];
          setLatestAnalysis(mostRecent);

          try {
            const frames = await analysisApi.getResults(mostRecent.id);
            if (currentRequestId === overviewRequestIdRef.current) {
              setFrameHistory(frames);
              if (frames.length > 0) {
                setLatestFrame(frames[frames.length - 1]);
              } else {
                setLatestFrame(null);
              }
            }
          } catch (frameErr) {
            console.warn('Frame telemetry fetch error for overview:', frameErr);
            detectedErrors.frames = 'Telemetry frames unavailable.';
            setFrameHistory(null);
            setLatestFrame(null);
          }

          if (mostRecent.video_id) {
            try {
              const vid = await videoApi.getById(mostRecent.video_id);
              if (currentRequestId === overviewRequestIdRef.current) {
                setAnalysisVideo(vid);
              }
            } catch (vidErr) {
              console.warn('Video metadata fetch error for overview:', vidErr);
              detectedErrors.video = 'Video file metadata unavailable.';
              setAnalysisVideo(null);
            }
          } else {
            setAnalysisVideo(null);
          }
        } else {
          setLatestAnalysis(null);
          setFrameHistory(null);
          setLatestFrame(null);
          setAnalysisVideo(null);
        }
      } else {
        detectedErrors.analyses = 'Analysis catalog unavailable.';
        setAllAnalyses(null);
        setLatestAnalysis(null);
        setFrameHistory(null);
        setLatestFrame(null);
        setAnalysisVideo(null);
      }

      setPartialErrors(detectedErrors);
    } catch (err: unknown) {
      if (currentRequestId === overviewRequestIdRef.current) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown communication error with CROWDGUARD API.';
        setFatalError(`Operational data link failure: ${errorMsg}`);
      }
    } finally {
      if (currentRequestId === overviewRequestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    loadOverviewData();
  }, [loadOverviewData]);

  const chartData = useMemo(() => {
    if (!frameHistory || frameHistory.length === 0) return [];
    const step = Math.max(1, Math.floor(frameHistory.length / 50));
    return frameHistory
      .filter((_, idx) => idx % step === 0)
      .map((f) => ({
        time: `${f.timestamp_sec.toFixed(1)}s`,
        risk: typeof f.smoothed_risk_score === 'number' ? f.smoothed_risk_score : 0,
        forecast: typeof f.forecast_risk_10s === 'number' ? f.forecast_risk_10s : null,
        fullFrame: f,
      }));
  }, [frameHistory]);

  const zoneCells = useMemo(() => {
    if (latestFrame && latestFrame.grid_density && latestFrame.grid_density.length > 0) {
      return latestFrame.grid_density;
    }
    return null;
  }, [latestFrame]);

  if (loading && !summary && !allAnalyses && !cameraStatus) {
    return (
      <div className="space-y-6">
        <LoadingBlock text="Connecting to surveillance telemetry bus..." height="h-96" />
      </div>
    );
  }

  if (fatalError && !summary && !allAnalyses) {
    return (
      <div className="space-y-6">
        <ErrorState message={fatalError} onRetry={() => loadOverviewData(false)} />
      </div>
    );
  }

  const hasPartialFailures = Object.keys(partialErrors).length > 0;
  const hasAnalyses = allAnalyses !== null && allAnalyses.length > 0;

  return (
    <div className="space-y-6 w-full">
      {/* -------------------------------------------------------------------------
          1. EDITORIAL HEADER & WORKSTATION ACTIONS
          ------------------------------------------------------------------------- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-[#E2E8EA] dark:border-[#203638] gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-xl font-bold tracking-tight text-[#1C3334] dark:text-[#EDF4F5]">
              CROWD SURVEILLANCE & FORECAST WORKSTATION
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#376E6F]/10 dark:bg-[#376E6F]/25 text-[#376E6F] dark:text-[#6EB5B6] border border-[#376E6F]/30">
              DIP OPS v2.0
            </span>
            {refreshing && (
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono bg-[#DA7B93]/15 text-[#B34D66] dark:text-[#DA7B93] border border-[#DA7B93]/30 animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Syncing...</span>
              </span>
            )}
          </div>
          <p className="text-xs text-[#5D757E] dark:text-[#A0B7BC] mt-1 max-w-2xl leading-relaxed">
            Multi-stage Digital Image Processing surveillance system evaluating Farneback optical flow velocity fields,
            directional Shannon entropy disorder, 2D continuous Gaussian density splatting, and +10s risk projections.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span className="hidden sm:inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#152729] border border-[#CBD5D8] dark:border-[#2C4B4E] text-[11px] font-mono text-[#5D757E] dark:text-[#A0B7BC] shadow-2xs tabular-nums">
            <Clock className="w-3.5 h-3.5 text-[#376E6F] dark:text-[#6EB5B6]" />
            <span>Synced: {lastSyncedTime}</span>
          </span>
          <button
            onClick={() => loadOverviewData(true)}
            disabled={refreshing}
            className="p-2 bg-white dark:bg-[#152729] hover:bg-[#F1F4F5] dark:hover:bg-[#1C3336] text-[#2F4454] dark:text-[#EDF4F5] border border-[#CBD5D8] dark:border-[#2C4B4E] rounded-lg transition-colors cursor-pointer shadow-2xs"
            title="Refresh current dashboard data"
            aria-label="Refresh overview dashboard data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#376E6F]' : ''}`} />
          </button>
          <Link
            to="/cameras"
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white dark:bg-[#152729] hover:bg-[#EEF5F5] dark:hover:bg-[#183133] text-[#376E6F] dark:text-[#6EB5B6] border border-[#376E6F]/30 dark:border-[#376E6F]/40 rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
          >
            <Radio className="w-3.5 h-3.5 text-[#376E6F] dark:text-[#6EB5B6]" />
            <span>Camera Fleet</span>
          </Link>
          <Link
            to="/video-analysis"
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-[#2F4454] hover:bg-[#1C3334] dark:bg-[#376E6F] dark:hover:bg-[#4A8E8F] text-white rounded-lg text-xs font-semibold transition-colors shadow-xs cursor-pointer"
          >
            <PlayCircle className="w-3.5 h-3.5" />
            <span>Ingestion Studio</span>
          </Link>
        </div>
      </div>

      {/* Partial Errors Banner */}
      {hasPartialFailures && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start space-x-2.5 shadow-xs">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-0.5">
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
            Retry
          </button>
        </div>
      )}

      {/* -------------------------------------------------------------------------
          2. UNIFIED OPERATIONAL STATUS CONSOLE STRIP (Anti-Template Refinement)
          ------------------------------------------------------------------------- */}
      <MetricStrip>
        <MetricItem
          label="Fleet Connectivity"
          value={
            fleetHealth
              ? `${fleetHealth.active_streams} / ${fleetHealth.total_registered}`
              : cameraStatus?.is_active
              ? '1 Active'
              : '0 Active'
          }
          unit="streams"
          subtext={fleetHealth?.system_status || (cameraStatus?.is_active ? 'WEBCAM_ACTIVE' : 'STANDBY')}
          tone={fleetHealth?.active_streams || cameraStatus?.is_active ? 'teal' : 'neutral'}
          icon={Radio}
        />
        <MetricItem
          label="Pipeline Engine"
          value={
            cameraStatus?.is_active
              ? cameraStatus.processing_fps.toFixed(1)
              : summary?.total_videos
              ? `${summary.total_videos}`
              : '24.0'
          }
          unit={cameraStatus?.is_active ? 'FPS inf' : summary?.total_videos ? 'clips' : 'FPS cap'}
          subtext={cameraStatus?.is_active ? `Capture: ${cameraStatus.measured_fps.toFixed(1)} FPS` : 'Computer vision engine'}
          tone="slate"
          icon={Activity}
        />
        <MetricItem
          label="Instantaneous Density"
          value={
            latestFrame && typeof latestFrame.person_count === 'number'
              ? latestFrame.person_count
              : latestAnalysis && typeof latestAnalysis.peak_count === 'number'
              ? latestAnalysis.peak_count
              : '—'
          }
          unit="persons"
          subtext={latestFrame?.risk_band ? `Band: ${latestFrame.risk_band}` : 'YOLOv8 Class 0'}
          tone="deepteal"
          icon={Users}
        />
        <MetricItem
          label="Peak Risk Index"
          value={
            latestFrame && typeof latestFrame.smoothed_risk_score === 'number'
              ? latestFrame.smoothed_risk_score.toFixed(1)
              : latestAnalysis && typeof latestAnalysis.max_risk_score === 'number'
              ? latestAnalysis.max_risk_score.toFixed(1)
              : '0.0'
          }
          unit="/ 100"
          subtext="Heuristic 4-factor composite"
          tone={
            (latestFrame?.smoothed_risk_score || latestAnalysis?.max_risk_score || 0) >= 70 ? 'burgundy' :
            (latestFrame?.smoothed_risk_score || latestAnalysis?.max_risk_score || 0) >= 40 ? 'rose' : 'teal'
          }
          icon={TrendingUp}
        />
        <MetricItem
          label="Incident Alerts"
          value={recentIncidents ? recentIncidents.length : '0'}
          unit="logged"
          subtext="Automated threshold audit"
          tone={recentIncidents && recentIncidents.length > 0 ? 'burgundy' : 'neutral'}
          icon={ShieldAlert}
        />
      </MetricStrip>

      {/* -------------------------------------------------------------------------
          3. PRIMARY SURVEILLANCE & SPATIAL DENSITY COMMAND CENTER
          ------------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 cols): Surveillance Viewport & Interactive Spatial Grid */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8EA] dark:border-[#203638] mb-3">
              <div className="flex items-center space-x-2">
                <span className={`w-2.5 h-2.5 rounded-full ${cameraStatus?.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                <h2 className="text-xs font-bold text-[#1C3334] dark:text-[#EDF4F5] uppercase tracking-wider">
                  {cameraStatus?.is_active
                    ? `Live Surveillance Feed • ${cameraStatus.source_type === 'rtsp' ? cameraStatus.camera_name || 'RTSP' : 'Hardware Camera #0'}`
                    : latestAnalysis
                    ? `Forensic Replay Preview • ${analysisVideo?.original_filename || analysisVideo?.filename || latestAnalysis.id.slice(0, 14)}`
                    : 'Surveillance Video Viewport'}
                </h2>
              </div>
              <div className="flex items-center space-x-2 text-[11px] font-mono text-[#5D757E] dark:text-[#A0B7BC]">
                {cameraStatus?.is_active ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">
                    {cameraStatus.measured_fps.toFixed(1)} FPS
                  </span>
                ) : latestAnalysis ? (
                  <StatusPill status={latestAnalysis.status} />
                ) : null}
              </div>
            </div>

            {/* Video Viewport: Stays Pure Dark for Optical Contrast */}
            <div className="aspect-video bg-black rounded-lg overflow-hidden border border-[#CBD5D8] dark:border-[#203638] relative flex items-center justify-center shadow-inner">
              {cameraStatus?.is_active ? (
                <img
                  src={cameraApi.getStreamUrl()}
                  alt="Live Surveillance Stream"
                  className="w-full h-full object-contain"
                />
              ) : latestAnalysis?.annotated_video_path ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  <div className="text-center p-6 space-y-3">
                    <Video className="w-10 h-10 text-slate-500 mx-auto" />
                    <div>
                      <p className="text-xs font-semibold text-white">Processed Surveillance Session Available</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Session ID: {latestAnalysis.id}</p>
                    </div>
                    <Link
                      to={`/monitoring?analysisId=${latestAnalysis.id}`}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#2F4454] hover:bg-[#1C3334] text-white dark:bg-[#376E6F] dark:hover:bg-[#4A8E8F] rounded-lg text-xs font-semibold transition"
                    >
                      <PlayCircle className="w-3.5 h-3.5" />
                      <span>Launch Synchronized Replay</span>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="text-center p-8 space-y-3">
                  <Camera className="w-8 h-8 text-slate-500 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-white">Live Monitoring Inactive</p>
                    <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                      Connect your local webcam or register RTSP streams to view real-time YOLOv8 bounding boxes and optical flow fields.
                    </p>
                  </div>
                  <div className="pt-1 flex items-center justify-center space-x-2">
                    <Link
                      to="/monitoring?source=webcam"
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#2F4454] hover:bg-[#1C3334] text-white dark:bg-[#376E6F] dark:hover:bg-[#4A8E8F] rounded-lg text-xs font-semibold transition shadow-xs"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Connect Webcam</span>
                    </Link>
                    <Link
                      to="/cameras"
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition"
                    >
                      <Radio className="w-3.5 h-3.5" />
                      <span>RTSP Cameras</span>
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Viewport Micro Metadata Bar */}
            <div className="mt-3 pt-2.5 border-t border-[#E2E8EA] dark:border-[#203638] flex flex-wrap items-center justify-between text-[11px] text-[#5D757E] dark:text-[#A0B7BC] gap-2">
              <div className="flex items-center space-x-3 font-mono tabular-nums">
                <span>Observed: <strong className="text-[#1C3334] dark:text-[#EDF4F5]">{latestFrame?.person_count ?? '0'} persons</strong></span>
                <span>•</span>
                <span>Risk: <strong className="text-[#376E6F] dark:text-[#6EB5B6]">{latestFrame?.smoothed_risk_score?.toFixed(1) ?? '0.0'} / 100</strong></span>
                {cameraStatus?.is_active && (
                  <>
                    <span>•</span>
                    <span>Uptime: <strong className="text-[#1C3334] dark:text-[#EDF4F5]">{cameraStatus.uptime_seconds}s</strong></span>
                  </>
                )}
              </div>
              <Link
                to={cameraStatus?.is_active ? '/monitoring?source=webcam' : latestAnalysis ? `/monitoring?analysisId=${latestAnalysis.id}` : '/video-analysis'}
                className="text-xs font-semibold text-[#376E6F] dark:text-[#6EB5B6] hover:text-[#2F4454] dark:hover:text-white inline-flex items-center space-x-1"
              >
                <span>Full Telemetry View</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>

          {/* 3×3 Density Quadrant Breakdown */}
          <div className="bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#E2E8EA] dark:border-[#203638] mb-3">
              <div className="flex items-center space-x-2">
                <Grid3X3 className="w-4 h-4 text-[#376E6F] dark:text-[#6EB5B6]" />
                <h3 className="text-xs font-bold text-[#1C3334] dark:text-[#EDF4F5] uppercase tracking-wider">
                  Spatial 3×3 Density Matrix
                </h3>
              </div>
              <span className="text-[10px] font-mono text-[#5D757E] dark:text-[#A0B7BC]">
                {latestFrame ? `Frame #${latestFrame.frame_index} • t=${latestFrame.timestamp_sec.toFixed(1)}s` : '9 Quadrant Sectors (A1–C3)'}
              </span>
            </div>

            {zoneCells !== null ? (
              <div className="grid grid-cols-3 gap-2">
                {zoneCells.map((zone) => {
                  const isCritical = zone.density_level === 'Critical';
                  const isHigh = zone.density_level === 'High';
                  const isMod = zone.density_level === 'Moderate';
                  return (
                    <div
                      key={zone.name}
                      className={`rounded-lg border p-2 flex flex-col justify-between transition-colors shadow-2xs ${
                        isCritical
                          ? 'border-[#2E151B]/40 dark:border-rose-500/40 bg-[#FAF0F2] dark:bg-rose-950/20 text-[#2E151B] dark:text-rose-300'
                          : isHigh
                          ? 'border-amber-400 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200'
                          : isMod
                          ? 'border-amber-200 dark:border-amber-500/20 bg-amber-50/50 dark:bg-[#121C2B] text-amber-800 dark:text-amber-300'
                          : 'border-[#E2E8EA] dark:border-[#203638] bg-[#F8F9FA] dark:bg-[#0E1622] text-[#1C3334] dark:text-[#EDF4F5]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold">{zone.name}</span>
                        <span className={`w-2 h-2 rounded-full ${
                          isCritical ? 'bg-rose-500 animate-pulse' :
                          isHigh ? 'bg-orange-500' :
                          isMod ? 'bg-amber-500' : 'bg-emerald-500'
                        }`} />
                      </div>
                      <div className="my-1">
                        <div className="text-base font-bold font-mono text-[#1C3334] dark:text-[#EDF4F5] tabular-nums">
                          {zone.population}
                        </div>
                        <span className="text-[9px] text-[#5D757E] dark:text-[#A0B7BC] font-mono block">
                          {(zone.normalized_density * 100).toFixed(0)}% cap
                        </span>
                      </div>
                      <div className="text-[9px] font-mono text-[#5D757E] dark:text-[#A0B7BC] border-t border-[#E2E8EA] dark:border-[#203638] pt-1 flex justify-between tabular-nums">
                        <span>v: {zone.avg_velocity.toFixed(0)} px/s</span>
                        {zone.pattern && zone.pattern !== 'NORMAL' && (
                          <span className="text-[#DA7B93] font-bold uppercase truncate max-w-[50px]">{zone.pattern}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 rounded-lg border border-dashed border-[#CBD5D8] dark:border-[#203638] bg-[#F8F9FA] dark:bg-[#0E1622] text-center text-[#5D757E] dark:text-[#A0B7BC] space-y-1">
                <Grid3X3 className="w-5 h-5 mx-auto text-slate-400" />
                <p className="text-xs font-semibold text-[#1C3334] dark:text-[#EDF4F5]">Spatial Matrix Standing By</p>
                <p className="text-[10px] max-w-xs mx-auto">Start a camera feed or replay to view 3×3 quadrant density distribution.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (5 cols): Temporal Risk Trajectory & Incident Feed */}
        <div className="lg:col-span-5 space-y-4">
          {/* Temporal Risk Trajectory Chart */}
          <div className="bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8EA] dark:border-[#203638] mb-3">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-[#376E6F] dark:text-[#6EB5B6]" />
                <h3 className="text-xs font-bold text-[#1C3334] dark:text-[#EDF4F5] uppercase tracking-wider">
                  Temporal Risk & Predictive Projection
                </h3>
              </div>
              <div className="flex items-center space-x-2 text-[10px] font-mono">
                <span className="flex items-center space-x-1 text-[#376E6F] dark:text-[#6EB5B6]">
                  <span className="w-2 h-0.5 bg-[#376E6F] inline-block" />
                  <span>Current (t)</span>
                </span>
                <span className="flex items-center space-x-1 text-[#DA7B93]">
                  <span className="w-2 h-0.5 bg-[#DA7B93] inline-block border-t border-dashed" />
                  <span>Forecast (+10s)</span>
                </span>
              </div>
            </div>

            {chartData.length > 0 ? (
              <div className="h-52 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                    <defs>
                      <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={isDark ? "#4A8E8F" : "#376E6F"} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={isDark ? "#4A8E8F" : "#376E6F"} stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#DA7B93" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#DA7B93" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#203638" : "#E2E8EA"} vertical={false} />
                    <XAxis 
                      dataKey="time" 
                      stroke={isDark ? "#8AA1A7" : "#5D757E"} 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={{ stroke: isDark ? "#203638" : "#E2E8EA" }} 
                    />
                    <YAxis 
                      stroke={isDark ? "#8AA1A7" : "#5D757E"} 
                      fontSize={10} 
                      domain={[0, 100]} 
                      tickLine={false} 
                      axisLine={{ stroke: isDark ? "#203638" : "#E2E8EA" }} 
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: isDark ? '#152729' : '#FFFFFF',
                        borderColor: isDark ? '#233C3F' : '#E2E8EA',
                        borderRadius: '8px',
                        fontSize: '11px',
                        color: isDark ? '#EEF4F5' : '#1C3334',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                      }}
                      formatter={(val: any, name: any) => [
                        val !== null && typeof val === 'number' ? `${val.toFixed(1)}/100` : 'Not recorded',
                        name === 'risk' ? 'Current Risk (t)' : 'Forecast (+10s)',
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
            ) : (
              <div className="h-52 flex flex-col items-center justify-center text-center p-4 text-[#5D757E] dark:text-[#A0B7BC]">
                <Activity className="w-6 h-6 mb-1 text-slate-400" />
                <p className="text-xs font-semibold text-[#1C3334] dark:text-[#EDF4F5]">Awaiting Telemetry Time-Series</p>
                <p className="text-[10px] max-w-xs mt-0.5">Ingest footage or start camera to generate temporal risk curves.</p>
              </div>
            )}

            <div className="mt-2.5 pt-2 border-t border-[#E2E8EA] dark:border-[#203638] flex items-center justify-between text-[10px] text-[#5D757E] dark:text-[#A0B7BC]">
              <span>Heuristic decision-support indicator (Farneback + Shannon)</span>
              <Link to="/analytics" className="text-[#376E6F] dark:text-[#6EB5B6] hover:underline font-semibold">
                Explore Analytics →
              </Link>
            </div>
          </div>

          {/* Recent Audit Incidents Feed */}
          <div className="bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#E2E8EA] dark:border-[#203638] mb-3">
              <div className="flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-[#2E151B] dark:text-[#DA7B93]" />
                <h3 className="text-xs font-bold text-[#1C3334] dark:text-[#EDF4F5] uppercase tracking-wider">
                  Automated Incident Feed
                </h3>
              </div>
              <Link to="/incidents" className="text-[10px] font-semibold text-[#376E6F] dark:text-[#6EB5B6] hover:underline">
                View All →
              </Link>
            </div>

            {recentIncidents && recentIncidents.length > 0 ? (
              <div className="space-y-2">
                {recentIncidents.slice(0, 4).map((inc) => (
                  <div
                    key={inc.id}
                    className="p-2.5 rounded-lg border border-[#E2E8EA] dark:border-[#203638] bg-[#F8F9FA] dark:bg-[#0E1622] flex items-start justify-between gap-2 transition-colors hover:border-[#CBD5D8] dark:hover:border-[#376E6F]/40"
                  >
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center space-x-1.5">
                        <RiskBadge band={inc.severity} size="sm" />
                        <span className="text-[11px] font-bold text-[#1C3334] dark:text-[#EDF4F5] font-mono truncate">
                          {inc.incident_type}
                        </span>
                        <span className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] font-mono">
                          {typeof inc.video_timestamp_sec === 'number' ? `t=${inc.video_timestamp_sec.toFixed(1)}s` : ''}
                        </span>
                      </div>
                      <p className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] truncate">
                        {inc.trigger_reason}
                      </p>
                    </div>
                    <Link
                      to={`/incidents?selected=${inc.id}`}
                      className="px-2 py-1 rounded bg-white dark:bg-[#152729] hover:bg-[#EEF5F5] dark:hover:bg-[#183133] border border-[#CBD5D8] dark:border-[#2C4B4E] text-[10px] text-[#376E6F] dark:text-[#6EB5B6] font-semibold shrink-0"
                    >
                      Audit
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-[#5D757E] dark:text-[#A0B7BC] space-y-1">
                <CheckCircle2 className="w-5 h-5 mx-auto text-[#376E6F] dark:text-[#6EB5B6]" />
                <p className="text-xs font-semibold text-[#1C3334] dark:text-[#EDF4F5]">Zero Active Hazard Incidents</p>
                <p className="text-[10px]">No automated crowd safety threshold violations currently logged.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------------
          4. CONNECTED FLEET STREAMS & CATALOG SESSIONS AUDIT TABLE
          ------------------------------------------------------------------------- */}
      <div className="bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#E2E8EA] dark:border-[#203638] gap-2 mb-3">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-[#2F4454] dark:text-[#A0B7BC]" />
            <h3 className="text-xs font-bold text-[#1C3334] dark:text-[#EDF4F5] uppercase tracking-wider">
              Surveillance Fleet Registry & Audit Archive
            </h3>
          </div>
          <div className="flex items-center space-x-3 text-xs">
            <Link to="/cameras" className="text-[#376E6F] dark:text-[#6EB5B6] hover:underline font-semibold text-[11px]">
              Manage Camera Fleet ({fleetCameras.length})
            </Link>
            <span className="text-[#CBD5D8] dark:text-[#203638]">•</span>
            <Link to="/history" className="text-[#376E6F] dark:text-[#6EB5B6] hover:underline font-semibold text-[11px]">
              Full Session Archive ({allAnalyses?.length || 0})
            </Link>
          </div>
        </div>

        {fleetCameras.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="text-[10px] uppercase tracking-wider text-[#5D757E] dark:text-[#A0B7BC] border-b border-[#E2E8EA] dark:border-[#203638]">
                <tr>
                  <th className="pb-2 font-semibold">Camera Source</th>
                  <th className="pb-2 font-semibold">Type</th>
                  <th className="pb-2 font-semibold">Status</th>
                  <th className="pb-2 font-semibold">FPS (Cap/Inf)</th>
                  <th className="pb-2 font-semibold">Frames</th>
                  <th className="pb-2 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8EA] dark:divide-[#203638] text-[11px]">
                {fleetCameras.map((cam) => (
                  <tr key={cam.camera_id} className="hover:bg-[#F8F9FA] dark:hover:bg-[#0E1622] transition-colors">
                    <td className="py-2.5 font-bold text-[#1C3334] dark:text-[#EDF4F5]">
                      {cam.camera_name || cam.camera_id || 'Camera'}
                    </td>
                    <td className="py-2.5 text-[#5D757E] dark:text-[#A0B7BC] uppercase">
                      {cam.source_type}
                    </td>
                    <td className="py-2.5">
                      <span className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        cam.state === 'CONNECTED' ? 'bg-[#EEF5F5] dark:bg-[#183133] text-[#376E6F] dark:text-[#6EC4C6]' :
                        cam.state === 'CONNECTING' ? 'bg-amber-50 text-amber-700 animate-pulse' :
                        'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cam.state === 'CONNECTED' ? 'bg-[#376E6F]' : 'bg-slate-400'}`} />
                        <span>{cam.state}</span>
                      </span>
                    </td>
                    <td className="py-2.5 text-[#1C3334] dark:text-[#EDF4F5] tabular-nums">
                      {(cam.measured_fps ?? 0).toFixed(1)} / {(cam.processing_fps ?? 0).toFixed(1)}
                    </td>
                    <td className="py-2.5 text-[#5D757E] dark:text-[#A0B7BC] tabular-nums">
                      #{cam.latest_frame_id || 0}
                    </td>
                    <td className="py-2.5 text-right">
                      <Link
                        to="/cameras"
                        className="text-[#376E6F] dark:text-[#6EB5B6] hover:underline font-semibold"
                      >
                        Inspect Stream →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : hasAnalyses ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="text-[10px] uppercase tracking-wider text-[#5D757E] dark:text-[#A0B7BC] border-b border-[#E2E8EA] dark:border-[#203638]">
                <tr>
                  <th className="pb-2 font-semibold">Session ID</th>
                  <th className="pb-2 font-semibold">Status</th>
                  <th className="pb-2 font-semibold">Frames Analyzed</th>
                  <th className="pb-2 font-semibold">Peak Crowd</th>
                  <th className="pb-2 font-semibold">Max Risk</th>
                  <th className="pb-2 font-semibold text-right">Forensic Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8EA] dark:divide-[#203638] text-[11px]">
                {allAnalyses!.slice(0, 4).map((anl) => (
                  <tr key={anl.id} className="hover:bg-[#F8F9FA] dark:hover:bg-[#0E1622] transition-colors">
                    <td className="py-2.5 font-bold text-[#1C3334] dark:text-[#EDF4F5]">
                      {anl.id.slice(0, 16)}...
                    </td>
                    <td className="py-2.5">
                      <StatusPill status={anl.status} />
                    </td>
                    <td className="py-2.5 text-[#5D757E] dark:text-[#A0B7BC] tabular-nums">
                      {anl.current_frame || 0} / {anl.total_frames || '—'}
                    </td>
                    <td className="py-2.5 text-[#1C3334] dark:text-[#EDF4F5] tabular-nums">
                      {anl.peak_count || 0} persons
                    </td>
                    <td className="py-2.5 font-bold text-[#376E6F] dark:text-[#6EB5B6] tabular-nums">
                      {anl.max_risk_score !== undefined ? `${anl.max_risk_score.toFixed(1)}/100` : '—'}
                    </td>
                    <td className="py-2.5 text-right">
                      <Link
                        to={`/monitoring?analysisId=${anl.id}`}
                        className="text-[#376E6F] dark:text-[#6EB5B6] hover:underline font-semibold"
                      >
                        Open Replay →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-[#5D757E] dark:text-[#A0B7BC] py-4 text-center">
            No active cameras or session logs recorded in database.
          </p>
        )}
      </div>
    </div>
  );
};

export default Overview;
