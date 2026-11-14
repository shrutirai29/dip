import React, { useState } from 'react';
import { 
  BookOpen, 
  Layers, 
  Compass, 
  TrendingUp, 
  Lock, 
  Cpu,
  Radio,
  FileCode,
  Sliders,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  Terminal,
  ShieldAlert
} from 'lucide-react';

const docSections = [
  { id: 'overview', title: 'Overview' },
  { id: 'architecture', title: 'Architecture' },
  { id: 'detection', title: 'Detection' },
  { id: 'optical-flow', title: 'Optical Flow' },
  { id: 'risk-engine', title: 'Risk Engine' },
  { id: 'camera-setup', title: 'Camera Setup' },
  { id: 'api', title: 'API' },
  { id: 'configuration', title: 'Configuration' },
  { id: 'troubleshooting', title: 'Troubleshooting' },
];

export const Documentation: React.FC = () => {
  const [activeSection, setActiveSection] = useState<string>('overview');

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="w-full text-xs text-ink space-y-6">
      {/* Editorial Header */}
      <div className="pb-4 border-b border-rule flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded-full bg-burgundy-soft border border-burgundy/20 text-burgundy text-[11px] font-mono font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-burgundy animate-pulse" />
            <span>Technical Reference Manual</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink font-display mt-1">
            System Documentation
          </h1>
          <p className="text-xs text-muted mt-1 max-w-2xl leading-relaxed">
            Mathematical formulations, computer vision pipelines, multi-camera architecture, and REST API specification for CROWDGUARD v2.0.
          </p>
        </div>

        <a
          href="/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-paper-2 hover:bg-paper-3 text-ink border border-rule rounded-lg text-xs font-medium transition"
        >
          <span>OpenAPI / Swagger UI</span>
          <ExternalLink className="w-3.5 h-3.5 text-muted" />
        </a>
      </div>

      {/* Two Column Technical Manual Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Sticky Documentation Navigation */}
        <nav className="lg:col-span-3 sticky top-20 bg-paper-2 border border-rule rounded-xl p-3 space-y-1 shadow-2xs">
          <div className="px-3 py-2 text-[10px] font-mono uppercase text-muted font-semibold tracking-wider border-b border-rule mb-1">
            Manual Navigation
          </div>
          {docSections.map((sec) => (
            <button
              key={sec.id}
              onClick={() => scrollToSection(sec.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${
                activeSection === sec.id
                  ? 'bg-burgundy text-white font-medium shadow-2xs'
                  : 'text-ink-2 hover:text-ink hover:bg-paper-3'
              }`}
            >
              <span>{sec.title}</span>
              {activeSection === sec.id && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ))}
        </nav>

        {/* Right Main Content */}
        <div className="lg:col-span-9 space-y-10 text-sm leading-relaxed text-ink-2">
          {/* 1. Overview */}
          <section id="overview" className="scroll-mt-24 space-y-4">
            <div className="border-b border-rule pb-2">
              <h2 className="text-xl font-bold text-ink font-display">1. System Overview</h2>
              <p className="text-xs text-muted font-mono">Platform mission, objectives, and operational scope</p>
            </div>
            <p>
              <strong>CROWDGUARD v2.0</strong> is an automated crowd safety and predictive hazard intelligence platform designed for high-density public infrastructure: railway concourses, sports stadiums, religious congregations, transit hubs, and commercial plazas.
            </p>
            <div className="p-4 bg-burgundy-soft/40 border border-burgundy/20 rounded-xl space-y-1">
              <span className="font-semibold text-burgundy text-xs font-mono uppercase">Key Operational Principle</span>
              <p className="text-xs text-ink leading-relaxed">
                Conventional video surveillance relies on passive human visual observation, which suffers severe cognitive fatigue after 20 minutes. CROWDGUARD shifts the paradigm from passive monitoring to <strong>proactive 10-second predictive intervention</strong> by synthesizing deep-learning headcount tracking with classical Gunnar Farneback optical flow physics.
              </p>
            </div>
          </section>

          {/* 2. Architecture */}
          <section id="architecture" className="scroll-mt-24 space-y-4">
            <div className="border-b border-rule pb-2">
              <h2 className="text-xl font-bold text-ink font-display">2. Pipeline Architecture</h2>
              <p className="text-xs text-muted font-mono">End-to-end data flow and processing stages</p>
            </div>
            <p>
              The platform executes a 4-stage pipeline that continuously transforms raw video frames into calibrated risk metrics:
            </p>

            <div className="p-4 bg-paper rounded-xl border border-rule font-mono text-xs overflow-x-auto space-y-2">
              <div className="text-muted font-sans font-medium text-[11px] uppercase">Data Pipeline Architecture</div>
              <div className="text-ink">
                [Raw Stream / RTSP / Webcam]
                <br />  │
                <br />  ▼ (Async Monotonic Queue)
                <br />[Stage 1: Ingestion & Frame Differencing]
                <br />  │
                <br />  ├─► [Stage 2: YOLOv8 Object Detection (Class 0: Person)] ──► [Centroid Tracker]
                <br />  │
                <br />  └─► [Stage 3: Gunnar Farneback Optical Flow] ──► [Directional Shannon Entropy]
                <br />        │
                <br />        ▼
                <br />  [Stage 4: 4-Factor Heuristic Risk Engine + Linear Forecast (+10s)]
                <br />        │
                <br />        ▼
                <br />  [FastAPI WebSocket Bus ──► React Mission Console & NVR Matrix]
              </div>
            </div>
          </section>

          {/* 3. Detection */}
          <section id="detection" className="scroll-mt-24 space-y-4">
            <div className="border-b border-rule pb-2">
              <h2 className="text-xl font-bold text-ink font-display">3. Object Detection & Tracking</h2>
              <p className="text-xs text-muted font-mono">Ultralytics YOLOv8n + Centroid Tracking Algorithm</p>
            </div>
            <p>
              Pedestrian detection is performed using <strong>Ultralytics YOLOv8 Nano</strong> (`yolov8n.pt`) fine-tuned for Class 0 (`person`). The model processes input tensors scaled to 640 \times 640 with aspect-preserving letterboxing.
            </p>
            <table className="w-full text-left text-xs border border-rule rounded-lg overflow-hidden">
              <thead className="bg-paper-3 text-muted font-mono font-medium">
                <tr>
                  <th className="p-3">Hyperparameter</th>
                  <th className="p-3">Default Value</th>
                  <th className="p-3">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule font-mono">
                <tr>
                  <td className="p-3 text-burgundy font-semibold">conf_threshold</td>
                  <td className="p-3">0.25</td>
                  <td className="p-3 font-sans">Minimum detection confidence for Class 0 bounding box acceptance.</td>
                </tr>
                <tr>
                  <td className="p-3 text-burgundy font-semibold">iou_threshold</td>
                  <td className="p-3">0.45</td>
                  <td className="p-3 font-sans">Non-Maximum Suppression (NMS) bounding box overlap threshold.</td>
                </tr>
                <tr>
                  <td className="p-3 text-burgundy font-semibold">perspective_weight</td>
                  <td className="p-3">1.2×</td>
                  <td className="p-3 font-sans">Compensates for optical camera foreshortening of distant pedestrians.</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* 4. Optical Flow */}
          <section id="optical-flow" className="scroll-mt-24 space-y-4">
            <div className="border-b border-rule pb-2">
              <h2 className="text-xl font-bold text-ink font-display">4. Dense Optical Flow & Shannon Entropy</h2>
              <p className="text-xs text-muted font-mono">Gunnar Farneback motion vectors and directional turbulence</p>
            </div>
            <p>
              Dense optical flow fields  (u(x,y), v(x,y))  are evaluated between consecutive grayscale frames using quadratic polynomial expansion:
            </p>
            <div className="p-3.5 bg-paper rounded-lg border border-rule font-mono text-xs space-y-1">
              <div>Flow Magnitude:  M(x, y) = √(u(x,y)² + v(x,y)²) </div>
              <div>Flow Direction:  θ(x, y) = atan2(v(x,y), u(x,y)) ∈ [-π, π] </div>
            </div>
            <p>
              To differentiate coordinated laminar flow (normal pedestrian movement) from chaotic multidirectional turbulence (stampede or panic onset), directional angles are partitioned into 8 angular sectors (45° bins) to calculate **Normalized Directional Shannon Entropy**:
            </p>
            <div className="p-3.5 bg-paper rounded-lg border border-rule font-mono text-xs text-burgundy space-y-1 font-semibold">
              <div> H = -∑ (i=1..8) p_i log₂(p_i) </div>
              <div> H_norm = H / log₂(8) = H / 3.0 ∈ [0.0, 1.0] </div>
            </div>
          </section>

          {/* 5. Risk Engine */}
          <section id="risk-engine" className="scroll-mt-24 space-y-4">
            <div className="border-b border-rule pb-2">
              <h2 className="text-xl font-bold text-ink font-display">5. 4-Factor Heuristic Risk Synthesis</h2>
              <p className="text-xs text-muted font-mono">Mathematical formulation of composite crowd hazard</p>
            </div>
            <p>
              The composite crowd risk score  R(t) ∈ [0, 100]  aggregates four normalized physical factors:
            </p>
            <div className="p-4 bg-paper rounded-xl border border-rule font-mono text-xs space-y-2">
              <div className="text-burgundy font-bold text-sm">
                 R(t) = 100 · [ w_1 · D(t) + w_2 · V(t) + w_3 · H_norm(t) + w_4 · A(t) ] 
              </div>
              <ul className="space-y-1 text-muted font-sans text-xs pt-1">
                <li>•  D(t) : Spatial density index (persons / m^2)</li>
                <li>•  V(t) : Mean flow speed magnitude</li>
                <li>•  H_norm(t) : Normalized directional Shannon entropy</li>
                <li>•  A(t) : Velocity gradient surge acceleration</li>
              </ul>
            </div>
          </section>

          {/* 6. Camera Setup */}
          <section id="camera-setup" className="scroll-mt-24 space-y-4">
            <div className="border-b border-rule pb-2">
              <h2 className="text-xl font-bold text-ink font-display">6. Camera Fleet & RTSP Security</h2>
              <p className="text-xs text-muted font-mono">Webcam ingestion, RTSP network streaming, and credential scrub</p>
            </div>
            <p>
              CROWDGUARD supports concurrent ingestion from local USB webcams (`/dev/video*`, Windows DirectShow index 0, 1) and remote RTSP security cameras.
            </p>
            <div className="p-4 bg-ok-soft/50 border border-ok/20 rounded-xl space-y-1">
              <span className="font-semibold text-ok text-xs font-mono uppercase">SSRF & Credential Protection</span>
              <p className="text-xs text-ink leading-relaxed">
                RTSP stream URLs containing embedded passwords (e.g., `rtsp://admin:pass@192.168.1.50/stream1`) are automatically scrubbed by `rtsp_security.py` prior to database persistence and client broadcast.
              </p>
            </div>
          </section>

          {/* 7. API */}
          <section id="api" className="scroll-mt-24 space-y-4">
            <div className="border-b border-rule pb-2">
              <h2 className="text-xl font-bold text-ink font-display">7. REST & WebSocket API Reference</h2>
              <p className="text-xs text-muted font-mono">Core FastAPI endpoints and telemetry streaming</p>
            </div>
            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 bg-paper rounded-lg border border-rule">
                <span className="text-ok font-bold">GET</span> <span className="text-ink">/api/health</span>
                <p className="text-[11px] text-muted font-sans mt-0.5">Returns health status of PyTorch, OpenCV, and FastAPI.</p>
              </div>
              <div className="p-3 bg-paper rounded-lg border border-rule">
                <span className="text-cool font-bold">POST</span> <span className="text-ink">/api/camera/start</span>
                <p className="text-[11px] text-muted font-sans mt-0.5">Initiates hardware webcam acquisition on index 0.</p>
              </div>
              <div className="p-3 bg-paper rounded-lg border border-rule">
                <span className="text-ok font-bold">GET</span> <span className="text-ink">/api/camera/stream</span>
                <p className="text-[11px] text-muted font-sans mt-0.5">Multipart MJPEG live video feed.</p>
              </div>
              <div className="p-3 bg-paper rounded-lg border border-rule">
                <span className="text-ok font-bold">GET</span> <span className="text-ink">/api/analysis/results</span>
                <p className="text-[11px] text-muted font-sans mt-0.5">Full time-series array of frame telemetry and risk scores.</p>
              </div>
            </div>
          </section>

          {/* 8. Configuration */}
          <section id="configuration" className="scroll-mt-24 space-y-4">
            <div className="border-b border-rule pb-2">
              <h2 className="text-xl font-bold text-ink font-display">8. System Configuration & Tuning</h2>
              <p className="text-xs text-muted font-mono">Environment variables and runtime calibration</p>
            </div>
            <p>
              Configuration is managed via `backend/app/core/config.py` and editable through the **Settings** console. Key environment variables include:
            </p>
            <pre className="p-4 bg-paper rounded-xl border border-rule font-mono text-xs overflow-x-auto text-ink">
{`PROJECT_NAME="Digital Image Processing Crowd Risk System"
VERSION="2.0.0"
API_V1_STR="/api"
CORS_ORIGINS=["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5174"]
MAX_CAMERAS=16
DEFAULT_CONF_THRESHOLD=0.25`}
            </pre>
          </section>

          {/* 9. Troubleshooting */}
          <section id="troubleshooting" className="scroll-mt-24 space-y-4">
            <div className="border-b border-rule pb-2">
              <h2 className="text-xl font-bold text-ink font-display">9. Troubleshooting & FAQ</h2>
              <p className="text-xs text-muted font-mono">Common operational edge cases and recovery protocols</p>
            </div>
            <div className="space-y-3">
              <div className="p-4 bg-paper rounded-xl border border-rule space-y-1">
                <h4 className="font-semibold text-ink text-xs">Port 5173 Conflict (Martian / NASA app)</h4>
                <p className="text-xs text-muted">
                  If `localhost:5173` is occupied by another local service on Windows IPv6 (`::1`), CROWDGUARD runs automatically on port **5174** with CORS configured for both ports.
                </p>
              </div>
              <div className="p-4 bg-paper rounded-xl border border-rule space-y-1">
                <h4 className="font-semibold text-ink text-xs">Camera Feed Inactive or Black Screen</h4>
                <p className="text-xs text-muted">
                  Ensure no other application (Zoom, Teams, OBS) is holding exclusive locks on Camera Device Index #0. Click "Connect Camera" in Live Monitoring to re-initialize the VideoCapture pipe.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
