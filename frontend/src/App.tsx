import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { TopBar } from './components/TopBar';
import { ThemeProvider } from './context/ThemeContext';
import { SystemProvider, useSystem } from './context/SystemContext';

import { Overview } from './pages/Overview';
import { VideoAnalysis } from './pages/VideoAnalysis';
import { LiveMonitoring } from './pages/LiveMonitoring';
import { Analytics } from './pages/Analytics';
import { Incidents } from './pages/Incidents';
import { SessionHistory } from './pages/SessionHistory';
import { SettingsPage } from './pages/Settings';
import { Documentation } from './pages/Documentation';
import { MultiCameraPage } from './pages/MultiCamera';
import { BenchmarksPage } from './pages/Benchmarks';

import './App.css';

const AppLayout: React.FC = () => {
  const { sidebarCollapsed } = useSystem();

  return (
    <div className="min-h-screen bg-paper text-ink flex transition-colors duration-200 selection:bg-accent-soft selection:text-ink">
      {/* Precision Navigation Sidebar */}
      <Navbar />

      {/* Main Console Workspace */}
      <div 
        className={`flex-1 flex flex-col min-w-0 transition-[margin] duration-200 ${
          sidebarCollapsed ? 'md:ml-[72px]' : 'md:ml-[260px]'
        }`}
      >
        {/* Top Context & Telemetry Bar */}
        <TopBar />

        {/* Scrollable Workspace Container */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1700px] w-full mx-auto">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/cameras" element={<MultiCameraPage />} />
            <Route path="/video-analysis" element={<VideoAnalysis />} />
            <Route path="/monitoring" element={<LiveMonitoring />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/incidents" element={<Incidents />} />
            <Route path="/history" element={<SessionHistory />} />
            <Route path="/benchmarks" element={<BenchmarksPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/docs" element={<Documentation />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

export function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <SystemProvider>
          <AppLayout />
        </SystemProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
