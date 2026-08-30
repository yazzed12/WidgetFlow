import React from 'react';
import type { WidgetTemplate, DynamicTemplate, ReportTemplateField, TemplateComponent, TemplateSection } from '../../types';
import { TemplateComponentRenderer } from './TemplateComponentRenderer';
import { Layers } from 'lucide-react';

interface DynamicTemplateRendererProps {
  template: WidgetTemplate | DynamicTemplate;
  values: Record<string, any>;
  mode: 'edit' | 'readOnly';
  onChange?: (newValues: Record<string, any>) => void;
  errors?: Record<string, string>;
  activeSignature?: any;
  activeSignatures?: any[];
  signatureHistory?: any[];
  currentUser?: any;
}

export const DynamicTemplateRenderer: React.FC<DynamicTemplateRendererProps> = ({
  template,
  values = {},
  mode,
  onChange,
  errors = {},
  activeSignature,
  activeSignatures,
  signatureHistory,
  currentUser,
}) => {
  // Extract all components/fields
  const rawFields: Array<ReportTemplateField | TemplateComponent> =
    (template as any).components || (template as any).fields || [];

  // Group components by section
  const sectionMap = new Map<string, Array<ReportTemplateField | TemplateComponent>>();

  const explicitSections: string[] =
    (template as any).sections && Array.isArray((template as any).sections)
      ? (template as any).sections
      : (template as any).dynamicSections?.map((s: TemplateSection) => s.title) || [];

  explicitSections.forEach((secName) => {
    if (!sectionMap.has(secName)) {
      sectionMap.set(secName, []);
    }
  });

  rawFields.forEach((f) => {
    const secName = f.section || 'General Information';
    if (!sectionMap.has(secName)) {
      sectionMap.set(secName, []);
    }
    sectionMap.get(secName)!.push(f);
  });

  const handleComponentChange = (key: string, newVal: any) => {
    if (onChange) {
      onChange({
        ...values,
        [key]: newVal,
      });
    }
  };

  const sectionsToRender = Array.from(sectionMap.entries()).filter(([_, comps]) => comps.length > 0);

  if (sectionsToRender.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl text-slate-500 text-xs">
        No sections or components found in template.
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {sectionsToRender.map(([sectionTitle, comps], sIdx) => (
        <div
          key={sectionTitle}
          className={`rounded-2xl border transition-all ${
            mode === 'readOnly'
              ? 'bg-slate-50/50 border-slate-200/80 p-5 space-y-4'
              : 'bg-white border-slate-200 p-5 shadow-xs space-y-4'
          }`}
        >
          {/* Section Header */}
          <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                <Layers className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">{sectionTitle}</h3>
            </div>
            <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              Section {sIdx + 1} of {sectionsToRender.length}
            </span>
          </div>

          {/* Section Components Grid */}
          <div className="grid grid-cols-12 gap-4">
            {comps.map((comp) => {
              const fieldKey = comp.key || comp.id;
              const val = values[fieldKey] !== undefined ? values[fieldKey] : values[comp.id];
              const errorMsg = errors[fieldKey] || errors[comp.id];

              return (
                <TemplateComponentRenderer
                  key={comp.id || fieldKey}
                  component={comp}
                  value={val}
                  mode={mode}
                  onChange={handleComponentChange}
                  error={errorMsg}
                  activeSignature={activeSignature}
                  activeSignatures={activeSignatures}
                  signatureHistory={signatureHistory}
                  currentUser={currentUser}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
