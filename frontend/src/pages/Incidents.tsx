import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  Search, 
  Check, 
  Clock, 
  ShieldAlert, 
  Eye, 
  FileSpreadsheet,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { incidentApi } from '../services/api';
import { Incident } from '../types';

export const Incidents: React.FC = () => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Inspection modal
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [operatorNotes, setOperatorNotes] = useState('');

  useEffect(() => {
    loadIncidents();
  }, [severityFilter, statusFilter]);

  const loadIncidents = async () => {
    try {
      const data = await incidentApi.getAll({
        severity: severityFilter || undefined,
        status: statusFilter || undefined,
      });
      setIncidents(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      const updated = await incidentApi.update(id, {
        status: newStatus,
        operator_notes: operatorNotes || selectedIncident?.operator_notes,
      });
      setIncidents((prev) => prev.map((i) => (i.id === id ? updated : i)));
      if (selectedIncident?.id === id) {
        setSelectedIncident(updated);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = incidents.filter((i) =>
    i.trigger_reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.incident_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-[#1D2935] gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">SUSTAINED INCIDENTS & ACTIONABLE EARLY WARNINGS</h1>
          <p className="text-xs text-[#8C9AAA] mt-0.5">
            Sustained condition hazard log with automated operator recommendations and audit verification
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-3 text-[#8C9AAA]" />
          <input
            type="text"
            placeholder="Search by ID, trigger reason, or zone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#0D131C] border border-[#1D2935] text-xs text-white rounded-lg pl-9 pr-4 py-2.5 focus:border-cyan-500"
          />
        </div>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="bg-[#0D131C] border border-[#1D2935] text-xs text-white rounded-lg px-3 py-2.5 w-full sm:w-auto"
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
          className="bg-[#0D131C] border border-[#1D2935] text-xs text-white rounded-lg px-3 py-2.5 w-full sm:w-auto"
        >
          <option value="">All Statuses</option>
          <option value="Open">Open</option>
          <option value="Acknowledged">Acknowledged</option>
          <option value="Resolved">Resolved</option>
        </select>
      </div>

      {/* Incidents Table */}
      <div className="bg-[#0D131C] border border-[#1D2935] rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#111923] text-[#8C9AAA] font-semibold uppercase border-b border-[#1D2935]">
              <tr>
                <th className="p-3.5">Severity</th>
                <th className="p-3.5">Incident ID</th>
                <th className="p-3.5">Time</th>
                <th className="p-3.5">Sector</th>
                <th className="p-3.5">Trigger Condition</th>
                <th className="p-3.5">Current / Forecast (+10s)</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1D2935] text-[#F4F7FA]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-[#8C9AAA]">
                    No matching incidents found in surveillance audit log.
                  </td>
                </tr>
              ) : (
                filtered.map((inc) => (
                  <tr key={inc.id} className="hover:bg-[#111923]/60 transition">
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        inc.severity === 'CRITICAL'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : inc.severity === 'HIGH'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      }`}>
                        {inc.severity}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-cyan-400">{inc.id}</td>
                    <td className="p-3.5 text-[#8C9AAA]">t={inc.video_timestamp_sec}s</td>
                    <td className="p-3.5 font-mono text-white">{inc.relevant_region || 'Sector B2'}</td>
                    <td className="p-3.5 font-medium max-w-sm truncate">{inc.trigger_reason}</td>
                    <td className="p-3.5 font-bold">
                      <span className="text-white">{inc.risk_score}</span>
                      <span className="text-[#8C9AAA] mx-1">→</span>
                      <span className="text-rose-400">{inc.forecast_risk}</span>
                    </td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase ${
                        inc.status === 'Open'
                          ? 'text-rose-400 bg-rose-500/10'
                          : inc.status === 'Acknowledged'
                          ? 'text-amber-400 bg-amber-500/10'
                          : 'text-emerald-400 bg-emerald-500/10'
                      }`}>
                        {inc.status}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => {
                          setSelectedIncident(inc);
                          setOperatorNotes(inc.operator_notes || '');
                        }}
                        className="px-2.5 py-1 bg-[#111923] hover:bg-[#1D2935] text-[#F4F7FA] rounded border border-[#1D2935] transition"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Incident Details Modal */}
      {selectedIncident && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-[#0D131C] border border-[#1D2935] rounded-xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#1D2935]">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                <h3 className="text-sm font-semibold text-white">Incident Audit — {selectedIncident.id}</h3>
              </div>
              <button
                onClick={() => setSelectedIncident(null)}
                className="text-[#8C9AAA] hover:text-white text-sm font-mono"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-[#8C9AAA] block mb-1">Trigger Condition:</span>
                <p className="p-2.5 bg-[#111923] rounded border border-[#1D2935] text-[#F4F7FA] font-medium leading-relaxed">
                  {selectedIncident.trigger_reason}
                </p>
              </div>

              {selectedIncident.recommended_action && (
                <div className="p-3 bg-cyan-950/20 border border-cyan-500/25 rounded-lg space-y-1">
                  <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block">
                    Recommended Operator Action:
                  </span>
                  <p className="text-gray-200 text-[11px] leading-relaxed">
                    {selectedIncident.recommended_action}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 bg-[#111923] rounded border border-[#1D2935]">
                  <span className="text-[#8C9AAA] block text-[10px]">Risk Profile</span>
                  <span className="text-xs font-bold text-white mt-1 block">
                    Current: {selectedIncident.risk_score} | Forecast: {selectedIncident.forecast_risk}
                  </span>
                </div>
                <div className="p-2.5 bg-[#111923] rounded border border-[#1D2935]">
                  <span className="text-[#8C9AAA] block text-[10px]">Location & Timestamp</span>
                  <span className="text-xs font-bold text-white mt-1 block">
                    {selectedIncident.relevant_region || 'Global'} @ t={selectedIncident.video_timestamp_sec}s
                  </span>
                </div>
              </div>

              {selectedIncident.evidence_frame_path && (
                <div>
                  <span className="text-[#8C9AAA] block mb-1">Captured Evidence Keyframe:</span>
                  <div className="aspect-video bg-black rounded border border-[#1D2935] overflow-hidden">
                    <img
                      src={selectedIncident.evidence_frame_path}
                      alt="Evidence Frame"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-[#8C9AAA] block mb-1">Supervisor Verification & Operator Audit Notes:</label>
                <textarea
                  value={operatorNotes}
                  onChange={(e) => setOperatorNotes(e.target.value)}
                  placeholder="Record camera angle validation, physical team dispatch, or safety clearance notes..."
                  className="w-full bg-[#111923] border border-[#1D2935] rounded p-2 text-xs text-white h-16"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-[#1D2935] flex items-center justify-between">
              <div className="flex space-x-2">
                <button
                  onClick={() => handleUpdateStatus(selectedIncident.id, 'Acknowledged')}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-medium"
                >
                  Acknowledge
                </button>
                <button
                  onClick={() => handleUpdateStatus(selectedIncident.id, 'Resolved')}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium"
                >
                  Resolve Incident
                </button>
              </div>
              <button
                onClick={() => setSelectedIncident(null)}
                className="px-3 py-1.5 bg-[#111923] hover:bg-[#1D2935] text-[#8C9AAA] rounded text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
