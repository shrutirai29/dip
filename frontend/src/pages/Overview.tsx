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
  AlertCircle
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

import { analyticsApi, analysisApi, incidentApi, videoApi } from '../services/api';
import { AnalyticsSummary, Analysis, Incident, FrameRecord, Video as VideoType } from '../types';
import { 
  KPICard, 
  StatusPill, 
  EmptyState, 
  ErrorState, 
  LoadingBlock 
} from '../components/UIComponents';
import { useSystem } from '../context/SystemContext';

interface PartialEndpointErrors {
  summary?: string;
  analyses?: string;
  incidents?: string;
  frames?: string;
  video?: string;
}

export const Overview: React.FC = () => {
  const { setSelectedAnalysis, refreshCounter } = useSystem();

  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [allAnalyses, setAllAnalyses] = useState<Analysis[] | null>(null);
  const [latestAnalysis, setLatestAnalysis] = useState<Analysis | null>(null);
  const [analysisVideo, setAnalysisVideo] = useState<VideoType | null>(null);
  const [recentIncidents, setRecentIncidents] = useState<Incident[] | null>(null);
  const [frameHistory, setFrameHistory] = useState<FrameRecord[] | null>(null);
  const [latestFrame, setLatestFrame] = useState<FrameRecord | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [partialErrors, setPartialErrors] = useState<PartialEndpointErrors>({});

  // Request race condition tracking
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
      // 1. Fetch summary, analyses, and incidents in parallel with allSettled
      const [sumResult, analysesResult, incidentsResult] = await Promise.allSettled([
        analyticsApi.getSummary(),
        analysisApi.getAll(),
        incidentApi.getAll(),
      ]);

      if (currentRequestId !== overviewRequestIdRef.current) return;

      // Handle summary endpoint
      if (sumResult.status === 'fulfilled') {
        setSummary(sumResult.value);
      } else {
        detectedErrors.summary = 'Summary metrics unavailable.';
        setSummary(null);
      }

      // Handle incidents endpoint
      if (incidentsResult.status === 'fulfilled') {
        setRecentIncidents(incidentsResult.value.slice(0, 5));
      } else {
        detectedErrors.incidents = 'Incident warnings could not be retrieved.';
        setRecentIncidents(null);
      }

      // Handle analyses endpoint
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

      // 2. If all three core endpoints failed, treat as fatal network failure
      if (
        sumResult.status === 'rejected' &&
        analysesResult.status === 'rejected' &&
        incidentsResult.status === 'rejected'
      ) {
        setFatalError('Unable to connect to the CROWDGUARD surveillance backend. Ensure the API server is running on port 8000.');
        setPartialErrors({});
        return;
      }

      // 3. Fetch telemetry & video if an active session exists
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
    // Initial mount load
    loadOverviewData(false);
  }, [loadOverviewData]);

  // Synchronize when header refresh trigger changes
  useEffect(() => {
    if (refreshCounter > 0) {
      loadOverviewData(true);
    }
  }, [refreshCounter, loadOverviewData]);

  // Format chart data honestly from actual recorded frames
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

  // Zone matrix: extract cells from latest frame's grid_density
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
    <div className="space-y-6">
      {/* -------------------------------------------------------------------------
          1. HEADER WITH ACTIONS & REFRESH STATUS
          ------------------------------------------------------------------------- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-[#192638] gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h2 className="text-xl font-bold tracking-tight text-white">
              CROWD SURVEILLANCE & FORECAST COMMAND CENTER
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/25">
              DIP OPS
            </span>
            {refreshing && (
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Updating Telemetry...</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
            Multi-stage Digital Image Processing surveillance system evaluating Farneback optical flow velocity fields, 
            directional Shannon entropy disorder, 2D continuous Gaussian density splatting, and +10s risk projections.
          </p>
        </div>

        <div className="flex items-center space-x-2.5 shrink-0">
          <button
            onClick={() => loadOverviewData(true)}
            disabled={refreshing}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-[#121C2B] hover:bg-[#182538] text-slate-300 hover:text-white border border-[#1E2D40] rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh current dashboard data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Refresh</span>
          </button>
          <Link
            to="/video-analysis"
            className="inline-flex items-center space-x-2 px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs cursor-pointer"
          >
            <PlayCircle className="w-4 h-4" />
            <span>Video Ingestion Studio</span>
          </Link>
          {latestAnalysis && (
            <Link
              to={`/monitoring?analysisId=${latestAnalysis.id}`}
              className="inline-flex items-center space-x-1.5 px-3 py-2 bg-[#121C2B] hover:bg-[#182538] text-slate-200 border border-[#1E2D40] rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              <Activity className="w-4 h-4 text-cyan-400" />
              <span>Open Telemetry Stream</span>
            </Link>
          )}
        </div>
      </div>

      {/* Partial Errors Banner */}
      {hasPartialFailures && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5 text-xs text-amber-200 flex items-start space-x-2.5">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <span className="font-semibold block text-amber-300">Telemetry Stream Partially Degraded:</span>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-300/80">
              {Object.entries(partialErrors).map(([key, msg]) => (
                <li key={key}>{msg}</li>
              ))}
            </ul>
          </div>
          <button
            onClick={() => loadOverviewData(true)}
            className="px-2.5 py-1 bg-amber-900/40 hover:bg-amber-900/60 border border-amber-500/30 rounded text-[11px] text-amber-200 font-medium cursor-pointer shrink-0"
          >
            Retry Telemetry
          </button>
        </div>
      )}

      {/* -------------------------------------------------------------------------
          2. ACTIVE / LATEST SESSION BANNER
          ------------------------------------------------------------------------- */}
      {allAnalyses === null && partialErrors.analyses ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/15 p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3 text-xs text-rose-300">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>Failed to load surveillance sessions from catalog.</span>
          </div>
          <button
            onClick={() => loadOverviewData(true)}
            className="px-3 py-1 rounded bg-rose-900/30 hover:bg-rose-900/50 border border-rose-500/30 text-xs text-rose-200 cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : latestAnalysis ? (
        <div className="rounded-xl border border-[#192638] bg-[#0A1018] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-10 h-10 rounded-lg bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <Video className="w-5 h-5" />
            </div>
            <div className="truncate">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-white">Active Catalog Session:</span>
                <span className="text-xs font-mono text-cyan-300 font-medium">
                  {latestAnalysis.id}
                </span>
                <StatusPill status={latestAnalysis.status} />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 mt-1">
                <span>
                  Source: <strong className="text-slate-200">{analysisVideo?.original_filename || analysisVideo?.filename || 'Surveillance Clip'}</strong>
                </span>
                <span>•</span>
                <span>
                  Dominant Pattern: <strong className="text-slate-200 uppercase font-mono">{latestAnalysis.dominant_pattern || 'NORMAL_FLOW'}</strong>
                </span>
                <span>•</span>
                <span>
                  Peak Crowd: <strong className="text-slate-200 font-mono">{typeof latestAnalysis.peak_count === 'number' ? latestAnalysis.peak_count : '—'}</strong>
                </span>
                <span>•</span>
                <span>
                  Max Risk: <strong className="text-slate-200 font-mono">{typeof latestAnalysis.max_risk_score === 'number' ? `${latestAnalysis.max_risk_score.toFixed(1)}/100` : '—'}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <Link
              to={`/monitoring?analysisId=${latestAnalysis.id}`}
              className="inline-flex items-center space-x-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-medium"
            >
              <span>Inspect Replay</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <EmptyState
          title="No Video Surveillance Sessions Active"
          description="The surveillance catalog is currently unpopulated. Ingest a video or select a synthetic demonstration scenario to begin tracking crowd density and risk telemetry."
          actionText="Go to Video Ingestion Studio"
          onAction={() => window.location.assign('/video-analysis')}
          icon={Video}
        />
      )}

      {/* -------------------------------------------------------------------------
          3. SURVEILLANCE KPI TILES (Actual API Metrics or Explicit Empty/Unavailable)
          ------------------------------------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <KPICard
          label="Total Catalog Videos"
          value={summary ? summary.total_videos : (partialErrors.summary ? 'Unavailable' : '—')}
          unit={summary ? 'files' : undefined}
          subtext={summary ? `${summary.completed_analyses} completed audits` : (partialErrors.summary || 'Awaiting catalog query')}
          icon={Video}
          tone="cyan"
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
              ? latestFrame.smoothed_risk_score >= 50 ? 'rose' : latestFrame.smoothed_risk_score >= 25 ? 'amber' : 'emerald'
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
          value={summary ? summary.total_incidents : (partialErrors.summary ? 'Unavailable' : '—')}
          unit={summary ? 'events' : undefined}
          subtext={summary ? `${summary.critical_incidents} critical priority alerts` : (partialErrors.summary || 'Awaiting incident query')}
          icon={AlertTriangle}
          tone={summary && summary.critical_incidents > 0 ? 'rose' : 'amber'}
        />
      </div>

      {/* -------------------------------------------------------------------------
          4. PRIMARY RISK TRAJECTORY & 3X3 SPATIAL QUADRANT MATRIX
          ------------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Risk Trend Chart Panel */}
        <div className="lg:col-span-2 rounded-xl border border-[#192638] bg-[#0A1018] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#192638] mb-4">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">
                  Temporal Risk Trajectory & Point-in-Time Projections
                </h3>
              </div>
              <div className="flex items-center space-x-3 text-xs">
                <span className="flex items-center space-x-1 text-cyan-400 text-[11px] font-mono">
                  <span className="w-2.5 h-0.5 bg-cyan-400 inline-block" />
                  <span>Observed Composite Risk (t)</span>
                </span>
                <span className="flex items-center space-x-1 text-rose-400 text-[11px] font-mono">
                  <span className="w-2.5 h-0.5 bg-rose-400 inline-block border-t border-dashed" />
                  <span>Point Projection (+10s at frame t)</span>
                </span>
              </div>
            </div>

            {chartData.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#06B6D4" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#F43F5E" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#192638" vertical={false} />
                    <XAxis 
                      dataKey="time" 
                      stroke="#64748B" 
                      fontSize={11} 
                      tickLine={false} 
                      axisLine={{ stroke: '#192638' }} 
                    />
                    <YAxis 
                      stroke="#64748B" 
                      fontSize={11} 
                      domain={[0, 100]} 
                      tickLine={false} 
                      axisLine={{ stroke: '#192638' }} 
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0E1622',
                        borderColor: '#1E2D40',
                        borderRadius: '8px',
                        fontSize: '11px',
                        color: '#F0F4F8',
                      }}
                      formatter={(val: any, name: any) => [
                        val !== null && typeof val === 'number' ? `${val.toFixed(1)}/100` : 'Not recorded',
                        name === 'risk' ? 'Observed Risk (t)' : name === 'forecast' ? 'Point-in-Time Projection (t + 10s)' : String(name),
                      ]}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="risk" 
                      stroke="#06B6D4" 
                      strokeWidth={2} 
                      fill="url(#riskGrad)" 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="forecast" 
                      stroke="#F43F5E" 
                      strokeWidth={1.5} 
                      strokeDasharray="4 4" 
                      fill="url(#forecastGrad)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : frameHistory === null && partialErrors.frames ? (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-rose-300">
                <AlertCircle className="w-8 h-8 text-rose-400 mb-2" />
                <p className="text-xs font-semibold">Frame Telemetry Unavailable</p>
                <p className="text-[11px] text-rose-300/80 mt-1 max-w-sm">
                  {partialErrors.frames}
                </p>
                <button
                  onClick={() => loadOverviewData(true)}
                  className="mt-3 px-3 py-1 bg-rose-900/30 hover:bg-rose-900/50 border border-rose-500/30 rounded text-xs text-rose-200 cursor-pointer"
                >
                  Retry Telemetry
                </button>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <Activity className="w-8 h-8 text-slate-400 mb-2" />
                <p className="text-xs font-medium text-slate-300">No frame telemetry recorded for this session</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-sm">
                  The active session has not recorded any frame telemetry records yet, or is currently pending.
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-[#192638] flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2">
            <span className="flex items-center space-x-1.5">
              <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>Forecasts represent rolling point-in-time linear extrapolations of trend derivatives, not an empirical future trajectory.</span>
            </span>
            {latestAnalysis && (
              <Link 
                to={`/analytics?analysisId=${latestAnalysis.id}`}
                className="text-cyan-400 hover:text-cyan-300 font-medium inline-flex items-center space-x-1"
              >
                <span>Full dynamics analytics</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>
        </div>

        {/* 3x3 Spatial Grid Quadrant Telemetry */}
        <div className="rounded-xl border border-[#192638] bg-[#0A1018] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#192638] mb-3">
              <div className="flex items-center space-x-2">
                <Grid3X3 className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">Spatial 3×3 Density Matrix</h3>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                {latestFrame ? `t=${latestFrame.timestamp_sec.toFixed(1)}s` : 'No Frame'}
              </span>
            </div>

            <p className="text-[11px] text-slate-400 mb-3">
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
                      className={`rounded-lg border p-2 flex flex-col justify-between transition-colors ${
                        isHigh
                          ? 'border-rose-500/40 bg-rose-950/20 text-rose-300'
                          : isMod
                          ? 'border-amber-500/40 bg-amber-950/20 text-amber-300'
                          : 'border-[#192638] bg-[#0E1622] text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold">{zone.name}</span>
                        <span className={`text-[9px] px-1 rounded font-mono ${
                          isHigh ? 'bg-rose-500/30 text-rose-200' : isMod ? 'bg-amber-500/30 text-amber-200' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {zone.density_level}
                        </span>
                      </div>

                      <div className="my-1">
                        <div className="text-lg font-bold font-mono text-white">
                          {zone.population}
                        </div>
                        <span className="text-[9px] text-slate-400 font-mono block">
                          density: {(zone.normalized_density * 100).toFixed(0)}%
                        </span>
                      </div>

                      <div className="text-[9px] font-mono text-slate-400 border-t border-[#192638] pt-1 flex justify-between">
                        <span>v: {zone.avg_velocity.toFixed(1)}px</span>
                        {zone.pattern !== 'NORMAL' && (
                          <span className="text-amber-400 font-bold uppercase">{zone.pattern}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="aspect-square rounded-lg border border-dashed border-[#1E2D40] bg-[#0E1622] flex flex-col items-center justify-center p-6 text-center text-slate-400">
                <Grid3X3 className="w-8 h-8 text-slate-400 mb-2" />
                <p className="text-xs font-medium text-slate-300">Spatial Telemetry Unavailable</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                  {partialErrors.frames
                    ? 'Frame telemetry request failed.'
                    : 'No processed frame records exist to construct the 3×3 quadrant density matrix.'}
                </p>
              </div>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-[#192638] text-[11px] text-slate-400 flex items-center justify-between">
            <span>Perspective Scale: {latestAnalysis?.perspective_weight ? `${latestAnalysis.perspective_weight}×` : '1.0×'}</span>
            <Link
              to={latestAnalysis ? `/monitoring?analysisId=${latestAnalysis.id}` : '/monitoring'}
              className="text-cyan-400 hover:text-cyan-300 font-medium inline-flex items-center space-x-1"
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
        <div className="rounded-xl border border-[#192638] bg-[#0A1018] p-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#192638] mb-3">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <h3 className="text-sm font-semibold text-white">
                Recent Sustained Incidents & Early Warnings
              </h3>
            </div>
            {recentIncidents && (
              <Link
                to="/incidents"
                className="text-xs text-cyan-400 hover:text-cyan-300 font-medium inline-flex items-center space-x-1"
              >
                <span>View all ({recentIncidents.length})</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>

          {recentIncidents === null && partialErrors.incidents ? (
            <div className="py-12 text-center text-rose-300">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-400" />
              <p className="text-xs font-semibold">Incident Retrieval Failed</p>
              <p className="text-[11px] text-rose-300/80 mt-1 max-w-xs mx-auto">
                {partialErrors.incidents}
              </p>
              <button
                onClick={() => loadOverviewData(true)}
                className="mt-3 px-3 py-1 bg-rose-900/30 hover:bg-rose-900/50 border border-rose-500/30 rounded text-xs text-rose-200 cursor-pointer"
              >
                Retry Incidents
              </button>
            </div>
          ) : recentIncidents && recentIncidents.length > 0 ? (
            <div className="space-y-2.5">
              {recentIncidents.map((inc) => (
                <div
                  key={inc.id}
                  className="rounded-lg border border-[#192638] bg-[#0E1622] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:border-[#22354E] transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                        inc.severity === 'CRITICAL' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                        inc.severity === 'HIGH' ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' :
                        'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}>
                        {inc.severity}
                      </span>
                      <span className="text-xs font-semibold text-white font-mono">
                        {inc.incident_type}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        @ {typeof inc.video_timestamp_sec === 'number' ? `${inc.video_timestamp_sec.toFixed(1)}s` : '—'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 line-clamp-1">
                      {inc.trigger_reason}
                    </p>
                    <div className="text-[10px] text-slate-400 font-mono">
                      Region: <span className="text-slate-300">{inc.relevant_region || 'Monitored Scene'}</span> • Score: {typeof inc.risk_score === 'number' ? `${inc.risk_score.toFixed(1)}/100` : '—'}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center space-x-2">
                    <Link
                      to={`/incidents?selected=${inc.id}`}
                      className="px-2.5 py-1 rounded bg-[#162234] hover:bg-[#1E2D40] border border-[#22354E] text-[11px] text-cyan-300 font-medium inline-flex items-center space-x-1 transition-colors"
                    >
                      <span>Review</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400">
              <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-slate-400" />
              <p className="text-xs font-medium text-slate-300">No active hazard incidents registered</p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
                Processed video feeds have maintained acceptable density and directional motion parameters.
              </p>
            </div>
          )}
        </div>

        {/* Catalog Audit Sessions */}
        <div className="rounded-xl border border-[#192638] bg-[#0A1018] p-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#192638] mb-3">
            <div className="flex items-center space-x-2">
              <Users className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-white">Recent Catalog Audit Sessions</h3>
            </div>
            {allAnalyses && (
              <Link
                to="/history"
                className="text-xs text-cyan-400 hover:text-cyan-300 font-medium inline-flex items-center space-x-1"
              >
                <span>Full archive ({allAnalyses.length})</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>

          {allAnalyses === null && partialErrors.analyses ? (
            <div className="py-12 text-center text-rose-300">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-400" />
              <p className="text-xs font-semibold">Catalog Sessions Unavailable</p>
              <p className="text-[11px] text-rose-300/80 mt-1 max-w-xs mx-auto">
                {partialErrors.analyses}
              </p>
              <button
                onClick={() => loadOverviewData(true)}
                className="mt-3 px-3 py-1 bg-rose-900/30 hover:bg-rose-900/50 border border-rose-500/30 rounded text-xs text-rose-200 cursor-pointer"
              >
                Retry Sessions
              </button>
            </div>
          ) : hasAnalyses ? (
            <div className="space-y-2.5">
              {allAnalyses!.slice(0, 5).map((anl) => (
                <div
                  key={anl.id}
                  className="rounded-lg border border-[#192638] bg-[#0E1622] p-3 flex items-center justify-between hover:border-[#22354E] transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono font-medium text-white">
                        {anl.id.slice(0, 14)}...
                      </span>
                      <StatusPill status={anl.status} />
                    </div>
                    <div className="flex items-center space-x-3 text-[11px] text-slate-400 font-mono">
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
                      className="px-2.5 py-1 rounded bg-[#162234] hover:bg-[#1E2D40] border border-[#22354E] text-[11px] text-slate-300 hover:text-white font-medium inline-flex items-center space-x-1 transition-colors"
                    >
                      <span>Replay</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400">
              <PlayCircle className="w-8 h-8 mx-auto mb-2 text-slate-400" />
              <p className="text-xs font-medium text-slate-300">No session history in database</p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
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
