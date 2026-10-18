import React, { useState, useEffect } from 'react';
import { 
  UploadCloud, 
  FileVideo, 
  Play, 
  Pause, 
  XOctagon, 
  Sliders, 
  CheckCircle2, 
  AlertCircle,
  Eye,
  RefreshCw
} from 'lucide-react';
import { videoApi, analysisApi } from '../services/api';
import { Video, Analysis } from '../types';
import { useNavigate } from 'react-router-dom';

export const VideoAnalysis: React.FC = () => {
  const navigate = useNavigate();
  const [videos, setVideos] = useState<Video[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Analysis Configuration Parameters
  const [confThreshold, setConfThreshold] = useState<number>(0.25);
  const [frameStride, setFrameStride] = useState<number>(2);
  const [inferenceSize, setInferenceSize] = useState<number>(640);

  // Risk Engine Weights
  const [weightDensity, setWeightDensity] = useState<number>(0.35);
  const [weightGrowth, setWeightGrowth] = useState<number>(0.20);
  const [weightMotion, setWeightMotion] = useState<number>(0.25);
  const [weightCongestion, setWeightCongestion] = useState<number>(0.20);

  // Active Job State
  const [activeAnalysis, setActiveAnalysis] = useState<Analysis | null>(null);
  const [jobPolling, setJobPolling] = useState(false);

  useEffect(() => {
    loadVideos();
  }, []);

  const loadVideos = async () => {
    try {
      const data = await videoApi.getAll();
      setVideos(data);
      if (data.length > 0 && !selectedVideo) {
        setSelectedVideo(data[0]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const uploaded = await videoApi.upload(file);
      setVideos((prev) => [uploaded, ...prev]);
      setSelectedVideo(uploaded);
    } catch (err: any) {
      setUploadError(err.response?.data?.detail || 'Failed to upload video');
    } finally {
      setUploading(false);
    }
  };

  const handleStartAnalysis = async () => {
    if (!selectedVideo) return;
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
      });
      setActiveAnalysis(analysis);
      setJobPolling(true);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to start analysis');
    }
  };

  // Poll analysis progress
  useEffect(() => {
    let interval: any;
    if (jobPolling && activeAnalysis) {
      interval = setInterval(async () => {
        try {
          const updated = await analysisApi.getById(activeAnalysis.id);
          setActiveAnalysis(updated);
          if (updated.status === 'completed' || updated.status === 'failed' || updated.status === 'cancelled') {
            setJobPolling(false);
            if (updated.status === 'completed') {
              navigate(`/monitoring?analysisId=${updated.id}`);
            }
          }
        } catch (e) {
          console.error(e);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [jobPolling, activeAnalysis, navigate]);

  const handlePause = async () => {
    if (activeAnalysis) {
      await analysisApi.pause(activeAnalysis.id);
      setActiveAnalysis((prev) => prev ? { ...prev, status: 'paused' } : null);
    }
  };

  const handleResume = async () => {
    if (activeAnalysis) {
      await analysisApi.resume(activeAnalysis.id);
      setActiveAnalysis((prev) => prev ? { ...prev, status: 'processing' } : null);
    }
  };

  const handleCancel = async () => {
    if (activeAnalysis) {
      await analysisApi.cancel(activeAnalysis.id);
      setActiveAnalysis((prev) => prev ? { ...prev, status: 'cancelled' } : null);
      setJobPolling(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-gray-800">
        <h1 className="text-2xl font-bold text-white tracking-tight">Video Ingestion & Analysis Studio</h1>
        <p className="text-sm text-gray-400 mt-1">
          Upload surveillance footage, configure DIP hyperparameters, and launch automated risk evaluation.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Upload & Video List */}
        <div className="space-y-6">
          {/* Upload Card */}
          <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Upload Video Footage</h3>
            <label className="border-2 border-dashed border-gray-700 hover:border-cyan-500 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer transition bg-gray-900/40">
              <UploadCloud className="w-10 h-10 text-cyan-400 mb-2" />
              <span className="text-sm font-medium text-gray-300">Click to select MP4 / AVI</span>
              <span className="text-xs text-gray-500 mt-1">Max upload limit: 150MB</span>
              <input
                type="file"
                accept="video/mp4,video/avi,video/x-msvideo"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
            {uploading && (
              <div className="mt-3 flex items-center space-x-2 text-xs text-cyan-400">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Uploading and extracting video properties...</span>
              </div>
            )}
            {uploadError && (
              <div className="mt-3 p-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded">
                {uploadError}
              </div>
            )}
          </div>

          {/* Videos List */}
          <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Available Video Sources</h3>
            {videos.length === 0 ? (
              <p className="text-xs text-gray-500">No videos uploaded yet. Upload a sample to start.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {videos.map((vid) => (
                  <div
                    key={vid.id}
                    onClick={() => setSelectedVideo(vid)}
                    className={`p-3 rounded-lg cursor-pointer border text-xs transition flex items-center justify-between ${
                      selectedVideo?.id === vid.id
                        ? 'bg-cyan-500/10 border-cyan-500/50 text-white'
                        : 'bg-gray-900/40 border-gray-800 text-gray-400 hover:border-gray-700'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 truncate">
                      <FileVideo className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="truncate font-medium">{vid.original_filename}</span>
                    </div>
                    <span className="text-[10px] text-gray-500 font-mono shrink-0 ml-2">
                      {vid.duration_seconds}s
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Middle/Right Column: Video Preview & Configuration */}
        <div className="lg:col-span-2 space-y-6">
          {/* Video Preview Card */}
          <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-800">
              <div>
                <h3 className="text-base font-semibold text-white">Input Video Preview</h3>
                <p className="text-xs text-gray-400">
                  {selectedVideo ? `${selectedVideo.original_filename} (${selectedVideo.width}x${selectedVideo.height} @ ${selectedVideo.fps} FPS)` : 'Select a video'}
                </p>
              </div>
              {selectedVideo && (
                <span className="text-xs bg-gray-800 text-gray-300 px-2.5 py-1 rounded font-mono">
                  {(selectedVideo.file_size_bytes / (1024 * 1024)).toFixed(1)} MB
                </span>
              )}
            </div>

            {selectedVideo ? (
              <div className="aspect-video bg-black rounded-lg overflow-hidden border border-gray-800">
                <video
                  src={`/data/uploads/${selectedVideo.filename}`}
                  controls
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="aspect-video bg-gray-900/40 rounded-lg border border-dashed border-gray-800 flex items-center justify-center text-gray-500 text-sm">
                No video selected
              </div>
            )}
          </div>

          {/* Hyperparameter Configuration */}
          <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
            <div className="flex items-center space-x-2 mb-4 pb-2 border-b border-gray-800 text-white font-semibold text-sm">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <span>Inference & Risk Engine Hyperparameters</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="text-xs text-gray-400 block mb-1">
                  YOLO Confidence ({confThreshold})
                </label>
                <input
                  type="range"
                  min="0.10"
                  max="0.80"
                  step="0.05"
                  value={confThreshold}
                  onChange={(e) => setConfThreshold(parseFloat(e.target.value))}
                  className="w-full accent-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">
                  Frame Stride ({frameStride}x)
                </label>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={frameStride}
                  onChange={(e) => setFrameStride(parseInt(e.target.value))}
                  className="w-full accent-cyan-500"
                />
                <span className="text-[10px] text-gray-500">Stride 2 = analyze every 2nd frame (CPU fast)</span>
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">
                  Inference Size ({inferenceSize}px)
                </label>
                <select
                  value={inferenceSize}
                  onChange={(e) => setInferenceSize(parseInt(e.target.value))}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-gray-200"
                >
                  <option value="384">384 px (Fastest CPU)</option>
                  <option value="640">640 px (Standard Accuracy)</option>
                  <option value="960">960 px (High Precision)</option>
                </select>
              </div>
            </div>

            {/* Risk Heuristic Weights */}
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
              Explainable Risk Heuristic Weights (Normalized Sum: 1.0)
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-6">
              <div className="p-2.5 bg-gray-900/60 rounded border border-gray-800">
                <span className="text-gray-400 block">Density Pressure</span>
                <span className="text-sm font-bold text-white mt-1 block">{(weightDensity * 100).toFixed(0)}%</span>
              </div>
              <div className="p-2.5 bg-gray-900/60 rounded border border-gray-800">
                <span className="text-gray-400 block">Surge / Growth</span>
                <span className="text-sm font-bold text-white mt-1 block">{(weightGrowth * 100).toFixed(0)}%</span>
              </div>
              <div className="p-2.5 bg-gray-900/60 rounded border border-gray-800">
                <span className="text-gray-400 block">Motion Anomaly</span>
                <span className="text-sm font-bold text-white mt-1 block">{(weightMotion * 100).toFixed(0)}%</span>
              </div>
              <div className="p-2.5 bg-gray-900/60 rounded border border-gray-800">
                <span className="text-gray-400 block">Grid Congestion</span>
                <span className="text-sm font-bold text-white mt-1 block">{(weightCongestion * 100).toFixed(0)}%</span>
              </div>
            </div>

            {/* Progress / Status controls */}
            {activeAnalysis && (
              <div className="mb-4 p-4 bg-gray-900 rounded-lg border border-gray-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-300">
                    Processing Status: <span className="uppercase text-cyan-400 font-semibold">{activeAnalysis.status}</span>
                  </span>
                  <span className="text-gray-400 font-mono">{activeAnalysis.progress_percent}%</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-cyan-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${activeAnalysis.progress_percent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1">
                  <span>Speed: {activeAnalysis.processing_fps} FPS</span>
                  <span>Frame: {activeAnalysis.current_frame} / {activeAnalysis.total_frames}</span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center space-x-3 pt-2">
              {!activeAnalysis || activeAnalysis.status === 'completed' || activeAnalysis.status === 'cancelled' || activeAnalysis.status === 'failed' ? (
                <button
                  onClick={handleStartAnalysis}
                  disabled={!selectedVideo}
                  className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition flex items-center space-x-2 shadow-sm"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Start AI & DIP Analysis</span>
                </button>
              ) : (
                <>
                  {activeAnalysis.status === 'processing' ? (
                    <button
                      onClick={handlePause}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition flex items-center space-x-2"
                    >
                      <Pause className="w-4 h-4" />
                      <span>Pause Analysis</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleResume}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition flex items-center space-x-2"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>Resume Analysis</span>
                    </button>
                  )}
                  <button
                    onClick={handleCancel}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-sm font-medium transition flex items-center space-x-2"
                  >
                    <XOctagon className="w-4 h-4" />
                    <span>Cancel Job</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
