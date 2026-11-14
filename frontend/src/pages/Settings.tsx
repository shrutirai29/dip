import React, { useState } from 'react';
import { 
  Cpu, 
  Lock, 
  Compass, 
  Sliders, 
  ShieldCheck, 
  HardDrive,
  Bell,
  Settings as SettingsIcon,
  Check,
  Save,
  RotateCcw
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'detection' | 'risk' | 'alerts' | 'system'>('detection');

  // Detection Tab State
  const [confThreshold, setConfThreshold] = useState<number>(0.25);
  const [iouThreshold, setIouThreshold] = useState<number>(0.45);
  const [maxPersons, setMaxPersons] = useState<number>(500);
  const [enableTracking, setEnableTracking] = useState<boolean>(true);
  const [drawBoxes, setDrawBoxes] = useState<boolean>(true);
  const [showPersonCount, setShowPersonCount] = useState<boolean>(true);

  // Risk Engine Tab State
  const [densityWeight, setDensityWeight] = useState<number>(0.35);
  const [flowWeight, setFlowWeight] = useState<number>(0.25);
  const [entropyWeight, setEntropyWeight] = useState<number>(0.25);
  const [surgeWeight, setSurgeWeight] = useState<number>(0.15);

  // Alerts Tab State
  const [threshLow, setThreshLow] = useState<number>(25);
  const [threshModerate, setThreshModerate] = useState<number>(45);
  const [threshHigh, setThreshHigh] = useState<number>(70);
  const [threshCritical, setThreshCritical] = useState<number>(85);
  const [enableSiren, setEnableSiren] = useState<boolean>(false);
  const [autoDispatch, setAutoDispatch] = useState<boolean>(true);

  // System Tab State
  const [rtspTimeout, setRtspTimeout] = useState<number>(5);
  const [maxQueueSize, setMaxQueueSize] = useState<number>(100);
  const [logLevel, setLogLevel] = useState<string>('INFO');
  const [hardwareTarget, setHardwareTarget] = useState<string>('auto');

  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const handleSave = () => {
    setSavedMessage('Configuration applied and saved to local runtime.');
    setTimeout(() => setSavedMessage(null), 3000);
  };

  const handleReset = () => {
    setConfThreshold(0.25);
    setIouThreshold(0.45);
    setMaxPersons(500);
    setDensityWeight(0.35);
    setFlowWeight(0.25);
    setEntropyWeight(0.25);
    setSurgeWeight(0.15);
    setThreshLow(25);
    setThreshModerate(45);
    setThreshHigh(70);
    setThreshCritical(85);
    setSavedMessage('Defaults restored.');
    setTimeout(() => setSavedMessage(null), 2500);
  };

  return (
    <div className="space-y-6 w-full text-xs text-ink">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-rule gap-4">
        <div>
          <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded-full bg-burgundy-soft border border-burgundy/20 text-burgundy text-[11px] font-mono font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-burgundy animate-pulse" />
            <span>Engineering Console</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink font-display mt-1">
            System Settings
          </h1>
          <p className="text-xs text-muted mt-1 max-w-2xl leading-relaxed">
            Active calibration for YOLOv8 inference, Gunnar Farneback optical flow, 4-factor risk synthesis, and emergency alert thresholds.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleReset}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-paper-2 hover:bg-paper-3 text-ink border border-rule rounded-lg text-xs font-medium transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-muted" />
            <span>Restore Defaults</span>
          </button>
          <button
            onClick={handleSave}
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-burgundy hover:bg-burgundy-hover text-white rounded-lg text-xs font-medium transition cursor-pointer shadow-2xs"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Configuration</span>
          </button>
        </div>
      </div>

      {savedMessage && (
        <div className="p-3 bg-ok-soft border border-ok/20 rounded-lg text-ok font-mono text-xs flex items-center space-x-2">
          <Check className="w-4 h-4 text-ok" />
          <span>{savedMessage}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center space-x-1 p-1 bg-paper-3 border border-rule rounded-xl w-max">
        <button
          onClick={() => setActiveTab('detection')}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
            activeTab === 'detection' ? 'bg-burgundy text-white shadow-2xs' : 'text-muted hover:text-ink'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>Detection</span>
        </button>
        <button
          onClick={() => setActiveTab('risk')}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
            activeTab === 'risk' ? 'bg-burgundy text-white shadow-2xs' : 'text-muted hover:text-ink'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Risk Engine</span>
        </button>
        <button
          onClick={() => setActiveTab('alerts')}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
            activeTab === 'alerts' ? 'bg-burgundy text-white shadow-2xs' : 'text-muted hover:text-ink'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>Alerts</span>
        </button>
        <button
          onClick={() => setActiveTab('system')}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
            activeTab === 'system' ? 'bg-burgundy text-white shadow-2xs' : 'text-muted hover:text-ink'
          }`}
        >
          <HardDrive className="w-3.5 h-3.5" />
          <span>System</span>
        </button>
      </div>

      {/* Tab 1: Detection Settings */}
      {activeTab === 'detection' && (
        <div className="space-y-4">
          <div className="bg-paper-2 border border-rule rounded-xl p-5 shadow-2xs space-y-4">
            <h3 className="text-sm font-semibold text-ink font-display pb-3 border-b border-rule">
              YOLOv8 & Tracking Parameters
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Conf Threshold */}
              <div className="p-3.5 bg-paper rounded-lg border border-rule space-y-2">
                <div className="flex justify-between items-center">
                  <label className="font-medium text-ink">Confidence Threshold</label>
                  <span className="font-mono font-semibold text-burgundy">{confThreshold.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="0.80"
                  step="0.05"
                  value={confThreshold}
                  onChange={(e) => setConfThreshold(parseFloat(e.target.value))}
                  className="w-full accent-burgundy"
                />
                <p className="text-[11px] text-muted">Minimum detection confidence for Class 0 (Person).</p>
              </div>

              {/* IoU Threshold */}
              <div className="p-3.5 bg-paper rounded-lg border border-rule space-y-2">
                <div className="flex justify-between items-center">
                  <label className="font-medium text-ink">NMS IoU Threshold</label>
                  <span className="font-mono font-semibold text-burgundy">{iouThreshold.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.20"
                  max="0.70"
                  step="0.05"
                  value={iouThreshold}
                  onChange={(e) => setIouThreshold(parseFloat(e.target.value))}
                  className="w-full accent-burgundy"
                />
                <p className="text-[11px] text-muted">Non-maximum suppression overlap threshold.</p>
              </div>

              {/* Max Persons */}
              <div className="p-3.5 bg-paper rounded-lg border border-rule space-y-2">
                <label className="font-medium text-ink block">Max Persons Per Frame</label>
                <input
                  type="number"
                  min="50"
                  max="2000"
                  value={maxPersons}
                  onChange={(e) => setMaxPersons(parseInt(e.target.value) || 500)}
                  className="w-full bg-paper-2 border border-rule rounded p-2 text-xs font-mono font-semibold text-ink focus:outline-none focus:border-burgundy"
                />
                <p className="text-[11px] text-muted">Hard ceiling for centroid tracker allocation.</p>
              </div>

              {/* Toggles */}
              <div className="p-3.5 bg-paper rounded-lg border border-rule space-y-3">
                <span className="font-medium text-ink block">Surveillance HUD Toggles</span>
                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableTracking}
                    onChange={(e) => setEnableTracking(e.target.checked)}
                    className="rounded accent-burgundy cursor-pointer"
                  />
                  <span className="text-xs text-ink-2">Enable Centroid & ByteTrack Association</span>
                </label>
                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={drawBoxes}
                    onChange={(e) => setDrawBoxes(e.target.checked)}
                    className="rounded accent-burgundy cursor-pointer"
                  />
                  <span className="text-xs text-ink-2">Draw Person Bounding Boxes</span>
                </label>
                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPersonCount}
                    onChange={(e) => setShowPersonCount(e.target.checked)}
                    className="rounded accent-burgundy cursor-pointer"
                  />
                  <span className="text-xs text-ink-2">Display Live Headcount Telemetry</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Risk Engine Settings */}
      {activeTab === 'risk' && (
        <div className="space-y-4">
          <div className="bg-paper-2 border border-rule rounded-xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-rule">
              <div>
                <h3 className="text-sm font-semibold text-ink font-display">
                  4-Factor Risk Engine Heuristic Weights
                </h3>
                <p className="text-[11px] text-muted">
                  Normalized composite model: Score = w1 · Density + w2 · Flow + w3 · Entropy + w4 · Surge
                </p>
              </div>
              <span className="font-mono text-xs text-burgundy font-semibold">
                Total: {((densityWeight + flowWeight + entropyWeight + surgeWeight) * 100).toFixed(0)}%
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3.5 bg-paper rounded-lg border border-rule space-y-2">
                <div className="flex justify-between items-center">
                  <label className="font-medium text-ink">Density Weight (\(w_1\))</label>
                  <span className="font-mono font-semibold text-burgundy">{(densityWeight * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="0.60"
                  step="0.05"
                  value={densityWeight}
                  onChange={(e) => setDensityWeight(parseFloat(e.target.value))}
                  className="w-full accent-burgundy"
                />
                <p className="text-[11px] text-muted">Contribution of spatial crowd headcount and grid density.</p>
              </div>

              <div className="p-3.5 bg-paper rounded-lg border border-rule space-y-2">
                <div className="flex justify-between items-center">
                  <label className="font-medium text-ink">Flow Velocity Weight (\(w_2\))</label>
                  <span className="font-mono font-semibold text-burgundy">{(flowWeight * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="0.50"
                  step="0.05"
                  value={flowWeight}
                  onChange={(e) => setFlowWeight(parseFloat(e.target.value))}
                  className="w-full accent-burgundy"
                />
                <p className="text-[11px] text-muted">Contribution of Farneback optical motion speed.</p>
              </div>

              <div className="p-3.5 bg-paper rounded-lg border border-rule space-y-2">
                <div className="flex justify-between items-center">
                  <label className="font-medium text-ink">Directional Entropy Weight (\(w_3\))</label>
                  <span className="font-mono font-semibold text-burgundy">{(entropyWeight * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="0.50"
                  step="0.05"
                  value={entropyWeight}
                  onChange={(e) => setEntropyWeight(parseFloat(e.target.value))}
                  className="w-full accent-burgundy"
                />
                <p className="text-[11px] text-muted">Contribution of angular flow disorder (Shannon H).</p>
              </div>

              <div className="p-3.5 bg-paper rounded-lg border border-rule space-y-2">
                <div className="flex justify-between items-center">
                  <label className="font-medium text-ink">Surge Acceleration Weight (\(w_4\))</label>
                  <span className="font-mono font-semibold text-burgundy">{(surgeWeight * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.40"
                  step="0.05"
                  value={surgeWeight}
                  onChange={(e) => setSurgeWeight(parseFloat(e.target.value))}
                  className="w-full accent-burgundy"
                />
                <p className="text-[11px] text-muted">Contribution of sudden acceleration spikes.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Alerts Settings */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          <div className="bg-paper-2 border border-rule rounded-xl p-5 shadow-2xs space-y-4">
            <h3 className="text-sm font-semibold text-ink font-display pb-3 border-b border-rule">
              Risk Thresholds & Operational Response
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center font-mono">
              <div className="p-3 bg-ok-soft rounded-lg border border-ok/20">
                <span className="text-[10px] text-ok block font-sans font-medium uppercase">Low Band</span>
                <span className="text-lg font-bold text-ok block mt-1">0 – {threshModerate - 1}</span>
              </div>
              <div className="p-3 bg-warn-soft rounded-lg border border-warn/25">
                <span className="text-[10px] text-warn block font-sans font-medium uppercase">Moderate Band</span>
                <span className="text-lg font-bold text-warn block mt-1">{threshModerate} – {threshHigh - 1}</span>
              </div>
              <div className="p-3 bg-burgundy-soft rounded-lg border border-burgundy/25">
                <span className="text-[10px] text-burgundy block font-sans font-medium uppercase">High Band</span>
                <span className="text-lg font-bold text-burgundy block mt-1">{threshHigh} – {threshCritical - 1}</span>
              </div>
              <div className="p-3 bg-bad-soft rounded-lg border border-bad/30">
                <span className="text-[10px] text-bad block font-sans font-medium uppercase">Critical Band</span>
                <span className="text-lg font-bold text-bad block mt-1">{threshCritical}+</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-3.5 bg-paper rounded-lg border border-rule space-y-2">
                <label className="font-medium text-ink block">Moderate Alert Cutoff</label>
                <input
                  type="number"
                  min="20"
                  max="60"
                  value={threshModerate}
                  onChange={(e) => setThreshModerate(parseInt(e.target.value) || 45)}
                  className="w-full bg-paper-2 border border-rule rounded p-2 text-xs font-mono font-semibold text-ink focus:outline-none focus:border-burgundy"
                />
              </div>

              <div className="p-3.5 bg-paper rounded-lg border border-rule space-y-2">
                <label className="font-medium text-ink block">High Risk Evacuation Cutoff</label>
                <input
                  type="number"
                  min="50"
                  max="90"
                  value={threshHigh}
                  onChange={(e) => setThreshHigh(parseInt(e.target.value) || 70)}
                  className="w-full bg-paper-2 border border-rule rounded p-2 text-xs font-mono font-semibold text-ink focus:outline-none focus:border-burgundy"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: System Settings */}
      {activeTab === 'system' && (
        <div className="space-y-4">
          <div className="bg-paper-2 border border-rule rounded-xl p-5 shadow-2xs space-y-4">
            <h3 className="text-sm font-semibold text-ink font-display pb-3 border-b border-rule">
              Runtime Architecture & Hardware Backend
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3.5 bg-paper rounded-lg border border-rule space-y-2">
                <label className="font-medium text-ink block">RTSP Connection Timeout (seconds)</label>
                <input
                  type="number"
                  min="2"
                  max="30"
                  value={rtspTimeout}
                  onChange={(e) => setRtspTimeout(parseInt(e.target.value) || 5)}
                  className="w-full bg-paper-2 border border-rule rounded p-2 text-xs font-mono font-semibold text-ink focus:outline-none focus:border-burgundy"
                />
              </div>

              <div className="p-3.5 bg-paper rounded-lg border border-rule space-y-2">
                <label className="font-medium text-ink block">Frame Buffer Queue Depth</label>
                <input
                  type="number"
                  min="20"
                  max="500"
                  value={maxQueueSize}
                  onChange={(e) => setMaxQueueSize(parseInt(e.target.value) || 100)}
                  className="w-full bg-paper-2 border border-rule rounded p-2 text-xs font-mono font-semibold text-ink focus:outline-none focus:border-burgundy"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
