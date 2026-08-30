import React from 'react';
import { X, CheckCircle2, Shield } from 'lucide-react';
import type { WidgetTemplate } from '../../types';

interface ApproveConfirmModalProps {
  template: WidgetTemplate;
  onConfirm: () => void;
  onClose: () => void;
}

export const ApproveConfirmModal: React.FC<ApproveConfirmModalProps> = ({ template, onConfirm, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-scale-up">
        <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-slate-900">Approve Template?</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs text-slate-600">
          <p className="text-slate-700 font-medium leading-relaxed">
            You are about to approve <strong className="text-slate-900 font-bold">"{template.name}"</strong>.
          </p>
          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-emerald-900 space-y-1">
            <span className="font-bold flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-emerald-600" />
              Workflow Effect
            </span>
            <p className="text-[11px] text-emerald-800">
              This template will immediately become <strong className="font-semibold">Approved</strong> and appear in the corporate-wide Templates Library.
            </p>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer shadow-xs"
          >
            Approve & Publish
          </button>
        </div>
      </div>
    </div>
  );
};
