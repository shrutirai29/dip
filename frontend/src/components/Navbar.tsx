import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  ShieldAlert, 
  LayoutDashboard, 
  Radio, 
  Video as VideoIcon, 
  Activity, 
  BarChart3, 
  AlertTriangle, 
  History, 
  Cpu, 
  Settings, 
  FileText,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react';
import { useSystem } from '../context/SystemContext';

const navItems = [
  { name: 'Overview', path: '/', icon: LayoutDashboard },
  { name: 'Cameras', path: '/cameras', icon: Radio },
  { name: 'Video Analysis', path: '/video-analysis', icon: VideoIcon },
  { name: 'Monitoring', path: '/monitoring', icon: Activity },
  { name: 'Analytics', path: '/analytics', icon: BarChart3 },
  { name: 'Incidents', path: '/incidents', icon: AlertTriangle },
  { name: 'History', path: '/history', icon: History },
  { name: 'Benchmarks', path: '/benchmarks', icon: Cpu },
  { name: 'Settings', path: '/settings', icon: Settings },
  { name: 'Documentation', path: '/docs', icon: FileText },
];

export const Navbar: React.FC = () => {
  const { 
    sidebarCollapsed, 
    setSidebarCollapsed, 
    mobileMenuOpen, 
    setMobileMenuOpen,
    systemHealth,
    pipelineActive
  } = useSystem();

  const isOnline = systemHealth === 'operational' || pipelineActive;

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-ink/40 backdrop-blur-xs z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Persistent Sidebar */}
      <aside 
        className={`fixed top-0 bottom-0 left-0 z-40 flex flex-col justify-between bg-paper-2 border-r border-rule transition-[width,transform] duration-200 select-none ${
          mobileMenuOpen ? 'translate-x-0 w-[260px]' : '-translate-x-full md:translate-x-0'
        } ${sidebarCollapsed ? 'md:w-[72px]' : 'md:w-[260px]'}`}
      >
        {/* Brand Header */}
        <div className="h-16 px-4 border-b border-rule flex items-center justify-between bg-paper-2">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-9 h-9 rounded-lg bg-burgundy text-white flex items-center justify-center shrink-0 shadow-xs">
              <ShieldAlert className="w-5 h-5" />
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <div className="flex items-center space-x-1.5">
                  <span className="font-semibold text-sm tracking-tight text-ink">CROWDGUARD</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-paper-3 text-muted border border-rule">
                    v2.0
                  </span>
                </div>
                <p className="text-[11px] text-muted truncate leading-tight mt-0.5">
                  Crowd Risk Intelligence Platform
                </p>
              </div>
            )}
          </div>

          <button 
            className="md:hidden text-muted hover:text-ink p-1 rounded-sm"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                onClick={() => setMobileMenuOpen(false)}
                title={sidebarCollapsed ? item.name : undefined}
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-burgundy focus-visible:outline-none ${
                    isActive
                      ? 'bg-burgundy text-white shadow-xs'
                      : 'text-ink hover:text-ink hover:bg-paper-3 text-ink-2'
                  } ${sidebarCollapsed ? 'justify-center px-0' : ''}`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-muted'}`} />
                    {!sidebarCollapsed && (
                      <span className="truncate">{item.name}</span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom Section */}
        <div className="border-t border-rule bg-paper-3/40">
          {/* Desktop Collapse Toggle */}
          <div className="hidden md:flex items-center justify-end px-3 py-2">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="w-full flex items-center justify-center space-x-2 py-1.5 text-xs text-muted hover:text-ink hover:bg-paper-2 rounded-md border border-transparent hover:border-rule transition-colors cursor-pointer"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <>
                  <ChevronLeft className="w-4 h-4" />
                  <span className="text-xs">Collapse navigation</span>
                </>
              )}
            </button>
          </div>

          {/* System Status Footer */}
          <div className="p-3.5 border-t border-rule bg-paper-2">
            {sidebarCollapsed ? (
              <div className="flex justify-center" title="System Online">
                <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-ok' : 'bg-bad'}`} />
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[11px] font-medium text-muted">System status</span>
                  <span className="inline-flex items-center space-x-1.5 font-mono text-[11px] text-ok font-medium">
                    <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-ok animate-pulse' : 'bg-bad'}`} />
                    <span>{isOnline ? 'System Online' : 'System Offline'}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted font-mono pt-0.5">
                  <span>FastAPI · YOLOv8 · OpenCV</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
