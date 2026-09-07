import React from 'react';
import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export const AuthMessage: React.FC<{
  tone: 'error' | 'success';
  id?: string;
  children: ReactNode;
}> = ({ tone, id, children }) => (
  <div
    id={id}
    role={tone === 'error' ? 'alert' : 'status'}
    aria-live="polite"
    className={`mb-5 flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm ${
      tone === 'error'
        ? 'border-rose-200 bg-rose-50 text-rose-800'
        : 'border-emerald-200 bg-emerald-50 text-emerald-800'
    }`}
  >
    {tone === 'error'
      ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
    <span>{children}</span>
  </div>
);

