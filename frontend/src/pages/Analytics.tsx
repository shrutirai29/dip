import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  CartesianGrid, 
  AreaChart, 
  Area,
  Legend
} from 'recharts';
import { 
  Activity, 
  TrendingUp, 
  Compass, 
  Zap, 
  RefreshCw, 
  FileSpreadsheet, 
  AlertCircle,
  BarChart2
} from 'lucide-react';
import { analysisApi } from '../services/api';
import { Analysis, FrameRecord } from '../types';
import { 
  KPICard, 
  StatusPill, 
  EmptyState, 
  ErrorState, 
  LoadingBlock 
} from '../components/UIComponents';
import { useSystem } from '../context/SystemContext';

export const Analytics: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryAnalysisId = searchParams.get('analysisId');
  const { selectedAnalysis: contextAnalysis, setSelectedAnalysis: setContextAnalysis } = useSystem();

  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<Analysis | null>(null);
  const [frameData, setFrameData] = useState<FrameRecord[]>([]);
  
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [loadingFrames, setLoadingFrames] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const contextAnalysisRef = useRef<Analysis | null>(contextAnalysis);
  useEffect(() => {
    contextAnalysisRef.current = contextAnalysis;
  }, [contextAnalysis]);

  const hasLoadedRef = useRef<boolean>(false);
  const loadedFrameIdRef = useRef<string | null>(null);

  // Load telemetry frames for a specific session without recreating
  const loadFrames = useCallback(async (id: string) => {
    setLoadingFrames(true);
    try {
      const frames = await analysisApi.getResults(id);
      setFrameData(frames);
      loadedFrameIdRef.current = id;
    } catch (e) {
      console.error('Failed to load frames:', e);
      setFrameData([]);
    } finally {
      setLoadingFrames(false);
    }
  }, []);

  // Load catalog of analyses with stable reference to prevent infinite rerender loops
  const loadAnalyses = useCallback(async (isManualRefresh = false) => {
    if (!hasLoadedRef.current) {
      setLoadingList(true);
    }
    setErrorMessage(null);
    try {
      const data = await analysisApi.getAll();
      setAnalyses(data);
      if (data.length > 0) {
        const currentCtxId = contextAnalysisRef.current?.id;
        const target = queryAnalysisId 
          ? data.find((a) => a.id === queryAnalysisId) || data[0]
          : currentCtxId 
            ? data.find((a) => a.id === currentCtxId) || data[0]
            : data[0];

        setSelectedAnalysis(target);
        if (currentCtxId !== target.id) {
          setContextAnalysis(target);
        }
        if (loadedFrameIdRef.current !== target.id || isManualRefresh) {
          loadFrames(target.id);
        }
      } else {
        setSelectedAnalysis(null);
        setFrameData([]);
        loadedFrameIdRef.current = null;
      }
      hasLoadedRef.current = true;
    } catch (e) {
      console.error('Failed to load analyses:', e);
      setErrorMessage('Unable to retrieve surveillance analytics data from the backend.');
    } finally {
      setLoadingList(false);
    }
  }, [queryAnalysisId, setContextAnalysis, loadFrames]);

  useEffect(() => {
    loadAnalyses();
  }, [loadAnalyses]);

  const handleSelect = (id: string) => {
    const found = analyses.find((a) => a.id === id);
    if (found) {
      setSelectedAnalysis(found);
      if (contextAnalysisRef.current?.id !== found.id) {
        setContextAnalysis(found);
      }
      setSearchParams({ analysisId: found.id });
      loadFrames(found.id);
    }
  };

  // Aggregated Statistical Metrics
  const metrics = useMemo(() => {
    if (!frameData || frameData.length === 0) {
      return {
        meanSpeed: '—',
        meanFlow: '—',
        meanEntropy: '—',
        meanAccel: '—',
        peakForecast10s: '—',
        hasData: false
      };
    }

    const count = frameData.length;
    const speed = frameData.reduce((acc, f) => acc + (f.mean_speed_pixels || 0), 0) / count;
    const flow = frameData.reduce((acc, f) => acc + (f.optical_flow_magnitude || 0), 0) / count;
    const entropy = frameData.reduce((acc, f) => acc + (f.directional_entropy || 0), 0) / count;
    const accel = frameData.reduce((acc, f) => acc + (f.mean_acceleration || 0), 0) / count;
    const maxForecast = Math.max(0, ...frameData.map(f => f.forecast_risk_10s || 0));

    return {
      meanSpeed: speed.toFixed(1),
      meanFlow: flow.toFixed(1),
      meanEntropy: entropy.toFixed(3),
      meanAccel: accel.toFixed(2),
      peakForecast10s: maxForecast.toFixed(1),
      hasData: true
    };
  }, [frameData]);

  if (loadingList) {
    return (
      <div className="space-y-6">
        <LoadingBlock text="Aggregating predictive crowd telemetry..." height="h-96" />
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
          title="No Analytics Data Available"
          description="There are currently no surveillance runs in the system to calculate crowd dynamics or predictive trends. Run an analysis session first."
          actionText="Go to Ingestion Studio"
          onAction={() => window.location.href = '/video-analysis'}
          icon={BarChart2}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      {/* Header with Session Selector, Status, and CSV Export */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-4 border-b border-[#1E2D40] gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-xl font-bold text-white tracking-tight">
              ADVANCED DYNAMICS & PREDICTIVE ANALYTICS
            </h1>
            {selectedAnalysis && <StatusPill status={selectedAnalysis.status} />}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Temporal feature decomposition: Farneback optical flow velocity vectors, directional Shannon entropy, and multi-horizon risk projections
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center space-x-2 bg-[#0E1622] border border-[#1E2D40] rounded-lg px-2.5 py-1.5">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Session:</span>
            <select
              value={selectedAnalysis?.id || ''}
              onChange={(e) => handleSelect(e.target.value)}
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
            onClick={() => selectedAnalysis && loadAnalyses(true)}
            disabled={loadingFrames}
            aria-label="Refresh telemetry analytics"
            className="p-2 bg-[#0E1622] hover:bg-[#141E2B] text-slate-300 hover:text-white border border-[#1E2D40] rounded-lg text-xs transition cursor-pointer"
            title="Refresh Analytics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingFrames ? 'animate-spin text-cyan-400' : ''}`} />
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

      {/* Top 4 Telemetry Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Mean Flow Speed"
          value={metrics.meanSpeed}
          unit="px / sec"
          subtext="Centroid vector tracking"
          icon={Activity}
          tone="cyan"
        />
        <KPICard
          label="Optical Flow Mag"
          value={metrics.meanFlow}
          unit="px / frame"
          subtext="Farneback dense motion field"
          icon={Zap}
          tone="amber"
        />
        <KPICard
          label="Directional Entropy"
          value={metrics.meanEntropy}
          unit="Shannon H"
          subtext="Normalized angular disorder"
          icon={Compass}
          tone="neutral"
        />
        <KPICard
          label="Surge Acceleration"
          value={metrics.meanAccel}
          unit="px / sec²"
          subtext="Velocity gradient rate"
          icon={TrendingUp}
          tone="rose"
        />
      </div>

      {/* Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Forecast Comparison Chart */}
        <div className="bg-[#0E1622] border border-[#1E2D40] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                Current Risk vs Multi-Horizon Forecast (+5s, +10s, +15s)
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Velocity and density gradient trend extrapolation
              </p>
            </div>
            <span className="text-[10px] font-mono text-cyan-400 px-2 py-0.5 rounded bg-cyan-950/40 border border-cyan-500/30">
              Multi-Horizon
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-[#0A1018] border border-[#1E2D40] text-[10px] text-slate-400 flex items-start space-x-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>Scientific Disclaimer:</strong> Forecasts represent heuristic polynomial extrapolations of instantaneous velocity and density gradients. They are uncalibrated advisory indicators and do not guarantee disaster probability.
            </span>
          </div>

          <div className="h-64 min-h-[256px] w-full min-w-0 relative">
            {frameData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={frameData}>
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
                  <Legend 
                    wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="smoothed_risk_score" 
                    name="Current Risk" 
                    stroke="#f59e0b" 
                    strokeWidth={2} 
                    dot={false} 
                    isAnimationActive={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="forecast_risk_5s" 
                    name="Forecast +5s" 
                    stroke="#38bdf8" 
                    strokeWidth={1.5}
                    strokeDasharray="3 3" 
                    dot={false} 
                    isAnimationActive={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="forecast_risk_10s" 
                    name="Forecast +10s" 
                    stroke="#ef4444" 
                    strokeWidth={2} 
                    strokeDasharray="4 4" 
                    dot={false} 
                    isAnimationActive={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="forecast_risk_15s" 
                    name="Forecast +15s" 
                    stroke="#c084fc" 
                    strokeWidth={1.5}
                    strokeDasharray="2 2" 
                    dot={false} 
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
                No telemetry time-series points recorded.
              </div>
            )}
          </div>
        </div>

        {/* Directional Shannon Entropy & Motion Variance */}
        <div className="bg-[#0E1622] border border-[#1E2D40] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                Directional Shannon Entropy & Motion Variance
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Quantifying coordinated laminar flow vs chaotic turbulence
              </p>
            </div>
            <span className="text-[10px] font-mono text-purple-400 px-2 py-0.5 rounded bg-purple-950/40 border border-purple-500/30">
              Turbulence Index
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-[#0A1018] border border-[#1E2D40] text-[10px] text-slate-400">
            Shannon entropy values &gt; 0.65 indicate multidirectional vector dispersion or panic agitation. Values &lt; 0.35 indicate uniform, structured pedestrian movement.
          </div>

          <div className="h-64 min-h-[256px] w-full min-w-0 relative">
            {frameData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={frameData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2D40" />
                  <XAxis 
                    dataKey="timestamp_sec" 
                    stroke="#64748B" 
                    tick={{ fontSize: 10, fill: '#64748B' }} 
                    unit="s" 
                  />
                  <YAxis 
                    yAxisId="entropy"
                    stroke="#c084fc" 
                    domain={[0, 1]} 
                    tick={{ fontSize: 10, fill: '#c084fc' }} 
                  />
                  <YAxis 
                    yAxisId="variance"
                    orientation="right"
                    stroke="#06b6d4" 
                    tick={{ fontSize: 10, fill: '#06b6d4' }} 
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
                  <Legend 
                    wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} 
                  />
                  <Line 
                    yAxisId="entropy"
                    type="monotone" 
                    dataKey="directional_entropy" 
                    name="Directional Entropy (0-1)" 
                    stroke="#c084fc" 
                    strokeWidth={2} 
                    dot={false} 
                    isAnimationActive={false}
                  />
                  <Line 
                    yAxisId="variance"
                    type="monotone" 
                    dataKey="motion_variance" 
                    name="Motion Variance" 
                    stroke="#06b6d4" 
                    strokeWidth={1.5} 
                    dot={false} 
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
                No entropy dynamics recorded for this session.
              </div>
            )}
          </div>
        </div>

        {/* 4 Normalized Risk Factor Components Progression */}
        <div className="bg-[#0E1622] border border-[#1E2D40] rounded-xl p-5 space-y-3 lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                Four Normalized Heuristic Risk Components Progression
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Decomposition into Density Pressure (35%), Surge Influx (20%), Motion Anomaly (25%), and Spatial Congestion (20%)
              </p>
            </div>
            <span className="text-[10px] font-mono text-slate-400">
              Normalized [0.0 - 1.0] Range
            </span>
          </div>

          <div className="h-64 min-h-[256px] w-full min-w-0 relative">
            {frameData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={frameData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2D40" />
                  <XAxis 
                    dataKey="timestamp_sec" 
                    stroke="#64748B" 
                    tick={{ fontSize: 10, fill: '#64748B' }} 
                    unit="s" 
                  />
                  <YAxis 
                    stroke="#64748B" 
                    domain={[0, 1]} 
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
                  <Legend 
                    wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="density_component" 
                    name="Density Pressure (w=0.35)" 
                    stroke="#06b6d4" 
                    fill="#06b6d4" 
                    fillOpacity={0.12} 
                    isAnimationActive={false}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="growth_component" 
                    name="Surge Influx (w=0.20)" 
                    stroke="#f59e0b" 
                    fill="#f59e0b" 
                    fillOpacity={0.12} 
                    isAnimationActive={false}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="motion_anomaly_component" 
                    name="Motion Anomaly (w=0.25)" 
                    stroke="#ef4444" 
                    fill="#ef4444" 
                    fillOpacity={0.12} 
                    isAnimationActive={false}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="congestion_component" 
                    name="Grid Congestion (w=0.20)" 
                    stroke="#c084fc" 
                    fill="#c084fc" 
                    fillOpacity={0.12} 
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
                No component telemetry available.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
