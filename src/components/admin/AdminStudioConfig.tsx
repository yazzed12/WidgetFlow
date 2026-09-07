import React, { useState } from 'react';
import { useSystemConfig } from '../../context/SystemConfigContext';
import {
  LayoutTemplate,
  Shapes,
  Package,
  Type,
  Layers,
  Database,
  Palette,
  GitMerge,
  Eye,
  X,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

const STUDIO_MODULES = [
  { key: 'studio.templates', label: 'Templates', icon: <LayoutTemplate className="w-4 h-4" /> },
  { key: 'studio.elements', label: 'Elements', icon: <Shapes className="w-4 h-4" /> },
  { key: 'studio.content_library', label: 'Content Library', icon: <Package className="w-4 h-4" /> },
  { key: 'studio.packs', label: 'Packs', icon: <Package className="w-4 h-4" /> },
  { key: 'studio.text', label: 'Text', icon: <Type className="w-4 h-4" /> },
  { key: 'studio.sections', label: 'Sections', icon: <Layers className="w-4 h-4" /> },
  { key: 'studio.data_fields', label: 'Data Fields', icon: <Database className="w-4 h-4" /> },
  { key: 'studio.themes', label: 'Themes', icon: <Palette className="w-4 h-4" /> },
  { key: 'studio.workflow', label: 'Workflow', icon: <GitMerge className="w-4 h-4" /> },
];

export const AdminStudioConfig: React.FC = () => {
  const { isFeatureEnabled } = useSystemConfig();
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const visibleModules = STUDIO_MODULES.filter((m) => isFeatureEnabled(m.key));

  return (
    <div className="space-y-6 animate-fade-in p-6">
      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-black tracking-tight text-slate-900">Template Studio Configuration</h2>
          </div>
          <p className="text-xs text-slate-500 font-medium pt-1">
            Visual summary of active Studio navigation modules available to creators.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowPreviewModal(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer"
        >
          <Eye className="w-4 h-4" />
          <span>Preview Template Studio UX</span>
        </button>
      </div>

      {/* Summary Grid */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-3">
          Studio Navigation Module Statuses
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {STUDIO_MODULES.map((m) => {
            const enabled = isFeatureEnabled(m.key);
            return (
              <div
                key={m.key}
                className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
                  enabled ? 'bg-emerald-50/50 border-emerald-200' : 'bg-slate-50 border-slate-200 opacity-60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={enabled ? 'text-indigo-600' : 'text-slate-400'}>{m.icon}</div>
                  <span className="text-xs font-extrabold text-slate-900">{m.label}</span>
                </div>
                {enabled ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3" /> Enabled
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">
                    <XCircle className="w-3 h-3" /> Disabled
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-scale-up">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-extrabold">Effective Template Studio Rail Preview</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-slate-300">
              <p className="text-slate-400">
                Below is the exact Studio sidebar navigation rail that creators (Ahmed, Sarah, Omar) will see based on current Admin configuration:
              </p>

              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-center gap-2 overflow-x-auto">
                {visibleModules.map((m) => (
                  <div
                    key={m.key}
                    className="py-3 px-4 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 flex flex-col items-center gap-1 shrink-0"
                  >
                    <div className="text-indigo-400">{m.icon}</div>
                    <span className="text-[10px] font-bold tracking-tight">{m.label}</span>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-purple-950/40 border border-purple-800/40 rounded-xl text-purple-200 text-[11px]">
                Showing {visibleModules.length} enabled modules out of {STUDIO_MODULES.length} total.
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 text-right">
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
