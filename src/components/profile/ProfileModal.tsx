import React from 'react';
import { useApp } from '../../context/AppContext';
import { X, Shield, Building, FileSpreadsheet, Library, CheckCircle2, Clock } from 'lucide-react';

interface ProfileModalProps {
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ onClose }) => {
  const { currentUser, reports, templates, getPendingApprovalsForUser, getReportsAwaitingMyReview, openResetDemoModal } = useApp();

  const userReports = reports.filter((r) => r.createdById === currentUser.id);
  const userTemplates = templates.filter((t) => t.createdById === currentUser.id);
  const signedReportsCount = reports.filter(
    (r) => r.signature && r.signature.signedByUserId === currentUser.id
  ).length;

  const pendingApprovalsCount = getPendingApprovalsForUser().length;
  const reportsAwaitingReviewCount = getReportsAwaitingMyReview().length;
  const totalPendingActions = pendingApprovalsCount + reportsAwaitingReviewCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-scale-up">
        {/* Header */}
        <div className="p-6 bg-indigo-600 text-white flex items-start justify-between">
          <div className="flex items-center gap-3.5">
            <div className={`w-12 h-12 rounded-2xl ${currentUser.avatarBg} ring-4 ring-white/20 text-white font-bold flex items-center justify-center text-lg shadow-md`}>
              {currentUser.avatarInitials}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight">{currentUser.name}</h2>
                <span className="bg-white/20 text-white font-bold text-[10px] px-2.5 py-0.5 rounded-full border border-white/30">
                  {currentUser.role}
                </span>
              </div>
              <p className="text-xs text-indigo-100 mt-0.5">{currentUser.email}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-indigo-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 text-xs">
          {/* Demo Context Alert */}
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between text-indigo-900">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-600 shrink-0" />
              <div>
                <span className="font-bold">Active Demo Session Account</span>
                <p className="text-[11px] text-indigo-700">Role permissions & context active for {currentUser.name}</p>
              </div>
            </div>
          </div>

          {/* User Details */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Account Information</h3>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Department</span>
                <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                  <Building className="w-3.5 h-3.5 text-slate-400" />
                  {currentUser.department}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Access Role</span>
                <span className="font-bold text-indigo-600 mt-0.5 block">{currentUser.role}</span>
              </div>
            </div>
          </div>

          {/* Activity Summary */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Activity Metrics</h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <FileSpreadsheet className="w-4 h-4 text-indigo-600 mx-auto mb-1" />
                <div className="text-base font-bold text-slate-900">{userReports.length}</div>
                <span className="text-[10px] text-slate-500 font-medium">Reports Created</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <Library className="w-4 h-4 text-blue-600 mx-auto mb-1" />
                <div className="text-base font-bold text-slate-900">{userTemplates.length}</div>
                <span className="text-[10px] text-slate-500 font-medium">Templates Authored</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
                <div className="text-base font-bold text-slate-900">{signedReportsCount}</div>
                <span className="text-[10px] text-slate-500 font-medium">Reports Signed</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <Clock className="w-4 h-4 text-amber-600 mx-auto mb-1" />
                <div className="text-base font-bold text-slate-900">{totalPendingActions}</div>
                <span className="text-[10px] text-slate-500 font-medium">Pending Actions</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={() => {
              onClose();
              openResetDemoModal();
            }}
            className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Reset Demo Data
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer shadow-xs"
          >
            Close Profile
          </button>
        </div>
      </div>
    </div>
  );
};
