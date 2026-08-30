import React from 'react';
import { useApp } from '../../context/AppContext';
import { CheckCircle, AlertCircle, Info } from 'lucide-react';

export const Toast: React.FC = () => {
  const { toast } = useApp();

  if (!toast) return null;

  const iconMap = {
    success: <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />,
    warning: <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />,
    info: <Info className="w-5 h-5 text-indigo-500 shrink-0" />,
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 bg-slate-900 text-white rounded-lg shadow-xl border border-slate-800 animate-slide-up max-w-md">
      {iconMap[toast.type]}
      <span className="text-sm font-medium">{toast.message}</span>
    </div>
  );
};
