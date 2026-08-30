import React, { useState } from 'react';
import type { TemplateSection, ContentPackCategory } from '../../types';
import { checkPackExternalReferences } from '../../shared/contentPackUtils';
import { Package, AlertCircle, CheckCircle2, X } from 'lucide-react';

interface SaveContentPackModalProps {
  section: TemplateSection | null;
  onClose: () => void;
  onSave: (packData: { name: string; category: ContentPackCategory; description: string; section: TemplateSection }) => Promise<void>;
}

const CATEGORIES: ContentPackCategory[] = [
  'General',
  'People / HR',
  'Finance',
  'Operations',
  'Technology',
  'Project Management',
  'Compliance / Risk',
];

export const SaveContentPackModal: React.FC<SaveContentPackModalProps> = ({
  section,
  onClose,
  onSave,
}) => {
  if (!section) return null;

  const [name, setName] = useState(section.title || '');
  const [category, setCategory] = useState<ContentPackCategory>('General');
  const [description, setDescription] = useState(section.description || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for external references
  const { hasExternalRefs, externalKeys } = checkPackExternalReferences(
    section.components || []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a Pack Name.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onSave({
        name: name.trim(),
        category,
        description: description.trim(),
        section,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save Content Pack.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-2xl">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Save as Content Pack</h2>
              <p className="text-xs text-slate-500">Save section as reusable content in My Packs</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {hasExternalRefs && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 space-y-1">
              <div className="flex items-center gap-2 font-bold text-amber-900">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>External Field References Detected</span>
              </div>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                This content references fields outside this section (e.g.{' '}
                <code className="font-mono font-semibold">{externalKeys.join(', ')}</code>). To ensure total portability across templates, external rules/calculations will be safely omitted from the pack definition.
              </p>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-800">
              Pack Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Vendor Evaluation Block"
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-800">
              Category <span className="text-rose-500">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ContentPackCategory)}
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white cursor-pointer"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-slate-400">
              Category is for discovery and search filter only.
            </p>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-800">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this reusable pack contains..."
              rows={3}
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
            />
          </div>

          <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl text-[11px] text-indigo-900 flex items-center justify-between">
            <span className="font-semibold">Save Location:</span>
            <span className="px-2.5 py-0.5 bg-white text-indigo-700 font-bold rounded-lg border border-indigo-200">
              My Packs
            </span>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isSubmitting ? 'Saving Pack...' : 'Save Pack'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
