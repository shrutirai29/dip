import React, { useEffect, useState } from 'react';
import { 
  Users, 
  AlertTriangle, 
  Activity, 
  TrendingUp, 
  ShieldCheck, 
  Clock, 
  PlayCircle,
  ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area
} from 'recharts';
import { analyticsApi, analysisApi, incidentApi } from '../services/api';
import { AnalyticsSummary, Analysis, Incident } from '../types';

export const Overview: React.FC = () => {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [latestAnalysis, setLatestAnalysis] = useState<Analysis | null>(null);
  const [recentIncidents, setRecentIncidents] = useState<Incident[]>([]);
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
          setLatestAnalysis(allAnalyses[0]);
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-gray-800 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Surveillance Overview & Safety Status</h1>
          <p className="text-sm text-gray-400 mt-1">
            Real-time Digital Image Processing (DIP) and crowd-dynamics early risk assessment console
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Link
            to="/video-analysis"
            className="flex items-center space-x-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition shadow-sm"
          >
            <PlayCircle className="w-4 h-4" />
            <span>Launch New Video Analysis</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs uppercase tracking-wider font-semibold">Active / Peak Crowd</span>
            <Users className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-bold text-white">{latestAnalysis ? latestAnalysis.peak_count : 0}</span>
            <span className="text-xs text-gray-500">peak persons observed</span>
          </div>
          <div className="mt-3 text-xs text-cyan-400/90 flex items-center space-x-1">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Total sessions processed: {summary?.total_analyses || 0}</span>
          </div>
        </div>

        <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs uppercase tracking-wider font-semibold">Latest Risk Score</span>
            <Activity className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-bold text-white">
              {latestAnalysis ? latestAnalysis.avg_risk_score.toFixed(1) : '0.0'}
            </span>
            <span className="text-xs text-gray-500">/ 100 max index</span>
          </div>
          <div className="mt-3 text-xs text-amber-400/90 flex items-center space-x-1">
            <span>Peak risk: {latestAnalysis ? latestAnalysis.max_risk_score.toFixed(1) : '0.0'}</span>
          </div>
        </div>

        <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs uppercase tracking-wider font-semibold">Safety Incidents</span>
            <AlertTriangle className="w-5 h-5 text-rose-500" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-bold text-white">{summary?.total_incidents || 0}</span>
            <span className="text-xs text-rose-400">({summary?.critical_incidents || 0} Critical)</span>
          </div>
          <div className="mt-3 text-xs text-gray-400 flex items-center space-x-1">
            <span>Requires human verification & review</span>
          </div>
        </div>

        <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs uppercase tracking-wider font-semibold">Processing Pipeline</span>
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-bold text-emerald-400">
              {latestAnalysis ? `${latestAnalysis.processing_fps} FPS` : 'Idle'}
            </span>
          </div>
          <div className="mt-3 text-xs text-emerald-400/90 flex items-center space-x-1">
            <span>YOLOv8 + Farneback Flow + ByteTrack</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Latest Analysis Preview + Recent Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Latest Analysis Panel */}
        <div className="lg:col-span-2 bg-[#111827] border border-gray-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-800/80">
              <div>
                <h3 className="text-base font-semibold text-white">Latest Video Analysis</h3>
                <p className="text-xs text-gray-400">
                  {latestAnalysis ? `Analysis ID: ${latestAnalysis.id}` : 'No active or completed analyses found'}
                </p>
              </div>
              {latestAnalysis && (
                <span className={`px-2.5 py-1 rounded text-xs font-medium uppercase ${
                  latestAnalysis.status === 'completed'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : latestAnalysis.status === 'processing'
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 animate-pulse'
                    : 'bg-gray-800 text-gray-300'
                }`}>
                  {latestAnalysis.status}
                </span>
              )}
            </div>

            {latestAnalysis?.annotated_video_path ? (
              <div className="relative aspect-video rounded-lg overflow-hidden bg-black border border-gray-800">
                <video
                  src={latestAnalysis.annotated_video_path}
                  controls
                  className="w-full h-full object-contain"
                  poster={latestAnalysis.heatmap_preview_path}
                />
              </div>
            ) : latestAnalysis?.heatmap_preview_path ? (
              <div className="relative aspect-video rounded-lg overflow-hidden bg-black border border-gray-800">
                <img
                  src={latestAnalysis.heatmap_preview_path}
                  alt="Heatmap Preview"
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="aspect-video rounded-lg bg-gray-900/60 border border-dashed border-gray-800 flex flex-col items-center justify-center text-center p-6 text-gray-500">
                <PlayCircle className="w-12 h-12 stroke-[1.5] mb-2 text-gray-600" />
                <p className="text-sm font-medium text-gray-400">No video processed yet</p>
                <p className="text-xs text-gray-500 mt-1 max-w-sm">
                  Upload an MP4/AVI surveillance video to trigger YOLO person detection, flow analysis, and risk scoring.
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-800 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              Confidence Threshold: {latestAnalysis?.conf_threshold || 0.25} | Stride: {latestAnalysis?.frame_stride || 2}
            </span>
            <Link
              to={latestAnalysis ? `/monitoring?analysisId=${latestAnalysis.id}` : '/video-analysis'}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-medium flex items-center space-x-1"
            >
              <span>View full metrics</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Real-time Alerts Panel */}
        <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-800/80">
              <div>
                <h3 className="text-base font-semibold text-white">Recent Safety Alerts</h3>
                <p className="text-xs text-gray-400">Automated heuristic alerts requiring audit</p>
              </div>
              <Link to="/incidents" className="text-xs text-cyan-400 hover:underline">
                View All
              </Link>
            </div>

            {recentIncidents.length === 0 ? (
              <div className="py-12 text-center text-gray-500">
                <ShieldCheck className="w-10 h-10 mx-auto stroke-[1.5] text-gray-600 mb-2" />
                <p className="text-sm">No incidents recorded</p>
                <p className="text-xs mt-1 text-gray-500">Monitored scenes are currently within safe thresholds.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentIncidents.map((inc) => (
                  <div
                    key={inc.id}
                    className="p-3 bg-gray-900/60 border border-gray-800 rounded-lg hover:border-gray-700 transition"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                        inc.severity === 'CRITICAL'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : inc.severity === 'HIGH'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      }`}>
                        {inc.severity}
                      </span>
                      <span className="text-[11px] text-gray-500 flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>t={inc.video_timestamp_sec}s</span>
                      </span>
                    </div>
                    <p className="text-xs font-medium text-gray-200 line-clamp-2">{inc.trigger_reason}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
                      <span>Risk: {inc.risk_score}</span>
                      <span className="text-cyan-400 font-mono">{inc.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-800 text-[11px] text-gray-500 text-center">
            Notice: Alerts are advisory and require human supervisor verification.
          </div>
        </div>
      </div>
    </div>
  );
};
