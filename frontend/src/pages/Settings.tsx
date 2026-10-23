import React from 'react';
import { 
  Cpu, 
  Lock, 
  Compass, 
  Sliders, 
  ShieldCheck, 
  HardDrive
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  return (
    <div className="space-y-6 w-full text-xs text-[#1C3334] dark:text-slate-200">
      {/* Header */}
      <div className="pb-4 border-b border-[#E2E8EA] dark:border-[#203638]">
        <div className="flex items-center space-x-2.5">
          <h1 className="text-xl font-bold text-[#1C3334] dark:text-[#EDF4F5] tracking-tight">
            ENGINE CALIBRATION & RUNTIME SPECIFICATION
          </h1>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-950/40 border border-cyan-500/30 text-[#376E6F] dark:text-cyan-300">
            SYSTEM ENGINE v2.0
          </span>
        </div>
        <p className="text-xs text-[#5D757E] dark:text-[#A0B7BC] mt-1">
          Active hyperparameter configuration for DIP optical flow, monocular perspective splatting, heuristic weighting, and privacy compliance
        </p>
      </div>

      <div className="space-y-5">
        {/* Detection Engine & Backbone */}
        <div className="bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl p-5 space-y-3 shadow-xs">
          <div className="flex items-center space-x-2 text-[#1C3334] dark:text-white font-semibold text-xs uppercase tracking-wider">
            <Cpu className="w-4 h-4 text-[#376E6F] dark:text-cyan-400" />
            <span>AI Model & Vision Backbone</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase text-[#5D757E] dark:text-slate-400">Pretrained Object Detector</label>
              <input
                type="text"
                disabled
                value="Ultralytics YOLOv8 Nano (yolov8n.pt - Class 0 Person)"
                className="w-full bg-[#F8F9FA] dark:bg-[#0A1018] border border-[#CBD5D8] dark:border-[#1E2D40] rounded-lg p-2.5 text-[#376E6F] dark:text-cyan-300 font-mono text-xs cursor-not-allowed"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase text-[#5D757E] dark:text-slate-400">Hardware Acceleration</label>
              <input
                type="text"
                disabled
                value="Auto-Detected CPU / CUDA Acceleration"
                className="w-full bg-[#F8F9FA] dark:bg-[#0A1018] border border-[#CBD5D8] dark:border-[#1E2D40] rounded-lg p-2.5 text-white font-mono text-xs cursor-not-allowed"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase text-[#5D757E] dark:text-slate-400">Multi-Object Tracking Algorithm</label>
              <input
                type="text"
                disabled
                value="ByteTrack (Kalman Filter State Estimation + High/Low Conf Association)"
                className="w-full bg-[#F8F9FA] dark:bg-[#0A1018] border border-[#CBD5D8] dark:border-[#1E2D40] rounded-lg p-2.5 text-white font-mono text-xs cursor-not-allowed"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase text-[#5D757E] dark:text-slate-400">Inference Resolution</label>
              <input
                type="text"
                disabled
                value="640 × 640 px (Dynamic Aspect-Preserving Letterbox)"
                className="w-full bg-[#F8F9FA] dark:bg-[#0A1018] border border-[#CBD5D8] dark:border-[#1E2D40] rounded-lg p-2.5 text-white font-mono text-xs cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* DIP Preprocessing & Optical Flow Configuration */}
        <div className="bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl p-5 space-y-3 shadow-xs">
          <div className="flex items-center space-x-2 text-[#1C3334] dark:text-white font-semibold text-xs uppercase tracking-wider">
            <Compass className="w-4 h-4 text-[#376E6F] dark:text-cyan-400" />
            <span>DIP Motion & Density Pipeline Specifications</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 bg-[#0A1018] rounded-lg border border-[#1E2D40] space-y-1">
              <span className="font-semibold text-white block">Dense Optical Flow</span>
              <p className="text-[#5D757E] dark:text-slate-400 text-[11px] leading-relaxed">
                Gunnar Farneback quadratic polynomial expansion (pyr_scale=0.5, levels=3, winsize=15, iterations=3, poly_n=5, poly_sigma=1.2).
              </p>
            </div>
            <div className="p-3.5 bg-[#0A1018] rounded-lg border border-[#1E2D40] space-y-1">
              <span className="font-semibold text-white block">Perspective Splatting</span>
              <p className="text-[#5D757E] dark:text-slate-400 text-[11px] leading-relaxed">
                2D continuous Gaussian kernels (kernel_size=61, σ=14.0) with adaptive vertical coordinate foreshortening compensation.
              </p>
            </div>
            <div className="p-3.5 bg-[#0A1018] rounded-lg border border-[#1E2D40] space-y-1">
              <span className="font-semibold text-white block">Directional Shannon Entropy</span>
              <p className="text-[#5D757E] dark:text-slate-400 text-[11px] leading-relaxed">
                8-sector angular histogram Shannon entropy normalized against log₂(8)=3.0 to isolate coordinated transit from panic dispersion.
              </p>
            </div>
          </div>
        </div>

        {/* Risk Model Calibration Weights */}
        <div className="bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl p-5 space-y-3 shadow-xs">
          <div className="flex items-center space-x-2 text-[#1C3334] dark:text-white font-semibold text-xs uppercase tracking-wider">
            <Sliders className="w-4 h-4 text-[#376E6F] dark:text-cyan-400" />
            <span>Heuristic Risk Scoring Coefficients</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
            <div className="p-3 bg-[#0A1018] rounded-lg border border-[#1E2D40]">
              <span className="text-[10px] text-[#5D757E] dark:text-slate-400 uppercase block">Density Pressure</span>
              <span className="text-base font-bold text-[#376E6F] dark:text-cyan-400 mt-1 block">35.0%</span>
              <span className="text-[10px] text-slate-500 font-sans mt-0.5 block">w_density = 0.35</span>
            </div>
            <div className="p-3 bg-[#0A1018] rounded-lg border border-[#1E2D40]">
              <span className="text-[10px] text-[#5D757E] dark:text-slate-400 uppercase block">Surge Influx</span>
              <span className="text-base font-bold text-amber-400 mt-1 block">20.0%</span>
              <span className="text-[10px] text-slate-500 font-sans mt-0.5 block">w_growth = 0.20</span>
            </div>
            <div className="p-3 bg-[#0A1018] rounded-lg border border-[#1E2D40]">
              <span className="text-[10px] text-[#5D757E] dark:text-slate-400 uppercase block">Motion Anomaly</span>
              <span className="text-base font-bold text-rose-400 mt-1 block">25.0%</span>
              <span className="text-[10px] text-slate-500 font-sans mt-0.5 block">w_motion = 0.25</span>
            </div>
            <div className="p-3 bg-[#0A1018] rounded-lg border border-[#1E2D40]">
              <span className="text-[10px] text-[#5D757E] dark:text-slate-400 uppercase block">Grid Congestion</span>
              <span className="text-base font-bold text-purple-400 mt-1 block">20.0%</span>
              <span className="text-[10px] text-slate-500 font-sans mt-0.5 block">w_congestion = 0.20</span>
            </div>
          </div>
        </div>

        {/* Ethical Safeguards & Privacy Preservation */}
        <div className="bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl p-5 space-y-3 shadow-xs">
          <div className="flex items-center space-x-2 text-[#1C3334] dark:text-white font-semibold text-xs uppercase tracking-wider">
            <Lock className="w-4 h-4 text-emerald-400" />
            <span>Ethical Safeguards & Privacy Preservation</span>
          </div>

          <div className="p-3.5 bg-emerald-950/20 border border-emerald-500/25 rounded-lg text-[#2F4454] dark:text-slate-300 leading-relaxed space-y-2">
            <div className="flex items-center space-x-2 text-emerald-400 font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>Non-Invasive Safety Compliance Verified:</span>
            </div>
            <p className="text-[#5D757E] dark:text-slate-400">
              This surveillance system strictly does NOT perform facial recognition, biometric identity scraping, or person-level behavioral profiling. Privacy filters (Bilateral Gaussian Face Blurring and Silhouette Masking) can be selected during video ingestion. Monocular perspective compensation is a mathematical spatial heuristic and does not replace calibrated stereoscopic photogrammetry.
            </p>
          </div>
        </div>

        {/* System & Storage Runtime */}
        <div className="bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl p-5 space-y-3 shadow-xs">
          <div className="flex items-center space-x-2 text-[#1C3334] dark:text-white font-semibold text-xs uppercase tracking-wider">
            <HardDrive className="w-4 h-4 text-[#376E6F] dark:text-cyan-400" />
            <span>API & Local Storage Runtime</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[#2F4454] dark:text-slate-300 font-mono text-[11px]">
            <div className="p-2.5 bg-[#0A1018] rounded-lg border border-[#1E2D40]">
              <span className="text-slate-500 text-[10px] block">API REST Prefix</span>
              <span className="text-[#376E6F] dark:text-cyan-400 mt-0.5 block">/api</span>
            </div>
            <div className="p-2.5 bg-[#0A1018] rounded-lg border border-[#1E2D40]">
              <span className="text-slate-500 text-[10px] block">Database Storage</span>
              <span className="text-white mt-0.5 block">SQLite via SQLAlchemy ORM (crowdguard.db)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
