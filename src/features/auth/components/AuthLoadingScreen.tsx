import React from 'react';
import { Layers3, LoaderCircle } from 'lucide-react';

export const AuthLoadingScreen: React.FC = () => (
  <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4" aria-busy="true">
    <div className="text-center" role="status" aria-live="polite">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
        <Layers3 className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-slate-600">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading WidgetFlow…
      </div>
    </div>
  </main>
);

