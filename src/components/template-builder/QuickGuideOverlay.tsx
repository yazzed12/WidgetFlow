import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { COMPONENT_HELP_DATABASE, type ComponentHelpDefinition } from '../../shared/component-help/index.js';
import { TemplateComponentRenderer } from '../dynamic-template/TemplateComponentRenderer.js';
import { X, HelpCircle, Lightbulb, PlayCircle, Check, ArrowRight } from 'lucide-react';

interface QuickGuideOverlayProps {
  type: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const QuickGuideOverlay: React.FC<QuickGuideOverlayProps> = ({
  type,
  isOpen,
  onClose,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const helpDef: ComponentHelpDefinition | undefined = type ? COMPONENT_HELP_DATABASE[type] : undefined;

  // Local temporary state for the isolated live preview
  const [previewValue, setPreviewValue] = useState<any>(undefined);

  useEffect(() => {
    if (helpDef && helpDef.defaultExampleValue !== undefined) {
      setPreviewValue(helpDef.defaultExampleValue);
    } else {
      setPreviewValue(undefined);
    }
  }, [type]);

  // Keyboard Escape listener & Focus Trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Focus modal container
    if (modalRef.current) {
      modalRef.current.focus();
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !helpDef) return null;

  const content = (
    <div
      tabIndex={-1}
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-title"
      className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fade-in focus:outline-none select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-scale-up">
        {/* Header Bar */}
        <div className="p-5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600 text-white rounded-2xl shadow-xs">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 id="guide-title" className="text-sm font-extrabold text-slate-900">
                {helpDef.title} Quick Guide
              </h3>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                Studio Component Guide
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close quick guide"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* What it does */}
          <div className="space-y-1.5">
            <h4 className="font-extrabold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-indigo-600" /> What it does
            </h4>
            <p className="text-slate-700 leading-relaxed font-medium bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
              {helpDef.shortDescription}
            </p>
          </div>

          {/* When to use it */}
          <div className="space-y-1.5">
            <h4 className="font-extrabold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <ArrowRight className="w-3.5 h-3.5 text-emerald-600" /> When to use it
            </h4>
            <p className="text-slate-700 leading-relaxed font-medium bg-emerald-50/50 p-3.5 rounded-2xl border border-emerald-200/80">
              {helpDef.whenToUse}
            </p>
          </div>

          {/* Live Visual Example Preview */}
          {helpDef.exampleComponent && (
            <div className="space-y-2">
              <h4 className="font-extrabold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <PlayCircle className="w-3.5 h-3.5 text-indigo-600" /> Live Visual Example (Instance Fill View)
              </h4>

              <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3">
                <TemplateComponentRenderer
                  component={helpDef.exampleComponent as any}
                  value={previewValue}
                  mode="edit"
                  onChange={(_, val) => setPreviewValue(val)}
                />
                <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-[10px] text-slate-500 font-mono">
                  <span>Isolated Preview State:</span>
                  <span className="truncate max-w-[200px]">
                    {JSON.stringify(previewValue !== undefined ? previewValue : 'null')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Best Practice Tips */}
          {helpDef.tips && helpDef.tips.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-extrabold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5 text-amber-500" /> Author Tips & Rules
              </h4>
              <ul className="space-y-1.5 pl-1">
                {helpDef.tips.map((tip, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-slate-600 font-medium">
                    <span className="w-4 h-4 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      ✓
                    </span>
                    <span className="leading-snug">{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Modal Action Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 font-semibold">Press Esc to close anytime</span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" /> Got it
          </button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
};
