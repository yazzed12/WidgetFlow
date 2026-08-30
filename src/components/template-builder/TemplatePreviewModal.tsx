import React, { useState } from 'react';
import type { WidgetTemplate } from '../../types';
import { DynamicTemplateRenderer } from '../dynamic-template/DynamicTemplateRenderer';
import { validateTemplateValues } from '../dynamic-template/validationHelper';
import { X, Eye, Edit3, CheckCircle, RefreshCw } from 'lucide-react';

interface TemplatePreviewModalProps {
  template: WidgetTemplate;
  onClose: () => void;
}

export const TemplatePreviewModal: React.FC<TemplatePreviewModalProps> = ({ template, onClose }) => {
  const [viewMode, setViewMode] = useState<'edit' | 'readOnly'>('edit');
  const [sampleValues, setSampleValues] = useState<Record<string, any>>({});
  const [sampleErrors, setSampleErrors] = useState<Record<string, string>>({});

  const handleTestValidation = () => {
    const errs = validateTemplateValues(template, sampleValues);
    setSampleErrors(errs);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-scale-up">
        {/* Modal Header */}
        <div className="p-5 bg-slate-900 text-white border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-indigo-600 rounded-lg text-white">
                <Eye className="w-4 h-4" />
              </span>
              <h2 className="text-sm font-bold tracking-tight">Template Preview — {template.name || 'Untitled'}</h2>
            </div>
            <p className="text-[11px] text-slate-400 pl-8">
              Live simulation of Universal Renderer rendering this template instance.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700">
              <button
                type="button"
                onClick={() => setViewMode('edit')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'edit' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Form Mode</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('readOnly')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'readOnly' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Document View</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto bg-slate-50">
          <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 text-xs">
            <span className="font-semibold text-slate-700">Test Form Inputs & Validation Rules</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestValidation}
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <CheckCircle className="w-3.5 h-3.5 text-indigo-600" />
                <span>Check Validation</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSampleValues({});
                  setSampleErrors({});
                }}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          <DynamicTemplateRenderer
            template={template}
            values={sampleValues}
            mode={viewMode}
            onChange={setSampleValues}
            errors={sampleErrors}
          />
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
};
