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
      { name: 'Overview', shortName: 'Overview', path: '/', icon: LayoutDashboard },
      { name: 'Live Monitoring', shortName: 'Live', path: '/monitoring', icon: Activity },
      { name: 'Multi-Camera', shortName: 'Cameras', path: '/cameras', icon: Radio }, 
      { name: 'Video Analysis', shortName: 'Analysis', path: '/video-analysis', icon: VideoIcon },
      { name: 'Analytics', shortName: 'Analytics', path: '/analytics', icon: BarChart3 },
    ],
  },
  {
    groupName: 'FORENSICS & AUDIT',
    items: [
      { name: 'Incidents', shortName: 'Incidents', path: '/incidents', icon: AlertTriangle },
      { name: 'Session History', shortName: 'History', path: '/history', icon: History },
      { name: 'Benchmarks', shortName: 'Benchmarks', path: '/benchmarks', icon: Cpu },
      { name: 'Settings', shortName: 'Settings', path: '/settings', icon: Settings },
      { name: 'Documentation', shortName: 'Docs', path: '/docs', icon: FileText },
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
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Container */}
      <aside 
        className={`fixed top-0 bottom-0 left-0 z-40 flex flex-col justify-between bg-white dark:bg-[#0E1A1B] border-r border-[#E2E8EA] dark:border-[#1F3538] transition-all duration-200 select-none ${
          mobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'
        } ${sidebarCollapsed ? 'md:w-16' : 'md:w-64'}`}
      >
        {/* Brand Header */}
        <div className="h-14 px-3.5 border-b border-[#E2E8EA] dark:border-[#1F3538] flex items-center justify-between bg-[#F8F9FA]/80 dark:bg-[#0B1415]/80">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-[#2F4454]/10 dark:bg-[#376E6F]/20 border border-[#2F4454]/25 dark:border-[#376E6F]/40 flex items-center justify-center text-[#2F4454] dark:text-[#6EB5B6] shrink-0 shadow-2xs">
              <ShieldAlert className="w-4 h-4 text-[#2F4454] dark:text-[#6EB5B6]" />
            </div>
            {!sidebarCollapsed && (
              <div className="truncate">
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs font-bold tracking-wider text-[#1C3334] dark:text-[#EEF4F5]">CROWDGUARD</span>
                  <span className="text-[9px] px-1 py-0.2 rounded bg-[#DA7B93]/15 text-[#B34D66] dark:text-[#DA7B93] font-mono border border-[#DA7B93]/30 font-semibold">
                    v2.0
                  </span>
                </div>
                <p className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] font-mono truncate">Crowd Intelligence Platform</p>
              </div>
            )}
          </div>

          {/* Close button on mobile */}
          <button 
            className="md:hidden text-[#5D757E] dark:text-[#A0B7BC] hover:text-[#1C3334] dark:hover:text-white p-1 rounded cursor-pointer"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation list */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {navGroups.map((group) => (
            <div key={group.groupName} className="space-y-1">
              {!sidebarCollapsed && (
                <div className="px-2.5 pb-1 text-[9px] font-bold tracking-widest text-[#5D757E] dark:text-[#6C868B] uppercase">
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
                          ? 'bg-[#FAF3F5] dark:bg-[#1F171C] text-[#1C3334] dark:text-[#EEF4F5] border-l-2 border-[#DA7B93] font-semibold shadow-2xs'
                          : 'text-[#2F4454] dark:text-[#A0B7BC] hover:text-[#1C3334] dark:hover:text-white hover:bg-[#F2ECE6] dark:hover:bg-[#152729] border-l-2 border-transparent'
                      } ${sidebarCollapsed ? 'justify-center px-0' : ''}`
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0 text-[#376E6F] dark:text-[#6EB5B6]" />
                    {!sidebarCollapsed && <span className="truncate">{item.name}</span>}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </div>

        {/* Desktop Collapse Toggle Button */}
        <div className="hidden md:flex items-center justify-end px-3 py-2 border-t border-[#E2E8EA] dark:border-[#1F3538] bg-[#F8F9FA]/40 dark:bg-[#0B1415]/40">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center justify-center space-x-2 py-1.5 text-xs text-[#5D757E] dark:text-[#A0B7BC] hover:text-[#1C3334] dark:hover:text-white hover:bg-[#F1F4F5] dark:hover:bg-[#152729] rounded border border-transparent hover:border-[#CBD5D8] dark:hover:border-[#2C4B4E] transition-colors cursor-pointer"
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
        <div className="p-3 border-t border-[#E2E8EA] dark:border-[#1F3538] bg-[#F8F9FA]/80 dark:bg-[#0B1415]/80">
          {sidebarCollapsed ? (
            <div className="flex justify-center" title={`Engine Status: ${systemHealth.toUpperCase()}`}>
              <span className={`w-2 h-2 rounded-full ${
                systemHealth === 'operational' ? (pipelineActive ? 'bg-[#376E6F] dark:bg-[#6EB5B6] animate-pulse' : 'bg-emerald-500') :
                systemHealth === 'degraded' ? 'bg-amber-500' :
                systemHealth === 'checking' ? 'bg-slate-400 animate-pulse' : 'bg-[#2E151B] dark:bg-rose-500'
              }`} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center space-x-1.5 text-[#1C3334] dark:text-[#EDF4F5]">
                  <Radio className={`w-3 h-3 ${
                    systemHealth === 'operational'
                      ? (pipelineActive ? 'text-[#376E6F] dark:text-[#6EB5B6] animate-pulse' : 'text-emerald-500')
                      : systemHealth === 'degraded'
                      ? 'text-amber-500'
                      : systemHealth === 'checking'
                      ? 'text-slate-400 animate-pulse'
                      : 'text-[#2E151B] dark:text-rose-400'
                  }`} />
                  <span className="font-medium text-[11px]">
                    {pipelineActive
                      ? 'Job In Progress'
                      : systemHealth === 'operational'
                      ? 'Engine Standby'
                      : systemHealth === 'degraded'
                      ? 'Degraded Link'
                      : systemHealth === 'checking'
                      ? 'Connecting...'
                      : 'Server Offline'}
                  </span>
                </span>
                <span className="text-[10px] bg-white dark:bg-[#152729] border border-[#CBD5D8] dark:border-[#2C4B4E] px-1.5 py-0.2 rounded text-[#2F4454] dark:text-[#A0B7BC] font-mono">
                  v2.0-CV
                </span>
              </div>
              <div className="flex items-center space-x-1 text-[10px] text-[#5D757E] dark:text-[#6C868B] font-mono truncate">
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
