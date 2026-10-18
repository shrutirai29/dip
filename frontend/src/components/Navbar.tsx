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
  ChevronLeft,
  ChevronRight,
  Radio,
  Cpu,
  X
} from 'lucide-react';
import { useSystem } from '../context/SystemContext';

interface NavGroup {
  groupName: string;
  items: {
    name: string;
    shortName: string;
    path: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }[];
}

const navGroups: NavGroup[] = [
  {
    groupName: 'MONITORING & SURVEILLANCE',
    items: [
      { name: 'Command Overview', shortName: 'Overview', path: '/', icon: LayoutDashboard },
      { name: 'Telemetry & Replay', shortName: 'Telemetry', path: '/monitoring', icon: Activity },
      { name: 'Dynamics & Forecasts', shortName: 'Forecasts', path: '/analytics', icon: BarChart3 },
      { name: 'Incident Warnings', shortName: 'Incidents', path: '/incidents', icon: AlertTriangle },
    ],
  },
  {
    groupName: 'STUDIO & FORENSICS',
    items: [
      { name: 'Video Ingestion Studio', shortName: 'Studio', path: '/video-analysis', icon: VideoIcon },
      { name: 'Audit Session History', shortName: 'History', path: '/history', icon: History },
      { name: 'DIP Methodology', shortName: 'Methodology', path: '/docs', icon: FileText },
      { name: 'Engine Calibration', shortName: 'Settings', path: '/settings', icon: Settings },
    ],
  },
];

export const Navbar: React.FC = () => {
  const { 
    sidebarCollapsed, 
    setSidebarCollapsed, 
    mobileMenuOpen, 
    setMobileMenuOpen,
    pipelineActive,
    systemHealth
  } = useSystem();

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Container */}
      <aside 
        className={`fixed top-0 bottom-0 left-0 z-40 flex flex-col justify-between bg-[#0A1018] border-r border-[#192638] transition-all duration-200 select-none ${
          mobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'
        } ${sidebarCollapsed ? 'md:w-16' : 'md:w-64'}`}
      >
        {/* Brand Header */}
        <div className="h-14 px-3.5 border-b border-[#192638] flex items-center justify-between bg-[#070B11]/80">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 shadow-inner">
              <ShieldAlert className="w-4 h-4 text-cyan-400" />
            </div>
            {!sidebarCollapsed && (
              <div className="truncate">
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs font-bold tracking-wider text-white">CROWDGUARD</span>
                  <span className="text-[9px] px-1 py-0.2 rounded bg-cyan-500/15 text-cyan-300 font-mono border border-cyan-500/30">
                    DIP
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono truncate">Surveillance & Risk</p>
              </div>
            )}
          </div>

          {/* Close button on mobile */}
          <button 
            className="md:hidden text-slate-400 hover:text-white p-1 rounded cursor-pointer"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation list */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-5">
          {navGroups.map((group) => (
            <div key={group.groupName} className="space-y-1">
              {!sidebarCollapsed && (
                <div className="px-2.5 pb-1 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                  {group.groupName}
                </div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    title={sidebarCollapsed ? item.name : undefined}
                    className={({ isActive }) =>
                      `flex items-center space-x-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold'
                          : 'text-slate-400 hover:text-slate-100 hover:bg-[#121C2B] border border-transparent'
                      } ${sidebarCollapsed ? 'justify-center px-0' : ''}`
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {!sidebarCollapsed && <span className="truncate">{item.name}</span>}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </div>

        {/* Desktop Collapse Toggle Button */}
        <div className="hidden md:flex items-center justify-end px-3 py-2 border-t border-[#192638] bg-[#070B11]/40">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center justify-center space-x-2 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-[#121C2B] rounded border border-transparent hover:border-[#1E2D40] transition-colors cursor-pointer"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <>
                <ChevronLeft className="w-3.5 h-3.5" />
                <span className="text-[11px] font-mono">Collapse Sidebar</span>
              </>
            )}
          </button>
        </div>

        {/* Footer Hardware & Engine Telemetry Status */}
        <div className="p-3 border-t border-[#192638] bg-[#070B11]/80">
          {sidebarCollapsed ? (
            <div className="flex justify-center" title="Engine Status: Active (v2.0-CV)">
              <span className={`w-2 h-2 rounded-full ${
                systemHealth === 'operational' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center space-x-1.5 text-slate-300">
                  <Radio className={`w-3 h-3 ${pipelineActive ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
                  <span className="font-medium text-[11px]">
                    {pipelineActive ? 'Pipeline Active' : 'Engine Ready'}
                  </span>
                </span>
                <span className="text-[10px] bg-[#121C2B] border border-[#1E2D40] px-1.5 py-0.2 rounded text-cyan-300 font-mono">
                  v2.0-CV
                </span>
              </div>
              <div className="flex items-center space-x-1 text-[10px] text-slate-400 font-mono truncate">
                <Cpu className="w-3 h-3 shrink-0" />
                <span className="truncate">Farneback • 2D Gaussian • YOLO</span>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
