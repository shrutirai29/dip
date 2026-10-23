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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-4 border-b border-[#E2E8EA] dark:border-[#203638] gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-xl font-bold text-[#1C3334] dark:text-[#EDF4F5] tracking-tight">
              INCIDENT WARNINGS & HAZARD AUDIT
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-rose-950/40 border border-rose-500/30 text-rose-300">
              AUDIT LOG
            </span>
          </div>
          <p className="text-xs text-[#5D757E] dark:text-[#A0B7BC] mt-1">
            Sustained condition hazard log with automated operator recommendations, keyframe evidence, and audit verification
          </p>
        </div>

        <button
          onClick={() => loadIncidents(true)}
          disabled={refreshing}
          className="inline-flex items-center space-x-2 px-3 py-1.5 bg-white dark:bg-[#152729] hover:bg-[#F1F4F5] dark:hover:bg-[#1C3336] text-[#2F4454] dark:text-[#EDF4F5] border border-[#CBD5D8] dark:border-[#2C4B4E] shadow-2xs rounded-lg text-xs font-medium transition cursor-pointer self-start lg:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-cyan-400' : ''}`} />
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
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#5D757E] dark:text-slate-400" />
          <input
            type="text"
            placeholder="Search by ID, trigger reason, sector, or pattern..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white dark:bg-[#0E1622] border border-[#CBD5D8] dark:border-[#1E2D40] text-xs text-[#1C3334] dark:text-[#1C3334] dark:text-white rounded-lg pl-9 pr-4 py-2 focus:border-[#376E6F] focus:outline-none placeholder-[#5D757E] dark:placeholder-slate-500 shadow-2xs"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-2.5 text-[#5D757E] dark:text-slate-400 hover:text-[#1C3334] dark:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="bg-white dark:bg-[#0E1622] border border-[#CBD5D8] dark:border-[#1E2D40] text-xs text-[#1C3334] dark:text-[#2F4454] dark:text-slate-300 rounded-lg px-3 py-2 w-full sm:w-auto focus:border-[#376E6F] focus:outline-none cursor-pointer shadow-2xs"
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
          className="bg-white dark:bg-[#0E1622] border border-[#CBD5D8] dark:border-[#1E2D40] text-xs text-[#1C3334] dark:text-[#2F4454] dark:text-slate-300 rounded-lg px-3 py-2 w-full sm:w-auto focus:border-[#376E6F] focus:outline-none cursor-pointer shadow-2xs"
        >
          <option value="">All Statuses</option>
          <option value="Open">Open</option>
          <option value="Acknowledged">Acknowledged</option>
          <option value="Resolved">Resolved</option>
        </select>
      </div>

      {/* Incidents Surveillance Table */}
      <div className="bg-white dark:bg-[#0E1622] border border-[#E2E8EA] dark:border-[#1E2D40] rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8F9FA] dark:bg-[#0A1018] text-[#5D757E] dark:text-[#5D757E] dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px] border-b border-[#E2E8EA] dark:border-[#1E2D40]">
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
            <tbody className="divide-y divide-[#E2E8EA] dark:divide-[#1E2D40] text-[#1C3334] dark:text-slate-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-500">
                    <div className="max-w-md mx-auto space-y-2">
                      <Inbox className="w-8 h-8 text-slate-600 mx-auto" />
                      <p className="text-xs text-[#5D757E] dark:text-slate-400">
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
                    <td className="p-3.5 font-mono text-[#376E6F] dark:text-cyan-400 font-semibold">
                      {inc.id}
                    </td>
                    <td className="p-3.5 text-[#5D757E] dark:text-slate-400 font-mono">
                      t={inc.video_timestamp_sec?.toFixed(1) || '0.0'}s
                    </td>
                    <td className="p-3.5 font-mono text-[#1C3334] dark:text-[#1C3334] dark:text-white font-medium">
                      {inc.relevant_region || 'Sector B2'}
                    </td>
                    <td className="p-3.5 max-w-xs truncate text-[#2F4454] dark:text-slate-300">
                      {inc.trigger_reason}
                    </td>
                    <td className="p-3.5 font-mono font-medium">
                      <span className="text-[#1C3334] dark:text-white">{inc.risk_score?.toFixed(1) ?? '—'}</span>
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
                          inc.status === 'Open' ? 'bg-rose-400 animate-pulse' :
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
                        className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-[#141E2B] hover:bg-[#1E2D40] text-slate-200 hover:text-[#1C3334] dark:text-white rounded border border-[#1E2D40] transition cursor-pointer text-xs"
                      >
                        <Eye className="w-3.5 h-3.5 text-cyan-400" />
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
          <div className="bg-[#0E1622] border border-[#1E2D40] rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E2D40]">
              <div className="flex items-center space-x-2.5">
                <RiskBadge band={selectedIncident.severity} size="md" />
                <h3 className="text-sm font-semibold text-[#1C3334] dark:text-white font-mono">
                  Hazard Audit: {selectedIncident.id}
                </h3>
              </div>
              <button
                onClick={() => setSelectedIncident(null)}
                className="text-[#5D757E] dark:text-slate-400 hover:text-[#1C3334] dark:text-white p-1 rounded hover:bg-[#141E2B] transition cursor-pointer"
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
                <span className="text-[10px] uppercase font-mono tracking-wider text-[#5D757E] dark:text-slate-400 block">
                  Identified Hazard Condition:
                </span>
                <p className="p-3 bg-[#0A1018] rounded-lg border border-[#1E2D40] text-slate-200 leading-relaxed font-mono">
                  {selectedIncident.trigger_reason}
                </p>
              </div>

              {/* Recommended Action */}
              {selectedIncident.recommended_action && (
                <div className="p-3.5 bg-cyan-950/30 border border-cyan-500/30 rounded-lg space-y-1">
                  <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block font-mono">
                    Protocol Recommendation:
                  </span>
                  <p className="text-slate-200 text-xs leading-relaxed">
                    {selectedIncident.recommended_action}
                  </p>
                </div>
              )}

              {/* Telemetry Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono">
                <div className="p-2.5 bg-[#0A1018] rounded-lg border border-[#1E2D40]">
                  <span className="text-[10px] text-[#5D757E] dark:text-slate-400 block">Trigger Risk</span>
                  <span className="text-sm font-bold text-[#1C3334] dark:text-white mt-1 block">
                    {selectedIncident.risk_score?.toFixed(1) ?? '—'}
                  </span>
                </div>
                <div className="p-2.5 bg-[#0A1018] rounded-lg border border-[#1E2D40]">
                  <span className="text-[10px] text-[#5D757E] dark:text-slate-400 block">Forecast (+10s)</span>
                  <span className="text-sm font-bold text-rose-400 mt-1 block">
                    {selectedIncident.forecast_risk?.toFixed(1) ?? '—'}
                  </span>
                </div>
                <div className="p-2.5 bg-[#0A1018] rounded-lg border border-[#1E2D40]">
                  <span className="text-[10px] text-[#5D757E] dark:text-slate-400 block">Sector / Region</span>
                  <span className="text-sm font-bold text-cyan-400 mt-1 block">
                    {selectedIncident.relevant_region || 'Sector B2'}
                  </span>
                </div>
                <div className="p-2.5 bg-[#0A1018] rounded-lg border border-[#1E2D40]">
                  <span className="text-[10px] text-[#5D757E] dark:text-slate-400 block">Video Timestamp</span>
                  <span className="text-sm font-bold text-[#1C3334] dark:text-white mt-1 block">
                    t={selectedIncident.video_timestamp_sec?.toFixed(1) || '0.0'}s
                  </span>
                </div>
              </div>

              {/* Captured Evidence Keyframe */}
              {selectedIncident.evidence_frame_path && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-[#5D757E] dark:text-slate-400 block">
                    Captured Evidence Keyframe:
                  </span>
                  <div className="aspect-video bg-black rounded-lg border border-[#1E2D40] overflow-hidden flex items-center justify-center">
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
                <label className="text-[10px] uppercase font-mono tracking-wider text-[#5D757E] dark:text-slate-400 block">
                  Supervisor Verification & Operator Audit Notes:
                </label>
                <textarea
                  value={operatorNotes}
                  onChange={(e) => setOperatorNotes(e.target.value)}
                  placeholder="Record camera angle validation, physical safety team dispatch, or clearance notes..."
                  className="w-full bg-[#0A1018] border border-[#1E2D40] rounded-lg p-3 text-xs text-[#1C3334] dark:text-white h-20 focus:border-cyan-500 focus:outline-none placeholder-slate-500"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-[#1E2D40] flex flex-wrap items-center justify-between gap-3">
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
                className="px-3.5 py-1.5 bg-[#141E2B] hover:bg-[#1E2D40] text-[#2F4454] dark:text-slate-300 rounded-lg text-xs border border-[#1E2D40] transition cursor-pointer"
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
