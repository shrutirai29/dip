import React, { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { 
  Menu, 
  Clock, 
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import { useSystem } from '../context/SystemContext';

const routeTitles: Record<string, { title: string; subtitle: string }> = {
  '/': {
    title: 'Surveillance Command Overview',
    subtitle: 'Real-time crowd dynamics, automated telemetry & early risk indicators',
  },
  '/video-analysis': {
    title: 'Video Ingestion & Studio',
    subtitle: 'Upload CCTV footage, configure DIP perspective & launch inference',
  },
  '/monitoring': {
    title: 'Telemetry & Replay Stream',
    subtitle: 'Spatial 3x3 density matrix, synchronized trajectory scrubbing & HUD playback',
  },
  '/analytics': {
    title: 'Dynamics & Forecasting',
    subtitle: 'Directional Shannon entropy, velocity dynamics & +10s risk projections',
  },
  '/incidents': {
    title: 'Incident Warnings & Evidence',
    subtitle: 'Sustained hazard advisories, evidentiary keyframes & operator workflow',
  },
  '/history': {
    title: 'Audit Session History',
    subtitle: 'Historical inspection log, metric summaries & persistent database catalog',
  },
  '/docs': {
    title: 'DIP System Methodology',
    subtitle: 'Farneback flow mathematics, Shannon entropy & perspective Gaussian formulation',
  },
  '/settings': {
    title: 'Engine Calibration & Weights',
    subtitle: 'Risk heuristic coefficient configuration & monocular perspective calibration',
  },
};

export const TopBar: React.FC = () => {
  const location = useLocation();
  const { 
    selectedAnalysis, 
    cameraSessionStatus,
    setMobileMenuOpen,
    triggerGlobalRefresh,
    systemHealth
  } = useSystem();

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshClick = async () => {
    setIsRefreshing(true);
    triggerGlobalRefresh();
    // Keep brief indicator spin for visual feedback
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

  const currentInfo = routeTitles[location.pathname] || {
    title: 'CROWDGUARD Command Center',
    subtitle: 'Digital Image Processing Based Crowd Monitoring & Disaster Risk System',
  };

  const healthBadgeConfig = {
    checking: {
      bg: 'bg-slate-800 text-slate-300 border-slate-700',
      dot: 'bg-slate-400 animate-pulse',
      label: 'CHECKING',
    },
    operational: {
      bg: 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30',
      dot: 'bg-emerald-400 animate-pulse',
      label: 'OPERATIONAL',
    },
    degraded: {
      bg: 'bg-amber-950/40 text-amber-300 border-amber-500/30',
      dot: 'bg-amber-400',
      label: 'DEGRADED',
    },
    offline: {
      bg: 'bg-rose-950/40 text-rose-300 border-rose-500/30',
      dot: 'bg-rose-400',
      label: 'OFFLINE',
    },
  }[systemHealth];

  return (
    <header className="sticky top-0 z-20 h-14 bg-[#0A1018]/90 backdrop-blur-md border-b border-[#192638] px-4 md:px-6 flex items-center justify-between transition-all">
      {/* Left: Mobile trigger & Page Context */}
      <div className="flex items-center space-x-3 overflow-hidden">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="md:hidden text-slate-400 hover:text-white p-1 rounded hover:bg-[#121C2B] cursor-pointer"
          aria-label="Open mobile navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="truncate">
          <h1 className="text-sm font-bold text-white tracking-tight flex items-center space-x-2 truncate">
            <span>{currentInfo.title}</span>
          </h1>
          <p className="text-[11px] text-slate-400 truncate hidden sm:block">
            {currentInfo.subtitle}
          </p>
        </div>
      </div>

      {/* Right: Selected Session Context & Global Status Indicator */}
      <div className="flex items-center space-x-3 shrink-0">
        {cameraSessionStatus && cameraSessionStatus.is_active ? (
          <div className="hidden lg:flex items-center space-x-2 px-2.5 py-1 rounded-lg bg-[#0E1622] border border-cyan-500/30 text-xs shadow-sm shadow-cyan-950/40">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-slate-400 font-mono text-[11px]">Live Camera:</span>
            <span className="text-cyan-300 font-mono font-medium text-[11px]">
              Device #{cameraSessionStatus.device_index ?? 0}
            </span>
            <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono uppercase ${
              cameraSessionStatus.state === 'CONNECTED' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
              cameraSessionStatus.state === 'CONNECTING' ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 animate-pulse' :
              'bg-amber-500/15 text-amber-400 border border-amber-500/30'
            }`}>
              {cameraSessionStatus.state}
            </span>
            <Link
              to="/monitoring?source=webcam"
              className="text-cyan-400 hover:text-cyan-300 ml-1"
              title="Open Live Camera Telemetry"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : selectedAnalysis ? (
          <div className="hidden lg:flex items-center space-x-2 px-2.5 py-1 rounded-lg bg-[#0E1622] border border-[#1E2D40] text-xs">
            <span className="text-slate-400 font-mono text-[11px]">Session:</span>
            <span className="text-white font-mono font-medium text-[11px]">
              {selectedAnalysis.id.slice(0, 10)}...
            </span>
            <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono uppercase ${
              selectedAnalysis.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
              selectedAnalysis.status === 'processing' ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 animate-pulse' :
              'bg-slate-800 text-slate-400 border border-slate-700'
            }`}>
              {selectedAnalysis.status}
            </span>
            <Link
              to={`/monitoring?analysisId=${selectedAnalysis.id}`}
              className="text-cyan-400 hover:text-cyan-300 ml-1"
              title="Open Session Telemetry"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <div className="hidden lg:flex items-center space-x-1.5 text-xs text-slate-400 font-mono">
            <Clock className="w-3.5 h-3.5" />
            <span>No Active Session</span>
          </div>
        )}

        {/* Global Operational Status Pill */}
        <div className="flex items-center space-x-2 pl-2 border-l border-[#192638]">
          <button
            onClick={handleRefreshClick}
            disabled={isRefreshing}
            className={`p-1.5 text-slate-400 hover:text-cyan-300 rounded hover:bg-[#121C2B] transition-colors cursor-pointer ${
              isRefreshing ? 'animate-spin text-cyan-400' : ''
            }`}
            title="Refresh System Telemetry & Catalog"
            aria-label="Refresh telemetry and catalog"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          
          <div className={`flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-mono font-medium ${healthBadgeConfig.bg}`}>
            <span className={`w-2 h-2 rounded-full ${healthBadgeConfig.dot}`} />
            <span>{healthBadgeConfig.label}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
