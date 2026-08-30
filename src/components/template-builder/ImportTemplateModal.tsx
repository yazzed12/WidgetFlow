import React, { useState } from 'react';
import type { WidgetTemplate } from '../../types';
import { X, FileCode, FileText, FileSpreadsheet, FileCheck, Upload, AlertCircle } from 'lucide-react';

interface ImportTemplateModalProps {
  onImportSchema: (template: WidgetTemplate) => void;
  onClose: () => void;
}

export const ImportTemplateModal: React.FC<ImportTemplateModalProps> = ({ onImportSchema, onClose }) => {
  const [selectedFormat, setSelectedFormat] = useState<'json' | 'word' | 'excel' | 'pdf'>('json');
  const [jsonInput, setJsonInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleProcessImport = () => {
    setError(null);
    if (selectedFormat !== 'json') {
      setError('Import format coming soon in future release.');
      return;
    }

    if (!jsonInput.trim()) {
      setError('Please paste a valid WidgetFlow Template JSON schema.');
      return;
    }

    try {
      const parsed = JSON.parse(jsonInput);

      // Validate imported schema structure
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid JSON object.');
      }

      if (!parsed.name || typeof parsed.name !== 'string') {
        throw new Error('Imported schema must contain a valid "name" string.');
      }

      const importedTemplate: WidgetTemplate = {
        id: `tpl-imp-${Date.now()}`,
        name: `${parsed.name} (Imported)`,
        description: parsed.description || 'Imported template schema.',
        categoryId: parsed.categoryId || 'cat-finance',
        version: 'v1.0',
        status: 'Draft',
        createdById: 'user-employee',
        createdByName: 'Ahmed Hassan',
        createdByRole: 'Employee',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: Array.isArray(parsed.tags) ? parsed.tags : ['Imported'],
        sections: Array.isArray(parsed.sections) ? parsed.sections : ['General Information'],
        dynamicSections: Array.isArray(parsed.dynamicSections) ? parsed.dynamicSections : [],
        fields: Array.isArray(parsed.fields) ? parsed.fields : [],
        components: Array.isArray(parsed.components) ? parsed.components : parsed.fields || [],
      };

      onImportSchema(importedTemplate);
      onClose();
    } catch (err: any) {
      setError(`Import failed: ${err.message || 'Invalid JSON syntax.'}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-scale-up">
        {/* Header */}
        <div className="p-5 bg-slate-900 text-white border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600 rounded-xl text-white">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">Import Business Report Template</h2>
              <p className="text-[11px] text-slate-400">Select source document or paste JSON template schema.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Format Selector Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: 'json', label: 'WidgetFlow JSON', icon: <FileCode className="w-4 h-4 text-indigo-600" />, ready: true },
              { id: 'word', label: 'Word (.docx)', icon: <FileText className="w-4 h-4 text-blue-500" />, ready: false },
              { id: 'excel', label: 'Excel (.xlsx)', icon: <FileSpreadsheet className="w-4 h-4 text-emerald-500" />, ready: false },
              { id: 'pdf', label: 'PDF Form', icon: <FileCheck className="w-4 h-4 text-rose-500" />, ready: false },
            ].map((fmt) => (
              <button
                key={fmt.id}
                type="button"
                onClick={() => {
                  setSelectedFormat(fmt.id as any);
                  setError(null);
                }}
                className={`p-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                  selectedFormat === fmt.id
                    ? 'bg-indigo-50/80 border-indigo-600 ring-2 ring-indigo-500/20'
                    : 'bg-slate-50 border-slate-200 hover:bg-white'
                }`}
              >
                {fmt.icon}
                <span className="text-[11px] font-bold text-slate-800">{fmt.label}</span>
                {!fmt.ready && (
                  <span className="text-[9px] font-semibold text-slate-400 bg-slate-200/80 px-1.5 py-0.5 rounded">
                    Coming soon
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Format Input Content */}
          {selectedFormat === 'json' ? (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-800">Paste WidgetFlow JSON Schema</label>
              <textarea
                rows={7}
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder='{"name": "Custom Operational Template", "categoryId": "cat-ops", "sections": ["Overview"], "fields": [...]}'
                className="w-full p-3 font-mono text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          ) : (
            <div className="p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-center space-y-2">
              <Upload className="w-8 h-8 text-slate-400 mx-auto" />
              <h4 className="text-xs font-bold text-slate-700">Document Parser Entry Point</h4>
              <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                {selectedFormat.toUpperCase()} document import and AI extraction will be enabled in a future update.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleProcessImport}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer shadow-xs"
          >
            Import as Draft
          </button>
        </div>
      </div>
    </div>
  );
};
