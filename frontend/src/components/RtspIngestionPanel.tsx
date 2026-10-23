import React, { useState, useEffect, useCallback } from 'react';
import { 
  Radio, 
  Play, 
  Square, 
  AlertTriangle, 
  ExternalLink,
  ShieldAlert,
  RotateCw,
  CheckCircle2,
  Lock,
  Activity
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cameraApi } from '../services/api';
import { CameraSessionStatus } from '../types';

export const RtspIngestionPanel: React.FC = () => {
  const [status, setStatus] = useState<CameraSessionStatus | null>(null);

  // Form parameters
  const [cameraName, setCameraName] = useState<string>('East Perimeter CCTV');
  const [rtspUrl, setRtspUrl] = useState<string>('rtsp://192.168.1.120:554/live/ch0');
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [location, setLocation] = useState<string>('Sector 4 - Perimeter North');
  const [targetFps, setTargetFps] = useState<number>(25);
  const [confThreshold, setConfThreshold] = useState<number>(0.30);
  const [perspectiveWeight, setPerspectiveWeight] = useState<number>(1.0);
  const [privacyMode, setPrivacyMode] = useState<string>('none');
  const [timeoutSec, setTimeoutSec] = useState<number>(5);
  const [maxRetries, setMaxRetries] = useState<number>(5);

  // Validation state
  const [validationLoading, setValidationLoading] = useState<boolean>(false);
  const [validationResult, setValidationResult] = useState<{
    is_valid: boolean;
    sanitized_url: string;
    host?: string;
    port?: number;
    error_message?: string;
  } | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [retryLoading, setRetryLoading] = useState<boolean>(false);

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

  const handleValidate = async () => {
    setValidationLoading(true);
    setValidationResult(null);
    setActionError(null);
    try {
      const res = await cameraApi.validateRtsp({
        rtsp_url: rtspUrl,
        username: username || undefined,
        password: password || undefined
      });
      setValidationResult(res);
      if (!res.is_valid && res.error_message) {
        setActionError(res.error_message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Validation request failed.';
      setActionError(msg);
    } finally {
      setValidationLoading(false);
    }
  };

  const handleStart = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await cameraApi.startRtsp({
        name: cameraName,
        rtsp_url: rtspUrl,
        username: username || undefined,
        password: password || undefined,
        timeout_seconds: timeoutSec,
        max_retries: maxRetries,
        target_fps: targetFps,
        conf_threshold: confThreshold,
        perspective_weight: perspectiveWeight,
        privacy_mode: privacyMode,
        location: location || undefined
      });
      setStatus(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect to RTSP camera.';
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

  const handleRetry = async () => {
    setRetryLoading(true);
    try {
      const res = await cameraApi.retryRtsp();
      setStatus(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to trigger reconnect.';
      setActionError(msg);
    } finally {
      setRetryLoading(false);
    }
  };

  const isActive = status?.is_active || false;
  const isRtspActive = isActive && status?.source_type === 'rtsp';
  const currentState = status?.state || 'IDLE';

  const stateColors: Record<string, string> = {
    IDLE: 'bg-slate-800 text-slate-300 border-slate-700',
    CONNECTING: 'bg-cyan-950/40 text-cyan-300 border-cyan-500/30 animate-pulse',
    CONNECTED: 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30',
    DEGRADED: 'bg-amber-950/40 text-amber-300 border-amber-500/30',
    RECONNECTING: 'bg-amber-950/60 text-amber-200 border-amber-500/40 animate-pulse',
    DISCONNECTED: 'bg-rose-950/40 text-rose-300 border-rose-500/30',
    ERROR: 'bg-rose-950/50 text-rose-300 border-rose-500/40',
  };

  return (
    <div className="space-y-6">
      {/* Configuration & Controls Strip */}
      <div className="rounded-xl border border-[#192638] bg-[#0A1018] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#192638] gap-3">
          <div className="flex items-center space-x-2.5">
            <Radio className="w-5 h-5 text-cyan-400" />
            <div>
              <h3 className="text-sm font-semibold text-white tracking-wide">
                Network CCTV (RTSP) Ingestion
              </h3>
              <p className="text-[11px] text-slate-400">
                Secure IP camera ingestion with SSRF destination validation, credential masking, and exponential reconnect backoff
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium border ${stateColors[currentState] || stateColors.IDLE}`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${
                currentState === 'CONNECTED' ? 'bg-emerald-400' :
                currentState === 'CONNECTING' ? 'bg-cyan-400 animate-ping' :
                currentState === 'RECONNECTING' ? 'bg-amber-400 animate-ping' :
                currentState === 'DEGRADED' ? 'bg-amber-400' :
                currentState === 'DISCONNECTED' ? 'bg-rose-400' : 'bg-slate-400'
              }`} />
              {currentState}
            </span>
          </div>
        </div>

        {/* Action Error / Diagnostic Notice */}
        {(actionError || (currentState === 'DISCONNECTED' && status?.error_message)) && (
          <div className="p-3 bg-rose-950/20 border border-rose-500/30 rounded-lg text-xs text-rose-200 flex items-start space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5 flex-1">
              <span className="font-semibold block">RTSP Connection Notice:</span>
              <p className="text-[11px] text-rose-300 leading-relaxed font-mono">
                {actionError || status?.error_message}
              </p>
              {currentState === 'RECONNECTING' && (
                <div className="flex items-center space-x-2 pt-1 text-[11px] text-amber-300">
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  <span>
                    Reconnect Attempt {status?.retry_count} / {status?.max_retries} (Backoff: {status?.next_retry_delay_sec}s)
                  </span>
                </div>
              )}
            </div>
            {currentState === 'RECONNECTING' && (
              <button
                onClick={handleRetry}
                disabled={retryLoading}
                className="px-2.5 py-1 rounded bg-amber-950/60 hover:bg-amber-900/60 text-amber-200 border border-amber-500/40 text-[11px] font-medium transition cursor-pointer shrink-0"
              >
                {retryLoading ? 'Retrying...' : 'Retry Now'}
              </button>
            )}
          </div>
        )}

        {/* Validation Result Banner */}
        {validationResult && !actionError && (
          <div className={`p-3 rounded-lg text-xs flex items-center space-x-2.5 ${
            validationResult.is_valid 
              ? 'bg-emerald-950/20 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-950/20 border border-rose-500/30 text-rose-300'
          }`}>
            {validationResult.is_valid ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <div className="text-[11px] font-mono flex-1">
              {validationResult.is_valid ? (
                <span>Destination Verified: {validationResult.sanitized_url} ({validationResult.host}:{validationResult.port})</span>
              ) : (
                <span>Destination Rejected: {validationResult.error_message}</span>
              )}
            </div>
          </div>
        )}

        {/* Stream Configuration Form */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Camera Name */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block">
              Camera Label / Identifier
            </label>
            <input
              type="text"
              value={cameraName}
              onChange={(e) => setCameraName(e.target.value)}
              disabled={isRtspActive || loading}
              placeholder="e.g. North Gate CCTV"
              className="w-full bg-[#111A26] border border-[#1E2D40] rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-400 font-mono disabled:opacity-50"
            />
          </div>

          {/* RTSP Source URL */}
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block">
              RTSP Stream URL (Authorized Camera Subnet)
            </label>
            <input
              type="text"
              value={rtspUrl}
              onChange={(e) => setRtspUrl(e.target.value)}
              disabled={isRtspActive || loading}
              placeholder="rtsp://192.168.1.120:554/live/ch0"
              className="w-full bg-[#111A26] border border-[#1E2D40] rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-400 font-mono disabled:opacity-50"
            />
          </div>

          {/* Location / Zone */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block">
              Physical Location / Sector
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={isRtspActive || loading}
              placeholder="Sector 4 - Perimeter North"
              className="w-full bg-[#111A26] border border-[#1E2D40] rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-400 font-mono disabled:opacity-50"
            />
          </div>

          {/* Credentials: Username */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 flex items-center justify-between">
              <span>Stream Username</span>
              <Lock className="w-3 h-3 text-slate-500" />
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isRtspActive || loading}
              placeholder="Optional"
              autoComplete="off"
              className="w-full bg-[#111A26] border border-[#1E2D40] rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-400 font-mono disabled:opacity-50"
            />
          </div>

          {/* Credentials: Password */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 flex items-center justify-between">
              <span>Stream Password</span>
              <Lock className="w-3 h-3 text-slate-500" />
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isRtspActive || loading}
              placeholder="••••••••"
              autoComplete="new-password"
              className="w-full bg-[#111A26] border border-[#1E2D40] rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-400 font-mono disabled:opacity-50"
            />
          </div>

          {/* Target Capture FPS */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block">
              Pacing Rate
            </label>
            <select
              disabled={isRtspActive || loading}
              value={targetFps}
              onChange={(e) => setTargetFps(Number(e.target.value))}
              className="w-full bg-[#111A26] border border-[#1E2D40] rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-400 font-mono disabled:opacity-50"
            >
              <option value={15}>15 FPS (Conserves Bandwidth)</option>
              <option value={20}>20 FPS (Standard Security)</option>
              <option value={25}>25 FPS (PAL Standard)</option>
              <option value={30}>30 FPS (NTSC High Motion)</option>
            </select>
          </div>

          {/* Privacy Preserving Mode */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block">
              Privacy Surveillance Mode
            </label>
            <select
              disabled={isRtspActive || loading}
              value={privacyMode}
              onChange={(e) => setPrivacyMode(e.target.value)}
              className="w-full bg-[#111A26] border border-[#1E2D40] rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-400 font-mono disabled:opacity-50"
            >
              <option value="none">Standard Surveillance (No Anonymization)</option>
              <option value="face_blur">Facial Region Gaussian Blurring</option>
              <option value="full_anonymize">Solid Masking Privacy Filter</option>
            </select>
          </div>
        </div>

        {/* Hyperparameter Calibration Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 border-t border-[#192638] text-xs">
          {/* Confidence Slider */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] font-mono">
              <span className="text-slate-400">Detection Confidence:</span>
              <span className="text-cyan-400 font-bold">{confThreshold.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.10"
              max="0.80"
              step="0.05"
              disabled={isRtspActive || loading}
              value={confThreshold}
              onChange={(e) => setConfThreshold(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-[#141E2B] rounded-lg appearance-none cursor-pointer accent-cyan-400 disabled:opacity-50"
            />
            <p className="text-[10px] text-slate-500">Baseline 0.30 suppresses background noise & phantom socket tracks</p>
          </div>

          {/* Perspective Weight */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] font-mono">
              <span className="text-slate-400">Perspective Horizon:</span>
              <span className="text-cyan-400 font-bold">{perspectiveWeight.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.1"
              disabled={isRtspActive || loading}
              value={perspectiveWeight}
              onChange={(e) => setPerspectiveWeight(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-[#141E2B] rounded-lg appearance-none cursor-pointer accent-cyan-400 disabled:opacity-50"
            />
            <p className="text-[10px] text-slate-500">Compensates crowd density for optical vanishing point</p>
          </div>

          {/* Reconnect Policy Settings */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] font-mono">
              <span className="text-slate-400">Reconnect Policy:</span>
              <span className="text-slate-300 font-bold">{maxRetries} Retries / {timeoutSec}s Timeout</span>
            </div>
            <div className="flex items-center space-x-2 pt-0.5">
              <select
                disabled={isRtspActive || loading}
                value={maxRetries}
                onChange={(e) => setMaxRetries(Number(e.target.value))}
                className="w-1/2 bg-[#111A26] border border-[#1E2D40] rounded px-2 py-1 text-slate-200 text-[11px] font-mono focus:border-cyan-400 disabled:opacity-50"
              >
                <option value={3}>3 Retries</option>
                <option value={5}>5 Retries (Standard)</option>
                <option value={10}>10 Retries (Persistent)</option>
              </select>
              <select
                disabled={isRtspActive || loading}
                value={timeoutSec}
                onChange={(e) => setTimeoutSec(Number(e.target.value))}
                className="w-1/2 bg-[#111A26] border border-[#1E2D40] rounded px-2 py-1 text-slate-200 text-[11px] font-mono focus:border-cyan-400 disabled:opacity-50"
              >
                <option value={3}>3s Timeout</option>
                <option value={5}>5s Timeout (Standard)</option>
                <option value={10}>10s Timeout (Slow WAN)</option>
              </select>
            </div>
            <div className="flex items-center space-x-1.5 text-[10px] text-slate-500 font-mono pt-0.5">
              <ShieldAlert className="w-3 h-3 text-cyan-400 shrink-0" />
              <span>Exponential backoff with jitter</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between pt-3 border-t border-[#192638] gap-3">
          <div className="flex items-center space-x-2 text-[11px] font-mono text-slate-400">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Credentials isolated server-side. Zero browser storage persistence.</span>
          </div>

          <div className="flex items-center space-x-3">
            {!isRtspActive && (
              <button
                onClick={handleValidate}
                disabled={validationLoading || loading || !rtspUrl.trim()}
                className="px-3.5 py-1.5 rounded-lg bg-[#111A26] hover:bg-[#192638] text-slate-300 border border-[#1E2D40] text-xs font-medium transition cursor-pointer disabled:opacity-50"
              >
                {validationLoading ? 'Probing...' : 'Validate Route'}
              </button>
            )}

            {!isRtspActive ? (
              <button
                onClick={handleStart}
                disabled={loading || !rtspUrl.trim()}
                className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold flex items-center space-x-1.5 shadow-lg shadow-cyan-950/30 transition cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{loading ? 'Initializing Stream...' : 'Connect & Start Live Stream'}</span>
              </button>
            ) : (
              <button
                onClick={handleStop}
                disabled={loading}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-lg shadow-rose-950/30 transition cursor-pointer disabled:opacity-50"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>{loading ? 'Releasing...' : 'Disconnect CCTV Feed'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Live Stream Viewport & Telemetry */}
      {isRtspActive && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* MJPEG Live Stream Viewport */}
          <div className="lg:col-span-2 rounded-xl border border-[#192638] bg-[#0A1018] overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-[#192638] bg-[#0D1520] flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-semibold text-white tracking-wide">
                  Live CCTV Stream: {status?.camera_name || 'Network Camera'}
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {status?.sanitized_url}
                </span>
              </div>
              <Link
                to="/monitoring?source=webcam"
                className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center space-x-1"
              >
                <span>Full Command Center</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>

            <div className="relative aspect-video bg-[#05080C] flex items-center justify-center overflow-hidden">
              <img
                src={cameraApi.getStreamUrl()}
                alt="Live RTSP MJPEG Feed"
                className="w-full h-full object-contain"
                onError={(e) => {
                  console.warn('MJPEG stream image error:', e);
                }}
              />
              <div className="absolute top-3 left-3 px-2 py-0.5 rounded bg-black/70 backdrop-blur-xs text-[10px] font-mono text-cyan-300 border border-cyan-500/30 flex items-center space-x-1.5">
                <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
                <span>RTSP CCTV FEED</span>
              </div>
              <div className="absolute top-3 right-3 px-2 py-0.5 rounded bg-black/70 backdrop-blur-xs text-[10px] font-mono text-slate-300 border border-slate-700">
                {status?.location || 'Sector 4'}
              </div>
            </div>
          </div>

          {/* Active Session Telemetry Strip */}
          <div className="rounded-xl border border-[#192638] bg-[#0A1018] p-4 flex flex-col justify-between space-y-4">
            <div>
              <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-3">
                Stream Telemetry & Acquisition
              </h4>
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between p-2 rounded bg-[#0D1520] border border-[#192638]">
                  <span className="text-slate-400">Capture Frame Rate:</span>
                  <span className="font-mono font-semibold text-emerald-400">{status?.measured_fps || 0.0} FPS</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-[#0D1520] border border-[#192638]">
                  <span className="text-slate-400">Inference Frame Rate:</span>
                  <span className="font-mono font-semibold text-cyan-400">{status?.processing_fps || 0.0} FPS</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-[#0D1520] border border-[#192638]">
                  <span className="text-slate-400">Total Frames Captured:</span>
                  <span className="font-mono text-slate-200">{status?.frames_captured?.toLocaleString() || 0}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-[#0D1520] border border-[#192638]">
                  <span className="text-slate-400">Queue Dropped Frames:</span>
                  <span className="font-mono text-amber-400">{status?.frames_dropped?.toLocaleString() || 0}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-[#0D1520] border border-[#192638]">
                  <span className="text-slate-400">Stream Uptime:</span>
                  <span className="font-mono text-slate-200">{status?.uptime_seconds?.toFixed(1) || 0.0}s</span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-cyan-950/20 border border-cyan-500/20 rounded-lg">
              <div className="flex items-center space-x-2 text-cyan-300 text-xs font-semibold">
                <Activity className="w-4 h-4 text-cyan-400" />
                <span>Synchronized Risk Engine</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                RTSP frames enter the identical Farneback optical flow and 3x3 density splatting pipeline. Live telemetry updates synchronously in Monitoring.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
