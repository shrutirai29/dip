import React, { useState, useEffect, useCallback } from 'react';
import { 
  Camera, 
  Play, 
  Square, 
  AlertTriangle, 
  Clock, 
  ExternalLink
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cameraApi } from '../services/api';
import { CameraSessionStatus } from '../types';

export const WebcamIngestionPanel: React.FC = () => {
  const [status, setStatus] = useState<CameraSessionStatus | null>(null);
  const [deviceIndex, setDeviceIndex] = useState<number>(0);
  const [targetFps, setTargetFps] = useState<number>(25);
  const [confThreshold, setConfThreshold] = useState<number>(0.25);
  const [perspectiveWeight, setPerspectiveWeight] = useState<number>(1.0);
  const [privacyMode, setPrivacyMode] = useState<string>('none');

  const [loading, setLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Poll camera status
  const fetchStatus = useCallback(async () => {
    try {
      const data = await cameraApi.getStatus();
      setStatus(data);
    } catch (err) {
      console.error('Failed to query camera status:', err);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = window.setInterval(fetchStatus, 1500);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleStart = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await cameraApi.start({
        device_index: deviceIndex,
        target_fps: targetFps,
        conf_threshold: confThreshold,
        perspective_weight: perspectiveWeight,
        privacy_mode: privacyMode,
      });
      setStatus(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect to local webcam device.';
      setActionError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await cameraApi.stop();
      setStatus(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to stop camera session.';
      setActionError(msg);
    } finally {
      setLoading(false);
    }
  };

  const isActive = status?.is_active || false;
  const currentState = status?.state || 'IDLE';

  const stateColors = {
    IDLE: 'bg-slate-800 text-slate-300 border-slate-700',
    CONNECTING: 'bg-cyan-950/40 text-cyan-300 border-cyan-500/30 animate-pulse',
    CONNECTED: 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30',
    DEGRADED: 'bg-amber-950/40 text-amber-300 border-amber-500/30',
    DISCONNECTED: 'bg-rose-950/40 text-rose-300 border-rose-500/30',
  };

  return (
    <div className="space-y-6">
      {/* Configuration & Controls Strip */}
      <div className="rounded-xl border border-[#192638] bg-[#0A1018] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#192638] gap-3">
          <div className="flex items-center space-x-2.5">
            <Camera className="w-5 h-5 text-cyan-400" />
            <div>
              <h3 className="text-sm font-semibold text-white tracking-wide">
                Local Hardware Webcam Ingestion
              </h3>
              <p className="text-[11px] text-slate-400">
                Direct OpenCV VideoCapture ingestion with bounded latest-frame buffering & live DIP telemetry
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium border ${stateColors[currentState] || stateColors.IDLE}`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${
                currentState === 'CONNECTED' ? 'bg-emerald-400' :
                currentState === 'CONNECTING' ? 'bg-cyan-400 animate-ping' :
                currentState === 'DEGRADED' ? 'bg-amber-400' :
                currentState === 'DISCONNECTED' ? 'bg-rose-400' : 'bg-slate-400'
              }`} />
              {currentState}
            </span>
          </div>
        </div>

        {/* Error Notice */}
        {(actionError || (currentState === 'DISCONNECTED' && status?.error_message)) && (
          <div className="p-3 bg-rose-950/20 border border-rose-500/30 rounded-lg text-xs text-rose-200 flex items-start space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold block">Camera Ingestion Notice:</span>
              <p className="text-[11px] text-rose-300 leading-relaxed">
                {actionError || status?.error_message}
              </p>
              <p className="text-[10px] text-slate-400 pt-1">
                Tip: Ensure your webcam is securely connected, not in use by Zoom/Teams/OBS, and that Windows Camera permissions allow desktop apps.
              </p>
            </div>
          </div>
        )}

        {/* Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Device Index */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block">
              Webcam Device Index
            </label>
            <select
              disabled={isActive || loading}
              value={deviceIndex}
              onChange={(e) => setDeviceIndex(Number(e.target.value))}
              className="w-full bg-[#111923] border border-[#192638] text-white rounded-lg px-3 py-2 text-xs font-mono focus:border-cyan-500 disabled:opacity-50 cursor-pointer"
            >
              <option value={0}>Camera #0 (Default Integrated)</option>
              <option value={1}>Camera #1 (Secondary / USB)</option>
              <option value={2}>Camera #2 (Auxiliary Video)</option>
            </select>
          </div>

          {/* Target Capture Rate */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block">
              Capture Pacing
            </label>
            <select
              disabled={isActive || loading}
              value={targetFps}
              onChange={(e) => setTargetFps(Number(e.target.value))}
              className="w-full bg-[#111923] border border-[#192638] text-white rounded-lg px-3 py-2 text-xs font-mono focus:border-cyan-500 disabled:opacity-50 cursor-pointer"
            >
              <option value={15}>15 FPS (Resource Saver)</option>
              <option value={25}>25 FPS (Standard CCTV)</option>
              <option value={30}>30 FPS (High Smoothness)</option>
            </select>
          </div>

          {/* Privacy Filtering */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block">
              Privacy Mode
            </label>
            <select
              disabled={isActive || loading}
              value={privacyMode}
              onChange={(e) => setPrivacyMode(e.target.value)}
              className="w-full bg-[#111923] border border-[#192638] text-white rounded-lg px-3 py-2 text-xs font-mono focus:border-cyan-500 disabled:opacity-50 cursor-pointer"
            >
              <option value="none">Standard Surveillance (Unfiltered)</option>
              <option value="face_blur">Face Blurring (Gaussian)</option>
              <option value="full_anonymize">Full Silhouette Anonymization</option>
            </select>
          </div>

          {/* Action Button */}
          <div className="space-y-1.5 flex flex-col justify-end">
            <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block invisible">
              Action
            </label>
            {isActive ? (
              <button
                onClick={handleStop}
                disabled={loading}
                className="w-full inline-flex items-center justify-center space-x-2 px-4 py-2 bg-rose-600/25 hover:bg-rose-600/40 text-rose-300 border border-rose-500/40 rounded-lg text-xs font-medium transition cursor-pointer disabled:opacity-50"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>{loading ? 'Releasing...' : 'Disconnect Camera'}</span>
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={loading}
                className="w-full inline-flex items-center justify-center space-x-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-medium transition cursor-pointer disabled:opacity-50 shadow-sm"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{loading ? 'Initializing...' : 'Start Webcam Ingestion'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Live Stream Viewport & Telemetry HUD */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Live Video Display */}
        <div className="lg:col-span-2 rounded-xl border border-[#192638] bg-[#0A1018] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'}`} />
              <h4 className="text-xs font-semibold text-white tracking-wide uppercase">
                Webcam Stream Viewport
              </h4>
              {isActive && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950/40 text-cyan-300 border border-cyan-500/30">
                  LIVE MJPEG FEED
                </span>
              )}
            </div>

            {status?.latest_frame_timestamp ? (
              <div className="flex items-center space-x-2 text-[10px] font-mono text-slate-400">
                <Clock className="w-3 h-3 text-cyan-400" />
                <span>Frame #{status.latest_frame_id}</span>
                <span>•</span>
                <span>{new Date(status.latest_frame_timestamp * 1000).toLocaleTimeString()}</span>
              </div>
            ) : null}
          </div>

          {/* Viewport Frame */}
          <div className="aspect-video bg-[#070B10] rounded-lg overflow-hidden border border-[#192638] relative flex items-center justify-center">
            {isActive ? (
              <img
                src={cameraApi.getStreamUrl()}
                alt="Live Camera Surveillance Feed"
                className="w-full h-full object-contain"
                onError={(e) => {
                  // Fallback if MJPEG stream encounters frame delay
                  e.currentTarget.style.opacity = '0.7';
                }}
              />
            ) : (
              <div className="text-center p-8 space-y-3">
                <div className="w-12 h-12 rounded-xl bg-[#111923] border border-[#192638] flex items-center justify-center mx-auto text-slate-500">
                  <Camera className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h5 className="text-xs font-semibold text-white">Camera Feed Offline</h5>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                    Select your local webcam index above and click &quot;Start Webcam Ingestion&quot; to initiate live video acquisition.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Ingestion Telemetry & Drop Accounting */}
        <div className="rounded-xl border border-[#192638] bg-[#0A1018] p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="pb-3 border-b border-[#192638]">
              <h4 className="text-xs font-semibold text-white tracking-wide uppercase">
                Ingestion Health & Frame Accounting
              </h4>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Real-time capture pacing, drop counters, and worker telemetry
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 font-mono">
              <div className="p-3 rounded-lg bg-[#111923] border border-[#192638]">
                <span className="text-[10px] text-slate-400 block font-sans">Captured Frames</span>
                <span className="text-lg font-bold text-white mt-1 block">
                  {status?.frames_captured ?? 0}
                </span>
                <span className="text-[9px] text-slate-500 block font-sans mt-0.5">Monotonic counter</span>
              </div>

              <div className="p-3 rounded-lg bg-[#111923] border border-[#192638]">
                <span className="text-[10px] text-slate-400 block font-sans">Dropped Frames</span>
                <span className={`text-lg font-bold mt-1 block ${
                  (status?.frames_dropped || 0) > 0 ? 'text-amber-400' : 'text-slate-300'
                }`}>
                  {status?.frames_dropped ?? 0}
                </span>
                <span className="text-[9px] text-slate-500 block font-sans mt-0.5">Slow inference drops</span>
              </div>

              <div className="p-3 rounded-lg bg-[#111923] border border-[#192638]">
                <span className="text-[10px] text-slate-400 block font-sans">Capture FPS</span>
                <span className="text-lg font-bold text-cyan-400 mt-1 block">
                  {status?.measured_fps?.toFixed(1) ?? '0.0'}
                </span>
                <span className="text-[9px] text-slate-500 block font-sans mt-0.5">Camera hardware</span>
              </div>

              <div className="p-3 rounded-lg bg-[#111923] border border-[#192638]">
                <span className="text-[10px] text-slate-400 block font-sans">Inference FPS</span>
                <span className="text-lg font-bold text-emerald-400 mt-1 block">
                  {status?.processing_fps?.toFixed(1) ?? '0.0'}
                </span>
                <span className="text-[9px] text-slate-500 block font-sans mt-0.5">YOLOv8 + Optical Flow</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#111923] border border-[#192638] space-y-1 text-[11px]">
              <div className="flex justify-between text-slate-400 font-mono">
                <span>Active Device:</span>
                <span className="text-white font-bold">
                  {status?.device_index !== null ? `Device Index #${status?.device_index}` : 'None'}
                </span>
              </div>
              <div className="flex justify-between text-slate-400 font-mono">
                <span>Session Uptime:</span>
                <span className="text-cyan-300">{status?.uptime_seconds ?? 0}s</span>
              </div>
              <div className="flex justify-between text-slate-400 font-mono">
                <span>Queue Strategy:</span>
                <span className="text-slate-300">Bounded Latest-Frame</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[#192638]">
            <Link
              to="/monitoring"
              className="w-full inline-flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg bg-[#141E2B] hover:bg-[#1E2D40] text-slate-200 hover:text-white border border-[#192638] transition text-xs font-medium cursor-pointer"
            >
              <span>View Full Replay & Telemetry</span>
              <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
