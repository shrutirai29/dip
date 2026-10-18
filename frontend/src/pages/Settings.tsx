import React from 'react';
import { Cpu, Lock, Compass } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  return (
    <div className="space-y-6 max-w-4xl text-xs">
      <div className="pb-4 border-b border-[#1D2935]">
        <h1 className="text-xl font-bold text-white tracking-tight">ENGINE ARCHITECTURE & CALIBRATION SPECIFICATION</h1>
        <p className="text-xs text-[#8C9AAA] mt-0.5">
          Configure default hyperparameters for DIP optical flow, perspective normalization, and privacy protection
        </p>
      </div>

      <div className="space-y-5">
        {/* Detection Engine */}
        <div className="bg-[#0D131C] border border-[#1D2935] rounded-xl p-5 space-y-3">
          <div className="flex items-center space-x-2 text-white font-semibold text-xs uppercase tracking-wider">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span>AI Model & Vision Backbone</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-[#8C9AAA] block mb-1">Pretrained Architecture</label>
              <input
                type="text"
                disabled
                value="Ultralytics YOLOv8 Nano (yolov8n.pt - Filtered to Person Class 0)"
                className="w-full bg-[#111923] border border-[#1D2935] rounded p-2 text-white font-mono"
              />
            </div>
            <div>
              <label className="text-[#8C9AAA] block mb-1">Hardware Acceleration Device</label>
              <input
                type="text"
                disabled
                value="Auto-Detected CPU / CUDA Acceleration"
                className="w-full bg-[#111923] border border-[#1D2935] rounded p-2 text-white font-mono"
              />
            </div>
          </div>
        </div>

        {/* DIP Preprocessing Configuration */}
        <div className="bg-[#0D131C] border border-[#1D2935] rounded-xl p-5 space-y-3">
          <div className="flex items-center space-x-2 text-white font-semibold text-xs uppercase tracking-wider">
            <Compass className="w-4 h-4 text-cyan-400" />
            <span>DIP Motion & Density Pipeline Specifications</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-[#111923] rounded border border-[#1D2935]">
              <span className="font-semibold text-white block">Dense Optical Flow</span>
              <p className="text-[#8C9AAA] mt-1 text-[11px] leading-relaxed">
                Gunnar Farneback quadratic polynomial expansion (pyr_scale=0.5, levels=3, winsize=15).
              </p>
            </div>
            <div className="p-3 bg-[#111923] rounded border border-[#1D2935]">
              <span className="font-semibold text-white block">Perspective Splatting</span>
              <p className="text-[#8C9AAA] mt-1 text-[11px] leading-relaxed">
                2D Gaussian kernels (k=61, σ=14.0) with dynamic Y-axis perspective scale compensation.
              </p>
            </div>
            <div className="p-3 bg-[#111923] rounded border border-[#1D2935]">
              <span className="font-semibold text-white block">Directional Entropy</span>
              <p className="text-[#8C9AAA] mt-1 text-[11px] leading-relaxed">
                8-sector angular histogram Shannon entropy to quantify coordinated flow vs. panic turbulence.
              </p>
            </div>
          </div>
        </div>

        {/* Privacy & Ethical Safety Notice */}
        <div className="bg-[#0D131C] border border-[#1D2935] rounded-xl p-5 space-y-3">
          <div className="flex items-center space-x-2 text-white font-semibold text-xs uppercase tracking-wider">
            <Lock className="w-4 h-4 text-emerald-400" />
            <span>Ethical Safeguards & Privacy Preservation</span>
          </div>

          <div className="p-3.5 bg-emerald-950/20 border border-emerald-500/20 rounded-lg text-[#8C9AAA] leading-relaxed">
            <p className="text-white font-semibold mb-1">Non-Invasive Safety Compliance:</p>
            This system does not perform facial recognition, identity matching, or individual biometric profiling. Privacy options include bilateral face blurring and full silhouette masking. Monocular camera perspective compensation is a mathematical heuristic and does not substitute for calibrated stereoscopic photogrammetry.
          </div>
        </div>
      </div>
    </div>
  );
};
