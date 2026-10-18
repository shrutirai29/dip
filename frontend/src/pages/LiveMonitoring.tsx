import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  AlertTriangle
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
import { analysisApi, incidentApi } from '../services/api';
import { Analysis, FrameRecord, Incident, GridDensityCell } from '../types';
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
  const { selectedAnalysis: contextAnalysis, setSelectedAnalysis: setContextAnalysis } = useSystem();

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

  // Load detailed telemetry and incidents for a chosen analysis session
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

  // Load available analysis sessions
  const loadAnalyses = useCallback(async () => {
    setLoadingList(true);
    setErrorMessage(null);
    try {
      const data = await analysisApi.getAll();
      setAnalyses(data);
      if (data.length > 0) {
        const target = queryAnalysisId 
          ? data.find((a) => a.id === queryAnalysisId) || data[0]
          : contextAnalysis 
            ? data.find((a) => a.id === contextAnalysis.id) || data[0]
            : data[0];
        
        setSelectedAnalysis(target);
        setContextAnalysis(target);
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
  }, [queryAnalysisId, contextAnalysis, setContextAnalysis, loadSessionDetails]);

  useEffect(() => {
    loadAnalyses();
  }, []);

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

  // Sync selected zone when active frame changes if none is selected
  useEffect(() => {
    if (currentFrame?.grid_density && currentFrame.grid_density.length > 0) {
      if (!selectedZone) {
        setSelectedZone(currentFrame.grid_density[4] || currentFrame.grid_density[0]);
      } else {
        // Keep same quadrant selected in the new frame
        const matching = currentFrame.grid_density.find(z => z.name === selectedZone.name);
        if (matching) setSelectedZone(matching);
      }
    }
  }, [currentFrame]);

  // Playback timer for frame timeline scrubbing
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
      }, 500); // 2 fps scrub interval for discrete frame steps
    }
    return () => clearInterval(interval);
  }, [isPlaying, results.length]);

  // Click on chart to jump to specific frame
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

  if (loadingList) {
    return (
      <div className="space-y-6">
        <LoadingBlock text="Connecting to surveillance telemetry bus..." height="h-96" />
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="space-y-6">
        <ErrorState message={errorMessage} onRetry={loadAnalyses} />
      </div>
    );
  }

  if (analyses.length === 0) {
    return (
      <div className="space-y-6">
        <EmptyState
          title="No Surveillance Sessions Available"
          description="There are currently no processed or active video analyses. Upload footage or ingest a benchmark sample in the Video Ingestion Studio to initiate monitoring."
          actionText="Go to Ingestion Studio"
          onAction={() => window.location.href = '/video-analysis'}
          icon={VideoIcon}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header with Session Selector, Telemetry State, and CSV Export */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-4 border-b border-[#1E2D40] gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-xl font-bold text-white tracking-tight">TELEMETRY & SPATIAL REPLAY</h1>
            {selectedAnalysis && <StatusPill status={selectedAnalysis.status} />}
            {incidents.length > 0 && (
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-mono font-medium bg-rose-950/30 border-rose-500/30 text-rose-300">
                <AlertTriangle className="w-3 h-3 text-rose-400" />
                <span>{incidents.length} Alert{incidents.length > 1 ? 's' : ''}</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Synchronized video playback, Farneback velocity vector field, and localized 3×3 quadrant density analysis
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Analysis Switcher */}
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
        </div>
      </div>

      {/* Main Surveillance Split Screen */}
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
                    <span className="text-[10px] text-slate-400 block">Density Population</span>
                    <span className="text-sm font-bold text-white mt-0.5 block">{selectedZone.population} persons</span>
                  </div>
                  <div className="p-2 rounded bg-[#0E1622] border border-[#1E2D40]">
                    <span className="text-[10px] text-slate-400 block">Normalized Density</span>
                    <span className="text-sm font-bold text-cyan-400 mt-0.5 block">
                      {(selectedZone.normalized_density * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="p-2 rounded bg-[#0E1622] border border-[#1E2D40]">
                    <span className="text-[10px] text-slate-400 block">Mean Flow Velocity</span>
                    <span className="text-sm font-bold text-white mt-0.5 block">{selectedZone.avg_velocity} px/s</span>
                  </div>
                  <div className="p-2 rounded bg-[#0E1622] border border-[#1E2D40]">
                    <span className="text-[10px] text-slate-400 block">Inflow / Outflow</span>
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

      {/* Synchronized Telemetry Recharts */}
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
  );
};
