import React from 'react';
import { ShieldCheck, CheckCircle2, FileSignature, Clock } from 'lucide-react';
import type { TemplateComponent, ReportSignatureRecord, User, TemplateTheme } from '../../types';
import { resolveReportSignatureForComponent } from '../../shared/signatureResolver.js';
import { resolveSignatureShellStyle } from '../../shared/themeResolver.js';

export { resolveReportSignatureForComponent };

interface SignatureRendererProps {
  component: TemplateComponent;
  readOnly?: boolean;
  activeSignature?: ReportSignatureRecord | null;
  activeSignatures?: ReportSignatureRecord[];
  signatureHistory?: ReportSignatureRecord[];
  currentUser?: User;
  theme?: TemplateTheme;
}

export const SignatureRenderer: React.FC<SignatureRendererProps> = ({
  component,
  readOnly,
  activeSignature,
  activeSignatures,
  signatureHistory,
  currentUser,
  theme,
}) => {
  const shellStyle = resolveSignatureShellStyle(component, theme);
  const sigConfig = component.signatureConfig || {};
  const rawRole = sigConfig.signatureRole || (component as any).signatureRole || 'Sender';
  const canonicalRole = String(rawRole).toLowerCase() === 'sender' ? 'sender' : 'receiver';
  const roleDisplayLabel = canonicalRole === 'sender' ? 'Sender' : 'Receiver';

  const label =
    sigConfig.label ||
    (component as any).label ||
    (canonicalRole === 'sender' ? 'Prepared & Submitted By' : 'Reviewed & Approved By');

  const showName = sigConfig.showName !== false;
  const showRole = sigConfig.showRole !== false;
  const showDate = sigConfig.showDate !== false;
  const showImage = sigConfig.showSignatureImage !== false;

  // Resolve active signature record for this component
  const relevantSignature = resolveReportSignatureForComponent({
    component,
    activeSignatures,
    signatureHistory,
    activeSignature,
  });

  if (readOnly || relevantSignature) {
    if (relevantSignature) {
      const isSender = String(relevantSignature.signatureRole).toLowerCase() === 'sender';
      const formattedDate = relevantSignature.signedAt
        ? new Date(relevantSignature.signedAt).toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })
        : '';

      return (
        <div
          className="p-4 border rounded-2xl space-y-3 select-none"
          style={{ backgroundColor: shellStyle.surfaceBg, borderColor: shellStyle.borderColor }}
        >
          {/* Header Role & Verification Badge */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
            <div
              className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
              style={{ fontFamily: shellStyle.labelFontFamily, color: shellStyle.labelColor }}
            >
              <FileSignature className="w-4 h-4 text-indigo-600" />
              <span>{label}</span>
            </div>

            <div className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-emerald-200">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>{isSender ? 'Sender Signed' : 'Reviewer Signed'}</span>
            </div>
          </div>

          {/* Signature Representation */}
          {showImage && (
            <div className="py-2.5 px-4 bg-white border border-slate-200 rounded-xl min-h-[60px] flex items-center justify-center">
              {relevantSignature.signatureMethod === 'drawn' && relevantSignature.signatureDataUrl ? (
                <img src={relevantSignature.signatureDataUrl} alt="Drawn Signature" className="max-h-14 object-contain" />
              ) : relevantSignature.signatureMethod === 'uploaded' && relevantSignature.signatureDataUrl ? (
                <img src={relevantSignature.signatureDataUrl} alt="Uploaded Signature" className="max-h-14 object-contain" />
              ) : (
                <p className="font-serif italic text-2xl text-indigo-950 font-extrabold tracking-wide">
                  {relevantSignature.typedName || relevantSignature.signedByName}
                </p>
              )}
            </div>
          )}

          {/* Metadata Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-600">
            <div>
              {showName && <span className="font-bold text-slate-900">{relevantSignature.signedByName}</span>}
              {showRole && <span className="text-slate-500 font-medium"> ({relevantSignature.signedByRole})</span>}
            </div>

            {showDate && formattedDate && (
              <div className="flex items-center gap-1 text-slate-500 font-medium">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>{formattedDate}</span>
              </div>
            )}
          </div>

          {/* Verification ID Badge */}
          <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <span className="flex items-center gap-1 text-indigo-700 font-semibold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 font-sans">
              <ShieldCheck className="w-3 h-3 text-indigo-600" />
              Verification ID: {relevantSignature.verificationId}
            </span>
            <span className="capitalize">Method: {relevantSignature.signatureMethod}</span>
          </div>
        </div>
      );
    }

    // Unsigned ReadOnly state
    return (
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 select-none text-center">
        <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-600 uppercase tracking-wider">
          <FileSignature className="w-4 h-4 text-slate-400" />
          <span>{label}</span>
        </div>
        <div className="py-4 border border-dashed border-slate-300 rounded-xl text-slate-400 text-xs italic bg-white">
          Awaiting {roleDisplayLabel} signature sign-off
        </div>
      </div>
    );
  }

  // Active Interactive Edit / Draft Mode
  return (
    <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3">
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2">
          <FileSignature className="w-4 h-4 text-indigo-600" />
          <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">{label}</span>
        </div>
        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
          {roleDisplayLabel} Signature Field
        </span>
      </div>

      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-1">
        <p className="text-xs text-slate-700 font-medium">
          {currentUser ? `Signer: ${currentUser.name} (${currentUser.role})` : 'Signer: Authorized User'}
        </p>
        <p className="text-[11px] text-slate-500 italic">
          Your saved signature will be requested with explicit confirmation when submitting or reviewing.
        </p>
      </div>
    </div>
  );
};
