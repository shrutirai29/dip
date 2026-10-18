import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { analysisApi, systemApi } from '../services/api';
import { Analysis } from '../types';

export type SystemHealthStatus = 'checking' | 'operational' | 'degraded' | 'offline';

interface SystemContextType {
  selectedAnalysis: Analysis | null;
  setSelectedAnalysis: (analysis: Analysis | null) => void;
  systemHealth: SystemHealthStatus;
  pipelineActive: boolean;
  refreshLatestAnalysis: () => Promise<void>;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  refreshCounter: number;
  triggerGlobalRefresh: () => void;
}

const SystemContext = createContext<SystemContextType | undefined>(undefined);

export const SystemProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedAnalysis, setSelectedAnalysis] = useState<Analysis | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealthStatus>('checking');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return window.innerWidth < 1280 && window.innerWidth >= 768;
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState<number>(0);

  // Request race condition guard
  const lastRequestIdRef = useRef<number>(0);

  const triggerGlobalRefresh = useCallback(() => {
    setRefreshCounter((prev) => prev + 1);
  }, []);

  const refreshLatestAnalysis = useCallback(async () => {
    const requestId = ++lastRequestIdRef.current;
    try {
      // 1. Perform truthful health check against GET /api/health
      const healthRes = await systemApi.healthCheck().catch(() => null);

      if (requestId !== lastRequestIdRef.current) return;

      if (!healthRes || healthRes.status !== 'healthy') {
        setSystemHealth('offline');
        setSelectedAnalysis(null);
        return;
      }

      // 2. Fetch analysis sessions
      const all = await analysisApi.getAll().catch(() => null);
      if (requestId !== lastRequestIdRef.current) return;

      if (all === null) {
        // API responded to health check but analysis endpoint failed -> degraded
        setSystemHealth('degraded');
        setSelectedAnalysis(null);
        return;
      }

      setSystemHealth('operational');

      if (all.length > 0) {
        // Prioritize actively processing job, then completed, then newest
        const processing = all.find((a) => a.status === 'processing');
        const completed = all.find((a) => a.status === 'completed');
        setSelectedAnalysis(processing || completed || all[0]);
      } else {
        setSelectedAnalysis(null);
      }
    } catch (err) {
      if (requestId !== lastRequestIdRef.current) return;
      console.warn('System telemetry check failed:', err);
      setSystemHealth('offline');
      setSelectedAnalysis(null);
    }
  }, []);

  useEffect(() => {
    refreshLatestAnalysis();
  }, [refreshLatestAnalysis, refreshCounter]);

  // A pipeline is active ONLY when an analysis status is actively 'processing'
  const pipelineActive = !!(selectedAnalysis && selectedAnalysis.status === 'processing');

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
        refreshCounter,
        triggerGlobalRefresh,
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
