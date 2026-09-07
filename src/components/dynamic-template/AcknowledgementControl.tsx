import React from 'react';
import type { TemplateComponent } from '../../types/index.js';
import { ShieldCheck, CheckCircle2 } from 'lucide-react';
import { getReportBusinessFieldKey } from '../../shared/signatureResolver';

interface AcknowledgementControlProps {
  component: TemplateComponent;
  value: any;
  mode: 'edit' | 'readOnly';
  onChange?: (key: string, val: any) => void;
  disabled?: boolean;
  error?: string;
}

export const AcknowledgementControl: React.FC<AcknowledgementControlProps> = ({
  component,
  value,
  mode,
  onChange,
  disabled,
  error,
}) => {
  const fieldKey = getReportBusinessFieldKey(component) || '';
  const config = component.acknowledgementConfig || {};
  const statement =
    config.statementText ||
    component.description ||
    'I confirm that the information provided in this request is accurate and complete.';
  const checkboxLabel = config.checkboxLabel || 'I Agree';
  const captureTimestamp = config.captureTimestamp !== false;

  // Extract stored state
  const isAgreed =
    value === true ||
    (typeof value === 'object' && value !== null && Boolean(value.agreed));

  const storedTimestamp =
    typeof value === 'object' && value !== null ? value.timestamp : null;

  const handleToggle = (checked: boolean) => {
    if (disabled || mode === 'readOnly') return;
    if (onChange) {
      const payload = {
        agreed: checked,
        timestamp: checked && captureTimestamp ? new Date().toISOString() : null,
      };
      onChange(fieldKey, payload);
    }
  };

  const formatTimestamp = (isoStr?: string) => {
    if (!isoStr) return null;
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return null;
      return `${d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })}, ${d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })}`;
    } catch {
      return null;
    }
  };

  if (mode === 'readOnly') {
    return (
      <div
        className={`p-4 rounded-2xl border transition-all space-y-2 ${
          isAgreed
            ? 'bg-emerald-50/60 border-emerald-200 text-slate-900'
            : 'bg-slate-50 border-slate-200 text-slate-500'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck
              className={`w-4 h-4 ${
                isAgreed ? 'text-emerald-600' : 'text-slate-400'
              }`}
            />
            <span
              className={`text-xs font-bold uppercase tracking-wider ${
                isAgreed ? 'text-emerald-900' : 'text-slate-500'
              }`}
            >
              {isAgreed ? 'Acknowledged ✓' : 'Pending Acknowledgement'}
            </span>
          </div>
          {storedTimestamp && (
            <span className="text-[10px] font-mono text-slate-400">
              {formatTimestamp(storedTimestamp)}
            </span>
          )}
        </div>

        <p className="text-xs text-slate-700 leading-relaxed italic border-t border-slate-200/60 pt-2">
          "{statement}"
        </p>

        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 pt-1">
          {isAgreed ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          ) : (
            <div className="w-3.5 h-3.5 rounded-full border border-slate-400" />
          )}
          <span>{checkboxLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`p-4 rounded-2xl border transition-all space-y-3 ${
        isAgreed
          ? 'bg-emerald-50/50 border-emerald-300 ring-2 ring-emerald-500/10'
          : error
          ? 'bg-rose-50/50 border-rose-300'
          : 'bg-slate-50 border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-700 leading-relaxed font-medium">
          {statement}
        </p>
      </div>

      <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between">
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isAgreed}
            disabled={disabled}
            onChange={(e) => handleToggle(e.target.checked)}
            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer disabled:cursor-not-allowed"
          />
          <span className="text-xs font-bold text-slate-900">{checkboxLabel}</span>
          {component.required && <span className="text-rose-500 font-bold">*</span>}
        </label>

        {isAgreed && storedTimestamp && (
          <span className="text-[10px] text-slate-400 font-mono">
            Confirmed {formatTimestamp(storedTimestamp)}
          </span>
        )}
      </div>
    </div>
  );
};
