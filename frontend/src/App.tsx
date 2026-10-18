import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Overview } from './pages/Overview';
import { VideoAnalysis } from './pages/VideoAnalysis';
import { LiveMonitoring } from './pages/LiveMonitoring';
import { Analytics } from './pages/Analytics';
import { Incidents } from './pages/Incidents';
import { SessionHistory } from './pages/SessionHistory';
import { SettingsPage } from './pages/Settings';
import { Documentation } from './pages/Documentation';

export function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-[#0B0F19]">
        {/* Sidebar */}
        <Navbar />

        {/* Main Workspace */}
        <main className="flex-1 ml-64 p-8 min-h-screen">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/video-analysis" element={<VideoAnalysis />} />
            <Route path="/monitoring" element={<LiveMonitoring />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/incidents" element={<Incidents />} />
            <Route path="/history" element={<SessionHistory />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/docs" element={<Documentation />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
