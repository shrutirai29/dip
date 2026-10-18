import React, { useEffect, useState, useMemo } from 'react';
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
  Info
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

export const Overview: React.FC = () => {
  const { setSelectedAnalysis } = useSystem();

  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [allAnalyses, setAllAnalyses] = useState<Analysis[]>([]);
  const [latestAnalysis, setLatestAnalysis] = useState<Analysis | null>(null);
  const [analysisVideo, setAnalysisVideo] = useState<VideoType | null>(null);
  const [recentIncidents, setRecentIncidents] = useState<Incident[]>([]);
  const [frameHistory, setFrameHistory] = useState<FrameRecord[]>([]);
  const [latestFrame, setLatestFrame] = useState<FrameRecord | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverviewData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch summary, analyses, and incidents in parallel
      const [sumData, analyses, incidents] = await Promise.all([
        analyticsApi.getSummary().catch((e) => {
          console.warn('Analytics summary error:', e);
          return null;
        }),
        analysisApi.getAll().catch((e) => {
          console.warn('Analyses fetch error:', e);
          return [];
        }),
        incidentApi.getAll().catch((e) => {
          console.warn('Incidents fetch error:', e);
          return [];
        }),
      ]);

      setSummary(sumData);
      setAllAnalyses(analyses);
      setRecentIncidents(incidents.slice(0, 5));

      // 2. Select latest analysis: prioritize completed, or most recent
      if (analyses && analyses.length > 0) {
        const completed = analyses.find((a) => a.status === 'completed');
        const active = completed || analyses[0];
        setLatestAnalysis(active);
        setSelectedAnalysis(active);

        // Fetch associated video details
        if (active.video_id) {
          videoApi.getById(active.video_id)
            .then((v) => setAnalysisVideo(v))
            .catch(() => setAnalysisVideo(null));
        }

        // Fetch recorded frame-by-frame telemetry for trends and zone telemetry
        try {
          const frames = await analysisApi.getResults(active.id);
          if (frames && frames.length > 0) {
            setFrameHistory(frames);
            setLatestFrame(frames[frames.length - 1]);
          } else {
            setFrameHistory([]);
            setLatestFrame(null);
          }
        } catch (frameErr) {
          console.warn('Frames fetch failed:', frameErr);
          setFrameHistory([]);
          setLatestFrame(null);
        }
      } else {
        setLatestAnalysis(null);
        setSelectedAnalysis(null);
        setAnalysisVideo(null);
        setFrameHistory([]);
        setLatestFrame(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to communicate with surveillance telemetry engine.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [setSelectedAnalysis]);

  useEffect(() => {
    loadOverviewData();
  }, [loadOverviewData]);

  // Format chart data for risk trajectory
  const chartData = useMemo(() => {
    if (!frameHistory || frameHistory.length === 0) return [];
    // Downsample if more than 60 points for clean rendering
    const step = Math.max(1, Math.floor(frameHistory.length / 50));
    return frameHistory
      .filter((_, idx) => idx % step === 0)
      .map((f) => ({
        time: `${f.timestamp_sec.toFixed(1)}s`,
        risk: Number(f.smoothed_risk_score.toFixed(1)),
        forecast: Number(f.forecast_risk_10s.toFixed(1)),
        count: f.person_count,
        entropy: Number(f.directional_entropy.toFixed(2)),
      }));
  }, [frameHistory]);

  // Zone matrix: extract cells from latest frame's grid_density
  const zoneCells = useMemo(() => {
    if (latestFrame && latestFrame.grid_density && latestFrame.grid_density.length === 9) {
      return latestFrame.grid_density;
    }
    // Fallback standard 3x3 layout if no frame records exist yet
    const rowLetters = ['A', 'B', 'C'];
    const cells = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 1; c <= 3; c++) {
        cells.push({
          name: `Zone ${rowLetters[r]}${c}`,
          population: 0,
          normalized_density: 0.0,
          density_level: 'Low' as const,
          avg_velocity: 0.0,
          inflow: 0,
          outflow: 0,
          zone_risk: 0.0,
          pattern: 'NORMAL',
        });
      }
    }
    return cells;
  }, [latestFrame]);

  if (loading) {
    return <LoadingBlock text="Initializing Command Center & Telemetry Streams..." height="h-96" />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={loadOverviewData} />;
  }

  const hasAnalyses = allAnalyses.length > 0;

  return (
    <div className="space-y-6">
      {/* -------------------------------------------------------------------------
          1. HEADER WITH QUICK ACTIONS
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
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
            Multi-stage Digital Image Processing surveillance system evaluating Farneback optical flow velocity fields, 
            directional Shannon entropy disorder, 2D continuous Gaussian density splatting, and +10s risk projections.
          </p>
        </div>

        <div className="flex items-center space-x-2.5 shrink-0">
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

      {/* -------------------------------------------------------------------------
          2. ACTIVE / LATEST SESSION BANNER
          ------------------------------------------------------------------------- */}
      {latestAnalysis ? (
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
                  Peak Crowd: <strong className="text-slate-200 font-mono">{latestAnalysis.peak_count || 0}</strong>
                </span>
                <span>•</span>
                <span>
                  Max Risk: <strong className="text-slate-200 font-mono">{latestAnalysis.max_risk_score.toFixed(1)}/100</strong>
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
          3. COMPACT SURVEILLANCE KPI TILES (Actual API Metrics)
          ------------------------------------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <KPICard
          label="Total Catalog Videos"
          value={summary?.total_videos ?? 0}
          unit="files"
          subtext={`${summary?.completed_analyses ?? 0} completed audits`}
          icon={Video}
          tone="cyan"
        />

        <KPICard
          label="Current / Sample Risk"
          value={latestFrame ? latestFrame.smoothed_risk_score.toFixed(1) : (latestAnalysis?.avg_risk_score.toFixed(1) ?? '0.0')}
          unit="/ 100"
          subtext={`Band: ${latestFrame?.risk_band || 'Low'}`}
          icon={Activity}
          tone={(latestFrame?.smoothed_risk_score || 0) >= 50 ? 'rose' : (latestFrame?.smoothed_risk_score || 0) >= 25 ? 'amber' : 'emerald'}
        />

        <KPICard
          label="Short-Term Forecast (+10s)"
          value={latestFrame ? latestFrame.forecast_risk_10s.toFixed(1) : '0.0'}
          unit="/ 100"
          subtext={`Trend: ${latestFrame?.forecast_trend || 'STABLE'} • ${latestFrame?.forecast_confidence ? `${latestFrame.forecast_confidence}% conf` : 'heuristic'}`}
          icon={TrendingUp}
          tone={(latestFrame?.forecast_risk_10s || 0) >= 60 ? 'rose' : 'neutral'}
        />

        <KPICard
          label="Sustained Incidents"
          value={summary?.total_incidents ?? 0}
          unit="events"
          subtext={`${summary?.critical_incidents ?? 0} critical priority alerts`}
          icon={AlertTriangle}
          tone={(summary?.critical_incidents ?? 0) > 0 ? 'rose' : 'amber'}
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
                  Temporal Risk Trajectory & Forecasting Window
                </h3>
              </div>
              <div className="flex items-center space-x-3 text-xs">
                <span className="flex items-center space-x-1 text-cyan-400 text-[11px] font-mono">
                  <span className="w-2.5 h-0.5 bg-cyan-400 inline-block" />
                  <span>Observed Composite Risk</span>
                </span>
                <span className="flex items-center space-x-1 text-rose-400 text-[11px] font-mono">
                  <span className="w-2.5 h-0.5 bg-rose-400 inline-block border-t border-dashed" />
                  <span>+10s Linear Projection</span>
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
                        `${Number(val).toFixed(1)}/100`,
                        name === 'risk' ? 'Observed Risk' : name === 'forecast' ? 'Projected (+10s)' : String(name),
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
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <Activity className="w-8 h-8 text-slate-400 mb-2" />
                <p className="text-xs font-medium text-slate-300">No telemetry recorded for current selection</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-sm">
                  Run an analysis job from the Video Ingestion Studio to view real-time temporal risk graphs.
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-[#192638] flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2">
            <span className="flex items-center space-x-1.5">
              <Info className="w-3.5 h-3.5 text-cyan-400" />
              <span>Forecasts represent uncalibrated linear extrapolation of rolling trend derivatives.</span>
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
                {latestFrame ? `t=${latestFrame.timestamp_sec.toFixed(1)}s` : 'Baseline'}
              </span>
            </div>

            <p className="text-[11px] text-slate-400 mb-3">
              Zone occupancy and perspective-weighted congestion across quadrants (Zones A1–C3):
            </p>

            {/* 3x3 Grid Visualizer */}
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
          </div>

          <div className="mt-3 pt-3 border-t border-[#192638] text-[11px] text-slate-400 flex items-center justify-between">
            <span>Perspective Scale: {latestAnalysis?.perspective_weight || 1.0}×</span>
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
          5. RECENT SUSTAINED INCIDENTS & HISTORICAL AUDIT SESSIONS
          ------------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sustained Incidents */}
        <div className="rounded-xl border border-[#192638] bg-[#0A1018] p-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#192638] mb-3">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <h3 className="text-sm font-semibold text-white">
                Recent Sustained Incidents & Early Warnings
              </h3>
            </div>
            <Link
              to="/incidents"
              className="text-xs text-cyan-400 hover:text-cyan-300 font-medium inline-flex items-center space-x-1"
            >
              <span>View all ({recentIncidents.length})</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {recentIncidents.length > 0 ? (
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
                        @ {inc.video_timestamp_sec.toFixed(1)}s
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 line-clamp-1">
                      {inc.trigger_reason}
                    </p>
                    <div className="text-[10px] text-slate-400 font-mono">
                      Region: <span className="text-slate-300">{inc.relevant_region || 'Monitored Scene'}</span> • Score: {inc.risk_score.toFixed(1)}/100
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
                All processed video feeds have remained within acceptable density and directional order parameters.
              </p>
            </div>
          )}
        </div>

        {/* Recent Catalog Sessions */}
        <div className="rounded-xl border border-[#192638] bg-[#0A1018] p-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#192638] mb-3">
            <div className="flex items-center space-x-2">
              <Users className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-white">Recent Catalog Audit Sessions</h3>
            </div>
            <Link
              to="/history"
              className="text-xs text-cyan-400 hover:text-cyan-300 font-medium inline-flex items-center space-x-1"
            >
              <span>Full archive ({allAnalyses.length})</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {hasAnalyses ? (
            <div className="space-y-2.5">
              {allAnalyses.slice(0, 5).map((anl) => (
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
                      <span>Frames: {anl.current_frame}/{anl.total_frames || '—'}</span>
                      <span>•</span>
                      <span>Peak: {anl.peak_count || 0}</span>
                      <span>•</span>
                      <span>Avg Risk: {anl.avg_risk_score.toFixed(1)}</span>
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
