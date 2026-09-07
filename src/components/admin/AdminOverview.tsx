import React, { useState, useEffect } from 'react';
import { adminService } from '../../features/admin/services/adminService';
import type { AdminOverviewSummary } from '../../features/admin/types/adminTypes';
import type { AdminViewType } from '../../types';
import {
  Users,
  Sliders,
  Shapes,
  Package,
  BookOpen,
  History,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

interface AdminOverviewProps {
  onNavigateTab: (tab: AdminViewType) => void;
}

export const AdminOverview: React.FC<AdminOverviewProps> = ({ onNavigateTab }) => {
  const [summary, setSummary] = useState<AdminOverviewSummary | null>(null);

  useEffect(() => {
    adminService.overview().then(setSummary).catch((err) => console.error('Overview fetch failed:', err));
  }, []);

  const auditLogs = summary?.recentAudit ?? [];
  const userCount = summary?.activeUserCount ?? 0;
  const categoryCount = summary?.activeCategoryCount ?? 0;
  const publishedPackCount = summary?.publishedPackCount ?? 0;
  const enabledContentCount = summary?.enabledContentItemCount ?? 0;

  return (
    <div className="space-y-6 animate-fade-in p-6">
      {/* Page Title */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-black tracking-tight text-slate-900">Admin Dashboard Overview</h2>
          <p className="text-xs text-slate-500 font-medium">
            Executive status summary of organization-wide platform configurations and activity
          </p>
        </div>
        <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl border border-emerald-200 text-xs font-bold">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>System Status: Operational</span>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Active Users</span>
            <Users className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{userCount}</div>
          <p className="text-[10px] text-slate-500">Firm-wide demo users</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Published Packs</span>
            <Package className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{publishedPackCount}</div>
          <p className="text-[10px] text-slate-500">Active building block packs</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Content Items</span>
            <BookOpen className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{enabledContentCount}</div>
          <p className="text-[10px] text-slate-500">Shared content library blocks</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Studio Features</span>
            <Sliders className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {summary?.enabledFeatureCount ?? 0}
          </div>
          <p className="text-[10px] text-slate-500">Active Studio modules</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Enabled Elements</span>
            <Shapes className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {summary?.enabledElementCount ?? 0}
          </div>
          <p className="text-[10px] text-slate-500">Permitted creator tools</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Config Changes</span>
            <History className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{summary?.auditEventCount ?? 0}</div>
          <p className="text-[10px] text-slate-500">Recorded audit events</p>
        </div>


      </div>

      {/* Main Grid Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Configuration Summary & Recent Activity */}
        <div className="lg:col-span-2 space-y-6">
          {/* Platform Configuration Summary */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-purple-600" />
                <h3 className="text-sm font-extrabold text-slate-900">Platform Configuration Summary</h3>
              </div>
              <span className="text-[10px] font-bold uppercase text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200">
                Company-wide Policy
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="text-xs font-bold text-slate-900">Template Studio Modules</div>
                <div className="text-xs text-slate-600">
                  {summary?.enabledFeatureCount ?? 0} of {summary?.featureCount ?? 0} modules enabled across all user roles.
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('features')}
                  className="pt-2 text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1 cursor-pointer"
                >
                  Configure Features <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="text-xs font-bold text-slate-900">Creator Toolbox Elements</div>
                <div className="text-xs text-slate-600">
                  {summary?.enabledElementCount ?? 0} of {summary?.elementCount ?? 0} input & component tools enabled for creators.
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('elements')}
                  className="pt-2 text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1 cursor-pointer"
                >
                  Manage Elements <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="text-xs font-bold text-slate-900">Active Categories</div>
                <div className="text-xs text-slate-600">
                  {categoryCount} report template categories available for organization workflows.
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('categories')}
                  className="pt-2 text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1 cursor-pointer"
                >
                  Manage Categories <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="text-xs font-bold text-slate-900">Users & Access</div>
                <div className="text-xs text-slate-600">
                  {userCount} active user identities in the live directory.
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('users')}
                  className="pt-2 text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1 cursor-pointer"
                >
                  User Directory <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Recent Administrative Activity */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-rose-600" />
                <h3 className="text-sm font-extrabold text-slate-900">Recent Administrative Activity</h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('audit')}
                className="text-xs font-bold text-purple-600 hover:underline cursor-pointer"
              >
                View Full Audit Log
              </button>
            </div>

            {auditLogs.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">No configuration changes logged yet.</div>
            ) : (
              <div className="space-y-3">
                {auditLogs.slice(0, 5).map((log) => (
                  <div key={log.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-start justify-between gap-4 text-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900">{log.actor_name}</span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-100 text-purple-800">{log.actor_role}</span>
                      </div>
                      <p className="text-slate-700 font-medium">
                        <span className="font-semibold text-purple-700">{log.action}:</span> {log.target}
                        {log.new_value && <span className="text-slate-500"> ({log.previous_value || 'None'} → {log.new_value})</span>}
                      </p>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Quick Actions */}
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-3">
              Administrative Quick Actions
            </h3>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => onNavigateTab('features')}
                className="w-full p-3 bg-purple-50 hover:bg-purple-100 text-purple-900 rounded-xl border border-purple-200 font-bold text-xs text-left flex items-center justify-between transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <Sliders className="w-4 h-4 text-purple-600" />
                  <span>Manage Studio Features</span>
                </div>
                <ArrowRight className="w-4 h-4 text-purple-600" />
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('elements')}
                className="w-full p-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 rounded-xl border border-indigo-200 font-bold text-xs text-left flex items-center justify-between transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <Shapes className="w-4 h-4 text-indigo-600" />
                  <span>Manage Toolbox Elements</span>
                </div>
                <ArrowRight className="w-4 h-4 text-indigo-600" />
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('users')}
                className="w-full p-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 rounded-xl border border-emerald-200 font-bold text-xs text-left flex items-center justify-between transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4 text-emerald-600" />
                  <span>Manage Users & Roles</span>
                </div>
                <ArrowRight className="w-4 h-4 text-emerald-600" />
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('settings')}
                className="w-full p-3 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-xl border border-amber-200 font-bold text-xs text-left flex items-center justify-between transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-amber-600" />
                  <span>Platform System Settings</span>
                </div>
                <ArrowRight className="w-4 h-4 text-amber-600" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
