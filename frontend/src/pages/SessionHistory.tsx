import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Eye, 
  BarChart2, 
  RefreshCw, 
  History, 
  CheckCircle2, 
  Activity, 
  AlertTriangle,
  FolderOpen
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { analysisApi } from '../services/api';
import { Analysis } from '../types';
import { 
  KPICard, 
  StatusPill, 
  ErrorState, 
  LoadingBlock 
} from '../components/UIComponents';

export const SessionHistory: React.FC = () => {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSessions = useCallback(async (isSilent = false) => {
    if (isSilent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setErrorMessage(null);
    try {
      const data = await analysisApi.getAll();
      setAnalyses(data);
    } catch (e) {
      console.error('Failed to load session history:', e);
      setErrorMessage('Unable to retrieve surveillance audit session history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Aggregate KPI summary
  const summary = useMemo(() => {
    const total = analyses.length;
    const completed = analyses.filter(a => a.status === 'completed').length;
    const processing = analyses.filter(a => a.status === 'processing').length;
    const totalIncidents = analyses.reduce((acc, a) => acc + (a.total_incidents_count || 0), 0);
    const maxRisk = analyses.length > 0 
      ? Math.max(...analyses.map(a => a.max_risk_score || 0)).toFixed(1)
      : '0.0';

    return { total, completed, processing, totalIncidents, maxRisk };
  }, [analyses]);

  if (loading && analyses.length === 0) {
    return (
      <div className="space-y-6">
        <LoadingBlock text="Loading surveillance audit session logs..." height="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-4 border-b border-[#E2E8EA] dark:border-[#203638] gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-xl font-bold text-[#1C3334] dark:text-[#EDF4F5] tracking-tight">
              SURVEILLANCE SESSION AUDIT LOG
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-950/40 border border-cyan-500/30 text-cyan-300">
              PERSISTENT REPOSITORY
            </span>
          </div>
          <p className="text-xs text-[#5D757E] dark:text-[#A0B7BC] mt-1">
            Historical archive of all video analyses, peak density metrics, high-risk durations, and audit CSV exports
          </p>
        </div>

        <button
          onClick={() => loadSessions(true)}
          disabled={refreshing}
          className="inline-flex items-center space-x-2 px-3 py-1.5 bg-white dark:bg-[#152729] hover:bg-[#F1F4F5] dark:hover:bg-[#1C3336] text-[#2F4454] dark:text-[#EDF4F5] border border-[#CBD5D8] dark:border-[#2C4B4E] shadow-2xs rounded-lg text-xs font-medium transition cursor-pointer self-start lg:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-cyan-400' : ''}`} />
          <span>Refresh Catalog</span>
        </button>
      </div>

      {errorMessage && (
        <ErrorState message={errorMessage} onRetry={() => loadSessions(false)} />
      )}

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Total Sessions"
          value={summary.total}
          unit="runs"
          subtext="Catalog archive count"
          icon={History}
          tone="neutral"
        />
        <KPICard
          label="Completed Audits"
          value={summary.completed}
          unit="finished"
          subtext="Fully processed runs"
          icon={CheckCircle2}
          tone="emerald"
        />
        <KPICard
          label="Active Inferences"
          value={summary.processing}
          unit="running"
          subtext={summary.processing > 0 ? 'Background workers active' : 'Idle pipeline'}
          icon={Activity}
          tone={summary.processing > 0 ? 'cyan' : 'neutral'}
        />
        <KPICard
          label="Total Hazard Alerts"
          value={summary.totalIncidents}
          unit="incidents"
          subtext="Flagged across all sessions"
          icon={AlertTriangle}
          tone={summary.totalIncidents > 0 ? 'amber' : 'neutral'}
        />
      </div>

      {/* Sessions Table */}
      <div className="bg-white dark:bg-[#0E1622] border border-[#E2E8EA] dark:border-[#1E2D40] rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8F9FA] dark:bg-[#0A1018] text-[#5D757E] dark:text-[#5D757E] dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px] border-b border-[#E2E8EA] dark:border-[#1E2D40]">
              <tr>
                <th className="p-3.5">Analysis ID</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Created Timestamp</th>
                <th className="p-3.5">Peak Count</th>
                <th className="p-3.5">Avg / Max Risk</th>
                <th className="p-3.5">High-Risk Duration</th>
                <th className="p-3.5">Incidents</th>
                <th className="p-3.5 text-right">Audit Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8EA] dark:divide-[#1E2D40] text-[#1C3334] dark:text-slate-200">
              {analyses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-500">
                    <div className="max-w-md mx-auto space-y-2">
                      <FolderOpen className="w-8 h-8 text-slate-600 mx-auto" />
                      <p className="text-xs text-[#5D757E] dark:text-slate-400">
                        No surveillance sessions have been recorded yet.
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Upload or ingest footage in the Video Ingestion Studio to run an analysis.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                analyses.map((a) => (
                  <tr key={a.id} className="hover:bg-[#F6F8F9] dark:hover:bg-[#121C2B] transition-colors">
                    <td className="p-3.5 font-mono text-[#376E6F] dark:text-cyan-400 font-semibold">
                      {a.id}
                    </td>
                    <td className="p-3.5">
                      <StatusPill status={a.status} />
                    </td>
                    <td className="p-3.5 text-[#5D757E] dark:text-slate-400 font-mono">
                      {a.created_at ? a.created_at.replace('T', ' ').slice(0, 19) : '—'}
                    </td>
                    <td className="p-3.5 font-bold font-mono text-[#1C3334] dark:text-white">
                      {a.peak_count} <span className="text-[10px] text-[#5D757E] dark:text-slate-400 font-normal">pers.</span>
                    </td>
                    <td className="p-3.5 font-mono font-medium">
                      <span className="text-[#2F4454] dark:text-slate-300">{a.avg_risk_score.toFixed(1)}</span>
                      <span className="text-slate-500 mx-1">/</span>
                      <span className={a.max_risk_score >= 70 ? 'text-rose-400 font-bold' : a.max_risk_score >= 40 ? 'text-amber-400' : 'text-emerald-400'}>
                        {a.max_risk_score.toFixed(1)}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-[#2F4454] dark:text-slate-300">
                      {a.high_risk_duration_sec}s
                    </td>
                    <td className="p-3.5">
                      {a.total_incidents_count > 0 ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-rose-950/40 text-rose-300 border border-rose-500/30">
                          <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />
                          <span>{a.total_incidents_count}</span>
                        </span>
                      ) : (
                        <span className="text-slate-500 font-mono text-[11px]">0</span>
                      )}
                    </td>
                    <td className="p-3.5 text-right space-x-2">
                      <Link
                        to={`/monitoring?analysisId=${a.id}`}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 bg-[#141E2B] hover:bg-[#1E2D40] text-slate-200 hover:text-[#1C3334] dark:text-white rounded border border-[#1E2D40] transition text-xs cursor-pointer"
                        title="Inspect Telemetry & Replay"
                      >
                        <Eye className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Inspect</span>
                      </Link>
                      <Link
                        to={`/analytics?analysisId=${a.id}`}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 bg-[#141E2B] hover:bg-[#1E2D40] text-slate-200 hover:text-[#1C3334] dark:text-white rounded border border-[#1E2D40] transition text-xs cursor-pointer"
                        title="View Advanced Dynamics"
                      >
                        <BarChart2 className="w-3.5 h-3.5 text-purple-400" />
                        <span>Dynamics</span>
                      </Link>
                      <a
                        href={analysisApi.getExportUrl(a.id)}
                        download
                        className="inline-flex items-center space-x-1 px-2.5 py-1 bg-cyan-950/30 hover:bg-cyan-900/40 text-cyan-300 rounded border border-cyan-500/30 transition text-xs cursor-pointer"
                        title="Export CSV Telemetry"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-400" />
                        <span>CSV</span>
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
