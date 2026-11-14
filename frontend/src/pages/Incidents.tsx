import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  AlertTriangle, 
  Search, 
  Check, 
  Eye, 
  RefreshCw, 
  ShieldAlert, 
  Clock, 
  X, 
  SlidersHorizontal, 
  Inbox
} from 'lucide-react';
import { incidentApi } from '../services/api';
import { Incident } from '../types';
import { 
  MetricStrip, 
  MetricItem, 
  RiskBadge, 
  ErrorState, 
  LoadingBlock 
} from '../components/UIComponents';

export const Incidents: React.FC = () => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Inspection modal
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [operatorNotes, setOperatorNotes] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState<boolean>(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const loadIncidents = useCallback(async (isSilent = false) => {
    if (isSilent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setErrorMessage(null);
    try {
      const data = await incidentApi.getAll({
        severity: severityFilter || undefined,
        status: statusFilter || undefined,
      });
      setIncidents(data);
    } catch (e) {
      console.error('Failed to load incidents:', e);
      setErrorMessage('Unable to retrieve recorded incidents from the surveillance audit log.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [severityFilter, statusFilter]);

  useEffect(() => {
    loadIncidents();
  }, [loadIncidents]);

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    setUpdatingStatus(true);
    setActionSuccessMessage(null);
    try {
      const updated = await incidentApi.update(id, {
        status: newStatus,
        operator_notes: operatorNotes || selectedIncident?.operator_notes,
      });
      setIncidents((prev) => prev.map((i) => (i.id === id ? updated : i)));
      if (selectedIncident?.id === id) {
        setSelectedIncident(updated);
        setOperatorNotes(updated.operator_notes || '');
      }
      setActionSuccessMessage(`Incident marked as ${newStatus}.`);
      setTimeout(() => setActionSuccessMessage(null), 3000);
    } catch (e) {
      console.error('Failed to update incident:', e);
      setActionSuccessMessage('Failed to update status. Please try again.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const filtered = useMemo(() => {
    return incidents.filter((i) => {
      const term = searchTerm.toLowerCase();
      const matchReason = i.trigger_reason?.toLowerCase().includes(term) || false;
      const matchType = i.incident_type?.toLowerCase().includes(term) || false;
      const matchId = i.id?.toLowerCase().includes(term) || false;
      const matchRegion = i.relevant_region?.toLowerCase().includes(term) || false;
      return matchReason || matchType || matchId || matchRegion;
    });
  }, [incidents, searchTerm]);

  // Metric counts
  const kpis = useMemo(() => {
    const total = incidents.length;
    const critical = incidents.filter(i => i.severity === 'CRITICAL').length;
    const high = incidents.filter(i => i.severity === 'HIGH').length;
    const open = incidents.filter(i => i.status === 'Open').length;
    return { total, critical, high, open };
  }, [incidents]);

  if (loading && incidents.length === 0) {
    return (
      <div className="space-y-6">
        <LoadingBlock text="Loading incident warnings and evidence keyframes..." height="h-96" />
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
            <span>Security Incident Management</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink font-display mt-1">
            Incidents & Alerts
          </h1>
          <p className="text-xs text-muted mt-1 max-w-2xl leading-relaxed">
            Real-time hazard audit log with automated operator recommendations, keyframe evidence, and security dispatch sign-off.
          </p>
        </div>

        <button
          onClick={() => loadIncidents(true)}
          disabled={refreshing}
          className="inline-flex items-center space-x-2 px-3 py-1.5 bg-white dark:bg-paper-2 hover:bg-paper-3 dark:hover:bg-[#1C3336] text-ink border border-rule dark:border-rule shadow-2xs rounded-lg text-xs font-medium transition cursor-pointer self-start lg:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-burgundy' : ''}`} />
          <span>Refresh Feed</span>
        </button>
      </div>

      {errorMessage && (
        <ErrorState message={errorMessage} onRetry={() => loadIncidents(false)} />
      )}

      {/* Hazard Telemetry Console Strip */}
      <MetricStrip>
        <MetricItem
          label="Total Hazard Records"
          value={kpis.total}
          unit="logged"
          subtext="Surveillance Audit Archive"
          icon={AlertTriangle}
          tone="slate"
        />
        <MetricItem
          label="Critical Severity"
          value={kpis.critical}
          unit="events"
          subtext="Immediate Safety Response"
          icon={ShieldAlert}
          tone={kpis.critical > 0 ? 'burgundy' : 'neutral'}
        />
        <MetricItem
          label="High Severity"
          value={kpis.high}
          unit="events"
          subtext="Sustained Escalation Band"
          icon={SlidersHorizontal}
          tone={kpis.high > 0 ? 'rose' : 'neutral'}
        />
        <MetricItem
          label="Open / Awaiting Action"
          value={kpis.open}
          unit="unresolved"
          subtext="Requires Operator Sign-off"
          icon={Clock}
          tone={kpis.open > 0 ? 'amber' : 'emerald'}
        />
      </MetricStrip>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3">
        {/* Quick Severity Buttons */}
        <div className="flex items-center space-x-2">
          <span className="text-xs font-medium text-muted mr-1 font-sans">Filter by Severity:</span>
          {['', 'HIGH', 'MODERATE', 'LOW'].map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`px-3 py-1 rounded-md text-xs font-mono transition-colors ${
                severityFilter === sev
                  ? 'bg-burgundy text-white font-medium shadow-2xs'
                  : 'bg-paper-2 text-ink border border-rule hover:bg-paper-3'
              }`}
            >
              {sev === '' ? 'All' : sev.charAt(0) + sev.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted" />
          <input
            type="text"
            placeholder="Search by ID, trigger reason, sector, or pattern..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white dark:bg-paper-3 border border-rule dark:border-rule text-xs text-[#1C3334] dark:text-ink rounded-lg pl-9 pr-4 py-2 focus:border-burgundy focus:outline-none placeholder-[#5D757E] dark:placeholder-slate-500 shadow-2xs"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-2.5 text-muted hover:text-ink"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="bg-white dark:bg-paper-3 border border-rule dark:border-rule text-xs text-[#1C3334] dark:text-[#2F4454] dark:text-slate-300 rounded-lg px-3 py-2 w-full sm:w-auto focus:border-burgundy focus:outline-none cursor-pointer shadow-2xs"
        >
          <option value="">All Severities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MODERATE">Moderate</option>
          <option value="LOW">Low</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-white dark:bg-paper-3 border border-rule dark:border-rule text-xs text-[#1C3334] dark:text-[#2F4454] dark:text-slate-300 rounded-lg px-3 py-2 w-full sm:w-auto focus:border-burgundy focus:outline-none cursor-pointer shadow-2xs"
        >
          <option value="">All Statuses</option>
          <option value="Open">Open</option>
          <option value="Acknowledged">Acknowledged</option>
          <option value="Resolved">Resolved</option>
        </select>
        </div>
      </div>

      {/* Incidents Surveillance Table */}
      <div className="bg-white dark:bg-paper-3 border border-rule dark:border-rule rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-paper-3 dark:bg-[#0A1018] text-[#5D757E] dark:text-muted font-semibold uppercase tracking-wider text-[11px] border-b border-rule dark:border-rule">
              <tr>
                <th className="p-3.5">Severity</th>
                <th className="p-3.5">Incident ID</th>
                <th className="p-3.5">Timestamp</th>
                <th className="p-3.5">Sector</th>
                <th className="p-3.5">Trigger Condition</th>
                <th className="p-3.5">Risk Score (Now → +10s)</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Audit Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8EA] dark:divide-[#1E2D40] text-ink">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-500">
                    <div className="max-w-md mx-auto space-y-2">
                      <Inbox className="w-8 h-8 text-slate-600 mx-auto" />
                      <p className="text-xs text-muted">
                        {searchTerm || severityFilter || statusFilter
                          ? 'No incidents match the active search or filter criteria.'
                          : 'No incidents are recorded in the current catalog.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((inc) => (
                  <tr key={inc.id} className="hover:bg-[#F6F8F9] dark:hover:bg-[#121C2B] transition-colors">
                    <td className="p-3.5">
                      <RiskBadge band={inc.severity} size="sm" />
                    </td>
                    <td className="p-3.5 font-mono text-burgundy dark:text-burgundy font-semibold">
                      {inc.id}
                    </td>
                    <td className="p-3.5 text-muted font-mono">
                      t={inc.video_timestamp_sec?.toFixed(1) || '0.0'}s
                    </td>
                    <td className="p-3.5 font-mono text-[#1C3334] dark:text-ink font-medium">
                      {inc.relevant_region || 'Sector B2'}
                    </td>
                    <td className="p-3.5 max-w-xs truncate text-[#2F4454] dark:text-slate-300">
                      {inc.trigger_reason}
                    </td>
                    <td className="p-3.5 font-mono font-medium">
                      <span className="text-ink">{inc.risk_score?.toFixed(1) ?? '—'}</span>
                      <span className="text-slate-500 mx-1.5">→</span>
                      <span className="text-rose-400">{inc.forecast_risk?.toFixed(1) ?? '—'}</span>
                    </td>
                    <td className="p-3.5">
                      <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium border ${
                        inc.status === 'Open'
                          ? 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                          : inc.status === 'Acknowledged'
                          ? 'bg-amber-950/30 border-amber-500/30 text-amber-300'
                          : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          inc.status === 'Open' ? 'bg-rose-400 motion-safe:animate-pulse motion-reduce:animate-none' :
                          inc.status === 'Acknowledged' ? 'bg-amber-400' : 'bg-emerald-400'
                        }`} />
                        <span>{inc.status}</span>
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => {
                          setSelectedIncident(inc);
                          setOperatorNotes(inc.operator_notes || '');
                          setActionSuccessMessage(null);
                        }}
                        className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-paper-2 hover:bg-paper-3 text-ink hover:text-ink rounded border border-rule transition cursor-pointer text-xs"
                      >
                        <Eye className="w-3.5 h-3.5 text-burgundy" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Evidentiary Inspection Modal */}
      {selectedIncident && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-paper-2 border border-rule text-ink rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-rule">
              <div className="flex items-center space-x-2.5">
                <RiskBadge band={selectedIncident.severity} size="md" />
                <h3 className="text-sm font-semibold text-ink font-mono">
                  Hazard Audit: {selectedIncident.id}
                </h3>
              </div>
              <button
                onClick={() => setSelectedIncident(null)}
                className="text-muted hover:text-ink p-1 rounded hover:bg-paper-3 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {actionSuccessMessage && (
              <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>{actionSuccessMessage}</span>
              </div>
            )}

            <div className="space-y-4 text-xs">
              {/* Trigger Condition */}
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-mono tracking-wider text-muted block">
                  Identified Hazard Condition:
                </span>
                <p className="p-3 bg-[#0A1018] rounded-lg border border-rule text-slate-200 leading-relaxed font-mono">
                  {selectedIncident.trigger_reason}
                </p>
              </div>

              {/* Recommended Action */}
              {selectedIncident.recommended_action && (
                <div className="p-3.5 bg-cyan-950/30 border border-cyan-500/30 rounded-lg space-y-1">
                  <span className="text-[10px] font-bold text-burgundy uppercase tracking-wider block font-mono">
                    Protocol Recommendation:
                  </span>
                  <p className="text-slate-200 text-xs leading-relaxed">
                    {selectedIncident.recommended_action}
                  </p>
                </div>
              )}

              {/* Telemetry Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono">
                <div className="p-2.5 bg-[#0A1018] rounded-lg border border-rule">
                  <span className="text-[10px] text-muted block">Trigger Risk</span>
                  <span className="text-sm font-bold text-ink mt-1 block">
                    {selectedIncident.risk_score?.toFixed(1) ?? '—'}
                  </span>
                </div>
                <div className="p-2.5 bg-[#0A1018] rounded-lg border border-rule">
                  <span className="text-[10px] text-muted block">Forecast (+10s)</span>
                  <span className="text-sm font-bold text-rose-400 mt-1 block">
                    {selectedIncident.forecast_risk?.toFixed(1) ?? '—'}
                  </span>
                </div>
                <div className="p-2.5 bg-[#0A1018] rounded-lg border border-rule">
                  <span className="text-[10px] text-muted block">Sector / Region</span>
                  <span className="text-sm font-bold text-burgundy mt-1 block">
                    {selectedIncident.relevant_region || 'Sector B2'}
                  </span>
                </div>
                <div className="p-2.5 bg-[#0A1018] rounded-lg border border-rule">
                  <span className="text-[10px] text-muted block">Video Timestamp</span>
                  <span className="text-sm font-bold text-ink mt-1 block">
                    t={selectedIncident.video_timestamp_sec?.toFixed(1) || '0.0'}s
                  </span>
                </div>
              </div>

              {/* Captured Evidence Keyframe */}
              {selectedIncident.evidence_frame_path && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-muted block">
                    Captured Evidence Keyframe:
                  </span>
                  <div className="aspect-video bg-black rounded-lg border border-rule overflow-hidden flex items-center justify-center">
                    <img
                      src={selectedIncident.evidence_frame_path}
                      alt="Incident Evidence Frame"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
              )}

              {/* Operator Notes */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-mono tracking-wider text-muted block">
                  Supervisor Verification & Operator Audit Notes:
                </label>
                <textarea
                  value={operatorNotes}
                  onChange={(e) => setOperatorNotes(e.target.value)}
                  placeholder="Record camera angle validation, physical safety team dispatch, or clearance notes..."
                  className="w-full bg-[#0A1018] border border-rule rounded-lg p-3 text-xs text-ink h-20 focus:border-cyan-500 focus:outline-none placeholder-slate-500"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-rule flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleUpdateStatus(selectedIncident.id, 'Acknowledged')}
                  disabled={updatingStatus || selectedIncident.status === 'Acknowledged'}
                  className="px-3 py-1.5 bg-amber-600/30 hover:bg-amber-600/40 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-medium transition cursor-pointer disabled:opacity-40"
                >
                  Mark Acknowledged
                </button>
                <button
                  onClick={() => handleUpdateStatus(selectedIncident.id, 'Resolved')}
                  disabled={updatingStatus || selectedIncident.status === 'Resolved'}
                  className="px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-medium transition cursor-pointer disabled:opacity-40"
                >
                  Resolve Incident
                </button>
              </div>

              <button
                onClick={() => setSelectedIncident(null)}
                className="px-3.5 py-1.5 bg-[#141E2B] hover:bg-[#1E2D40] text-[#2F4454] dark:text-slate-300 rounded-lg text-xs border border-rule transition cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
