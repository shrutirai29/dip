import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Video as VideoIcon, 
  Activity, 
  BarChart3, 
  AlertTriangle, 
  History, 
  Settings, 
  FileText,
  ShieldAlert
} from 'lucide-react';

const navItems = [
  { name: 'Overview', path: '/', icon: LayoutDashboard },
  { name: 'Video Analysis', path: '/video-analysis', icon: VideoIcon },
  { name: 'Live Monitoring', path: '/monitoring', icon: Activity },
  { name: 'Analytics', path: '/analytics', icon: BarChart3 },
  { name: 'Incidents & Alerts', path: '/incidents', icon: AlertTriangle },
  { name: 'Session History', path: '/history', icon: History },
  { name: 'Engine Settings', path: '/settings', icon: Settings },
  { name: 'DIP Documentation', path: '/docs', icon: FileText },
];

export const Navbar: React.FC = () => {
  return (
    <aside className="w-64 bg-[#111827] border-r border-gray-800 flex flex-col justify-between h-screen fixed left-0 top-0 z-30">
      <div>
        {/* Brand */}
        <div className="p-6 border-b border-gray-800 flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide">DIP CROWD SURVEILLANCE</h1>
            <p className="text-[11px] text-gray-400 font-mono">Disaster Risk Assessment</p>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shadow-sm'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
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

      {/* Footer Info */}
      <div className="p-4 border-t border-gray-800 bg-[#0d131f]/60">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Pipeline: Online</span>
          </span>
          <span className="text-[10px] bg-gray-800 px-2 py-0.5 rounded text-gray-300 font-mono">v1.0-DIP</span>
        </div>
      </div>
    </aside>
  );
};
