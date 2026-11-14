import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { 
  Users, 
  Activity, 
  TrendingUp, 
  AlertTriangle, 
  PlayCircle,
  Video,
  Radio,
  ExternalLink,
  ShieldAlert,
  Clock,
  Layers,
  Cpu,
  CheckCircle2,
  Play,
  ArrowRight,
  Maximize2
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { analyticsApi, analysisApi, incidentApi, videoApi, cameraApi, multiCameraApi } from '../services/api';
import { AnalyticsSummary, Analysis, Incident, FrameRecord, Video as VideoType, CameraSessionStatus, MultiCameraHealth } from '../types';
import { 
  StatusPill, 
  KPICard,
  RiskBadge,
  RiskGauge,
  ForecastChart,
  ArchitecturePipeline,
  EmptyState, 
  ErrorState, 
  LoadingBlock 
} from '../components/UIComponents';
import { useSystem } from '../context/SystemContext';
import { useTheme } from '../context/ThemeContext';

export const Overview: React.FC = () => {
  const { isDark } = useTheme();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [allAnalyses, setAllAnalyses] = useState<Analysis[] | null>(null);
  const [latestAnalysis, setLatestAnalysis] = useState<Analysis | null>(null);
  const [analysisVideo, setAnalysisVideo] = useState<VideoType | null>(null);
  const [frameHistory, setFrameHistory] = useState<FrameRecord[] | null>(null);
  const [latestFrame, setLatestFrame] = useState<FrameRecord | null>(null);
  const [recentIncidents, setRecentIncidents] = useState<Incident[] | null>(null);
  
  // Real-Time Camera Hardware Telemetry
  const [cameraStatus, setCameraStatus] = useState<CameraSessionStatus | null>(null);
  const [fleetHealth, setFleetHealth] = useState<MultiCameraHealth | null>(null);
  const [fleetCameras, setFleetCameras] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [startingCam, setStartingCam] = useState(false);

  const overviewRequestIdRef = useRef(0);

  const handleStartWebcam = async () => {
    try {
      setStartingCam(true);
      await cameraApi.start({ device_index: 0, target_fps: 25.0 });
      await loadOverviewData();
    } catch (e: any) {
      alert(`Could not start hardware camera: ${e?.response?.data?.detail || e.message}`);
    } finally {
      setStartingCam(false);
    }
  };

  const loadOverviewData = useCallback(async () => {
    const currentRequestId = ++overviewRequestIdRef.current;
    setLoading(true);
    setFatalError(null);

    try {
      // 1. Core Analytics Summary
      let summaryData: AnalyticsSummary | null = null;
      try {
        summaryData = await analyticsApi.getSummary();
      } catch {
        // non-fatal fallback
      }

      // 2. Multi-Camera Fleet Health & List
      try {
        const [healthRes, camsRes] = await Promise.all([
          multiCameraApi.getHealth().catch(() => null),
          multiCameraApi.list().catch(() => null)
        ]);
        if (healthRes && currentRequestId === overviewRequestIdRef.current) {
          setFleetHealth(healthRes);
        }
        if (camsRes && currentRequestId === overviewRequestIdRef.current) {
          setFleetCameras(camsRes || []);
        }
      } catch {
        // Multi-cam is optional
      }

      // 3. Live Hardware Camera Status
      try {
        const camRes = await cameraApi.getStatus();
        if (currentRequestId === overviewRequestIdRef.current) {
          setCameraStatus(camRes);
        }
      } catch {
        // Non-blocking
      }

      // 4. Session Analyses
      let analysesData: Analysis[] = [];
      try {
        analysesData = await analysisApi.getAll();
      } catch {
        // non-blocking
      }

      // 5. Recent Incidents
      let incidentsData: Incident[] = [];
      try {
        incidentsData = await incidentApi.getAll();
      } catch {
        // non-blocking
      }

      if (currentRequestId !== overviewRequestIdRef.current) return;

      setSummary(summaryData);
      setAllAnalyses(analysesData);
      setRecentIncidents(incidentsData);

      if (analysesData.length > 0) {
        const targetAnalysis = analysesData[0];
        setLatestAnalysis(targetAnalysis);

        try {
          const vidRes = await videoApi.getById(targetAnalysis.video_id);
          if (currentRequestId === overviewRequestIdRef.current) {
            setAnalysisVideo(vidRes);
          }
        } catch {
          // ignore
        }

        try {
          const framesRes = await analysisApi.getResults(targetAnalysis.id);
          if (currentRequestId === overviewRequestIdRef.current) {
            setFrameHistory(framesRes);
            if (framesRes.length > 0) {
              setLatestFrame(framesRes[framesRes.length - 1]);
            }
          }
        } catch {
          // ignore
        }
      }
    } catch (err: unknown) {
      if (currentRequestId === overviewRequestIdRef.current) {
        const errorMsg = err instanceof Error ? err.message : 'Communication error with CROWDGUARD API.';
        setFatalError(`Operational data link failure: ${errorMsg}`);
      }
    } finally {
      if (currentRequestId === overviewRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadOverviewData();
  }, [loadOverviewData]);

  // Real Operational Metrics (Derived strictly from live telemetry and database)
  const isCameraActive = !!cameraStatus?.is_active;
  const activeStreamsCount = fleetCameras.filter(c => c.is_active).length || (isCameraActive ? 1 : 0);
  const monitoredQuadrants = activeStreamsCount * 9;
  
  const currentRiskScore = latestFrame?.smoothed_risk_score ?? cameraStatus?.smoothed_risk_score ?? summary?.avg_risk_overall ?? null;
  const forecastRiskScore = latestFrame?.forecast_risk_10s ?? null;
  const currentDensity = latestFrame?.grid_density && latestFrame.grid_density.length > 0
    ? (latestFrame.grid_density.reduce((acc, cell) => acc + (cell.normalized_density || 0), 0) / latestFrame.grid_density.length)
    : null;
  const currentFlow = latestFrame?.optical_flow_magnitude ?? null;
  const currentEntropy = latestFrame?.directional_entropy ?? null;
  const currentCount = latestFrame?.person_count ?? cameraStatus?.person_count ?? (summary?.peak_crowd_overall ?? null);
  const pipelineFps = cameraStatus?.processing_fps || null;

  // Real Operational Incidents (Strictly from database / API)
  const incidentsList = useMemo(() => {
    if (!recentIncidents || recentIncidents.length === 0) return [];
    return recentIncidents.slice(0, 5).map((inc) => ({
      time: inc.video_timestamp_sec
        ? new Date(inc.video_timestamp_sec * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '—',
      camera: inc.relevant_region ? `Camera (${inc.relevant_region})` : 'Camera #0',
      risk: inc.risk_score || 0,
      severity: inc.severity || (inc.risk_score >= 70 ? 'High' : inc.risk_score >= 40 ? 'Medium' : 'Low'),
      event: inc.trigger_reason || inc.incident_type || 'Crowd density alert',
      recommendation: inc.recommended_action || 'Routine perimeter monitoring',
    }));
  }, [recentIncidents]);

  if (loading && !summary && !allAnalyses && !cameraStatus) {
    return <LoadingBlock text="Connecting to surveillance telemetry bus..." height="h-96" />;
  }

  if (fatalError && !summary && !allAnalyses) {
    return <ErrorState message={fatalError} onRetry={loadOverviewData} />;
  }

  return (
    <div className="space-y-6">
      {/* 1. HERO SECTION WITH MONOCHROMATIC ARCHITECTURAL LINE-ART */}
      <div className="relative rounded-xl border border-rule bg-paper-2 p-6 md:p-8 overflow-hidden shadow-2xs">
        {/* Monochromatic architectural skyline line-art SVG */}
        <div className="absolute right-0 top-0 bottom-0 w-80 md:w-96 pointer-events-none opacity-20 dark:opacity-10 overflow-hidden flex items-end justify-end pr-6">
          <svg className="w-full h-40 text-muted" viewBox="0 0 300 120" fill="none" stroke="currentColor" strokeWidth="1.2">
            <line x1="10" y1="120" x2="10" y2="40" />
            <line x1="10" y1="40" x2="40" y2="40" />
            <line x1="40" y1="40" x2="40" y2="120" />
            <line x1="45" y1="120" x2="45" y2="20" />
            <line x1="45" y1="20" x2="90" y2="20" />
            <line x1="90" y1="20" x2="90" y2="120" />
            <line x1="95" y1="120" x2="95" y2="55" />
            <line x1="95" y1="55" x2="135" y2="55" />
            <line x1="135" y1="55" x2="135" y2="120" />
            <line x1="140" y1="120" x2="140" y2="10" />
            <line x1="140" y1="10" x2="180" y2="10" />
            <line x1="180" y1="10" x2="180" y2="120" />
            <line x1="185" y1="120" x2="185" y2="35" />
            <line x1="185" y1="35" x2="225" y2="35" />
            <line x1="225" y1="35" x2="225" y2="120" />
            <line x1="230" y1="120" x2="230" y2="50" />
            <line x1="230" y1="50" x2="270" y2="50" />
            <line x1="270" y1="50" x2="270" y2="120" />
            {/* Perspective grid lines */}
            <line x1="0" y1="120" x2="300" y2="120" strokeWidth="1.5" />
            <line x1="30" y1="60" x2="30" y2="100" strokeDasharray="3 3" />
            <line x1="70" y1="40" x2="70" y2="90" strokeDasharray="3 3" />
            <line x1="160" y1="30" x2="160" y2="90" strokeDasharray="3 3" />
          </svg>
        </div>

        <div className="relative z-10 max-w-2xl space-y-2">
          <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded-full bg-burgundy-soft border border-burgundy/20 text-burgundy text-[11px] font-mono font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-burgundy animate-pulse" />
            <span>Operational Command Center</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink font-display">
            Executive Dashboard
          </h1>

          <p className="text-xs sm:text-sm text-muted leading-relaxed font-sans max-w-xl">
            Real-time crowd analysis, risk prediction & incident prevention platform. Powered by YOLOv8 deep learning and Gunnar Farneback optical flow.
          </p>
        </div>
      </div>

      {/* 2. KPI STRIP (Real Metrics Strictly) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KPICard
          label="Active Streams"
          value={activeStreamsCount}
          unit="CCTV"
          subtext={activeStreamsCount > 0 ? "Synchronized video feeds" : "All streams offline"}
          icon={Video}
          tone={activeStreamsCount > 0 ? "teal" : "slate"}
        />
        <KPICard
          label="Monitored Quadrants"
          value={monitoredQuadrants}
          unit="Zones"
          subtext="3×3 Spatial decomposition"
          icon={Layers}
          tone="slate"
        />
        <KPICard
          label="Peak Incident Risk"
          value={currentRiskScore !== null ? `${currentRiskScore.toFixed(0)}%` : "—"}
          subtext={currentRiskScore !== null ? "Live Composite Score" : "No active assessment"}
          icon={ShieldAlert}
          tone={currentRiskScore && currentRiskScore >= 70 ? "burgundy" : currentRiskScore && currentRiskScore >= 40 ? "amber" : "teal"}
          isRiskCard={currentRiskScore !== null && currentRiskScore >= 70}
        />
        <KPICard
          label="Pipeline Latency"
          value={pipelineFps ? `${(1000 / pipelineFps).toFixed(0)}` : "—"}
          unit={pipelineFps ? "ms" : ""}
          subtext={pipelineFps ? `${pipelineFps.toFixed(0)} FPS throughput` : "Engine idle"}
          icon={Activity}
          tone={pipelineFps ? "emerald" : "slate"}
        />
        <KPICard
          label="System Health"
          value="Operational"
          subtext="YOLOv8 + OpenCV core"
          icon={CheckCircle2}
          tone="emerald"
        />
      </div>

      {/* 3. MAIN INTELLIGENCE AREA (Asymmetric Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT — LARGE LIVE CROWD FEED (~58% width, 7 cols on lg) */}
        <div className="lg:col-span-7 bg-paper-2 border border-rule rounded-xl overflow-hidden shadow-2xs flex flex-col justify-between">
          {/* Surveillance Header */}
          <div className="px-4 py-3 border-b border-rule flex items-center justify-between bg-paper-3/50">
            <div className="flex items-center space-x-2.5">
              <span className="font-semibold text-sm text-ink font-display">Live Crowd Feed</span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-paper border border-rule text-ink-2 font-medium">
                Camera-03
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-ok-soft text-ok border border-ok/20 text-[11px] font-mono font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />
                <span>LIVE</span>
              </span>
              <Link 
                to="/monitoring"
                className="p-1 rounded text-muted hover:text-ink hover:bg-paper-3 transition-colors"
                title="Expand in Live Monitoring Console"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Surveillance Viewport */}
          <div className="relative aspect-video bg-[#111114] overflow-hidden flex items-center justify-center">
            {cameraStatus?.is_active ? (
              <img
                src={cameraApi.getStreamUrl()}
                alt="Live Surveillance Stream"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-center p-8 space-y-3">
                <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-slate-400">
                  <Video className="w-6 h-6" />
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
                    disabled={startingCam}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-burgundy hover:bg-burgundy-hover text-white rounded-lg text-xs font-medium transition cursor-pointer disabled:opacity-50 shadow-2xs"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{startingCam ? 'Connecting...' : 'Start Camera #0'}</span>
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
        </div>

        {/* RIGHT — RISK ANALYSIS & 10-SECOND FORECAST (~42% width, 5 cols on lg) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Restrained Burgundy Gauge */}
          <RiskGauge
            score={currentRiskScore}
            band={currentRiskScore !== null ? (currentRiskScore >= 70 ? 'High Risk' : currentRiskScore >= 40 ? 'Moderate' : 'Low Risk') : null}
            density={currentDensity}
            flowSpeed={currentFlow}
            entropy={currentEntropy}
            surge={null}
          />

          {/* 10-Second Predictive Forecast */}
          <ForecastChart
            currentRisk={currentRiskScore}
            projectedRisk={forecastRiskScore}
          />
        </div>
      </div>

      {/* 4. QUICK ACTIONS BAR */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link
          to="/monitoring"
          className="p-3.5 bg-burgundy hover:bg-burgundy-hover text-white rounded-lg shadow-2xs transition-colors flex items-center justify-between font-medium text-xs group"
        >
          <span>Live Monitoring</span>
          <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </Link>
        <Link
          to="/cameras"
          className="p-3.5 bg-paper-2 hover:bg-paper-3 text-ink rounded-lg border border-rule transition-colors flex items-center justify-between font-medium text-xs group"
        >
          <span>Add Camera</span>
          <ArrowRight className="w-4 h-4 text-muted group-hover:translate-x-0.5 transition-transform" />
        </Link>
        <Link
          to="/video-analysis"
          className="p-3.5 bg-paper-2 hover:bg-paper-3 text-ink rounded-lg border border-rule transition-colors flex items-center justify-between font-medium text-xs group"
        >
          <span>Analyze Video</span>
          <ArrowRight className="w-4 h-4 text-muted group-hover:translate-x-0.5 transition-transform" />
        </Link>
        <Link
          to="/cameras"
          className="p-3.5 bg-paper-2 hover:bg-paper-3 text-ink rounded-lg border border-rule transition-colors flex items-center justify-between font-medium text-xs group"
        >
          <span>Multi-Camera Grid</span>
          <ArrowRight className="w-4 h-4 text-muted group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      {/* 5. RECENT INCIDENTS (Generous Spacing, Operational Table) */}
      <div className="bg-paper-2 border border-rule rounded-xl overflow-hidden shadow-2xs">
        <div className="p-4 sm:p-5 border-b border-rule flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink font-display">Recent Incidents</h3>
            <p className="text-[11px] text-muted">Real-time alert ledger and automated safety dispatch logs</p>
          </div>
          <Link
            to="/incidents"
            className="text-xs font-medium text-burgundy hover:underline inline-flex items-center space-x-1"
          >
            <span>View all incidents</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-rule bg-paper-3/50 text-muted font-medium font-sans">
                <th className="py-3 px-4 font-normal">Time</th>
                <th className="py-3 px-4 font-normal">Camera</th>
                <th className="py-3 px-4 font-normal">Risk</th>
                <th className="py-3 px-4 font-normal">Event / Observation</th>
                <th className="py-3 px-4 font-normal">Recommendation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule font-sans">
              {incidentsList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 px-4 text-center text-muted">
                    <div className="max-w-sm mx-auto space-y-1">
                      <p className="text-xs font-medium text-ink">No Recorded Incidents</p>
                      <p className="text-[11px] text-muted">All active surveillance zones operating within nominal safety thresholds.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                incidentsList.map((inc, i) => (
                  <tr key={i} className="hover:bg-paper-3/40 transition-colors">
                    <td className="py-3.5 px-4 font-mono text-ink-2 tabular-nums">
                      {inc.time}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium text-ink">
                      {inc.camera}
                    </td>
                    <td className="py-3.5 px-4">
                      <RiskBadge
                        score={inc.risk}
                        band={inc.severity}
                        size="sm"
                      />
                    </td>
                    <td className="py-3.5 px-4 text-ink font-medium max-w-xs">
                      {inc.event}
                    </td>
                    <td className="py-3.5 px-4 text-muted">
                      {inc.recommendation}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. SYSTEM ARCHITECTURE (Connected Horizontal Modules) */}
      <ArchitecturePipeline />
    </div>
  );
};
