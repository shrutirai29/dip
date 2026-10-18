import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { 
  Users, 
  Activity, 
  Download, 
  Layers, 
  Compass, 
  Clock, 
  AlertTriangle,
  FileSpreadsheet,
  CheckCircle2
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area
} from 'recharts';
import { analysisApi, incidentApi } from '../services/api';
import { Analysis, FrameRecord, Incident } from '../types';

export const LiveMonitoring: React.FC = () => {
  const [searchParams] = useSearchParams();
  const analysisId = searchParams.get('analysisId');

  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<Analysis | null>(null);
  const [results, setResults] = useState<FrameRecord[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);

  // Toggle visual overlays
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showBBoxes, setShowBBoxes] = useState(true);
  const [showTrajectories, setShowTrajectories] = useState(true);

  useEffect(() => {
    loadAnalyses();
  }, []);

  const loadAnalyses = async () => {
    try {
      const data = await analysisApi.getAll();
      setAnalyses(data);
      if (data.length > 0) {
        const target = analysisId ? data.find((a) => a.id === analysisId) || data[0] : data[0];
        setSelectedAnalysis(target);
        loadSessionDetails(target.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadSessionDetails = async (id: string) => {
    setLoading(true);
    try {
      const [resData, incData] = await Promise.all([
        analysisApi.getResults(id),
        incidentApi.getAll(),
      ]);
      setResults(resData);
      setIncidents(incData.filter((i) => i.analysis_id === id));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAnalysis = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    const found = analyses.find((a) => a.id === id);
    if (found) {
      setSelectedAnalysis(found);
      loadSessionDetails(found.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Session Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-gray-800 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Live & Replay Crowd Intelligence</h1>
          <p className="text-sm text-gray-400 mt-1">
            Frame-accurate AI detections, DIP density splatting, and temporal motion telemetry
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={selectedAnalysis?.id || ''}
            onChange={handleSelectAnalysis}
            className="bg-[#111827] border border-gray-700 text-xs text-white rounded-lg px-3 py-2"
          >
            {analyses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.id} ({a.status.toUpperCase()} - {a.created_at.slice(0, 10)})
              </option>
            ))}
          </select>

          {selectedAnalysis && (
            <a
              href={analysisApi.getExportUrl(selectedAnalysis.id)}
              download
              className="flex items-center space-x-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs font-medium border border-gray-700 transition"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Export CSV Audit</span>
            </a>
          )}
        </div>
      </div>

      {/* Main Video View & Live Metrics Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Video Player (Annotated with DIP Heatmap) */}
        <div className="lg:col-span-2 bg-[#111827] border border-gray-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
              <h3 className="text-sm font-semibold text-white">Annotated DIP Surveillance Stream</h3>
            </div>
            <div className="flex items-center space-x-2 text-xs text-gray-400">
              <span className="font-mono">{selectedAnalysis?.processing_fps || 0} FPS Processed</span>
            </div>
          </div>

          <div className="aspect-video bg-black rounded-lg overflow-hidden border border-gray-800 relative">
            {selectedAnalysis?.annotated_video_path ? (
              <video
                src={selectedAnalysis.annotated_video_path}
                controls
                autoPlay
                loop
                className="w-full h-full object-contain"
              />
            ) : selectedAnalysis?.heatmap_preview_path ? (
              <img
                src={selectedAnalysis.heatmap_preview_path}
                alt="Heatmap Preview"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
                No processed video available for this analysis session.
              </div>
            )}
          </div>

          {/* Quick HUD Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
            <div className="p-3 bg-gray-900/60 rounded-lg border border-gray-800">
              <span className="text-gray-400 block text-[11px]">Peak Person Count</span>
              <span className="text-xl font-bold text-white mt-1 block">
                {selectedAnalysis?.peak_count || 0}
              </span>
            </div>
            <div className="p-3 bg-gray-900/60 rounded-lg border border-gray-800">
              <span className="text-gray-400 block text-[11px]">Average Risk Score</span>
              <span className="text-xl font-bold text-cyan-400 mt-1 block">
                {selectedAnalysis?.avg_risk_score.toFixed(1) || '0.0'}
              </span>
            </div>
            <div className="p-3 bg-gray-900/60 rounded-lg border border-gray-800">
              <span className="text-gray-400 block text-[11px]">Max Risk Score</span>
              <span className="text-xl font-bold text-rose-400 mt-1 block">
                {selectedAnalysis?.max_risk_score.toFixed(1) || '0.0'}
              </span>
            </div>
            <div className="p-3 bg-gray-900/60 rounded-lg border border-gray-800">
              <span className="text-gray-400 block text-[11px]">High-Risk Duration</span>
              <span className="text-xl font-bold text-amber-400 mt-1 block">
                {selectedAnalysis?.high_risk_duration_sec || 0}s
              </span>
            </div>
          </div>
        </div>

        {/* Real-time Explainability & Incident Log */}
        <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="pb-3 mb-3 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Explainable Risk Factors</h3>
              <span className="text-[10px] text-gray-400 font-mono">DIP Heuristic Engine</span>
            </div>

            {results.length > 0 ? (
              <div className="space-y-4">
                {/* Last recorded frame metrics breakdown */}
                {(() => {
                  const latest = results[results.length - 1];
                  return (
                    <div className="space-y-3">
                      <div className="p-3 bg-gray-900/60 rounded-lg border border-gray-800">
                        <span className="text-xs text-gray-400 block mb-1">Latest Risk Rationale:</span>
                        <p className="text-xs text-gray-200 font-medium">{latest.risk_explanation}</p>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div>
                          <div className="flex justify-between text-gray-400 mb-1">
                            <span>Density Pressure (35%)</span>
                            <span className="font-mono text-white">{(latest.density_component * 100).toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-cyan-500 h-1.5" style={{ width: `${latest.density_component * 100}%` }} />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-gray-400 mb-1">
                            <span>Crowd Growth / Surge (20%)</span>
                            <span className="font-mono text-white">{(latest.growth_component * 100).toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-amber-500 h-1.5" style={{ width: `${latest.growth_component * 100}%` }} />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-gray-400 mb-1">
                            <span>Optical Flow Anomaly (25%)</span>
                            <span className="font-mono text-white">{(latest.motion_anomaly_component * 100).toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-rose-500 h-1.5" style={{ width: `${latest.motion_anomaly_component * 100}%` }} />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-gray-400 mb-1">
                            <span>Grid Congestion (20%)</span>
                            <span className="font-mono text-white">{(latest.congestion_component * 100).toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-purple-500 h-1.5" style={{ width: `${latest.congestion_component * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <p className="text-xs text-gray-500 py-6 text-center">No frame telemetry recorded yet.</p>
            )}

            {/* Incidents within this session */}
            <div className="mt-6 pt-4 border-t border-gray-800">
              <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                Session Incidents ({incidents.length})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {incidents.length === 0 ? (
                  <p className="text-xs text-gray-500">No safety thresholds breached during session.</p>
                ) : (
                  incidents.map((inc) => (
                    <div key={inc.id} className="p-2 bg-gray-900 rounded border border-gray-800 text-xs">
                      <div className="flex justify-between items-center text-[10px] text-gray-400">
                        <span className="text-rose-400 font-bold uppercase">{inc.severity}</span>
                        <span>t={inc.video_timestamp_sec}s</span>
                      </div>
                      <p className="text-gray-300 mt-1 text-[11px] font-medium">{inc.trigger_reason}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-800 text-[11px] text-gray-500 text-center">
            Advisory risk rating powered by Farneback Optical Flow & Spatial Splatting.
          </div>
        </div>
      </div>

      {/* Telemetry Charts: Crowd Count & Risk Score Over Time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Crowd Count Timeline */}
        <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Person Count Dynamics Over Time</h3>
            <span className="text-xs text-gray-400 font-mono">Detections / Frame</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={results}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="timestamp_sec" stroke="#4b5563" tick={{ fontSize: 11 }} unit="s" />
                <YAxis stroke="#4b5563" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="person_count" stroke="#06b6d4" fillOpacity={1} fill="url(#colorCount)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Risk Score Timeline */}
        <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Smoothed Crowd-Risk Index (0-100)</h3>
            <span className="text-xs text-amber-400 font-mono">Thresholds: 25 | 50 | 75</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={results}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="timestamp_sec" stroke="#4b5563" tick={{ fontSize: 11 }} unit="s" />
                <YAxis stroke="#4b5563" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', fontSize: '12px' }}
                />
                <Line
                  type="monotone"
                  dataKey="smoothed_risk_score"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
