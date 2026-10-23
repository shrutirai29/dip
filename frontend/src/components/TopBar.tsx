import React, { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { 
  Menu, 
  Clock, 
  ExternalLink,
  RefreshCw,
  Sun,
  Moon
} from 'lucide-react';
import { useSystem } from '../context/SystemContext';
import { useTheme } from '../context/ThemeContext';

const routeTitles: Record<string, { title: string; subtitle: string }> = {
  '/': {
    title: 'Real-Time Crowd Intelligence',
    subtitle: 'Monitor. Analyse. Predict. Prevent. • High-precision spatial surveillance',
  },
  '/monitoring': {
    title: 'Live Surveillance & Spatial Replay',
    subtitle: '3D analytical plaza matrix, synchronized trajectory scrubbing & HUD telemetry',
  },
  '/cameras': {
    title: 'Multi-Camera Fleet Surveillance',
    subtitle: 'Concurrent CCTV stream monitoring, network isolation & failover recovery',
  },
  '/video-analysis': {
    title: 'Surveillance Ingestion Studio',
    subtitle: 'Upload CCTV footage, calibrate monocular perspective & launch inference',
  },
  '/analytics': {
    title: 'Crowd Dynamics & Forecasting',
    subtitle: 'Directional Shannon entropy, optical flow vectors & +10s risk projections',
  },
  '/incidents': {
    title: 'Incident Warnings & Hazard Audit',
    subtitle: 'Sustained condition hazard log, evidentiary keyframes & operator workflow',
  },
  '/history': {
    title: 'Surveillance Session Audit Log',
    subtitle: 'Historical archive of all video analyses, peak density metrics & audit CSV exports',
  },
  '/benchmarks': {
    title: 'System Evaluation & Benchmarks',
    subtitle: 'Detection accuracy, bottleneck profiling, adaptive scheduling & sustained validation',
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
  const { toggleTheme, isDark } = useTheme();
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
      bg: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700',
      dot: 'bg-slate-500 animate-pulse',
      label: 'CHECKING',
    },
    operational: {
      bg: 'bg-[#EEF5F5] dark:bg-[#183133] text-[#376E6F] dark:text-[#5EB4B6] border-[#376E6F]/30 dark:border-[#376E6F]/40',
      dot: 'bg-[#376E6F] dark:bg-[#5EB4B6] animate-pulse',
      label: 'OPERATIONAL',
    },
    degraded: {
      bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/30',
      dot: 'bg-amber-500',
      label: 'DEGRADED',
    },
    offline: {
      bg: 'bg-[#FAF0F2] dark:bg-rose-950/40 text-[#2E151B] dark:text-rose-300 border-[#2E151B]/20 dark:border-rose-500/30',
      dot: 'bg-[#DA7B93] dark:bg-rose-400',
      label: 'OFFLINE',
    },
  }[systemHealth];

  return (
    <header className="sticky top-0 z-20 h-14 bg-white/90 dark:bg-[#112022]/90 backdrop-blur-md border-b border-[#E2E8EA] dark:border-[#233C3F] px-4 md:px-6 flex items-center justify-between transition-colors duration-200">
      {/* Left: Mobile trigger & Page Context */}
      <div className="flex items-center space-x-3 overflow-hidden">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="md:hidden text-[#5D757E] dark:text-[#A0B7BC] hover:text-[#1C3334] dark:hover:text-white p-1 rounded hover:bg-[#F1F4F5] dark:hover:bg-[#16292B] cursor-pointer"
          aria-label="Open mobile navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="truncate">
          <h1 className="text-sm font-bold text-[#1C3334] dark:text-[#EEF4F5] tracking-tight flex items-center space-x-2 truncate">
            <span>{currentInfo.title}</span>
          </h1>
          <p className="text-[11px] text-[#5D757E] dark:text-[#A0B7BC] truncate hidden sm:block">
            {currentInfo.subtitle}
          </p>
        </div>
      </div>

      {/* Right: Theme Toggle, Active Session Context & Global Status */}
      <div className="flex items-center space-x-3 shrink-0">
        {/* Active Stream / Session Status */}
        {cameraSessionStatus && cameraSessionStatus.is_active ? (
          <div className="hidden lg:flex items-center space-x-2 px-2.5 py-1 rounded-lg bg-[#EEF5F5] dark:bg-[#16292B] border border-[#376E6F]/30 dark:border-[#376E6F]/40 text-xs shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[#376E6F] dark:bg-[#5EB4B6] animate-pulse" />
            <span className="text-[#5D757E] dark:text-[#A0B7BC] font-mono text-[11px]">Live Camera:</span>
            <span className="text-[#2F4454] dark:text-[#A3CBD4] font-mono font-medium text-[11px]">
              Device #{cameraSessionStatus.device_index ?? 0}
            </span>
            <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono uppercase ${
              cameraSessionStatus.state === 'CONNECTED' ? 'bg-[#376E6F]/15 text-[#376E6F] dark:text-[#6EC4C6] border border-[#376E6F]/30' :
              cameraSessionStatus.state === 'CONNECTING' ? 'bg-[#DA7B93]/15 text-[#DA7B93] border border-[#DA7B93]/30 animate-pulse' :
              'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
            }`}>
              {cameraSessionStatus.state}
            </span>
            <Link
              to="/monitoring?source=webcam"
              className="text-[#376E6F] dark:text-[#5EB4B6] hover:text-[#2F4454] dark:hover:text-white ml-1"
              title="Open Live Camera Telemetry"
              aria-label="Open live camera telemetry view"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : selectedAnalysis ? (
          <div className="hidden lg:flex items-center space-x-2 px-2.5 py-1 rounded-lg bg-[#F8F9FA] dark:bg-[#16292B] border border-[#E2E8EA] dark:border-[#233C3F] text-xs">
            <span className="text-[#5D757E] dark:text-[#A0B7BC] font-mono text-[11px]">Session:</span>
            <span className="text-[#1C3334] dark:text-[#EEF4F5] font-mono font-medium text-[11px]">
              {selectedAnalysis.id.slice(0, 10)}...
            </span>
            <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono uppercase ${
              selectedAnalysis.status === 'completed' ? 'bg-[#376E6F]/15 text-[#376E6F] dark:text-[#6EC4C6] border border-[#376E6F]/30' :
              selectedAnalysis.status === 'processing' ? 'bg-[#DA7B93]/15 text-[#DA7B93] border border-[#DA7B93]/30 animate-pulse' :
              'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400 border border-slate-300 dark:border-slate-700'
            }`}>
              {selectedAnalysis.status}
            </span>
            <Link
              to={`/monitoring?analysisId=${selectedAnalysis.id}`}
              className="text-[#376E6F] dark:text-[#5EB4B6] hover:text-[#2F4454] dark:hover:text-white ml-1"
              title="Open Session Telemetry"
              aria-label="Open session telemetry view"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <div className="hidden lg:flex items-center space-x-1.5 text-xs text-[#5D757E] dark:text-[#A0B7BC] font-mono">
            <Clock className="w-3.5 h-3.5" />
            <span>No Active Session</span>
          </div>
        )}

        {/* Global Operational Status Pill */}
        <div className={`flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-mono font-medium ${healthBadgeConfig.bg}`}>
          <span className={`w-2 h-2 rounded-full ${healthBadgeConfig.dot}`} />
          <span>{healthBadgeConfig.label}</span>
        </div>

        {/* Refresh System Telemetry Button */}
        <button
          onClick={handleRefreshClick}
          disabled={isRefreshing}
          className={`p-1.5 text-[#5D757E] dark:text-[#A0B7BC] hover:text-[#2F4454] dark:hover:text-white rounded-lg hover:bg-[#F1F4F5] dark:hover:bg-[#16292B] transition-colors cursor-pointer ${
            isRefreshing ? 'animate-spin text-[#376E6F] dark:text-[#5EB4B6]' : ''
          }`}
          title="Refresh System Telemetry & Catalog"
          aria-label="Refresh telemetry and catalog"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        {/* Brand Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border border-[#CBD5D8] dark:border-[#315357] bg-[#F1F4F5] dark:bg-[#16292B] hover:bg-[#E8EEF0] dark:hover:bg-[#1B3235] text-[#2F4454] dark:text-[#EDF4F5] transition-all cursor-pointer shadow-2xs"
          title={isDark ? "Switch to Warm Light Theme" : "Switch to Deep Charcoal Theme"}
          aria-label={isDark ? "Switch to warm light theme" : "Switch to dark theme"}
        >
          {isDark ? (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-400 animate-spin-slow" />
              <span className="text-[11px] font-semibold hidden sm:inline">Light</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-[#2F4454]" />
              <span className="text-[11px] font-semibold hidden sm:inline">Dark</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
