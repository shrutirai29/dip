import React from 'react';
import { 
  BookOpen, 
  Layers, 
  Compass, 
  TrendingUp, 
  Lock, 
  Cpu
} from 'lucide-react';

export const Documentation: React.FC = () => {
  return (
    <div className="space-y-6 w-full text-xs text-[#1C3334] dark:text-slate-200">
      {/* Header */}
      <div className="pb-4 border-b border-[#E2E8EA] dark:border-[#203638]">
        <div className="flex items-center space-x-2.5">
          <h1 className="text-xl font-bold text-[#1C3334] dark:text-[#EDF4F5] tracking-tight">
            ACADEMIC METHODOLOGY & DIP ALGORITHM SPECIFICATION
          </h1>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-950/40 border border-cyan-500/30 text-[#376E6F] dark:text-cyan-300">
            TECHNICAL SPEC v2.0
          </span>
        </div>
        <p className="text-xs text-[#5D757E] dark:text-[#A0B7BC] mt-1">
          Comprehensive digital image processing formulation, Gunnar Farneback optical flow dynamics, directional Shannon entropy, and predictive risk forecasting
        </p>
      </div>

      <div className="space-y-6">
        {/* Section 1: Problem Statement */}
        <section className="bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl p-5 space-y-3 shadow-xs">
          <h2 className="text-sm font-bold text-[#1C3334] dark:text-white flex items-center space-x-2">
            <BookOpen className="w-4 h-4 text-[#376E6F] dark:text-cyan-400" />
            <span>1. Problem Statement & Research Motivation</span>
          </h2>
          <p className="text-[#2F4454] dark:text-slate-300 leading-relaxed">
            Catastrophic crowd disasters (stampedes, compressive asphyxia, turbulent bottleneck crush points) manifest when physical ground density exceeds safe physiological limits (&gt;4–5 persons/m²) combined with sudden directional velocity perturbations. Conventional CCTV security operations rely on human visual monitoring, which suffers severe fatigue degradation within 20–30 minutes of continuous surveillance.
          </p>
          <p className="text-[#5D757E] dark:text-slate-400 leading-relaxed">
            This research project establishes an end-to-end automated Digital Image Processing (DIP) and Computer Vision system. Rather than providing passive video playback, the platform extracts frame-differenced motion vectors, computes dense optical flow fields, measures directional Shannon entropy to detect turbulence before stampede onset, and produces short-term (+5s, +10s, +15s) predictive hazard projections.
          </p>
        </section>

        {/* Section 2: Complete Pipeline Architecture */}
        <section className="bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl p-5 space-y-3 shadow-xs">
          <h2 className="text-sm font-bold text-[#1C3334] dark:text-white flex items-center space-x-2">
            <Layers className="w-4 h-4 text-[#376E6F] dark:text-cyan-400" />
            <span>2. End-to-End DIP & Computer Vision Pipeline</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            <div className="p-3 bg-[#F8F9FA] dark:bg-[#0A1018] rounded-lg border border-[#CBD5D8] dark:border-[#1E2D40] space-y-1.5">
              <span className="text-[10px] font-mono font-bold text-[#376E6F] dark:text-cyan-400 uppercase">Stage 1: Ingestion</span>
              <p className="text-[11px] text-[#2F4454] dark:text-slate-300 font-medium">Bilateral Preprocessing</p>
              <p className="text-[10px] text-[#5D757E] dark:text-slate-400 leading-normal">
                Noise reduction via edge-preserving bilateral filtering and temporal frame differencing.
              </p>
            </div>
            <div className="p-3 bg-[#F8F9FA] dark:bg-[#0A1018] rounded-lg border border-[#CBD5D8] dark:border-[#1E2D40] space-y-1.5">
              <span className="text-[10px] font-mono font-bold text-[#376E6F] dark:text-cyan-400 uppercase">Stage 2: Detection</span>
              <p className="text-[11px] text-[#2F4454] dark:text-slate-300 font-medium">YOLOv8 + ByteTrack</p>
              <p className="text-[10px] text-[#5D757E] dark:text-slate-400 leading-normal">
                COCO Class 0 pedestrian localization coupled with Kalman-filter multi-object tracking.
              </p>
            </div>
            <div className="p-3 bg-[#F8F9FA] dark:bg-[#0A1018] rounded-lg border border-[#CBD5D8] dark:border-[#1E2D40] space-y-1.5">
              <span className="text-[10px] font-mono font-bold text-[#376E6F] dark:text-cyan-400 uppercase">Stage 3: DIP Motion</span>
              <p className="text-[11px] text-[#2F4454] dark:text-slate-300 font-medium">Optical Flow & Entropy</p>
              <p className="text-[10px] text-[#5D757E] dark:text-slate-400 leading-normal">
                Gunnar Farneback polynomial expansion flow fields and 8-sector Shannon entropy.
              </p>
            </div>
            <div className="p-3 bg-[#F8F9FA] dark:bg-[#0A1018] rounded-lg border border-[#CBD5D8] dark:border-[#1E2D40] space-y-1.5">
              <span className="text-[10px] font-mono font-bold text-[#376E6F] dark:text-cyan-400 uppercase">Stage 4: Prediction</span>
              <p className="text-[11px] text-[#2F4454] dark:text-slate-300 font-medium">Multi-Horizon Heuristics</p>
              <p className="text-[10px] text-[#5D757E] dark:text-slate-400 leading-normal">
                4-factor risk scoring combined with rolling polynomial extrapolation (+5s, +10s, +15s).
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Farneback Optical Flow & Entropy */}
        <section className="bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl p-5 space-y-3 shadow-xs">
          <h2 className="text-sm font-bold text-[#1C3334] dark:text-white flex items-center space-x-2">
            <Compass className="w-4 h-4 text-[#376E6F] dark:text-cyan-400" />
            <span>3. Motion Field & Directional Shannon Entropy Formulation</span>
          </h2>
          <div className="space-y-2.5 text-[#2F4454] dark:text-slate-300 leading-relaxed">
            <p>
              Dense optical flow is evaluated across consecutive image pairs by approximating the neighborhood of each pixel through quadratic polynomial expansion:
            </p>
            <div className="p-3 bg-[#F8F9FA] dark:bg-[#0A1018] rounded-lg border border-[#CBD5D8] dark:border-[#1E2D40] font-mono text-[11px] text-[#376E6F] dark:text-cyan-300 space-y-1">
              <div>Flow Magnitude: M(x, y) = √(u(x, y)² + v(x, y)²)</div>
              <div>Flow Direction: θ(x, y) = atan2(v(x, y), u(x, y)) ∈ [-π, π]</div>
            </div>
            <p className="text-[#5D757E] dark:text-slate-400">
              To quantify spatial flow turbulence (laminar pedestrian stream versus panicked dispersal), angular vectors θ(x, y) are partitioned into 8 angular sectors (N=8 bins: 45° sectors) to formulate the Normalized Directional Shannon Entropy:
            </p>
            <div className="p-3 bg-[#F8F9FA] dark:bg-[#0A1018] rounded-lg border border-[#CBD5D8] dark:border-[#1E2D40] font-mono text-[11px] text-amber-300 space-y-1">
              <div>H = - ∑ [ p_i · log₂(p_i) ]   for i = 1 .. 8</div>
              <div>H_norm = H / log₂(8) = H / 3.0 ∈ [0.0, 1.0]</div>
            </div>
            <p className="text-[#5D757E] dark:text-slate-400">
              Low entropy (H_norm &lt; 0.35) corresponds to unidirectional, orderly crowd transit. Elevated entropy (H_norm &gt; 0.65) detects disordered turbulence or multi-directional dispersal preceding crowd compression incidents.
            </p>
          </div>
        </section>

        {/* Section 4: Perspective-Aware 2D Gaussian Density Splatting */}
        <section className="bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl p-5 space-y-3 shadow-xs">
          <h2 className="text-sm font-bold text-[#1C3334] dark:text-white flex items-center space-x-2">
            <Cpu className="w-4 h-4 text-[#376E6F] dark:text-cyan-400" />
            <span>4. Perspective-Aware 2D Gaussian Density Splatting</span>
          </h2>
          <div className="space-y-2.5 text-[#2F4454] dark:text-slate-300 leading-relaxed">
            <p>
              Discrete bounding box counts fail to capture continuous physical crowd pressure due to monocular perspective foreshortening. In CROWDGUARD, detected foot contact centroids project continuous 2D Gaussian kernels onto the ground plane:
            </p>
            <div className="p-3 bg-[#F8F9FA] dark:bg-[#0A1018] rounded-lg border border-[#CBD5D8] dark:border-[#1E2D40] font-mono text-[11px] text-[#376E6F] dark:text-cyan-300">
              G(x, y) = exp( - [ (x - x_foot)² + (y - y_foot)² ] / [ 2 · σ(y)² ] ) · W_perspective(y)
            </div>
            <p className="text-[#5D757E] dark:text-slate-400">
              The kernel bandwidth σ(y) and weighting factor W_perspective(y) adapt continuously with vertical coordinate y. Pedestrians located near the horizon occupy smaller pixel clusters yet represent equal physical real-world density, preventing systematic undercounting in distant quadrants.
            </p>
          </div>
        </section>

        {/* Section 5: Heuristic Risk Index & Forecasting */}
        <section className="bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl p-5 space-y-3 shadow-xs">
          <h2 className="text-sm font-bold text-[#1C3334] dark:text-white flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-[#376E6F] dark:text-cyan-400" />
            <span>5. Heuristic Risk Formulation & Short-Term Projections</span>
          </h2>
          <div className="space-y-2.5 text-[#2F4454] dark:text-slate-300 leading-relaxed">
            <p>
              Instantaneous frame risk is derived from four explainable physical components normalized to [0.0, 1.0]:
            </p>
            <div className="p-3 bg-[#F8F9FA] dark:bg-[#0A1018] rounded-lg border border-[#CBD5D8] dark:border-[#1E2D40] font-mono text-[11px] text-rose-300">
              Risk_Score(t) = 100 × [ 0.35 · D(t) + 0.20 · G(t) + 0.25 · M(t) + 0.20 · C(t) ]
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-[11px] font-mono">
              <div className="p-2 bg-[#0A1018] rounded border border-[#1E2D40]">
                <span className="text-[#376E6F] dark:text-cyan-400 font-bold block">D(t) — Density Pressure (35%)</span>
                <span className="text-[#5D757E] dark:text-slate-400 text-[10px]">Peak Gaussian ground splat intensity</span>
              </div>
              <div className="p-2 bg-[#0A1018] rounded border border-[#1E2D40]">
                <span className="text-amber-400 font-bold block">G(t) — Surge Growth (20%)</span>
                <span className="text-[#5D757E] dark:text-slate-400 text-[10px]">Temporal rate of pedestrian influx</span>
              </div>
              <div className="p-2 bg-[#0A1018] rounded border border-[#1E2D40]">
                <span className="text-rose-400 font-bold block">M(t) — Motion Anomaly (25%)</span>
                <span className="text-[#5D757E] dark:text-slate-400 text-[10px]">Shannon entropy and acceleration variance</span>
              </div>
              <div className="p-2 bg-[#0A1018] rounded border border-[#1E2D40]">
                <span className="text-purple-400 font-bold block">C(t) — Spatial Congestion (20%)</span>
                <span className="text-[#5D757E] dark:text-slate-400 text-[10px]">Spatial 3×3 grid bottleneck concentration</span>
              </div>
            </div>
            <p className="text-[#5D757E] dark:text-slate-400 pt-1">
              Short-term forecasts (+5s, +10s, +15s) compute temporal velocity and density differentials over a rolling 15-frame window. Forecast values provide early advisory warnings to station controllers before sustained stampede thresholds are breached.
            </p>
          </div>
        </section>

        {/* Section 6: Privacy & Ethical Safeguards */}
        <section className="bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl p-5 space-y-3 shadow-xs">
          <h2 className="text-sm font-bold text-[#1C3334] dark:text-white flex items-center space-x-2">
            <Lock className="w-4 h-4 text-emerald-400" />
            <span>6. Privacy-Preserving Surveillance & Ethical Governance</span>
          </h2>
          <div className="space-y-2 text-[#2F4454] dark:text-slate-300 leading-relaxed">
            <p>
              CROWDGUARD enforces strict privacy-by-design standards:
            </p>
            <ul className="space-y-1.5 list-disc pl-5 text-[#5D757E] dark:text-slate-400">
              <li>
                <strong className="text-[#1C3334] dark:text-slate-200">Zero Biometric Identification:</strong> The vision pipeline does not extract facial features, identify individuals, or match identities against law enforcement databases.
              </li>
              <li>
                <strong className="text-[#1C3334] dark:text-slate-200">Integrated Anonymization Modes:</strong> Optional bilateral Gaussian face blurring and full silhouette masking can be configured prior to ingestion.
              </li>
              <li>
                <strong className="text-[#1C3334] dark:text-slate-200">Decoupled Telemetry:</strong> All stored analytics consist of anonymized centroid coordinates, velocity vectors, and aggregated spatial heatmaps.
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
};
