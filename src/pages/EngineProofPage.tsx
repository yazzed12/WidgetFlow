import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { DynamicTemplateRenderer } from '../components/dynamic-template/DynamicTemplateRenderer';
import { validateTemplateValues } from '../components/dynamic-template/validationHelper';
import type { WidgetTemplate } from '../types';
import { Cpu, Eye, Edit3, CheckCircle, Code, Layers, FileSpreadsheet, RefreshCw } from 'lucide-react';

export const EngineProofPage: React.FC = () => {
  const { templates } = useApp();

  // Find 3 distinct demo templates or fallback to initial ones
  const opsTemplate = templates.find((t) => t.id === 'tpl-hr-1') || templates[0];
  const purchaseTemplate = templates.find((t) => t.id === 'tpl-pur-1') || templates[1] || templates[0];
  const incidentTemplate = templates.find((t) => t.id === 'tpl-dev-2') || templates[2] || templates[0];

  const demoSchemas: Array<{ id: string; name: string; subtitle: string; template: WidgetTemplate }> = [
    {
      id: 'ops',
      name: 'Weekly Operations Report',
      subtitle: 'SLA metrics, volume tracking, checkbox escalations & risk analysis',
      template: opsTemplate,
    },
    {
      id: 'purchase',
      name: 'Purchase Request',
      subtitle: 'Procurement details, currency, priority radio, file upload & justification',
      template: purchaseTemplate,
    },
    {
      id: 'incident',
      name: 'Incident Report',
      subtitle: 'System outages, datetime picker, P1-P4 severity & post-mortem analysis',
      template: incidentTemplate,
    },
  ];

  const [selectedSchemaId, setSelectedSchemaId] = useState<'ops' | 'purchase' | 'incident'>('ops');
  const [viewMode, setViewMode] = useState<'edit' | 'readOnly'>('edit');
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [activeJsonTab, setActiveJsonTab] = useState<'values' | 'schema' | 'errors'>('values');

  const currentDemo = demoSchemas.find((s) => s.id === selectedSchemaId) || demoSchemas[0];
  const currentTemplate = currentDemo.template;

  const handleSelectSchema = (id: 'ops' | 'purchase' | 'incident') => {
    setSelectedSchemaId(id);
    setFormValues({});
    setValidationErrors({});
  };

  const handleValidate = () => {
    const errors = validateTemplateValues(currentTemplate, formValues);
    setValidationErrors(errors);
  };

  return (
    <div className="space-y-6 pb-16 animate-fade-in">
      {/* Page Banner */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-lg border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-600 rounded-xl text-white shadow-xs">
              <Cpu className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold tracking-tight">Dynamic Template Engine Foundation — Schema V1</h1>
          </div>
          <p className="text-xs text-slate-400 pl-11">
            Universal Renderer rendering completely different business templates from JSON schema without custom React code per template.
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-800/90 p-1.5 rounded-xl border border-slate-700/80 self-start md:self-auto">
          <button
            onClick={() => setViewMode('edit')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'edit'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit Form Mode</span>
          </button>

          <button
            onClick={() => setViewMode('readOnly')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'readOnly'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Read-Only Document View</span>
          </button>
        </div>
      </div>

      {/* Demo Schema Selector Tabs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {demoSchemas.map((demo) => {
          const isSelected = demo.id === selectedSchemaId;
          return (
            <button
              key={demo.id}
              onClick={() => handleSelectSchema(demo.id as any)}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                isSelected
                  ? 'bg-white border-indigo-600 ring-2 ring-indigo-500/20 shadow-md'
                  : 'bg-white/80 border-slate-200 hover:border-slate-300 hover:bg-white shadow-2xs'
              }`}
            >
              {isSelected && <div className="absolute top-0 right-0 w-3 h-3 bg-indigo-600 rounded-bl-lg" />}
              <div className="flex items-center gap-2 mb-1">
                <FileSpreadsheet className={`w-4 h-4 ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`} />
                <h3 className="text-xs font-bold text-slate-900">{demo.name}</h3>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">{demo.subtitle}</p>
            </button>
          );
        })}
      </div>

      {/* Main Grid: Renderer Area + Live JSON Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Universal Renderer Output (Cols 7) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>Universal Renderer Output — {currentTemplate.name}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleValidate}
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-lg border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <CheckCircle className="w-3.5 h-3.5 text-indigo-600" />
                <span>Test Validation</span>
              </button>

              <button
                onClick={() => {
                  setFormValues({});
                  setValidationErrors({});
                }}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset Form</span>
              </button>
            </div>
          </div>

          {/* Universal Dynamic Template Renderer */}
          <DynamicTemplateRenderer
            template={currentTemplate}
            values={formValues}
            mode={viewMode}
            onChange={setFormValues}
            errors={validationErrors}
          />
        </div>

        {/* Live JSON Inspector (Cols 5) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 text-slate-200 rounded-2xl border border-slate-800 shadow-xl overflow-hidden sticky top-20">
            {/* Inspector Header Tabs */}
            <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                <Code className="w-4 h-4 text-indigo-400" />
                <span>Engine Data & Schema Inspector</span>
              </div>

              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                <button
                  onClick={() => setActiveJsonTab('values')}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                    activeJsonTab === 'values' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Values ({Object.keys(formValues).length})
                </button>

                <button
                  onClick={() => setActiveJsonTab('schema')}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                    activeJsonTab === 'schema' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Schema
                </button>

                <button
                  onClick={() => setActiveJsonTab('errors')}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                    activeJsonTab === 'errors' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Errors ({Object.keys(validationErrors).length})
                </button>
              </div>
            </div>

            {/* Inspector Code View */}
            <div className="p-4 max-h-[600px] overflow-y-auto font-mono text-[11px] leading-relaxed text-indigo-200">
              {activeJsonTab === 'values' && (
                <pre>{JSON.stringify(formValues, null, 2)}</pre>
              )}

              {activeJsonTab === 'schema' && (
                <pre>
                  {JSON.stringify(
                    {
                      id: currentTemplate.id,
                      name: currentTemplate.name,
                      version: currentTemplate.version,
                      sections: currentTemplate.sections || currentTemplate.dynamicSections,
                      components: (currentTemplate.components || currentTemplate.fields || []).map((c: any) => ({
                        key: c.key || c.id,
                        label: c.label,
                        type: c.type,
                        required: c.required,
                        layoutWidth: c.layoutWidth || c.layout?.width,
                        validation: c.validation,
                      })),
                    },
                    null,
                    2
                  )}
                </pre>
              )}

              {activeJsonTab === 'errors' && (
                <div>
                  {Object.keys(validationErrors).length === 0 ? (
                    <span className="text-emerald-400 italic">No validation errors. Schema values are valid!</span>
                  ) : (
                    <pre className="text-rose-300">{JSON.stringify(validationErrors, null, 2)}</pre>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
