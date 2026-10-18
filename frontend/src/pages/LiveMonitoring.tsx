import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Users, 
  Activity, 
  TrendingUp, 
  Compass, 
  Layers, 
  Clock, 
  FileSpreadsheet, 
  AlertTriangle,
  Play,
  Pause,
  RotateCcw
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area
} from 'recharts';
import { analysisApi, incidentApi } from '../services/api';
import { Analysis, FrameRecord, Incident, GridDensityCell } from '../types';

export const LiveMonitoring: React.FC = () => {
  const [searchParams] = useSearchParams();
  const analysisId = searchParams.get('analysisId');

  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<Analysis | null>(null);
  const [results, setResults] = useState<FrameRecord[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<FrameRecord | null>(null);
  const [selectedZone, setSelectedZone] = useState<GridDensityCell | null>(null);

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
    try {
      const [resData, incData] = await Promise.all([
        analysisApi.getResults(id),
        incidentApi.getAll(),
      ]);
      setResults(resData);
      setIncidents(incData.filter((i) => i.analysis_id === id));
      if (resData.length > 0) {
        const latest = resData[resData.length - 1];
        setSelectedFrame(latest);
        if (latest.grid_density && latest.grid_density.length > 0) {
          setSelectedZone(latest.grid_density[4]); // Center Zone B2 default
        }
      }
    } catch (err) {
      console.error(err);
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

  // Synchronized scrubbing: click on any chart point to inspect that frame's telemetry
  const handleChartClick = (e: any) => {
    if (e && e.activePayload && e.activePayload.length > 0) {
      const record = e.activePayload[0].payload as FrameRecord;
      setSelectedFrame(record);
      if (record.grid_density && record.grid_density.length > 0) {
        setSelectedZone(record.grid_density[4]);
      }
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header and Session Selection */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-[#1D2935] gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">LIVE & REPLAY MULTI-CHANNEL TELEMETRY</h1>
          <p className="text-xs text-[#8C9AAA] mt-0.5">
            Synchronized video playback, Farneback optical flow velocity field, and interactive 3×3 spatial zone matrices
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={selectedAnalysis?.id || ''}
            onChange={handleSelectAnalysis}
            className="bg-[#0D131C] border border-[#1D2935] text-xs text-white rounded-lg px-3 py-2"
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
              className="flex items-center space-x-1.5 px-3 py-2 bg-[#111923] hover:bg-[#1D2935] text-white rounded-lg text-xs font-medium border border-[#1D2935] transition"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export CSV</span>
            </a>
          )}
        </div>
      </div>

      {/* Main Split Screen: Video + Interactive 3x3 Zone Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Annotated Video Screen */}
        <div className="lg:col-span-2 bg-[#0D131C] border border-[#1D2935] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
              <h3 className="text-sm font-semibold text-white">Annotated DIP Surveillance Stream</h3>
            </div>
            <div className="flex items-center space-x-3 text-xs text-[#8C9AAA] font-mono">
              <span>Time: t={selectedFrame?.timestamp_sec || 0}s</span>
              <span>Pattern: {selectedFrame?.detected_pattern || 'NORMAL_FLOW'}</span>
            </div>
          </div>

          <div className="aspect-video bg-black rounded-lg overflow-hidden border border-[#1D2935] relative">
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
              <div className="w-full h-full flex items-center justify-center text-[#8C9AAA] text-xs">
                No processed video available.
              </div>
            )}
          </div>

          {/* Quick Telemetry Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-[#111923] rounded-lg border border-[#1D2935]">
              <span className="text-[10px] text-[#8C9AAA] block">Observed People</span>
              <span className="text-lg font-bold text-white mt-1 block">
                {selectedFrame?.person_count || 0}
              </span>
            </div>
            <div className="p-3 bg-[#111923] rounded-lg border border-[#1D2935]">
              <span className="text-[10px] text-[#8C9AAA] block">Current Risk</span>
              <span className="text-lg font-bold text-amber-400 mt-1 block">
                {selectedFrame?.smoothed_risk_score.toFixed(1) || '0.0'}
              </span>
            </div>
            <div className="p-3 bg-[#111923] rounded-lg border border-[#1D2935]">
              <span className="text-[10px] text-[#8C9AAA] block">Forecast (+10s)</span>
              <span className="text-lg font-bold text-rose-400 mt-1 block">
                {selectedFrame?.forecast_risk_10s.toFixed(1) || '0.0'}
              </span>
            </div>
            <div className="p-3 bg-[#111923] rounded-lg border border-[#1D2935]">
              <span className="text-[10px] text-[#8C9AAA] block">Directional Entropy</span>
              <span className="text-lg font-bold text-cyan-400 mt-1 block">
                {selectedFrame?.directional_entropy.toFixed(3) || '0.000'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Interactive 3x3 Spatial Grid Telemetry */}
        <div className="bg-[#0D131C] border border-[#1D2935] rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#1D2935]">
              <div>
                <h3 className="text-sm font-semibold text-white">Spatial 3×3 Grid Matrix</h3>
                <p className="text-[10px] text-[#8C9AAA]">Click any quadrant to inspect localized telemetry</p>
              </div>
              <span className="text-[10px] font-mono text-cyan-400">9 Zones (A1–C3)</span>
            </div>

            {/* 3x3 Interactive Grid */}
            <div className="grid grid-cols-3 gap-2 mt-3">
              {selectedFrame?.grid_density ? (
                selectedFrame.grid_density.map((zone) => {
                  const isSelected = selectedZone?.name === zone.name;
                  const isCritical = zone.density_level === 'Critical';
                  const isHigh = zone.density_level === 'High';
                  const isMod = zone.density_level === 'Moderate';
                  
                  return (
                    <button
                      key={zone.name}
                      onClick={() => setSelectedZone(zone)}
                      className={`p-2.5 rounded-lg border text-left transition relative ${
                        isSelected
                          ? 'border-cyan-400 bg-cyan-950/30'
                          : isCritical
                          ? 'border-rose-500/40 bg-rose-950/20'
                          : isHigh
                          ? 'border-amber-500/40 bg-amber-950/20'
                          : 'border-[#1D2935] bg-[#111923]'
                      }`}
                    >
                      <div className="flex justify-between items-center text-[10px] text-[#8C9AAA]">
                        <span className="font-bold text-white">{zone.name.replace('Zone ', '')}</span>
                        <span className={`font-mono text-[9px] ${
                          isCritical ? 'text-rose-400' : isHigh ? 'text-amber-400' : 'text-emerald-400'
                        }`}>
                          {zone.density_level[0]}
                        </span>
                      </div>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className="text-sm font-bold text-white">{zone.population}</span>
                        <span className="text-[9px] text-[#8C9AAA] font-mono">r:{zone.zone_risk}</span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="col-span-3 py-6 text-center text-xs text-[#8C9AAA]">
                  No zone telemetry loaded.
                </div>
              )}
            </div>

            {/* Selected Zone Deep Dive */}
            {selectedZone && (
              <div className="mt-4 p-3.5 bg-[#111923] rounded-lg border border-[#1D2935] space-y-2 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-[#1D2935]">
                  <span className="font-bold text-white">{selectedZone.name} Detailed Telemetry</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                    selectedZone.density_level === 'Critical' ? 'bg-rose-500/20 text-rose-400' :
                    selectedZone.density_level === 'High' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {selectedZone.density_level}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                  <div>
                    <span className="text-[#8C9AAA] block text-[10px]">Population:</span>
                    <span className="font-bold text-white">{selectedZone.population} persons</span>
                  </div>
                  <div>
                    <span className="text-[#8C9AAA] block text-[10px]">Normalized Density:</span>
                    <span className="font-bold text-white">{(selectedZone.normalized_density * 100).toFixed(0)}%</span>
                  </div>
                  <div>
                    <span className="text-[#8C9AAA] block text-[10px]">Mean Velocity:</span>
                    <span className="font-bold text-white">{selectedZone.avg_velocity} px/s</span>
                  </div>
                  <div>
                    <span className="text-[#8C9AAA] block text-[10px]">Inflow / Outflow:</span>
                    <span className="font-bold text-white">+{selectedZone.inflow} / -{selectedZone.outflow}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#1D2935]">
                  <span className="text-[#8C9AAA] text-[10px] block">Quadrant Pattern:</span>
                  <span className={`font-semibold ${selectedZone.pattern === 'BOTTLENECK' ? 'text-rose-400' : 'text-cyan-400'}`}>
                    {selectedZone.pattern}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="text-[10px] text-[#8C9AAA] text-center pt-2 border-t border-[#1D2935]">
            Click any point on the bottom charts to scrub and inspect that exact timestamp.
          </div>
        </div>
      </div>

      {/* Synchronized Telemetry Charts (Clickable) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk & Short-Term Forecast Chart */}
        <div className="bg-[#0D131C] border border-[#1D2935] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
              Current Risk vs Forecast (+10s) Timeline
            </h3>
            <span className="text-[10px] font-mono text-cyan-400">Click point to scrub</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={results} onClick={handleChartClick}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1D2935" />
                <XAxis dataKey="timestamp_sec" stroke="#8C9AAA" tick={{ fontSize: 10 }} unit="s" />
                <YAxis stroke="#8C9AAA" domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0D131C', borderColor: '#1D2935', fontSize: '11px' }}
                />
                <Line
                  type="monotone"
                  dataKey="smoothed_risk_score"
                  name="Current Risk"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="forecast_risk_10s"
                  name="Forecast (+10s)"
                  stroke="#ef4444"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Optical Flow Magnitude & Directional Entropy Chart */}
        <div className="bg-[#0D131C] border border-[#1D2935] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
              Farneback Optical Flow & Directional Entropy
            </h3>
            <span className="text-[10px] font-mono text-cyan-400">DIP Motion Features</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={results} onClick={handleChartClick}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1D2935" />
                <XAxis dataKey="timestamp_sec" stroke="#8C9AAA" tick={{ fontSize: 10 }} unit="s" />
                <YAxis stroke="#8C9AAA" tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0D131C', borderColor: '#1D2935', fontSize: '11px' }}
                />
                <Line
                  type="monotone"
                  dataKey="optical_flow_magnitude"
                  name="Optical Flow Mag (px)"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="mean_speed_pixels"
                  name="Velocity (px/s)"
                  stroke="#a855f7"
                  strokeWidth={1.5}
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
