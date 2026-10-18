import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  Search, 
  Filter, 
  Check, 
  Clock, 
  ShieldAlert, 
  Eye, 
  MessageSquare,
  FileSpreadsheet
} from 'lucide-react';
import { incidentApi } from '../services/api';
import { Incident } from '../types';

export const Incidents: React.FC = () => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Selected for inspection modal
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [operatorNotes, setOperatorNotes] = useState('');

  useEffect(() => {
    loadIncidents();
  }, [severityFilter, statusFilter]);

  const loadIncidents = async () => {
    setLoading(true);
    try {
      const data = await incidentApi.getAll({
        severity: severityFilter || undefined,
        status: statusFilter || undefined,
      });
      setIncidents(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
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
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-gray-800 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Incidents & Early Warning Alerts</h1>
          <p className="text-sm text-gray-400 mt-1">
            Audit-logged heuristic alarm triggers requiring human verification and resolution
          </p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-3 text-gray-500" />
          <input
            type="text"
            placeholder="Search by ID, keyword, or trigger reason..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#111827] border border-gray-800 text-xs text-white rounded-lg pl-9 pr-4 py-2.5 focus:border-cyan-500"
          />
        </div>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="bg-[#111827] border border-gray-800 text-xs text-white rounded-lg px-3 py-2.5 w-full sm:w-auto"
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
          className="bg-[#111827] border border-gray-800 text-xs text-white rounded-lg px-3 py-2.5 w-full sm:w-auto"
        >
          <option value="">All Statuses</option>
          <option value="Open">Open</option>
          <option value="Acknowledged">Acknowledged</option>
          <option value="Resolved">Resolved</option>
        </select>
      </div>

      {/* Incidents Table */}
      <div className="bg-[#111827] border border-gray-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-900/60 text-gray-400 font-semibold uppercase border-b border-gray-800">
              <tr>
                <th className="p-3.5">Severity</th>
                <th className="p-3.5">Incident ID</th>
                <th className="p-3.5">Time (sec)</th>
                <th className="p-3.5">Trigger Reason</th>
                <th className="p-3.5">Risk Score</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60 text-gray-300">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">
                    No matching incidents found.
                  </td>
                </tr>
              ) : (
                filtered.map((inc) => (
                  <tr key={inc.id} className="hover:bg-gray-800/30 transition">
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
                    <td className="p-3.5 font-mono text-gray-400">{inc.id}</td>
                    <td className="p-3.5 text-gray-400">{inc.video_timestamp_sec}s</td>
                    <td className="p-3.5 font-medium max-w-md truncate">{inc.trigger_reason}</td>
                    <td className="p-3.5 font-bold text-white">{inc.risk_score}</td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
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
                        className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded border border-gray-700 transition"
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
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#111827] border border-gray-800 rounded-xl max-w-xl w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-800">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                <h3 className="text-base font-semibold text-white">Incident Details — {selectedIncident.id}</h3>
              </div>
              <button
                onClick={() => setSelectedIncident(null)}
                className="text-gray-400 hover:text-white text-lg font-mono"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-gray-400 block mb-1">Trigger Reason:</span>
                <p className="p-2.5 bg-gray-900 rounded border border-gray-800 text-gray-200 font-medium">
                  {selectedIncident.trigger_reason}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 bg-gray-900 rounded border border-gray-800">
                  <span className="text-gray-400 block">Severity / Score</span>
                  <span className="text-sm font-bold text-white mt-1 block">
                    {selectedIncident.severity} ({selectedIncident.risk_score}/100)
                  </span>
                </div>
                <div className="p-2.5 bg-gray-900 rounded border border-gray-800">
                  <span className="text-gray-400 block">Occurred At</span>
                  <span className="text-sm font-bold text-white mt-1 block">
                    t={selectedIncident.video_timestamp_sec}s (Frame #{selectedIncident.frame_index})
                  </span>
                </div>
              </div>

              {selectedIncident.evidence_frame_path && (
                <div>
                  <span className="text-gray-400 block mb-1">Captured Evidence Snapshot:</span>
                  <div className="aspect-video bg-black rounded border border-gray-800 overflow-hidden">
                    <img
                      src={selectedIncident.evidence_frame_path}
                      alt="Evidence Frame"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-gray-400 block mb-1">Supervisor / Operator Notes:</label>
                <textarea
                  value={operatorNotes}
                  onChange={(e) => setOperatorNotes(e.target.value)}
                  placeholder="Record verification notes, camera angle validation, or human action taken..."
                  className="w-full bg-gray-900 border border-gray-800 rounded p-2 text-xs text-gray-200 h-20"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-gray-800 flex items-center justify-between">
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
                  Mark Resolved
                </button>
              </div>
              <button
                onClick={() => setSelectedIncident(null)}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs"
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
