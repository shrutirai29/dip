import React, { useEffect, useState } from 'react';
import { 
  Users, 
  Activity, 
  TrendingUp, 
  AlertTriangle, 
  Compass, 
  PlayCircle,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { analyticsApi, analysisApi, incidentApi } from '../services/api';
import { AnalyticsSummary, Analysis, Incident, FrameRecord } from '../types';

export const Overview: React.FC = () => {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [latestAnalysis, setLatestAnalysis] = useState<Analysis | null>(null);
  const [recentIncidents, setRecentIncidents] = useState<Incident[]>([]);
  const [latestFrame, setLatestFrame] = useState<FrameRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sumData, allAnalyses, incData] = await Promise.all([
          analyticsApi.getSummary(),
          analysisApi.getAll(),
          incidentApi.getAll(),
        ]);
        setSummary(sumData);
        if (allAnalyses.length > 0) {
          const topAnalysis = allAnalyses[0];
          setLatestAnalysis(topAnalysis);
          
          // Fetch latest frames for live forecasting breakdown
          try {
            const frames = await analysisApi.getResults(topAnalysis.id);
            if (frames.length > 0) {
              setLatestFrame(frames[frames.length - 1]);
            }
          } catch (e) {
            console.error('Frame fetch error', e);
          }
        }
        setRecentIncidents(incData.slice(0, 5));
      } catch (err) {
        console.error('Failed to load overview data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-[#1D2935] gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-[#F4F7FA] tracking-tight">CROWD COMMAND & DISASTER EARLY WARNING</h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              LIVE SURVEILLANCE
            </span>
          </div>
          <p className="text-xs text-[#8C9AAA] mt-1 font-sans">
            Real-time Digital Image Processing (DIP) pipeline: Farneback Optical Flow, 2D Gaussian Density Splatting, and +10s Predictive Forecasting.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Link
            to="/video-analysis"
            className="flex items-center space-x-2 px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-medium transition shadow-sm"
          >
            <PlayCircle className="w-4 h-4" />
            <span>Launch Analysis Studio</span>
          </Link>
        </div>
      </div>

      {/* 5 Core Surveillance KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-[#0D131C] border border-[#1D2935] rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-[#8C9AAA] mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Crowd Observed</span>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-white">
              {latestFrame ? latestFrame.person_count : latestAnalysis?.peak_count || 0}
            </span>
            <span className="text-[10px] text-[#8C9AAA]">detected persons</span>
          </div>
          <div className="mt-2 text-[10px] text-[#8C9AAA]">
            Peak observed: <span className="text-white font-medium">{latestAnalysis?.peak_count || 0}</span>
          </div>
        </div>

        <div className="bg-[#0D131C] border border-[#1D2935] rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-[#8C9AAA] mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Current Risk</span>
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className={`text-2xl font-bold ${
              (latestFrame?.smoothed_risk_score || 0) >= 75 ? 'text-rose-500' :
              (latestFrame?.smoothed_risk_score || 0) >= 50 ? 'text-amber-400' : 'text-emerald-400'
            }`}>
              {latestFrame ? latestFrame.smoothed_risk_score.toFixed(1) : latestAnalysis?.avg_risk_score.toFixed(1) || '0.0'}
            </span>
            <span className="text-[10px] text-[#8C9AAA]">/ 100 max</span>
          </div>
          <div className="mt-2 text-[10px] text-[#8C9AAA]">
            Band: <span className="text-white font-medium">{latestFrame?.risk_band || 'Low'}</span>
          </div>
        </div>

        <div className="bg-[#0D131C] border border-[#1D2935] rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-[#8C9AAA] mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Forecast (+10s)</span>
            <TrendingUp className="w-4 h-4 text-rose-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-rose-400">
              {latestFrame ? latestFrame.forecast_risk_10s.toFixed(1) : '0.0'}
            </span>
            <span className="text-[10px] text-[#8C9AAA]">({latestFrame?.forecast_trend || 'STABLE'})</span>
          </div>
          <div className="mt-2 text-[10px] text-[#8C9AAA]">
            Confidence: <span className="text-white font-medium">{latestFrame ? `${latestFrame.forecast_confidence}%` : '85%'}</span>
          </div>
        </div>

        <div className="bg-[#0D131C] border border-[#1D2935] rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-[#8C9AAA] mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Active Incidents</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-white">{summary?.total_incidents || 0}</span>
            <span className="text-[10px] text-rose-400">({summary?.critical_incidents || 0} Critical)</span>
          </div>
          <div className="mt-2 text-[10px] text-[#8C9AAA]">
            Status: <span className="text-white font-medium">Human Audit Required</span>
          </div>
        </div>

        <div className="bg-[#0D131C] border border-[#1D2935] rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-[#8C9AAA] mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Motion Dynamics</span>
            <Compass className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-cyan-400">
              {latestFrame ? `${latestFrame.optical_flow_magnitude.toFixed(1)} px` : '0.0 px'}
            </span>
          </div>
          <div className="mt-2 text-[10px] text-[#8C9AAA]">
            Entropy: <span className="text-white font-medium">{latestFrame?.directional_entropy.toFixed(2) || '0.00'}</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Live Video Feed + Explainable Early Warning Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Annotated Video Player Panel */}
        <div className="lg:col-span-2 bg-[#0D131C] border border-[#1D2935] rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-[#1D2935]">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
                <h3 className="text-sm font-semibold text-white">Active Surveillance Feed & Heatmap Overlay</h3>
              </div>
              <div className="flex items-center space-x-2 text-xs">
                {latestAnalysis && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                    Pattern: {latestAnalysis.dominant_pattern || 'NORMAL_FLOW'}
                  </span>
                )}
                <span className="text-xs text-[#8C9AAA] font-mono">
                  {latestAnalysis?.processing_fps || 24.0} FPS
                </span>
              </div>
            </div>

            {latestAnalysis?.annotated_video_path ? (
              <div className="relative aspect-video rounded-lg overflow-hidden bg-black border border-[#1D2935]">
                <video
                  src={latestAnalysis.annotated_video_path}
                  controls
                  autoPlay
                  loop
                  className="w-full h-full object-contain"
                  poster={latestAnalysis.heatmap_preview_path}
                />
              </div>
            ) : latestAnalysis?.heatmap_preview_path ? (
              <div className="relative aspect-video rounded-lg overflow-hidden bg-black border border-[#1D2935]">
                <img
                  src={latestAnalysis.heatmap_preview_path}
                  alt="Heatmap Preview"
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="aspect-video rounded-lg bg-[#070B12]/80 border border-dashed border-[#1D2935] flex flex-col items-center justify-center text-center p-6 text-[#8C9AAA]">
                <PlayCircle className="w-12 h-12 stroke-[1.5] mb-2 text-[#8C9AAA]/60" />
                <p className="text-sm font-medium text-white">No active video analysis session</p>
                <p className="text-xs text-[#8C9AAA] mt-1 max-w-sm">
                  Upload surveillance footage in the Video Ingestion Studio to run YOLO person detection and continuous 2D Gaussian density splatting.
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-[#1D2935] flex items-center justify-between text-xs text-[#8C9AAA]">
            <span>
              Perspective Weight: {latestAnalysis?.perspective_weight || 1.0}x • Privacy: {latestAnalysis?.privacy_mode || 'none'}
            </span>
            <Link
              to={latestAnalysis ? `/monitoring?analysisId=${latestAnalysis.id}` : '/video-analysis'}
              className="text-cyan-400 hover:text-cyan-300 font-medium flex items-center space-x-1"
            >
              <span>Full telemetry screen</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Actionable Early Warning & Rationale Panel */}
        <div className="bg-[#0D131C] border border-[#1D2935] rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#1D2935]">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">Explainable Risk & Forecast</h3>
              </div>
              <span className="text-[10px] font-mono text-[#8C9AAA]">Rolling Heuristic</span>
            </div>

            {/* Current vs Forecast Risk Index */}
            <div className="mt-3 p-3.5 bg-[#111923] rounded-lg border border-[#1D2935] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-[#8C9AAA] uppercase tracking-wider block">Current Risk</span>
                  <span className="text-xl font-bold text-white">
                    {latestFrame ? latestFrame.smoothed_risk_score.toFixed(1) : '0.0'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-[#8C9AAA] uppercase tracking-wider block">Forecast (+10s)</span>
                  <span className="text-xl font-bold text-rose-400">
                    {latestFrame ? latestFrame.forecast_risk_10s.toFixed(1) : '0.0'}
                  </span>
                </div>
              </div>

              {/* Contributing factor bars */}
              <div className="space-y-2 text-xs pt-1">
                <div>
                  <div className="flex justify-between text-[11px] text-[#8C9AAA] mb-0.5">
                    <span>Density Pressure (35%)</span>
                    <span className="font-mono text-white">
                      {latestFrame ? `${(latestFrame.density_component * 100).toFixed(0)}%` : '0%'}
                    </span>
                  </div>
                  <div className="w-full bg-[#1D2935] rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-cyan-500 h-1.5"
                      style={{ width: `${latestFrame ? latestFrame.density_component * 100 : 0}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-[#8C9AAA] mb-0.5">
                    <span>Surge Influx Rate (20%)</span>
                    <span className="font-mono text-white">
                      {latestFrame ? `${(latestFrame.growth_component * 100).toFixed(0)}%` : '0%'}
                    </span>
                  </div>
                  <div className="w-full bg-[#1D2935] rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-amber-500 h-1.5"
                      style={{ width: `${latestFrame ? latestFrame.growth_component * 100 : 0}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-[#8C9AAA] mb-0.5">
                    <span>Motion Disorder / Entropy (25%)</span>
                    <span className="font-mono text-white">
                      {latestFrame ? `${(latestFrame.motion_anomaly_component * 100).toFixed(0)}%` : '0%'}
                    </span>
                  </div>
                  <div className="w-full bg-[#1D2935] rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-rose-500 h-1.5"
                      style={{ width: `${latestFrame ? latestFrame.motion_anomaly_component * 100 : 0}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-[#8C9AAA] mb-0.5">
                    <span>Quadrant Congestion (20%)</span>
                    <span className="font-mono text-white">
                      {latestFrame ? `${(latestFrame.congestion_component * 100).toFixed(0)}%` : '0%'}
                    </span>
                  </div>
                  <div className="w-full bg-[#1D2935] rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-purple-500 h-1.5"
                      style={{ width: `${latestFrame ? latestFrame.congestion_component * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Rationale Explanation */}
            <div className="mt-3 p-3 bg-[#111923]/60 rounded-lg border border-[#1D2935] text-xs">
              <span className="text-[10px] uppercase font-semibold text-[#8C9AAA] block mb-1">Automated Assessment:</span>
              <p className="text-[#F4F7FA] font-medium leading-relaxed">
                {latestFrame?.risk_explanation || 'Crowd movement and spatial density remain within safe baseline thresholds.'}
              </p>
            </div>
          </div>

          {/* Recommended Advisory Action */}
          <div className="p-3 bg-cyan-950/20 border border-cyan-500/20 rounded-lg text-xs space-y-1">
            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block">
              Advisory Operator Recommendation:
            </span>
            <p className="text-gray-300 text-[11px] leading-relaxed">
              {recentIncidents.length > 0
                ? recentIncidents[0].recommended_action || 'Maintain camera monitoring and observe pedestrian flow transitions.'
                : 'All zones operating under standard parameters. Maintain standard periodic surveillance inspection.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
