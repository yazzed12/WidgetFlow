import React, { useState } from 'react';
import { X, XCircle, AlertCircle } from 'lucide-react';
import type { WidgetTemplate } from '../../types';

interface RejectModalProps {
  template: WidgetTemplate;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

export const RejectModal: React.FC<RejectModalProps> = ({ template, onConfirm, onClose }) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a reason for rejecting this template request.');
      return;
    }
    onConfirm(reason.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-scale-up">
        <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
              <XCircle className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-slate-900">Reject Template Request</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <p className="text-slate-700 font-medium leading-relaxed">
            Rejecting <strong className="text-slate-900 font-bold">"{template.name}"</strong> submitted by{' '}
            <strong className="text-slate-900">{template.createdByName}</strong> ({template.createdByRole}).
          </p>

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Reason for Rejection <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={4}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError('');
              }}
              placeholder="Explain what needs to be changed before this template can be approved..."
              className={`w-full px-3.5 py-2 bg-slate-50 border rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 transition-all ${
                error ? 'border-rose-400 ring-rose-500/20' : 'border-slate-200 focus:ring-rose-500/20 focus:border-rose-500'
              }`}
            />
            {error && (
              <p className="text-[11px] text-rose-500 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {error}
              </p>
            )}
          </div>
        </form>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer shadow-xs"
          >
            Reject Template
          </button>
        </div>
      </div>
    </div>
  );
};
