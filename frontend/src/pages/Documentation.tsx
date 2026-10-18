import React from 'react';
import { BookOpen, Layers, Cpu, Compass, ShieldCheck, TrendingUp, Lock } from 'lucide-react';

export const Documentation: React.FC = () => {
  return (
    <div className="space-y-6 max-w-4xl text-[#F4F7FA] text-xs">
      <div className="pb-4 border-b border-[#1D2935]">
        <h1 className="text-xl font-bold text-white tracking-tight">ACADEMIC METHODOLOGY & DIP ALGORITHM SPECIFICATION</h1>
        <p className="text-xs text-[#8C9AAA] mt-0.5">
          Comprehensive digital image processing formulation, Farneback optical flow dynamics, directional entropy, and predictive risk forecasting
        </p>
      </div>

      <div className="space-y-6">
        {/* Section 1: Problem Statement */}
        <section className="bg-[#0D131C] border border-[#1D2935] rounded-xl p-5 space-y-2.5">
          <h2 className="text-sm font-bold text-white flex items-center space-x-2">
            <BookOpen className="w-4 h-4 text-cyan-400" />
            <span>1. Problem Statement & Research Motivation</span>
          </h2>
          <p className="text-[#8C9AAA] leading-relaxed">
            Catastrophic crowd disasters (stampedes, turbulent crush points, bottleneck compressions) arise when local physical density exceeds safe physiological limits combined with erratic motion perturbations. Conventional surveillance systems rely on visual human fatigue-prone monitoring. This research project establishes an end-to-end automated Digital Image Processing (DIP) and Computer Vision system that quantifies spatial crowd density, tracks velocity vectors, measures directional entropy, and produces short-term (+10s) risk forecasts.
          </p>
        </section>

        {/* Section 2: Complete Pipeline Architecture */}
        <section className="bg-[#0D131C] border border-[#1D2935] rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-white flex items-center space-x-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span>2. End-to-End DIP & Computer Vision Architecture</span>
          </h2>
          <div className="p-3 bg-[#111923] rounded border border-[#1D2935] font-mono text-[11px] text-cyan-300 leading-relaxed overflow-x-auto">
            Input CCTV Video → Bilateral Noise Reduction → Temporal Frame Differencing →
            YOLOv8 Person Detection (COCO Class 0) → Multi-Object ByteTracker →
            Gunnar Farneback Dense Optical Flow → Directional Shannon Entropy →
            Perspective-Aware 2D Gaussian Density Splatting → Spatial 3x3 Quadrant Inflow/Outflow →
            Heuristic Risk Scoring → Multivariate Short-Term Risk Forecast (+5s, +10s, +15s) →
            Sustained Incident Alerts & Human Audit Workflow
          </div>
        </section>

        {/* Section 3: Farneback Optical Flow & Entropy Formulation */}
        <section className="bg-[#0D131C] border border-[#1D2935] rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-white flex items-center space-x-2">
            <Compass className="w-4 h-4 text-cyan-400" />
            <span>3. Motion Field & Directional Shannon Entropy Formulation</span>
          </h2>
          <div className="space-y-2 text-[#8C9AAA] leading-relaxed">
            <p>
              Dense optical flow is calculated using Gunnar Farneback's quadratic polynomial expansion across neighborhood frames:
            </p>
            <div className="p-2.5 bg-[#111923] rounded border border-[#1D2935] font-mono text-cyan-400">
              Flow Magnitude: M(x, y) = √(u² + v²), Angle: θ(x, y) = atan2(v, u)
            </div>
            <p>
              To measure directional disorder (turbulence vs. coordinated flow), the moving angles θ are partitioned into 8 angular sectors (N=8 bins: 45° sectors) to calculate the Normalized Shannon Entropy:
            </p>
            <div className="p-2.5 bg-[#111923] rounded border border-[#1D2935] font-mono text-amber-400">
              H = - Σ [ p_i × log₂(p_i) ],   H_normalized = H / log₂(N) ∈ [0, 1]
            </div>
            <p>
              Low entropy indicates laminar, coordinated pedestrian flow. Elevated entropy (&gt;0.65) indicates chaotic turbulence or multi-directional dispersal.
            </p>
          </div>
        </section>

        {/* Section 4: Perspective-Aware 2D Gaussian Density Splatting */}
        <section className="bg-[#0D131C] border border-[#1D2935] rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-white flex items-center space-x-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span>4. Perspective-Aware 2D Gaussian Density Splatting</span>
          </h2>
          <div className="space-y-2 text-[#8C9AAA] leading-relaxed">
            <p>
              Instead of discrete bounding-box counts which fail to reflect physical ground pressure, 2D continuous Gaussian kernels are projected from detected foot locations:
            </p>
            <div className="p-2.5 bg-[#111923] rounded border border-[#1D2935] font-mono text-cyan-400">
              G(x, y) = exp( - [ (x - x_foot)² + (y - y_foot)² ] / [ 2 × σ(y)² ] ) × W_perspective(y)
            </div>
            <p>
              Here, σ(y) and W_perspective(y) dynamically adapt according to the vertical image plane coordinate y. Pedestrians higher up near the horizon occupy fewer pixels yet represent equal physical real-world area, counteracting monocular camera foreshortening.
            </p>
          </div>
        </section>

        {/* Section 5: Heuristic Risk & Short-Term Forecasting */}
        <section className="bg-[#0D131C] border border-[#1D2935] rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-white flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            <span>5. Heuristic Risk Index & Short-Term Forecasting Engine</span>
          </h2>
          <div className="p-3 bg-[#111923] rounded border border-[#1D2935] font-mono text-amber-300">
            Risk_Score(t) = 100 × [ 0.35 × D(t) + 0.20 × G(t) + 0.25 × M(t) + 0.20 × C(t) ]
          </div>
          <p className="text-[#8C9AAA] leading-relaxed">
            The short-term predictive forecast evaluates temporal gradients across a rolling 15-frame window. Rates of density growth, velocity variance, and active pattern multipliers project expected risk at +5s, +10s, and +15s horizons to grant operators early advisory warning before critical stampede conditions manifest.
          </p>
        </section>

        {/* Section 6: Privacy-Preserving Surveillance */}
        <section className="bg-[#0D131C] border border-[#1D2935] rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-white flex items-center space-x-2">
            <Lock className="w-4 h-4 text-emerald-400" />
            <span>6. Privacy-Preserving Surveillance & Ethical Safeguards</span>
          </h2>
          <p className="text-[#8C9AAA] leading-relaxed">
            The platform provides dedicated privacy filtering (Face Blurring and Silhouette Anonymization). The system strictly does NOT perform criminal identification, biometric scraping, or facial recognition matching. It is engineered exclusively as an advisory crowd-safety analytics and disaster mitigation tool.
          </p>
        </section>
      </div>
    </div>
  );
};
