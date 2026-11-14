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
  MetricStrip, 
  MetricItem, 
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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-4 border-b border-rule gap-4">
        <div>
          <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded-full bg-burgundy-soft border border-burgundy/20 text-burgundy text-[11px] font-mono font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-burgundy animate-pulse" />
            <span>Forensic Evidence Archive</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink font-display mt-1">
            Session History
          </h1>
          <p className="text-xs text-muted mt-1 max-w-2xl leading-relaxed">
            Historical archive of surveillance sessions, peak density metrics, high-risk durations, and evidentiary CSV exports.
          </p>
        </div>

        <button
          onClick={() => loadSessions(true)}
          disabled={refreshing}
          className="inline-flex items-center space-x-2 px-3 py-1.5 bg-white dark:bg-paper-2 hover:bg-paper-3 dark:hover:bg-[#1C3336] text-ink border border-rule dark:border-rule shadow-2xs rounded-lg text-xs font-medium transition cursor-pointer self-start lg:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-burgundy' : ''}`} />
          <span>Refresh Catalog</span>
        </button>
      </div>

      {errorMessage && (
        <ErrorState message={errorMessage} onRetry={() => loadSessions(false)} />
      )}

      {/* Audit Registry Summary Strip */}
      <MetricStrip>
        <MetricItem
          label="Catalog Sessions"
          value={summary.total}
          unit="runs"
          subtext="Persistent Archive Count"
          icon={History}
          tone="slate"
        />
        <MetricItem
          label="Completed Audits"
          value={summary.completed}
          unit="finished"
          subtext="Fully Processed Records"
          icon={CheckCircle2}
          tone="teal"
        />
        <MetricItem
          label="Active Pipelines"
          value={summary.processing}
          unit="running"
          subtext={summary.processing > 0 ? 'Active Ingestion Workers' : 'Idle Queue'}
          icon={Activity}
          tone={summary.processing > 0 ? 'teal' : 'neutral'}
        />
        <MetricItem
          label="Aggregated Hazard Alerts"
          value={summary.totalIncidents}
          unit="incidents"
          subtext="Flagged Safety Conditions"
          icon={AlertTriangle}
          tone={summary.totalIncidents > 0 ? 'amber' : 'emerald'}
        />
      </MetricStrip>

      {/* Sessions Table */}
      <div className="bg-white dark:bg-paper-3 border border-rule dark:border-rule rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-paper-3 dark:bg-[#0A1018] text-[#5D757E] dark:text-muted font-semibold uppercase tracking-wider text-[11px] border-b border-rule dark:border-rule">
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
            <tbody className="divide-y divide-[#E2E8EA] dark:divide-[#1E2D40] text-ink">
              {analyses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-500">
                    <div className="max-w-md mx-auto space-y-2">
                      <FolderOpen className="w-8 h-8 text-slate-600 mx-auto" />
                      <p className="text-xs text-muted">
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
                    <td className="p-3.5 font-mono text-burgundy dark:text-burgundy font-semibold">
                      {a.id}
                    </td>
                    <td className="p-3.5">
                      <StatusPill status={a.status} />
                    </td>
                    <td className="p-3.5 text-muted font-mono">
                      {a.created_at ? a.created_at.replace('T', ' ').slice(0, 19) : '—'}
                    </td>
                    <td className="p-3.5 font-bold font-mono text-ink">
                      {a.peak_count} <span className="text-[10px] text-muted font-normal">pers.</span>
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
                        className="inline-flex items-center space-x-1 px-2.5 py-1 bg-paper-2 hover:bg-paper-3 text-ink rounded border border-rule transition text-xs cursor-pointer"
                        title="Inspect Telemetry & Replay"
                      >
                        <Eye className="w-3.5 h-3.5 text-burgundy" />
                        <span>Inspect</span>
                      </Link>
                      <Link
                        to={`/analytics?analysisId=${a.id}`}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 bg-paper-2 hover:bg-paper-3 text-ink rounded border border-rule transition text-xs cursor-pointer"
                        title="View Advanced Dynamics"
                      >
                        <BarChart2 className="w-3.5 h-3.5 text-purple-400" />
                        <span>Dynamics</span>
                      </Link>
                      <a
                        href={analysisApi.getExportUrl(a.id)}
                        download
                        className="inline-flex items-center space-x-1 px-2.5 py-1 bg-burgundy text-white hover:bg-burgundy-hover rounded border border-burgundy/20 transition text-xs cursor-pointer"
                        title="Export CSV Telemetry"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-burgundy" />
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
