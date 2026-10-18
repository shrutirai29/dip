import React, { useState, useEffect } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area
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

  const meanSpeed = frameData.length > 0
    ? (frameData.reduce((acc, f) => acc + f.mean_speed_pixels, 0) / frameData.length).toFixed(1)
    : '0.0';
    
  const meanFlow = frameData.length > 0
    ? (frameData.reduce((acc, f) => acc + f.optical_flow_magnitude, 0) / frameData.length).toFixed(1)
    : '0.0';

  const meanEntropy = frameData.length > 0
    ? (frameData.reduce((acc, f) => acc + f.directional_entropy, 0) / frameData.length).toFixed(3)
    : '0.000';

  const meanAccel = frameData.length > 0
    ? (frameData.reduce((acc, f) => acc + f.mean_acceleration, 0) / frameData.length).toFixed(2)
    : '0.00';

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-[#1D2935] gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">ADVANCED CROWD DYNAMICS & PREDICTIVE ANALYTICS</h1>
          <p className="text-xs text-[#8C9AAA] mt-0.5">
            Temporal feature decomposition: Farneback optical flow fields, Shannon entropy, and multi-horizon forecasts
          </p>
        </div>

        <select
          value={selectedAnalysisId}
          onChange={(e) => handleSelect(e.target.value)}
          className="bg-[#0D131C] border border-[#1D2935] text-xs text-white rounded-lg px-3 py-2"
        >
          {analyses.map((a) => (
            <option key={a.id} value={a.id}>
              {a.id} ({a.created_at.slice(0, 10)})
            </option>
          ))}
        </select>
      </div>

      {/* Top 4 Telemetry Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-[#0D131C] border border-[#1D2935] rounded-xl p-4">
          <span className="text-[10px] text-[#8C9AAA] uppercase tracking-wider font-semibold">Mean Flow Speed</span>
          <div className="flex items-baseline space-x-1.5 mt-1.5">
            <span className="text-xl font-bold text-cyan-400">{meanSpeed}</span>
            <span className="text-[10px] text-[#8C9AAA]">px / sec</span>
          </div>
          <span className="text-[9px] text-[#8C9AAA] mt-1 block">Tracked centroid displacement</span>
        </div>

        <div className="bg-[#0D131C] border border-[#1D2935] rounded-xl p-4">
          <span className="text-[10px] text-[#8C9AAA] uppercase tracking-wider font-semibold">Optical Flow Magnitude</span>
          <div className="flex items-baseline space-x-1.5 mt-1.5">
            <span className="text-xl font-bold text-amber-400">{meanFlow}</span>
            <span className="text-[10px] text-[#8C9AAA]">px / frame</span>
          </div>
          <span className="text-[9px] text-[#8C9AAA] mt-1 block">Farneback dense motion field</span>
        </div>

        <div className="bg-[#0D131C] border border-[#1D2935] rounded-xl p-4">
          <span className="text-[10px] text-[#8C9AAA] uppercase tracking-wider font-semibold">Directional Entropy</span>
          <div className="flex items-baseline space-x-1.5 mt-1.5">
            <span className="text-xl font-bold text-purple-400">{meanEntropy}</span>
            <span className="text-[10px] text-[#8C9AAA]">Shannon H / H_max</span>
          </div>
          <span className="text-[9px] text-[#8C9AAA] mt-1 block">Angular vector disorder index</span>
        </div>

        <div className="bg-[#0D131C] border border-[#1D2935] rounded-xl p-4">
          <span className="text-[10px] text-[#8C9AAA] uppercase tracking-wider font-semibold">Crowd Acceleration</span>
          <div className="flex items-baseline space-x-1.5 mt-1.5">
            <span className="text-xl font-bold text-rose-400">{meanAccel}</span>
            <span className="text-[10px] text-[#8C9AAA]">px / sec²</span>
          </div>
          <span className="text-[9px] text-[#8C9AAA] mt-1 block">Velocity surge gradient</span>
        </div>
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Forecast Comparison Chart */}
        <div className="bg-[#0D131C] border border-[#1D2935] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
              Current Risk vs Multi-Horizon Forecast (+5s, +10s, +15s)
            </h3>
            <span className="text-[10px] font-mono text-cyan-400">Uncalibrated Trend Extrapolation</span>
          </div>
          <p className="text-[10px] text-[#8C9AAA] mb-2 font-mono">
            *Experimental extrapolation from local velocity gradients; not calibrated disaster probability.
          </p>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={frameData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1D2935" />
                <XAxis dataKey="timestamp_sec" stroke="#8C9AAA" tick={{ fontSize: 10 }} unit="s" />
                <YAxis stroke="#8C9AAA" domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0D131C', borderColor: '#1D2935', fontSize: '11px' }}
                />
                <Line type="monotone" dataKey="smoothed_risk_score" name="Current Risk" stroke="#f59e0b" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="forecast_risk_5s" name="Forecast +5s" stroke="#38bdf8" strokeDasharray="3 3" dot={false} />
                <Line type="monotone" dataKey="forecast_risk_10s" name="Forecast +10s" stroke="#ef4444" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                <Line type="monotone" dataKey="forecast_risk_15s" name="Forecast +15s" stroke="#a855f7" strokeDasharray="2 2" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Directional Shannon Entropy & Velocity Dynamics */}
        <div className="bg-[#0D131C] border border-[#1D2935] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
              Directional Shannon Entropy & Flow Irregularity
            </h3>
            <span className="text-[10px] font-mono text-cyan-400">Turbulence / Panic Index</span>
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={frameData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1D2935" />
                <XAxis dataKey="timestamp_sec" stroke="#8C9AAA" tick={{ fontSize: 10 }} unit="s" />
                <YAxis stroke="#8C9AAA" tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0D131C', borderColor: '#1D2935', fontSize: '11px' }}
                />
                <Line type="monotone" dataKey="directional_entropy" name="Directional Entropy (0-1)" stroke="#a855f7" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="motion_variance" name="Motion Variance" stroke="#06b6d4" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 4 Normalized Risk Factor Components */}
        <div className="bg-[#0D131C] border border-[#1D2935] rounded-xl p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
              Four Component Heuristic Progression (0.0 to 1.0 Normalized)
            </h3>
            <span className="text-[10px] font-mono text-[#8C9AAA]">Density (35%) • Growth (20%) • Motion (25%) • Congestion (20%)</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={frameData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1D2935" />
                <XAxis dataKey="timestamp_sec" stroke="#8C9AAA" tick={{ fontSize: 10 }} unit="s" />
                <YAxis stroke="#8C9AAA" domain={[0, 1]} tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0D131C', borderColor: '#1D2935', fontSize: '11px' }}
                />
                <Area type="monotone" dataKey="density_component" name="Density Pressure" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.15} />
                <Area type="monotone" dataKey="growth_component" name="Surge Influx" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} />
                <Area type="monotone" dataKey="motion_anomaly_component" name="Motion Anomaly" stroke="#ef4444" fill="#ef4444" fillOpacity={0.15} />
                <Area type="monotone" dataKey="congestion_component" name="Grid Congestion" stroke="#a855f7" fill="#a855f7" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
