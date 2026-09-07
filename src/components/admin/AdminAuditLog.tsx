import React, { useState, useEffect } from 'react';
import { adminService } from '../../features/admin/services/adminService';
import type { AdminAuditRecord } from '../../features/admin/types/adminTypes';
import { History, Search } from 'lucide-react';

export const AdminAuditLog: React.FC = () => {
  const [logs, setLogs] = useState<AdminAuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminService.audit();
      setLogs(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Failed to fetch admin audit log:', err);
      setError(err.message || 'Unable to load audit log.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(
    (l) =>
      l.actor_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.target?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in p-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-rose-600" />
            <h2 className="text-xl font-black tracking-tight text-slate-900">Admin Audit Trail Log</h2>
          </div>
          <p className="text-xs text-slate-500 font-medium pt-1">
            Immutable log of all administrative actions, feature toggles, element settings, and user access changes.
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search audit trail..."
            className="w-full pl-9 pr-3 py-2 bg-white rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-purple-600 focus:outline-none"
          />
        </div>
      </div>

      {/* Audit Log Table */}
      {error ? (
        <div className="p-8 text-center bg-rose-50 border border-rose-200 rounded-2xl space-y-3">
          <p className="text-sm font-bold text-rose-900">{error}</p>
          <button
            onClick={fetchLogs}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl cursor-pointer transition-colors"
          >
            Retry Loading Audit Log
          </button>
        </div>
      ) : loading ? (
        <div className="p-12 text-center text-xs text-slate-400">Loading audit records...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3.5 px-4">Timestamp</th>
                  <th className="py-3.5 px-4">Actor</th>
                  <th className="py-3.5 px-4">Action</th>
                  <th className="py-3.5 px-4">Target Resource</th>
                  <th className="py-3.5 px-4">Previous Value</th>
                  <th className="py-3.5 px-4">New Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                      No matching audit records found.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900">{log.actor_name}</span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                            {log.actor_role}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-extrabold text-purple-700">{log.action}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800">{log.target}</td>
                      <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">{log.previous_value || '—'}</td>
                      <td className="py-3.5 px-4 font-bold text-emerald-700 font-mono text-[11px]">{log.new_value || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
