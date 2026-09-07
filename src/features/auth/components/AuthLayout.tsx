import React, { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Layers3 } from 'lucide-react';

interface AuthLayoutProps {
  title: string;
  description: string;
  children: ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ title, description, children }) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="mb-7 flex items-center justify-center gap-3 text-slate-900">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
            <Layers3 className="h-6 w-6" aria-hidden="true" />
          </span>
          <span className="text-xl font-black tracking-tight">WidgetFlow</span>
        </div>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
          <header className="mb-6">
            <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-black tracking-tight text-slate-900 outline-none">
              {title}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          </header>
          {children}
        </section>
        <p className="mt-6 text-center text-xs text-slate-500">Secure organization access to WidgetFlow</p>
      </div>
    </main>
  );
};

