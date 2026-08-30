import React from 'react';
import { useApp } from '../../context/AppContext';
import { UserCheck } from 'lucide-react';

export const RoleSwitcher: React.FC = () => {
  const { currentUser, users, switchUser } = useApp();

  return (
    <div className="bg-slate-900 border-b border-slate-800 text-white px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2 font-medium text-slate-300">

        <span className="hidden sm:inline text-slate-400">Click a user context to test approval workflows live:</span>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto">
        {users.map((user) => {
          const isActive = user.id === currentUser.id;
          const firstName = user.name.split(' ')[0];
          return (
            <button
              key={user.id}
              onClick={() => switchUser(user.id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-medium transition-all cursor-pointer text-xs whitespace-nowrap ${isActive
                ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-400 ring-offset-1 ring-offset-slate-900'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                }`}
            >
              <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              <span>{firstName} · {user.role}</span>
              {isActive && <UserCheck className="w-3.5 h-3.5 ml-0.5 text-indigo-200" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};
