import React, { useState } from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import type { User } from '../../types';
import { useAuth } from '../../features/auth/useAuth';
import { toAuthError } from '../../features/auth/authErrors';
import { navigateTo } from '../../features/auth/authRouting';

interface AdminHeaderProps {
  currentUser: User;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({ currentUser }) => {
  const { logout } = useAuth();
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const handleLogout = async () => {
    if (logoutPending) return;
    setLogoutPending(true);
    setLogoutError(null);
    try {
      await logout();
      navigateTo('/login', true);
    } catch (error) {
      setLogoutError(toAuthError(error).message);
    } finally {
      setLogoutPending(false);
    }
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white shrink-0 select-none">
      {/* Main Admin Header Content */}
      <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-xl text-white shadow-lg shadow-purple-950/50 border border-purple-400/30">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-tight text-white">WidgetFlow Admin</h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30 tracking-wider">
                Organization Control Center
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              Firm-wide configuration and platform administration
            </p>
          </div>
        </div>

        {/* Admin Profile Info */}
        <div>
          <div className="flex items-center gap-3 bg-slate-800/80 px-3.5 py-1.5 rounded-xl border border-slate-700/80">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center text-white font-extrabold text-xs shadow-sm">
              {currentUser.avatarInitials || '?'}
            </div>
            <div className="text-left">
              <div className="text-xs font-bold text-slate-200">{currentUser.name}</div>
              <div className="text-[10px] text-purple-300 font-semibold">
                {currentUser.profileCode ? `${currentUser.profileCode} · ` : ''}{currentUser.role} · {currentUser.email}
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              disabled={logoutPending}
              className="ml-2 flex items-center gap-1.5 rounded-lg border border-slate-600 px-2.5 py-1.5 text-[11px] font-bold text-slate-200 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              {logoutPending ? 'Signing out…' : 'Sign Out'}
            </button>
          </div>
          {logoutError && <p role="alert" className="mt-1 text-right text-[10px] text-rose-300">{logoutError}</p>}
        </div>
      </div>
    </header>
  );
};
