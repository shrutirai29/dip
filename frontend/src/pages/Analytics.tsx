import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Activity, 
  Compass, 
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area, BarChart, Bar
} from 'recharts';
import { analysisApi } from '../services/api';
import { Analysis, FrameRecord } from '../types';

export const Analytics: React.FC = () => {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string>('');
  const [frameData, setFrameData] = useState<FrameRecord[]>([]);

  useEffect(() => {
    loadAnalyses();
  }, []);

  const loadAnalyses = async () => {
    try {
      const data = await analysisApi.getAll();
      setAnalyses(data);
      if (data.length > 0) {
        setSelectedAnalysisId(data[0].id);
        loadFrames(data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadFrames = async (id: string) => {
    try {
      const frames = await analysisApi.getResults(id);
      setFrameData(frames);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelect = (id: string) => {
    setSelectedAnalysisId(id);
    loadFrames(id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-gray-800 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Crowd Dynamics & Movement Analytics</h1>
          <p className="text-sm text-gray-400 mt-1">
            Multivariate temporal breakdown of velocity, optical flow, and spatial density vectors
          </p>
        </div>

        <select
          value={selectedAnalysisId}
          onChange={(e) => handleSelect(e.target.value)}
          className="bg-[#111827] border border-gray-700 text-xs text-white rounded-lg px-3 py-2"
        >
          {analyses.map((a) => (
            <option key={a.id} value={a.id}>
              {a.id} ({a.created_at.slice(0, 10)})
            </option>
          ))}
        </select>
      </div>

      {/* Top 3 KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
          <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Mean Flow Speed</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-2xl font-bold text-cyan-400">
              {frameData.length > 0 
                ? (frameData.reduce((acc, f) => acc + f.mean_speed_pixels, 0) / frameData.length).toFixed(1)
                : '0.0'}
            </span>
            <span className="text-xs text-gray-500">pixels / second</span>
          </div>
          <span className="text-[11px] text-gray-500 mt-2 block">Track ID centroid displacement</span>
        </div>

        <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
          <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Optical Flow Magnitude</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-2xl font-bold text-amber-400">
              {frameData.length > 0
                ? (frameData.reduce((acc, f) => acc + f.optical_flow_magnitude, 0) / frameData.length).toFixed(1)
                : '0.0'}
            </span>
            <span className="text-xs text-gray-500">px / frame</span>
          </div>
          <span className="text-[11px] text-gray-500 mt-2 block">Dense Gunnar Farneback differential field</span>
        </div>

        <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
          <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Congestion Pressure</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-2xl font-bold text-rose-400">
              {frameData.length > 0
                ? (frameData.reduce((acc, f) => acc + f.congestion_component, 0) / frameData.length * 100).toFixed(0)
                : '0'}%
            </span>
            <span className="text-xs text-gray-500">mean concentration</span>
          </div>
          <span className="text-[11px] text-gray-500 mt-2 block">Localized 3x3 grid concentration ratio</span>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Optical Flow vs Velocity */}
        <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Motion Dynamics: Optical Flow vs Speed</h3>
            <span className="text-xs text-cyan-400 font-mono">DIP Farneback (px)</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={frameData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="timestamp_sec" stroke="#4b5563" tick={{ fontSize: 11 }} unit="s" />
                <YAxis stroke="#4b5563" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', fontSize: '12px' }}
                />
                <Line
                  type="monotone"
                  dataKey="optical_flow_magnitude"
                  name="Optical Flow (px)"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="mean_speed_pixels"
                  name="Mean Velocity (px/s)"
                  stroke="#fbbf24"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 4 Risk Components Breakdown */}
        <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Heuristic Components Progression</h3>
            <span className="text-xs text-gray-400 font-mono">0.0 to 1.0 Normalized</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={frameData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="timestamp_sec" stroke="#4b5563" tick={{ fontSize: 11 }} unit="s" />
                <YAxis stroke="#4b5563" domain={[0, 1]} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="density_component" name="Density (35%)" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.2} />
                <Area type="monotone" dataKey="growth_component" name="Growth (20%)" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />
                <Area type="monotone" dataKey="motion_anomaly_component" name="Motion (25%)" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
