import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  ShieldAlert, 
  LayoutDashboard, 
  Video as VideoIcon, 
  Activity, 
  BarChart3, 
  AlertTriangle, 
  History, 
  FileText, 
  Settings,
  Radio,
  Sparkles
} from 'lucide-react';

const navItems = [
  { name: 'Command Overview', path: '/', icon: LayoutDashboard },
  { name: 'Video Ingestion & Studio', path: '/video-analysis', icon: VideoIcon },
  { name: 'Live & Replay Stream', path: '/monitoring', icon: Activity },
  { name: 'Dynamics & Forecasts', path: '/analytics', icon: BarChart3 },
  { name: 'Incident Warnings', path: '/incidents', icon: AlertTriangle },
  { name: 'Audit Session History', path: '/history', icon: History },
  { name: 'DIP Methodology', path: '/docs', icon: FileText },
  { name: 'Engine Calibration', path: '/settings', icon: Settings },
];

export const Navbar: React.FC = () => {
  return (
    <aside className="w-64 bg-[#0D131C] border-r border-[#1D2935] flex flex-col justify-between h-screen fixed left-0 top-0 z-30 select-none">
      <div>
        {/* Brand Header */}
        <div className="p-5 border-b border-[#1D2935] flex items-center space-x-3 bg-[#070B12]/40">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 shadow-inner">
            <ShieldAlert className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-bold tracking-wider text-white">CROWDGUARD</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-mono border border-cyan-500/30">DIP</span>
            </div>
            <p className="text-[10px] text-[#8C9AAA] font-mono leading-tight mt-0.5">Disaster Risk Prediction</p>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="p-3 space-y-1 mt-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm'
                      : 'text-[#8C9AAA] hover:text-[#F4F7FA] hover:bg-[#111923]'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Footer Info & Telemetry Engine Status */}
      <div className="p-4 border-t border-[#1D2935] bg-[#070B12]/80 space-y-2">
        <div className="flex items-center justify-between text-[11px] text-[#8C9AAA]">
          <span className="flex items-center space-x-1.5">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="text-[#F4F7FA] font-medium">Pipeline Active</span>
          </span>
          <span className="text-[10px] bg-[#111923] border border-[#1D2935] px-2 py-0.5 rounded text-cyan-400 font-mono">v2.0-CV</span>
        </div>
        <p className="text-[10px] text-[#8C9AAA]/80 font-sans leading-relaxed">
          Farneback Optical Flow • Entropy • Perspective Splatting
        </p>
      </div>
    </aside>
  );
};
