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
  MetricStrip, 
  MetricItem, 
  StatusPill, 
  EmptyState, 
  ErrorState, 
  LoadingBlock 
} from '../components/UIComponents';
import { useSystem } from '../context/SystemContext';
import { useTheme } from '../context/ThemeContext';

export const Analytics: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryAnalysisId = searchParams.get('analysisId');
  const { selectedAnalysis: contextAnalysis, setSelectedAnalysis: setContextAnalysis } = useSystem();
  const { isDark } = useTheme();

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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-4 border-b border-[#E2E8EA] dark:border-[#203638] gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-xl font-bold text-[#1C3334] dark:text-[#EDF4F5] tracking-tight">
              ADVANCED DYNAMICS & PREDICTIVE ANALYTICS
            </h1>
            {selectedAnalysis && <StatusPill status={selectedAnalysis.status} />}
          </div>
          <p className="text-xs text-[#5D757E] dark:text-[#A0B7BC] mt-1">
            Temporal feature decomposition: Farneback optical flow velocity vectors, directional Shannon entropy, and multi-horizon risk projections
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center space-x-2 bg-white dark:bg-[#152729] border border-[#CBD5D8] dark:border-[#2C4B4E] rounded-lg px-2.5 py-1.5 shadow-2xs">
            <span className="text-[10px] uppercase font-mono tracking-wider text-[#5D757E] dark:text-[#A0B7BC]">Session:</span>
            <select
              value={selectedAnalysis?.id || ''}
              onChange={(e) => handleSelect(e.target.value)}
              className="bg-transparent text-xs font-mono text-[#376E6F] dark:text-[#6EB5B6] font-semibold focus:outline-none cursor-pointer"
            >
              {analyses.map((a) => (
                <option key={a.id} value={a.id} className="bg-white dark:bg-[#152729] text-[#1C3334] dark:text-[#EEF4F5]">
                  {a.id.slice(0, 16)}... ({a.status.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => selectedAnalysis && loadAnalyses(true)}
            disabled={loadingFrames}
            aria-label="Refresh telemetry analytics"
            className="p-2 bg-white dark:bg-[#152729] hover:bg-[#F1F4F5] dark:hover:bg-[#1C3336] text-[#2F4454] dark:text-[#EDF4F5] border border-[#CBD5D8] dark:border-[#2C4B4E] rounded-lg text-xs transition cursor-pointer shadow-2xs"
            title="Refresh Analytics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingFrames ? 'animate-spin text-[#376E6F]' : ''}`} />
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
        </div>
      </div>

      {/* High-Density Statistical Ribbon */}
      <MetricStrip>
        <MetricItem
          label="Mean Flow Speed"
          value={metrics.meanSpeed}
          unit="px / sec"
          subtext="Centroid Tracking Velocity"
          icon={Activity}
          tone="teal"
        />
        <MetricItem
          label="Optical Flow Mag"
          value={metrics.meanFlow}
          unit="px / frame"
          subtext="Farneback Dense Motion"
          icon={Zap}
          tone="slate"
        />
        <MetricItem
          label="Directional Entropy"
          value={metrics.meanEntropy}
          unit="Shannon H"
          subtext="Normalized Flow Disorder"
          icon={Compass}
          tone="deepteal"
        />
        <MetricItem
          label="Surge Acceleration"
          value={metrics.meanAccel}
          unit="px / sec²"
          subtext="Velocity Gradient Rate"
          icon={TrendingUp}
          tone="rose"
        />
        <MetricItem
          label="Peak Projected Risk"
          value={metrics.peakForecast10s}
          unit="/ 100"
          subtext="Maximum +10s Horizon"
          icon={BarChart2}
          tone="burgundy"
        />
      </MetricStrip>

      {/* Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Forecast Comparison Chart */}
        <div className="bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold text-[#1C3334] dark:text-white uppercase tracking-wider">
                1. What is the short-term disaster risk trajectory? — Multi-Horizon Projections (+5s, +10s, +15s)
              </h3>
              <p className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] mt-0.5">
                Velocity and density gradient trend extrapolation
              </p>
            </div>
            <span className="text-[10px] font-mono text-[#376E6F] dark:text-[#6EB5B6] px-2 py-0.5 rounded bg-[#376E6F]/10 border border-[#376E6F]/30">
              Multi-Horizon
            </span>
          </div>

          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-500/30 text-[11px] text-amber-900 dark:text-amber-200 flex items-start space-x-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>Scientific Disclaimer:</strong> Forecasts represent heuristic polynomial extrapolations of instantaneous velocity and density gradients. They are uncalibrated advisory indicators and do not guarantee disaster probability.
            </span>
          </div>

          <div className="h-64 min-h-[256px] w-full min-w-0 relative">
            {frameData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={frameData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#203638' : '#E2E8EA'} />
                  <XAxis 
                    dataKey="timestamp_sec" 
                    stroke={isDark ? '#8AA1A7' : '#5D757E'} 
                    tick={{ fontSize: 10, fill: isDark ? '#8AA1A7' : '#5D757E' }} 
                    unit="s" 
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
                  <Legend 
                    wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="smoothed_risk_score" 
                    name="Current Risk" 
                    stroke="#DA7B93" 
                    strokeWidth={2} 
                    dot={false} 
                    isAnimationActive={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="forecast_risk_5s" 
                    name="Forecast +5s" 
                    stroke="#376E6F" 
                    strokeWidth={1.5}
                    strokeDasharray="3 3" 
                    dot={false} 
                    isAnimationActive={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="forecast_risk_10s" 
                    name="Forecast +10s" 
                    stroke="#2F4454" 
                    strokeWidth={2} 
                    strokeDasharray="4 4" 
                    dot={false} 
                    isAnimationActive={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="forecast_risk_15s" 
                    name="Forecast +15s" 
                    stroke="#2E151B" 
                    strokeWidth={1.5}
                    strokeDasharray="2 2" 
                    dot={false} 
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-[#5D757E] dark:text-[#8AA1A7]">
                No telemetry time-series points recorded.
              </div>
            )}
          </div>
        </div>

        {/* 2. Is the crowd moving in organized laminar flow or turbulent panic? — Shannon Entropy & Velocity Variance */}
        <div className="bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold text-[#1C3334] dark:text-white uppercase tracking-wider">
                2. Is the crowd moving in organized laminar flow or turbulent panic? — Shannon Entropy & Velocity Variance
              </h3>
              <p className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] mt-0.5">
                Quantifying coordinated laminar flow vs chaotic turbulence
              </p>
            </div>
            <span className="text-[10px] font-mono text-[#DA7B93] px-2 py-0.5 rounded bg-[#DA7B93]/10 border border-[#DA7B93]/30">
              Turbulence Index
            </span>
          </div>

          <div className="p-3 rounded-lg bg-[#F8F9FA] dark:bg-[#0B1415] border border-[#E2E8EA] dark:border-[#203638] text-[10px] text-[#5D757E] dark:text-[#A0B7BC]">
            Shannon entropy values &gt; 0.65 indicate multidirectional vector dispersion or panic agitation. Values &lt; 0.35 indicate uniform, structured pedestrian movement.
          </div>

          <div className="h-64 min-h-[256px] w-full min-w-0 relative">
            {frameData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={frameData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#203638' : '#E2E8EA'} />
                  <XAxis 
                    dataKey="timestamp_sec" 
                    stroke={isDark ? '#8AA1A7' : '#5D757E'} 
                    tick={{ fontSize: 10, fill: isDark ? '#8AA1A7' : '#5D757E' }} 
                    unit="s" 
                  />
                  <YAxis 
                    yAxisId="entropy"
                    stroke="#DA7B93" 
                    domain={[0, 1]} 
                    tick={{ fontSize: 10, fill: '#DA7B93' }} 
                  />
                  <YAxis 
                    yAxisId="variance"
                    orientation="right"
                    stroke="#376E6F" 
                    tick={{ fontSize: 10, fill: '#376E6F' }} 
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
                  <Legend 
                    wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} 
                  />
                  <Line 
                    yAxisId="entropy"
                    type="monotone" 
                    dataKey="directional_entropy" 
                    name="Directional Entropy (0-1)" 
                    stroke="#DA7B93" 
                    strokeWidth={2} 
                    dot={false} 
                    isAnimationActive={false}
                  />
                  <Line 
                    yAxisId="variance"
                    type="monotone" 
                    dataKey="motion_variance" 
                    name="Motion Variance" 
                    stroke="#376E6F" 
                    strokeWidth={1.5} 
                    dot={false} 
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-[#5D757E] dark:text-[#8AA1A7]">
                No entropy dynamics recorded for this session.
              </div>
            )}
          </div>
        </div>

        {/* 4 Normalized Risk Factor Components Progression */}
        <div className="bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl p-5 space-y-3 lg:col-span-2 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-[#1C3334] dark:text-white uppercase tracking-wider">
                3. Which physical mechanism is driving the composite risk rating? — 4-Factor Heuristic Decomposition
              </h3>
              <p className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] mt-0.5">
                Decomposition into Density Pressure (35%), Surge Influx (20%), Motion Anomaly (25%), and Spatial Congestion (20%)
              </p>
            </div>
            <span className="text-[10px] font-mono text-[#5D757E] dark:text-[#A0B7BC]">
              Normalized [0.0 - 1.0] Range
            </span>
          </div>

          <div className="h-64 min-h-[256px] w-full min-w-0 relative">
            {frameData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={frameData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#203638' : '#E2E8EA'} />
                  <XAxis 
                    dataKey="timestamp_sec" 
                    stroke={isDark ? '#8AA1A7' : '#5D757E'} 
                    tick={{ fontSize: 10, fill: isDark ? '#8AA1A7' : '#5D757E' }} 
                    unit="s" 
                  />
                  <YAxis 
                    stroke={isDark ? '#8AA1A7' : '#5D757E'} 
                    domain={[0, 1]} 
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
                  <Legend 
                    wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="density_component" 
                    name="Density Pressure (w=0.35)" 
                    stroke="#376E6F" 
                    fill="#376E6F" 
                    fillOpacity={0.16} 
                    isAnimationActive={false}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="growth_component" 
                    name="Surge Influx (w=0.20)" 
                    stroke="#DA7B93" 
                    fill="#DA7B93" 
                    fillOpacity={0.16} 
                    isAnimationActive={false}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="motion_anomaly_component" 
                    name="Motion Anomaly (w=0.25)" 
                    stroke="#2E151B" 
                    fill="#2E151B" 
                    fillOpacity={0.16} 
                    isAnimationActive={false}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="congestion_component" 
                    name="Grid Congestion (w=0.20)" 
                    stroke="#2F4454" 
                    fill="#2F4454" 
                    fillOpacity={0.16} 
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-[#5D757E] dark:text-[#8AA1A7]">
                No component telemetry available.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
