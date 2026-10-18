import React, { createContext, useContext, useState, useEffect } from 'react';
import { analysisApi } from '../services/api';
import { Analysis } from '../types';

interface SystemContextType {
  selectedAnalysis: Analysis | null;
  setSelectedAnalysis: (analysis: Analysis | null) => void;
  systemHealth: 'operational' | 'degraded' | 'offline';
  pipelineActive: boolean;
  refreshLatestAnalysis: () => Promise<void>;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const SystemContext = createContext<SystemContextType | undefined>(undefined);

export const SystemProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedAnalysis, setSelectedAnalysis] = useState<Analysis | null>(null);
  const [systemHealth, setSystemHealth] = useState<'operational' | 'degraded' | 'offline'>('operational');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return window.innerWidth < 1280 && window.innerWidth >= 768;
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const refreshLatestAnalysis = async () => {
    try {
      const all = await analysisApi.getAll();
      if (all && all.length > 0) {
        // Look for completed analysis first, otherwise latest
        const completed = all.find(a => a.status === 'completed');
        setSelectedAnalysis(completed || all[0]);
        setSystemHealth('operational');
      } else {
        setSelectedAnalysis(null);
      }
    } catch (err) {
      console.warn('System telemetry check failed:', err);
      setSystemHealth('degraded');
    }
  };

  useEffect(() => {
    refreshLatestAnalysis();
  }, []);

  const pipelineActive = !!(
    selectedAnalysis && (selectedAnalysis.status === 'processing' || selectedAnalysis.status === 'completed')
  );

  return (
    <SystemContext.Provider
      value={{
        selectedAnalysis,
        setSelectedAnalysis,
        systemHealth,
        pipelineActive,
        refreshLatestAnalysis,
        sidebarCollapsed,
        setSidebarCollapsed,
        mobileMenuOpen,
        setMobileMenuOpen,
      }}
    >
      {children}
    </SystemContext.Provider>
  );
};

export const useSystem = (): SystemContextType => {
  const context = useContext(SystemContext);
  if (!context) {
    throw new Error('useSystem must be used within a SystemProvider');
  }
  return context;
};
