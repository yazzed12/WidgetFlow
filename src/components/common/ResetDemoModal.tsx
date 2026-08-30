import React from 'react';
import { useApp } from '../../context/AppContext';
import { RotateCcw, X, AlertTriangle } from 'lucide-react';

interface ResetDemoModalProps {
  onClose: () => void;
}

export const ResetDemoModal: React.FC<ResetDemoModalProps> = ({ onClose }) => {
  const { resetDemoData } = useApp();

  const handleConfirmReset = () => {
    resetDemoData();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-scale-up">
        {/* Header */}
        <div className="p-5 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-600 text-white rounded-lg shadow-xs">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-amber-950">Reset Demo Data?</h2>
              <p className="text-xs text-amber-700">Restore application to default presentation state</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-amber-400 hover:text-amber-700 hover:bg-amber-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-3 text-xs text-slate-600 leading-relaxed">
          <p>
            This action will restore all standard Report Templates, filled Report Instances, template approvals, discussions, digital signatures, and notifications to their original initial state.
          </p>
          <p className="font-semibold text-slate-800">
            User context will switch back to <strong>Ahmed Hassan (Employee)</strong> and navigate to the Dashboard.
          </p>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirmReset}
            className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset Demo Data</span>
          </button>
        </div>
      </div>
    </div>
  );
};
