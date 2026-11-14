import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { 
  Menu, 
  ExternalLink,
  RefreshCw,
  Sun,
  Moon,
  Bell,
  User,
  Presentation
} from 'lucide-react';
import { useSystem } from '../context/SystemContext';
import { useTheme } from '../context/ThemeContext';

const routeDisplayTitles: Record<string, string> = {
  '/': 'Executive Dashboard',
  '/cameras': 'Multi-Camera Control Room',
  '/video-analysis': 'Video Analysis Studio',
  '/monitoring': 'Live Monitoring Console',
  '/analytics': 'Analytics & Forensics',
  '/incidents': 'Incidents & Alerts',
  '/history': 'Evidence & Session Archive',
  '/benchmarks': 'Empirical Benchmarks',
  '/settings': 'System Configuration',
  '/docs': 'Technical Documentation',
};

export const TopBar: React.FC = () => {
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const { 
    setMobileMenuOpen, 
    systemHealth, 
    triggerGlobalRefresh
  } = useSystem();

  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      // IST format
      const optionsDate: Intl.DateTimeFormatOptions = { 
        weekday: 'short', 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
      };
      const optionsTime: Intl.DateTimeFormatOptions = { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit', 
        hour12: false, 
        timeZone: 'Asia/Kolkata' 
      };
      
      setCurrentDate(now.toLocaleDateString('en-GB', optionsDate));
      setCurrentTime(now.toLocaleTimeString('en-GB', optionsTime) + ' IST');
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRefreshClick = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      triggerGlobalRefresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const pageTitle = routeDisplayTitles[location.pathname] || 'Operational Console';
  const isOnline = systemHealth === 'operational';

  return (
    <header className="sticky top-0 z-30 h-14 bg-paper-2 border-b border-rule px-4 sm:px-6 flex items-center justify-between text-xs transition-colors duration-150">
      {/* Left: Mobile trigger & Current Page Title */}
      <div className="flex items-center space-x-3 min-w-0">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="md:hidden p-1.5 rounded-md text-muted hover:text-ink hover:bg-paper-3 transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="flex items-center space-x-2.5 truncate">
          <span className="font-semibold text-sm text-ink tracking-tight font-display">
            {pageTitle}
          </span>
        </div>
      </div>

      {/* Center & Right: Editorial Separated Telemetry Strip */}
      <div className="flex items-center space-x-2 sm:space-x-3 text-muted font-mono text-[11px] shrink-0">
        <div className="hidden lg:flex items-center space-x-3">
          <span>{currentDate}</span>
          <span className="text-rule-2 font-sans">|</span>
          <span className="tabular-nums text-ink-2 font-medium">{currentTime}</span>
          <span className="text-rule-2 font-sans">|</span>
        </div>

        {/* System Online Badge */}
        <div className="flex items-center space-x-1.5 font-medium">
          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-ok animate-pulse' : 'bg-bad'}`} />
          <span className={isOnline ? 'text-ok font-mono' : 'text-bad font-mono'}>
            {isOnline ? 'System Online' : 'System Offline'}
          </span>
        </div>

        <span className="text-rule-2 font-sans hidden sm:inline">|</span>

        {/* Action controls */}
        <div className="flex items-center space-x-1">
          {/* Refresh Action */}
          <button
            onClick={handleRefreshClick}
            disabled={isRefreshing}
            className="p-1.5 text-muted hover:text-ink hover:bg-paper-3 rounded-md transition-colors"
            title="Refresh active telemetry"
            aria-label="Refresh telemetry"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-burgundy' : ''}`} />
          </button>

          {/* Presentation Slide Deck Link */}
          <a
            href="/presentation.html"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center space-x-1 px-2 py-1 bg-paper-3 hover:bg-burgundy-soft hover:text-burgundy text-ink-2 rounded border border-rule transition-colors text-[11px]"
            title="Open Interactive Presentation Deck"
          >
            <Presentation className="w-3.5 h-3.5 text-burgundy" />
            <span className="font-sans font-medium">Deck</span>
          </a>

          {/* Theme Toggle (Light / Dark) */}
          <button
            onClick={toggleTheme}
            className="p-1.5 text-muted hover:text-ink hover:bg-paper-3 rounded-md transition-colors"
            title={isDark ? 'Switch to Warm Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="w-3.5 h-3.5 text-warn" /> : <Moon className="w-3.5 h-3.5" />}
          </button>

          {/* Notification bell */}
          <button
            className="p-1.5 text-muted hover:text-ink hover:bg-paper-3 rounded-md transition-colors relative"
            title="Security Notifications"
            aria-label="Notifications"
          >
            <Bell className="w-3.5 h-3.5" />
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-burgundy" />
          </button>

          {/* Profile pill */}
          <div className="flex items-center space-x-1.5 pl-1.5 py-0.5">
            <div className="w-6 h-6 rounded-full bg-burgundy/10 text-burgundy border border-burgundy/20 flex items-center justify-center font-semibold text-[10px]">
              CR
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
