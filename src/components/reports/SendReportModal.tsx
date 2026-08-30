import React, { useState } from 'react';
import type { ReportInstance } from '../../types';
import { useApp } from '../../context/AppContext';
import { X, Send, AlertCircle, PenTool, ExternalLink } from 'lucide-react';
import { apiService } from '../../services/apiService';
import { ReportSignatureModal } from '../report/ReportSignatureModal';
import { UserSignatureSettingsModal } from '../user/UserSignatureSettingsModal';

interface SendReportModalProps {
  report: ReportInstance;
  onClose: () => void;
}

export const SendReportModal: React.FC<SendReportModalProps> = ({ report, onClose }) => {
  const { currentUser, users, templates, sendReport } = useApp();

  // New assignments are limited to active operational users. Historical report references are unaffected.
  const availableRecipients = users.filter((u) => u.id !== currentUser.id && u.roleKey !== 'admin' && u.roleActive !== false && (u.status || 'Active') === 'Active');

  // Default suggested recipient
  const defaultRecipient = availableRecipients.find((u) => {
    if (currentUser.roleType === 'System' && currentUser.roleKey === 'employee') return u.roleType === 'System' && u.roleKey === 'manager';
    if (currentUser.roleType === 'System' && currentUser.roleKey === 'manager') return u.roleType === 'System' && u.roleKey === 'director';
    return true;
  }) || availableRecipients[0];

  const [selectedRecipientId, setSelectedRecipientId] = useState(defaultRecipient?.id || '');
  const [senderNote, setSenderNote] = useState('');
  const [error, setError] = useState('');
  const [missingProfileError, setMissingProfileError] = useState(false);
  const [showSigModal, setShowSigModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Check template requirements for Sender Signature
  const template = report.templateSnapshot || templates.find((t) => t.id === report.templateId);
  const components: any[] = [];
  if (template?.components) components.push(...template.components);
  if (template?.dynamicSections) {
    template.dynamicSections.forEach((s: any) => {
      if (s.components) components.push(...s.components);
    });
  }
  if (template?.fields) components.push(...template.fields);

  const hasSenderSigRequirement = components.some(
    (c: any) => c.type === 'signature' && (c.signatureConfig?.signatureRole || '').toLowerCase() === 'sender'
  );
  const activeSenderSig = (report.activeSignatures || []).find((s: any) => s.signatureRole === 'sender');

  const handleSendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecipientId) {
      setError('Please select a recipient.');
      return;
    }

    // Sender Signature Gate
    if (hasSenderSigRequirement && !activeSenderSig) {
      try {
        const sigProf = await apiService.getUserSignatureProfile();
        if (!sigProf) {
          setMissingProfileError(true);
          setError('You need to create your signature before signing and sending this report.');
          return;
        }
        setMissingProfileError(false);
        setError('');
        setShowSigModal(true);
      } catch (err) {
        setMissingProfileError(true);
        setError('You need to create your signature before signing and sending this report.');
      }
      return;
    }

    // Direct send if no sender signature required or already active
    await sendReport(report.id, selectedRecipientId, senderNote.trim());
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
        <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-scale-up">
          {/* Header */}
          <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-xs">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Send Report for Review</h2>
                <p className="text-xs text-slate-500">{report.title}</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSendSubmit} className="p-6 space-y-5 text-xs">
            {/* Sender Signature Requirement Notice */}
            {hasSenderSigRequirement && !activeSenderSig && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-amber-900">
                <PenTool className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-950">Sender Digital Signature Required</h4>
                  <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                    This template requires your digital sign-off. Clicking Send will open the <strong>SIGN & SEND</strong> confirmation.
                  </p>
                </div>
              </div>
            )}

            {/* Recipient Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                Select Recipient <span className="text-rose-500">*</span>
              </label>

              <div className="space-y-2">
                {availableRecipients.map((user) => (
                  <label
                    key={user.id}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                      selectedRecipientId === user.id
                        ? 'bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/20'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="recipient"
                        value={user.id}
                        checked={selectedRecipientId === user.id}
                        onChange={() => {
                          setSelectedRecipientId(user.id);
                          setError('');
                        }}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className={`w-8 h-8 rounded-full ${user.avatarBg} text-white font-bold flex items-center justify-center text-xs shrink-0`}>
                        {user.avatarInitials}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          {user.name}
                          <span className="text-[10px] font-semibold px-2 py-0.2 rounded bg-white text-indigo-700 border border-indigo-200">
                            {user.role}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">{user.department} • {user.email}</div>
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              {error && (
                <div className="mt-2.5 p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                  <p className="text-[11px] font-medium text-rose-700 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    {error}
                  </p>

                  {missingProfileError && (
                    <button
                      type="button"
                      onClick={() => setShowProfileModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] rounded-lg transition-colors cursor-pointer shadow-xs mt-1"
                    >
                      <PenTool className="w-3.5 h-3.5" />
                      <span>Create Saved Signature Profile</span>
                      <ExternalLink className="w-3 h-3 ml-0.5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Optional Message */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Optional Note for Recipient
              </label>
              <textarea
                rows={3}
                value={senderNote}
                onChange={(e) => setSenderNote(e.target.value)}
                placeholder="Add a note for the recipient (e.g., Please review this week's operational metrics)..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>

            {/* Footer Actions */}
            <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Send className="w-4 h-4" />
                <span>{hasSenderSigRequirement && !activeSenderSig ? 'Sign & Send' : 'Send Report'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Signature Confirmation Modal */}
      {showSigModal && (
        <ReportSignatureModal
          reportTitle={report.title}
          signatureRole="sender"
          currentUser={currentUser}
          onClose={() => setShowSigModal(false)}
          onConfirm={async (sigPayload) => {
            setShowSigModal(false);
            await sendReport(report.id, selectedRecipientId, senderNote.trim(), sigPayload);
            onClose();
          }}
        />
      )}

      {/* User Signature Profile Setup Modal */}
      {showProfileModal && (
        <UserSignatureSettingsModal
          currentUser={currentUser}
          onClose={() => {
            setShowProfileModal(false);
            setMissingProfileError(false);
            setError('');
          }}
        />
      )}
    </>
  );
};
