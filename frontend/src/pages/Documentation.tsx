import React from 'react';
import { BookOpen, Layers, Cpu, Compass, ShieldCheck } from 'lucide-react';

export const Documentation: React.FC = () => {
  return (
    <div className="space-y-6 max-w-4xl text-gray-300 text-sm">
      <div className="pb-4 border-b border-gray-800">
        <h1 className="text-2xl font-bold text-white tracking-tight">Academic DIP & AI Methodology Report</h1>
        <p className="text-sm text-gray-400 mt-1">
          Technical documentation of computer vision algorithms, mathematical formulations, and system architecture
        </p>
      </div>

      <div className="space-y-8">
        {/* Section 1: Problem Statement */}
        <section className="bg-[#111827] border border-gray-800 rounded-xl p-6 space-y-3">
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            <BookOpen className="w-4 h-4 text-cyan-400" />
            <span>1. Problem Statement & Research Motivation</span>
          </h2>
          <p className="text-xs leading-relaxed text-gray-400">
            High-density crowd catastrophes (e.g. stampedes, bottleneck crushes) frequently occur due to sudden surges in density and chaotic directional changes in restricted public passages. Conventional CCTV surveillance relies heavily on human monitors who experience vigilance fatigue. This project develops an automated Digital Image Processing (DIP) and Computer Vision pipeline that extracts real spatial and temporal crowd telemetry to generate explainable early warning indices.
          </p>
        </section>

        {/* Section 2: DIP Techniques */}
        <section className="bg-[#111827] border border-gray-800 rounded-xl p-6 space-y-3">
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span>2. Digital Image Processing (DIP) Algorithms</span>
          </h2>
          <div className="space-y-3 text-xs text-gray-400">
            <div>
              <span className="font-semibold text-white block">A. Gunnar Farneback Dense Optical Flow:</span>
              Computes optical motion vector field $(u, v)$ across consecutive frames by approximating neighborhoods using polynomial expansions. Used to identify sudden crowd velocity spikes and directional disorder.
            </div>
            <div>
              <span className="font-semibold text-white block">B. Spatial Gaussian Density Splatting:</span>
              Convolves 2D Gaussian kernels over detected ground points (feet coordinates) across the scene grid to produce smooth continuous density heatmaps, highlighting localized bottleneck clusters.
            </div>
            <div>
              <span className="font-semibold text-white block">C. Temporal Differencing & Filtering:</span>
              Applies frame differencing and bilateral noise suppression to filter sensor noise before feeding frames to the multi-scale tracker.
            </div>
          </div>
        </section>

        {/* Section 3: Risk Formula */}
        <section className="bg-[#111827] border border-gray-800 rounded-xl p-6 space-y-3">
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            <Compass className="w-4 h-4 text-cyan-400" />
            <span>3. Mathematical Risk Engine Formulation</span>
          </h2>
          <div className="p-4 bg-gray-900 rounded-lg border border-gray-800 font-mono text-xs text-cyan-300">
            Risk_Score(t) = 100 × [ w_density × D(t) + w_growth × G(t) + w_motion × M(t) + w_congestion × C(t) ]
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Where each sub-component is strictly normalized to the $[0, 1]$ interval, and the heuristic weights satisfy $\sum w_i = 1.0$. Temporal Exponential Moving Average (EMA) smoothing ($\alpha = 0.3$) is applied to avoid single-frame alert flickering.
          </p>
        </section>
      </div>
    </div>
  );
};
