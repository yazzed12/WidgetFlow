import React from 'react';
import type { ContentPack } from '../../types';
import {
  X,
  Package,
  Layers,
  CheckCircle2,
} from 'lucide-react';

interface ContentPackPreviewModalProps {
  pack: ContentPack | null;
  onClose: () => void;
  onInsert: (pack: ContentPack) => void;
}

export const ContentPackPreviewModal: React.FC<ContentPackPreviewModalProps> = ({
  pack,
  onClose,
  onInsert,
}) => {
  if (!pack) return null;

  const totalComponents = (pack.sections || []).reduce(
    (acc, sec) => acc + (sec.components || []).length,
    0
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100/70 text-indigo-700 rounded-2xl">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">{pack.name}</h2>
                <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-full border border-indigo-100">
                  {pack.category}
                </span>
              </div>
              <p className="text-xs text-slate-500">{pack.description}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Preview */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium pb-2 border-b border-slate-100">
            <span className="flex items-center gap-1.5 font-bold text-slate-700">
              <Layers className="w-4 h-4 text-indigo-600" />
              {(pack.sections || []).length} Section{(pack.sections || []).length > 1 ? 's' : ''} Structure
            </span>
            <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-slate-700 font-semibold">
              {totalComponents} Total Field{totalComponents !== 1 ? 's' : ''}
            </span>
          </div>

          {(pack.sections || []).map((sec, sIdx) => (
            <div key={sIdx} className="space-y-3 bg-slate-50/60 border border-slate-200/80 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <span className="w-5 h-5 bg-indigo-600 text-white text-[11px] font-bold rounded-full flex items-center justify-center">
                    {sIdx + 1}
                  </span>
                  {sec.title}
                </h3>
                <span className="text-[11px] text-slate-500 italic">
                  {(sec.components || []).length} field{(sec.components || []).length !== 1 ? 's' : ''}
                </span>
              </div>
              {sec.description && <p className="text-xs text-slate-500">{sec.description}</p>}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                {(sec.components || []).map((comp, cIdx) => (
                  <div
                    key={cIdx}
                    className="p-3 bg-white border border-slate-200/80 rounded-xl space-y-1.5 shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 truncate">
                        {comp.label || comp.key}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                        {comp.type}
                      </span>
                    </div>

                    {comp.description && (
                      <p className="text-[10px] text-slate-400 line-clamp-1">{comp.description}</p>
                    )}

                    {/* Component-type specific preview indicator */}
                    <div className="pt-1 text-[11px] text-slate-500 font-mono flex items-center gap-1.5">
                      {comp.type === 'signature' && (
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold text-[10px]">
                          Role: {comp.signatureConfig?.signatureRole || 'Sender'} Signature
                        </span>
                      )}
                      {comp.type === 'table' && (
                        <span className="text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded font-semibold text-[10px]">
                          Data Table V2 ({(comp.tableConfig?.columns || []).length} columns)
                        </span>
                      )}
                      {comp.type === 'repeating_group' && (
                        <span className="text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded font-semibold text-[10px]">
                          Repeating Group ({(comp.nestedComponents || []).length} child fields)
                        </span>
                      )}
                      {comp.type === 'select' && (
                        <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-[10px]">
                          Options: {(comp.options || []).join(', ')}
                        </span>
                      )}
                      {['text', 'number', 'currency', 'date', 'textarea'].includes(comp.type) && (
                        <span className="text-slate-400 text-[10px] italic">
                          {comp.placeholder || `[${comp.type} input]`}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Preview is temporary. Nothing is saved to template until inserted.
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onInsert(pack);
                onClose();
              }}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Insert Content Pack
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
