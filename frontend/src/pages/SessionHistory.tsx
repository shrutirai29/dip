import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  Eye
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { analysisApi } from '../services/api';
import { Analysis } from '../types';

export const SessionHistory: React.FC = () => {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const data = await analysisApi.getAll();
      setAnalyses(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-gray-800">
        <h1 className="text-2xl font-bold text-white tracking-tight">Audit Session History</h1>
        <p className="text-sm text-gray-400 mt-1">
          Historical archive of all video analyses, peak density metrics, and audit exports
        </p>
      </div>

      <div className="bg-[#111827] border border-gray-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-900/60 text-gray-400 font-semibold uppercase border-b border-gray-800">
              <tr>
                <th className="p-3.5">Analysis ID</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Created Date</th>
                <th className="p-3.5">Peak Count</th>
                <th className="p-3.5">Avg Risk</th>
                <th className="p-3.5">Max Risk</th>
                <th className="p-3.5">High-Risk (sec)</th>
                <th className="p-3.5">Incidents</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60 text-gray-300">
              {analyses.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-gray-500">
                    No session history available yet.
                  </td>
                </tr>
              ) : (
                analyses.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-800/30 transition">
                    <td className="p-3.5 font-mono text-cyan-400">{a.id}</td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        a.status === 'completed'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : a.status === 'processing'
                          ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 animate-pulse'
                          : 'bg-gray-800 text-gray-300'
                      }`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="p-3.5 text-gray-400">{a.created_at.replace('T', ' ').slice(0, 19)}</td>
                    <td className="p-3.5 font-bold text-white">{a.peak_count}</td>
                    <td className="p-3.5">{a.avg_risk_score.toFixed(1)}</td>
                    <td className="p-3.5 text-rose-400 font-bold">{a.max_risk_score.toFixed(1)}</td>
                    <td className="p-3.5">{a.high_risk_duration_sec}s</td>
                    <td className="p-3.5 text-amber-400">{a.total_incidents_count}</td>
                    <td className="p-3.5 text-right space-x-2">
                      <Link
                        to={`/monitoring?analysisId=${a.id}`}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded border border-gray-700 transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect</span>
                      </Link>
                      <a
                        href={analysisApi.getExportUrl(a.id)}
                        download
                        className="inline-flex items-center space-x-1 px-2.5 py-1 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 rounded border border-cyan-500/30 transition"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
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
