import React, { useState } from 'react';
import type { ContentPack, ContentPackCategory } from '../../types';
import type { ToolboxItem } from './BuilderToolbox';
import { Package, CheckCircle2, AlertCircle, X, Sparkles } from 'lucide-react';

interface AddToPackModalProps {
  toolItem: ToolboxItem | null;
  userPacks: ContentPack[];
  onClose: () => void;
  onAddToExistingPack: (packId: string, payload: { sectionId?: string; newSectionName?: string; componentDef: any }) => Promise<void>;
  onCreateNewPackAndAdd: (packData: { name: string; category: ContentPackCategory; description: string; firstSectionName: string; componentDef: any }) => Promise<void>;
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

export const AddToPackModal: React.FC<AddToPackModalProps> = ({
  toolItem,
  userPacks = [],
  onClose,
  onAddToExistingPack,
  onCreateNewPackAndAdd,
}) => {
  if (!toolItem) return null;

  // Mode: 'existing' vs 'new'
  const [mode, setMode] = useState<'existing' | 'new'>(userPacks.length > 0 ? 'existing' : 'new');

  // Lightweight Config State
  const [label, setLabel] = useState(toolItem.defaultLabel || toolItem.label);
  const [required, setRequired] = useState(false);
  const [signatureRole, setSignatureRole] = useState<'sender' | 'receiver'>('sender');

  // Existing Pack Selection
  const [selectedPackId, setSelectedPackId] = useState<string>(userPacks[0]?.id || '');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [newSectionName, setNewSectionName] = useState<string>('');
  const [isCreatingSection, setIsCreatingSection] = useState(false);

  // New Pack Creation
  const [newPackName, setNewPackName] = useState('');
  const [newPackCategory, setNewPackCategory] = useState<ContentPackCategory>('General');
  const [newPackDescription, setNewPackDescription] = useState('');
  const [firstSectionName, setFirstSectionName] = useState('Main Content');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected pack object
  const currentPack = userPacks.find((p) => p.id === selectedPackId) || userPacks[0] || null;
  const currentSections = currentPack?.sections || [];

  // Update section selection when selected pack changes
  const handlePackChange = (id: string) => {
    setSelectedPackId(id);
    const p = userPacks.find((item) => item.id === id);
    if (p && p.sections && p.sections.length > 0) {
      setSelectedSectionId((p.sections[0] as any).id || p.sections[0].title || '');
      setIsCreatingSection(false);
    } else {
      setSelectedSectionId('');
      setIsCreatingSection(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    try {
      setIsSubmitting(true);
      setError(null);

      // Build component definition
      const compDef: any = {
        type: toolItem.type,
        label: label.trim() || toolItem.defaultLabel || toolItem.label,
        required,
        placeholder: toolItem.defaultPlaceholder || '',
        options: toolItem.defaultOptions ? toolItem.defaultOptions.map((o) => ({ label: o, value: o })) : undefined,
      };

      if (toolItem.type === 'signature') {
        compDef.signatureConfig = {
          signatureRole,
          required: true,
        };
      }

      if (mode === 'existing') {
        if (!selectedPackId) {
          setError('Please select a My Pack destination.');
          setIsSubmitting(false);
          return;
        }

        await onAddToExistingPack(selectedPackId, {
          sectionId: isCreatingSection ? undefined : selectedSectionId || (currentSections[0] as any)?.id || currentSections[0]?.title,
          newSectionName: isCreatingSection ? newSectionName.trim() || 'New Section' : undefined,
          componentDef: compDef,
        });
      } else {
        if (!newPackName.trim()) {
          setError('Please provide a Pack Name.');
          setIsSubmitting(false);
          return;
        }

        await onCreateNewPackAndAdd({
          name: newPackName.trim(),
          category: newPackCategory,
          description: newPackDescription.trim(),
          firstSectionName: firstSectionName.trim() || 'Main Content',
          componentDef: compDef,
        });
      }

      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add element to Content Pack.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-2xl">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Add to Content Pack</h2>
              <p className="text-xs text-slate-500">Save element definition into your reusable My Packs</p>
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
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Element Summary Header */}
          <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-white text-indigo-600 rounded-xl shadow-2xs">
                {toolItem.icon || <Sparkles className="w-4 h-4" />}
              </div>
              <div>
                <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                  Element Definition
                </span>
                <h3 className="text-xs font-bold text-slate-900">{toolItem.label}</h3>
              </div>
            </div>
            <span className="px-2 py-0.5 bg-white text-slate-600 font-mono text-[10px] font-bold rounded-md border border-slate-200">
              {toolItem.type}
            </span>
          </div>

          {/* Lightweight Properties Config */}
          <div className="space-y-3 p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-800">
                Element Label in Pack
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Employee Full Name"
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {toolItem.type === 'signature' ? (
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-800">Signature Role</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSignatureRole('sender')}
                    className={`py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                      signatureRole === 'sender'
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Sender Signature
                  </button>
                  <button
                    type="button"
                    onClick={() => setSignatureRole('receiver')}
                    className={`py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                      signatureRole === 'receiver'
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Receiver Signature
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-semibold text-slate-700">Required Field by Default</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={required}
                    onChange={(e) => setRequired(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
            )}
          </div>

          {/* Mode Switcher: Existing Pack vs Create New Pack */}
          <div className="space-y-3">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setMode('existing')}
                disabled={userPacks.length === 0}
                className={`flex-1 py-1.5 text-center rounded-xl transition-all cursor-pointer ${
                  mode === 'existing'
                    ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 disabled:opacity-40'
                }`}
              >
                Existing My Pack ({userPacks.length})
              </button>
              <button
                type="button"
                onClick={() => setMode('new')}
                className={`flex-1 py-1.5 text-center rounded-xl transition-all cursor-pointer ${
                  mode === 'new'
                    ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                + Create New Pack
              </button>
            </div>

            {/* Mode A: Existing My Pack */}
            {mode === 'existing' && (
              <div className="space-y-3 p-4 border border-slate-200 rounded-2xl bg-white space-y-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-800">
                    Select Target My Pack <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedPackId}
                    onChange={(e) => handlePackChange(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {userPacks.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.category})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Section selection */}
                {currentPack && (
                  <div className="space-y-1 pt-1 border-t border-slate-100">
                    <label className="block text-xs font-bold text-slate-800 flex items-center justify-between">
                      <span>Add to Section</span>
                      {currentSections.length > 1 && !isCreatingSection && (
                        <button
                          type="button"
                          onClick={() => setIsCreatingSection(true)}
                          className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer"
                        >
                          + Create New Section
                        </button>
                      )}
                    </label>

                    {isCreatingSection ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newSectionName}
                          onChange={(e) => setNewSectionName(e.target.value)}
                          placeholder="e.g. Additional Information"
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-500"
                        />
                        {currentSections.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setIsCreatingSection(false)}
                            className="px-2.5 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-semibold rounded-xl shrink-0"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    ) : (
                      <select
                        value={selectedSectionId || (currentSections[0] as any)?.id || currentSections[0]?.title || ''}
                        onChange={(e) => {
                          if (e.target.value === '__new__') {
                            setIsCreatingSection(true);
                          } else {
                            setSelectedSectionId(e.target.value);
                          }
                        }}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        {currentSections.map((sec, idx) => {
                          const secId = (sec as any).id || sec.title || `sec-${idx}`;
                          return (
                            <option key={secId} value={secId}>
                              {sec.title} ({(sec.components || []).length} items)
                            </option>
                          );
                        })}
                        <option value="__new__">+ Create New Section...</option>
                      </select>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Mode B: Create New Pack */}
            {mode === 'new' && (
              <div className="space-y-3 p-4 border border-slate-200 rounded-2xl bg-white">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-800">
                    Pack Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newPackName}
                    onChange={(e) => setNewPackName(e.target.value)}
                    placeholder="e.g. Employee Request Pack"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-800">Category</label>
                  <select
                    value={newPackCategory}
                    onChange={(e) => setNewPackCategory(e.target.value as ContentPackCategory)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-800">First Section Name</label>
                  <input
                    type="text"
                    value={firstSectionName}
                    onChange={(e) => setFirstSectionName(e.target.value)}
                    placeholder="e.g. Request Information"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-800">Description</label>
                  <textarea
                    value={newPackDescription}
                    onChange={(e) => setNewPackDescription(e.target.value)}
                    placeholder="Brief description of what this reusable pack contains..."
                    rows={2}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}
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
              {isSubmitting
                ? 'Adding to Pack...'
                : mode === 'new'
                ? 'Create Pack & Add Element'
                : 'Add to Pack'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
