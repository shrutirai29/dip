import React, { useState, useEffect, useCallback } from 'react';
import { 
  UploadCloud, 
  FileVideo, 
  Camera,
  Radio,
  Play, 
  Pause, 
  XOctagon, 
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { videoApi, analysisApi } from '../services/api';
import { Video, Analysis } from '../types';
import { useNavigate } from 'react-router-dom';
import { 
  StatusPill, 
  ErrorState, 
  LoadingBlock 
} from '../components/UIComponents';
import { WebcamIngestionPanel } from '../components/WebcamIngestionPanel';
import { RtspIngestionPanel } from '../components/RtspIngestionPanel';
import { useSystem } from '../context/SystemContext';

export const VideoAnalysis: React.FC = () => {
  const navigate = useNavigate();
  const { setSelectedAnalysis, triggerGlobalRefresh } = useSystem();

  // Source selection: Video Archive vs Live Webcam vs Network CCTV (RTSP)
  const [sourceMode, setSourceMode] = useState<'video' | 'webcam' | 'rtsp'>('video');

  // Video catalog state
  const [videos, setVideos] = useState<Video[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [videosLoading, setVideosLoading] = useState<boolean>(true);
  const [videosError, setVideosError] = useState<string | null>(null);

  // Uploading state
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Preset sample scenarios
  const [samples, setSamples] = useState<{ filename: string; size_bytes: number; url: string }[]>([]);
  const [loadingSample, setLoadingSample] = useState<string | null>(null);
  const [sampleError, setSampleError] = useState<string | null>(null);

  // Analysis Hyperparameters (All connected to API schema)
  const [confThreshold, setConfThreshold] = useState<number>(0.25);
  const [frameStride, setFrameStride] = useState<number>(2);
  const inferenceSize = 640;
  const [perspectiveWeight, setPerspectiveWeight] = useState<number>(1.2);
  const [privacyMode, setPrivacyMode] = useState<string>('none');

  // Risk heuristic weights
  const weightDensity = 0.35;
  const weightGrowth = 0.20;
  const weightMotion = 0.25;
  const weightCongestion = 0.20;

  // Active Job State
  const [activeAnalysis, setActiveAnalysis] = useState<Analysis | null>(null);
  const [jobPolling, setJobPolling] = useState<boolean>(false);
  const [jobError, setJobError] = useState<string | null>(null);
  const [jobActionLoading, setJobActionLoading] = useState<boolean>(false);

  const loadVideos = useCallback(async () => {
    setVideosLoading(true);
    setVideosError(null);
    try {
      const data = await videoApi.getAll();
      setVideos(data);
      if (data.length > 0) {
        setSelectedVideo((prev) => (prev ? (data.find(v => v.id === prev.id) || data[0]) : data[0]));
      } else {
        setSelectedVideo(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to retrieve video catalog';
      setVideosError(msg);
    } finally {
      setVideosLoading(false);
    }
  }, []);

  const loadSamples = useCallback(async () => {
    try {
      const data = await videoApi.getSamples();
      setSamples(data);
    } catch (err) {
      console.warn('Sample scenarios list unavailable:', err);
    }
  }, []);

  useEffect(() => {
    loadVideos();
    loadSamples();
  }, [loadVideos, loadSamples]);

  // Handle preset scenario 1-click ingestion
  const handleSelectSample = async (sampleName: string) => {
    setLoadingSample(sampleName);
    setSampleError(null);
    try {
      const ingested = await videoApi.ingestSample(sampleName);
      setVideos((prev) => [ingested, ...prev.filter((v) => v.id !== ingested.id)]);
      setSelectedVideo(ingested);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load demonstration scenario';
      setSampleError(msg);
    } finally {
      setLoadingSample(null);
    }
  };

  // Handle local video file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const uploaded = await videoApi.upload(file);
      setVideos((prev) => [uploaded, ...prev]);
      setSelectedVideo(uploaded);
      setUploadSuccess(`Successfully ingested "${uploaded.original_filename}" (${(uploaded.file_size_bytes / (1024 * 1024)).toFixed(1)} MB)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Video upload failed. Check format and size limits.';
      setUploadError(msg);
    } finally {
      setUploading(false);
      // Reset input value
      e.target.value = '';
    }
  };

  // Start analysis job
  const handleStartAnalysis = async () => {
    if (!selectedVideo) return;
    setJobError(null);
    setJobActionLoading(true);
    try {
      const analysis = await analysisApi.create({
        video_id: selectedVideo.id,
        conf_threshold: confThreshold,
        frame_stride: frameStride,
        inference_size: inferenceSize,
        weight_density: weightDensity,
        weight_growth: weightGrowth,
        weight_motion_anomaly: weightMotion,
        weight_congestion: weightCongestion,
        perspective_weight: perspectiveWeight,
        privacy_mode: privacyMode,
      });
      setActiveAnalysis(analysis);
      setSelectedAnalysis(analysis);
      setJobPolling(true);
      triggerGlobalRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to initiate video analysis job.';
      setJobError(msg);
    } finally {
      setJobActionLoading(false);
    }
  };

  // Poll analysis job status
  useEffect(() => {
    if (!jobPolling || !activeAnalysis) return;

    const intervalId = window.setInterval(async () => {
      try {
        const updated = await analysisApi.getById(activeAnalysis.id);
        setActiveAnalysis(updated);
        setSelectedAnalysis(updated);

        if (updated.status === 'completed' || updated.status === 'failed' || updated.status === 'cancelled') {
          setJobPolling(false);
          triggerGlobalRefresh();
        }
      } catch (err) {
        console.warn('Analysis polling error:', err);
      }
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [jobPolling, activeAnalysis, setSelectedAnalysis, triggerGlobalRefresh]);

  const handlePause = async () => {
    if (!activeAnalysis) return;
    setJobActionLoading(true);
    try {
      await analysisApi.pause(activeAnalysis.id);
      setActiveAnalysis((prev) => (prev ? { ...prev, status: 'paused' } : null));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to pause analysis.';
      setJobError(msg);
    } finally {
      setJobActionLoading(false);
    }
  };

  const handleResume = async () => {
    if (!activeAnalysis) return;
    setJobActionLoading(true);
    try {
      await analysisApi.resume(activeAnalysis.id);
      setActiveAnalysis((prev) => (prev ? { ...prev, status: 'processing' } : null));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resume analysis.';
      setJobError(msg);
    } finally {
      setJobActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!activeAnalysis) return;
    setJobActionLoading(true);
    try {
      await analysisApi.cancel(activeAnalysis.id);
      setActiveAnalysis((prev) => (prev ? { ...prev, status: 'cancelled' } : null));
      setJobPolling(false);
      triggerGlobalRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to cancel analysis.';
      setJobError(msg);
    } finally {
      setJobActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* -------------------------------------------------------------------------
          HEADER & SOURCE MODE SWITCHER
          ------------------------------------------------------------------------- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-[#E2E8EA] dark:border-[#203638] gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h2 className="text-xl font-bold tracking-tight text-[#1C3334] dark:text-[#EDF4F5]">
              SURVEILLANCE INGESTION STUDIO
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-[#376E6F] dark:text-cyan-300 border border-cyan-500/25">
              {sourceMode === 'video' ? 'ASYNC BATCH' : sourceMode === 'webcam' ? 'LIVE WEBCAM FOUNDATION' : 'SECURE RTSP CCTV'}
            </span>
          </div>
          <p className="text-xs text-[#5D757E] dark:text-[#A0B7BC] mt-1 max-w-2xl leading-relaxed">
            {sourceMode === 'video'
              ? 'Upload surveillance footage, select preset academic crowd scenarios, calibrate monocular perspective weights, and execute the computer vision pipeline with real-time progress tracking.'
              : sourceMode === 'webcam'
              ? 'Acquire live video from a local webcam device with monotonic frame pacing, bounded latest-frame drop accounting, and incremental DIP telemetry.'
              : 'Ingest live network CCTV cameras over RTSP/RTSPS with SSRF protection, credential isolation, stalled stream detection, and resilient exponential reconnects.'}
          </p>
        </div>

        {/* Source Mode Toggle */}
        <div className="flex items-center p-1 bg-[#F1F4F5] dark:bg-[#0B1415] border border-[#CBD5D8] dark:border-[#233C3F] rounded-xl shadow-2xs self-start md:self-auto shrink-0">
          <button
            onClick={() => setSourceMode('video')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
              sourceMode === 'video'
                ? 'bg-[#2F4454] dark:bg-[#376E6F] text-white shadow-xs'
                : 'text-[#5D757E] dark:text-[#A0B7BC] hover:text-[#1C3334] dark:hover:text-white'
            }`}
          >
            <FileVideo className="w-3.5 h-3.5" />
            <span>Recorded Archive</span>
          </button>
          <button
            onClick={() => setSourceMode('webcam')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
              sourceMode === 'webcam'
                ? 'bg-[#2F4454] dark:bg-[#376E6F] text-white shadow-xs'
                : 'text-[#5D757E] dark:text-[#A0B7BC] hover:text-[#1C3334] dark:hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Live Local Webcam</span>
          </button>
          <button
            onClick={() => setSourceMode('rtsp')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
              sourceMode === 'rtsp'
                ? 'bg-[#2F4454] dark:bg-[#376E6F] text-white shadow-xs'
                : 'text-[#5D757E] dark:text-[#A0B7BC] hover:text-[#1C3334] dark:hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Network CCTV (RTSP)</span>
          </button>
        </div>
      </div>

      {sourceMode === 'webcam' ? (
        <WebcamIngestionPanel />
      ) : sourceMode === 'rtsp' ? (
        <RtspIngestionPanel />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* =========================================================================
            LEFT COLUMN: VIDEO SOURCES & UPLOAD
            ========================================================================= */}
        <div className="space-y-5">
          {/* Upload Panel */}
          <div className="rounded-xl border border-[#E2E8EA] dark:border-[#203638] bg-white dark:bg-[#122123] shadow-xs p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#1C3334] dark:text-white uppercase tracking-wider">
                Upload Surveillance Video
              </span>
              <span className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] font-mono">Max 150MB</span>
            </div>

            <label className="border-2 border-dashed border-[#CBD5D8] dark:border-[#1E2D40] hover:border-cyan-500/60 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors bg-[#F8F9FA] dark:bg-[#0E1622]/50 hover:bg-[#EEF2F4] dark:hover:bg-[#121C2B]/60 text-center">
              <UploadCloud className="w-10 h-10 text-[#376E6F] dark:text-cyan-400 mb-2" />
              <span className="text-xs font-medium text-[#1C3334] dark:text-slate-200">
                Click to browse or drop video file
              </span>
              <span className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] mt-1 font-mono">
                Supports MP4, AVI, MOV, MKV
              </span>
              <input
                type="file"
                accept="video/mp4,video/avi,video/x-msvideo,video/quicktime,video/x-matroska"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>

            {uploading && (
              <div className="p-3 rounded-lg bg-cyan-950/30 border border-cyan-500/30 flex items-center space-x-2 text-xs text-[#376E6F] dark:text-cyan-300">
                <RefreshCw className="w-4 h-4 animate-spin text-[#376E6F] dark:text-cyan-400 shrink-0" />
                <span>Uploading and extracting video properties...</span>
              </div>
            )}

            {uploadError && (
              <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-500/30 flex items-start space-x-2 text-xs text-rose-300">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{uploadError}</span>
              </div>
            )}

            {uploadSuccess && (
              <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/30 flex items-start space-x-2 text-xs text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{uploadSuccess}</span>
              </div>
            )}
          </div>

          {/* Preset Academic Scenarios */}
          <div className="rounded-xl border border-[#E2E8EA] dark:border-[#203638] bg-white dark:bg-[#122123] shadow-xs p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#1C3334] dark:text-white uppercase tracking-wider">
                Preset Academic Scenarios
              </span>
              <span className="text-[10px] font-mono text-[#376E6F] dark:text-cyan-300 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/25">
                Deterministic
              </span>
            </div>
            <p className="text-[11px] text-[#5D757E] dark:text-[#A0B7BC] leading-relaxed">
              Synthesized CCTV scenarios designed for reproducible testing of bottleneck clustering, opposing counterflow, and sudden dispersion:
            </p>

            {sampleError && (
              <div className="p-2.5 rounded bg-rose-950/20 border border-rose-500/30 text-rose-300 text-[11px]">
                {sampleError}
              </div>
            )}

            <div className="space-y-2">
              {samples.map((s) => {
                const isLoadingThis = loadingSample === s.filename;
                const isSelected = selectedVideo?.original_filename === s.filename || selectedVideo?.filename === s.filename;
                return (
                  <button
                    key={s.filename}
                    onClick={() => handleSelectSample(s.filename)}
                    disabled={isLoadingThis}
                    className={`w-full text-left p-3 rounded-lg border text-xs transition-colors flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                        : 'border-[#192638] bg-[#0E1622] hover:bg-[#121C2B] text-slate-300 hover:text-white'
                    }`}
                  >
                    <div className="space-y-0.5 truncate pr-2">
                      <div className="font-medium truncate font-mono text-[11px]">
                        {s.filename}
                      </div>
                      <div className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC]">
                        Size: {(s.size_bytes / (1024 * 1024)).toFixed(1)} MB
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isLoadingThis ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#376E6F] dark:text-cyan-400" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-[#5D757E] dark:text-[#A0B7BC]" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Video Catalog Browser */}
          <div className="rounded-xl border border-[#E2E8EA] dark:border-[#203638] bg-white dark:bg-[#122123] shadow-xs p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#1C3334] dark:text-white uppercase tracking-wider">
                Catalog Video Library
              </span>
              <span className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] font-mono">
                {videos.length} clips
              </span>
            </div>

            {videosLoading ? (
              <LoadingBlock text="Loading catalog videos..." height="h-32" />
            ) : videosError ? (
              <ErrorState message={videosError} onRetry={loadVideos} />
            ) : videos.length === 0 ? (
              <p className="text-xs text-[#5D757E] dark:text-[#A0B7BC] py-4 text-center">
                No videos in catalog. Upload a file above or click a preset scenario.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {videos.map((v) => {
                  const isSelected = selectedVideo?.id === v.id;
                  return (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVideo(v)}
                      className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                          : 'border-[#192638] bg-[#0E1622] hover:bg-[#121C2B] text-slate-300 hover:text-white'
                      }`}
                    >
                      <div className="truncate pr-2">
                        <div className="font-medium truncate font-mono text-[11px]">
                          {v.original_filename || v.filename}
                        </div>
                        <div className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] font-mono">
                          {v.duration_seconds.toFixed(1)}s • {v.fps.toFixed(0)} FPS • {v.frame_count} frames
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-[#5D757E] dark:text-[#A0B7BC] shrink-0">
                        {(v.file_size_bytes / (1024 * 1024)).toFixed(1)}MB
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* =========================================================================
            CENTER & RIGHT: PIPELINE CONFIGURATION & RUNTIME EXECUTION
            ========================================================================= */}
        <div className="lg:col-span-2 space-y-5">
          {/* Selected Video Overview */}
          <div className="rounded-xl border border-[#E2E8EA] dark:border-[#203638] bg-white dark:bg-[#122123] shadow-xs p-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8EA] dark:border-[#203638] mb-4">
              <div className="flex items-center space-x-2">
                <FileVideo className="w-4 h-4 text-[#376E6F] dark:text-cyan-400" />
                <h3 className="text-xs font-semibold text-[#1C3334] dark:text-white uppercase tracking-wider">
                  Target Surveillance Footage
                </h3>
              </div>
              {selectedVideo && (
                <span className="text-[11px] font-mono text-[#376E6F] dark:text-cyan-300">
                  ID: {selectedVideo.id}
                </span>
              )}
            </div>

            {selectedVideo ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-[#E2E8EA] dark:divide-[#203638] bg-[#F8F9FA] dark:bg-[#0E1622] rounded-lg border border-[#CBD5D8] dark:border-[#192638] text-xs">
                <div className="p-3">
                  <span className="text-[9px] uppercase tracking-wider text-[#5D757E] dark:text-[#A0B7BC] block mb-0.5">Duration</span>
                  <span className="font-mono font-bold text-[#1C3334] dark:text-white text-sm tabular-nums">
                    {selectedVideo.duration_seconds.toFixed(1)}s
                  </span>
                </div>
                <div className="p-3">
                  <span className="text-[9px] uppercase tracking-wider text-[#5D757E] dark:text-[#A0B7BC] block mb-0.5">Framerate</span>
                  <span className="font-mono font-bold text-[#1C3334] dark:text-white text-sm tabular-nums">
                    {selectedVideo.fps.toFixed(1)} FPS
                  </span>
                </div>
                <div className="p-3">
                  <span className="text-[9px] uppercase tracking-wider text-[#5D757E] dark:text-[#A0B7BC] block mb-0.5">Resolution</span>
                  <span className="font-mono font-bold text-[#1C3334] dark:text-white text-sm tabular-nums">
                    {selectedVideo.width} × {selectedVideo.height}
                  </span>
                </div>
                <div className="p-3">
                  <span className="text-[9px] uppercase tracking-wider text-[#5D757E] dark:text-[#A0B7BC] block mb-0.5">Total Frames</span>
                  <span className="font-mono font-bold text-[#1C3334] dark:text-white text-sm tabular-nums">
                    #{selectedVideo.frame_count}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#5D757E] dark:text-[#A0B7BC] py-3">
                No video selected. Select or upload a clip from the library on the left.
              </p>
            )}
          </div>

          {/* Hyperparameters & Vision Configuration */}
          <div className="rounded-xl border border-[#E2E8EA] dark:border-[#203638] bg-white dark:bg-[#122123] shadow-xs p-5 space-y-4">
            <div className="flex items-center space-x-2 pb-3 border-b border-[#E2E8EA] dark:border-[#203638]">
              <Sliders className="w-4 h-4 text-[#376E6F] dark:text-cyan-400" />
              <h3 className="text-xs font-semibold text-[#1C3334] dark:text-white uppercase tracking-wider">
                Vision Engine Parameters & DIP Calibration
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {/* Detection Confidence */}
              <div className="p-3.5 bg-[#F8F9FA] dark:bg-[#0E1622] rounded-lg border border-[#CBD5D8] dark:border-[#192638] space-y-2">
                <div className="flex justify-between items-center">
                  <label className="font-medium text-[#1C3334] dark:text-slate-200">YOLO Person Confidence Threshold</label>
                  <span className="font-mono font-bold text-[#376E6F] dark:text-cyan-300">{confThreshold.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="0.80"
                  step="0.05"
                  value={confThreshold}
                  onChange={(e) => setConfThreshold(parseFloat(e.target.value))}
                  className="w-full accent-[#376E6F]"
                />
                <p className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC]">
                  Minimum confidence score to accept Class 0 person bounding box (default: 0.25).
                </p>
              </div>

              {/* Frame Stride */}
              <div className="p-3.5 bg-[#F8F9FA] dark:bg-[#0E1622] rounded-lg border border-[#CBD5D8] dark:border-[#192638] space-y-2">
                <div className="flex justify-between items-center">
                  <label className="font-medium text-[#1C3334] dark:text-slate-200">Temporal Frame Sampling Stride</label>
                  <span className="font-mono font-bold text-[#376E6F] dark:text-cyan-300">{frameStride}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={frameStride}
                  onChange={(e) => setFrameStride(parseInt(e.target.value))}
                  className="w-full accent-[#376E6F]"
                />
                <p className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC]">
                  Process every Nth frame. Stride 2 balances CPU Farneback flow with near real-time throughput.
                </p>
              </div>

              {/* Monocular Perspective Weight */}
              <div className="p-3.5 bg-[#F8F9FA] dark:bg-[#0E1622] rounded-lg border border-[#CBD5D8] dark:border-[#192638] space-y-2">
                <div className="flex justify-between items-center">
                  <label className="font-medium text-[#1C3334] dark:text-slate-200">Monocular Perspective Weight</label>
                  <span className="font-mono font-bold text-[#376E6F] dark:text-cyan-300">{perspectiveWeight.toFixed(1)}×</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.1"
                  value={perspectiveWeight}
                  onChange={(e) => setPerspectiveWeight(parseFloat(e.target.value))}
                  className="w-full accent-[#376E6F]"
                />
                <p className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC]">
                  Compensates for optical camera shrinkage of distant individuals near the top horizon.
                </p>
              </div>

              {/* Privacy Masking Mode */}
              <div className="p-3.5 bg-[#F8F9FA] dark:bg-[#0E1622] rounded-lg border border-[#CBD5D8] dark:border-[#192638] space-y-2">
                <label className="font-medium text-[#1C3334] dark:text-slate-200 block">Privacy Anonymization Mode</label>
                <select
                  value={privacyMode}
                  onChange={(e) => setPrivacyMode(e.target.value)}
                  className="w-full bg-white dark:bg-[#121C2B] border border-[#CBD5D8] dark:border-[#1E2D40] text-[#1C3334] dark:text-slate-200 rounded px-3 py-1.5 text-xs focus:border-cyan-500"
                >
                  <option value="none">None (Standard Surveillance Annotations)</option>
                  <option value="face_blur">Face Blur (Gaussian head region blurring)</option>
                  <option value="full_anonymize">Full Anonymize (Silhouette bounding overlay)</option>
                </select>
                <p className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC]">
                  Ethical surveillance compliance filter applied before frame encoding.
                </p>
              </div>
            </div>

            {/* Risk Heuristic Weights Accordion/Grid */}
            <div className="pt-2">
              <span className="text-[11px] font-semibold text-slate-300 block mb-2">
                Risk Heuristic Weight Distribution (Normalized Composite Formula):
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-[#E2E8EA] dark:divide-[#203638] bg-[#F8F9FA] dark:bg-[#0E1622] rounded border border-[#CBD5D8] dark:border-[#192638] text-xs">
                <div className="p-2.5">
                  <span className="text-[9px] uppercase tracking-wider text-[#5D757E] dark:text-[#A0B7BC] block">Density (wd)</span>
                  <span className="font-mono font-bold text-[#376E6F] dark:text-[#6EC4C6] tabular-nums">{(weightDensity * 100).toFixed(0)}%</span>
                </div>
                <div className="p-2.5">
                  <span className="text-[9px] uppercase tracking-wider text-[#5D757E] dark:text-[#A0B7BC] block">Growth Influx (wg)</span>
                  <span className="font-mono font-bold text-amber-700 dark:text-amber-300 tabular-nums">{(weightGrowth * 100).toFixed(0)}%</span>
                </div>
                <div className="p-2.5">
                  <span className="text-[9px] uppercase tracking-wider text-[#5D757E] dark:text-[#A0B7BC] block">Disorder/Flow (wm)</span>
                  <span className="font-mono font-bold text-[#DA7B93] tabular-nums">{(weightMotion * 100).toFixed(0)}%</span>
                </div>
                <div className="p-2.5">
                  <span className="text-[9px] uppercase tracking-wider text-[#5D757E] dark:text-[#A0B7BC] block">Congestion (wc)</span>
                  <span className="font-mono font-bold text-[#2F4454] dark:text-[#A0B7BC] tabular-nums">{(weightCongestion * 100).toFixed(0)}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Job Launch & Progress Terminal */}
          <div className="rounded-xl border border-[#E2E8EA] dark:border-[#203638] bg-white dark:bg-[#122123] shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8EA] dark:border-[#203638]">
              <div className="flex items-center space-x-2">
                <Play className="w-4 h-4 text-[#376E6F] dark:text-cyan-400" />
                <h3 className="text-xs font-semibold text-[#1C3334] dark:text-white uppercase tracking-wider">
                  Analysis Job Execution
                </h3>
              </div>

              {activeAnalysis && (
                <StatusPill status={activeAnalysis.status} />
              )}
            </div>

            {jobError && (
              <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-500/30 text-xs text-rose-300 flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{jobError}</span>
              </div>
            )}

            {!activeAnalysis ? (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2">
                <div className="space-y-0.5 text-xs text-[#5D757E] dark:text-[#A0B7BC]">
                  <p className="text-[#1C3334] dark:text-slate-200 font-medium">Ready to launch inference</p>
                  <p className="text-[11px]">
                    The backend will spawn an asynchronous background thread processing frames sequentially.
                  </p>
                </div>

                <button
                  onClick={handleStartAnalysis}
                  disabled={!selectedVideo || jobActionLoading}
                  className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-5 py-2.5 bg-[#2F4454] hover:bg-[#1C3334] text-white dark:bg-[#376E6F] dark:hover:bg-[#4A8E8F] disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs shrink-0"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Launch Computer Vision Pipeline</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium text-[#1C3334] dark:text-slate-200">
                      Processing: Frame {activeAnalysis.current_frame} of {activeAnalysis.total_frames || '—'}
                    </span>
                    <span className="font-mono font-bold text-[#376E6F] dark:text-cyan-300">
                      {activeAnalysis.progress_percent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-[#0E1622] rounded-full h-2 border border-[#192638] overflow-hidden">
                    <div
                      className="bg-cyan-500 h-2 transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(0, activeAnalysis.progress_percent))}%` }}
                    />
                  </div>
                </div>

                {/* Processing metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 bg-[#F8F9FA] dark:bg-[#0E1622] rounded border border-[#CBD5D8] dark:border-[#192638]">
                    <span className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] block">Processing Speed</span>
                    <span className="font-mono font-bold text-[#1C3334] dark:text-white text-xs">
                      {activeAnalysis.processing_fps.toFixed(1)} FPS
                    </span>
                  </div>
                  <div className="p-2.5 bg-[#F8F9FA] dark:bg-[#0E1622] rounded border border-[#CBD5D8] dark:border-[#192638]">
                    <span className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] block">Peak Detected</span>
                    <span className="font-mono font-bold text-[#1C3334] dark:text-white text-xs">
                      {activeAnalysis.peak_count} persons
                    </span>
                  </div>
                  <div className="p-2.5 bg-[#F8F9FA] dark:bg-[#0E1622] rounded border border-[#CBD5D8] dark:border-[#192638]">
                    <span className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] block">Max Risk Score</span>
                    <span className="font-mono font-bold text-rose-400 text-xs">
                      {activeAnalysis.max_risk_score.toFixed(1)}/100
                    </span>
                  </div>
                  <div className="p-2.5 bg-[#F8F9FA] dark:bg-[#0E1622] rounded border border-[#CBD5D8] dark:border-[#192638]">
                    <span className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] block">Active Pattern</span>
                    <span className="font-mono font-bold text-[#376E6F] dark:text-cyan-300 text-xs uppercase truncate block">
                      {activeAnalysis.dominant_pattern || 'ANALYZING...'}
                    </span>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#192638]">
                  <div className="flex items-center space-x-2">
                    {activeAnalysis.status === 'processing' && (
                      <button
                        onClick={handlePause}
                        disabled={jobActionLoading}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#121C2B] hover:bg-[#182538] border border-[#1E2D40] text-xs font-medium text-slate-300 cursor-pointer"
                      >
                        <Pause className="w-3.5 h-3.5" />
                        <span>Pause</span>
                      </button>
                    )}
                    {activeAnalysis.status === 'paused' && (
                      <button
                        onClick={handleResume}
                        disabled={jobActionLoading}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/40 text-xs font-medium text-cyan-200 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Resume</span>
                      </button>
                    )}
                    {(activeAnalysis.status === 'processing' || activeAnalysis.status === 'paused') && (
                      <button
                        onClick={handleCancel}
                        disabled={jobActionLoading}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-rose-950/40 hover:bg-rose-950/60 border border-rose-500/40 text-xs font-medium text-rose-300 cursor-pointer"
                      >
                        <XOctagon className="w-3.5 h-3.5" />
                        <span>Cancel</span>
                      </button>
                    )}
                    {(activeAnalysis.status === 'completed' || activeAnalysis.status === 'failed' || activeAnalysis.status === 'cancelled') && (
                      <button
                        onClick={() => setActiveAnalysis(null)}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#121C2B] hover:bg-[#182538] border border-[#1E2D40] text-xs font-medium text-slate-300 cursor-pointer"
                      >
                        <span>Configure New Job</span>
                      </button>
                    )}
                  </div>

                  {activeAnalysis.status === 'completed' && (
                    <button
                      onClick={() => navigate(`/monitoring?analysisId=${activeAnalysis.id}`)}
                      className="inline-flex items-center space-x-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <span>Open Live Telemetry & Replay</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
};

export default VideoAnalysis;
