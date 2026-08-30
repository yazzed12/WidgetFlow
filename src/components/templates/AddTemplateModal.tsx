import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { X, FileText, Save, Send, AlertCircle, Plus, Trash2 } from 'lucide-react';
import type { WidgetLayoutType, FieldInputType, ReportTemplateField } from '../../types';
import { fetchTemplateSubmissionAction, resolveUserGovernanceLevel } from '../../utils/governanceUtils';

export const AddTemplateModal: React.FC = () => {
  const {
    currentUser,
    categories,
    isAddModalOpen,
    draftToEdit,
    closeAddTemplateModal,
    saveTemplateDraft,
    submitTemplateForApproval,
  } = useApp();

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [layoutType, setLayoutType] = useState<WidgetLayoutType>('KPI Cards');

  // Custom Field Definitions
  const [fields, setFields] = useState<ReportTemplateField[]>([
    { id: 'f-1', label: 'Reporting Period', type: 'text', required: true, section: 'General Information' },
    { id: 'f-2', label: 'Primary Metrics Data', type: 'textarea', required: true, section: 'Metrics Data' },
  ]);

  const [errors, setErrors] = useState<{ name?: string; categoryId?: string; description?: string }>({});

  const [submissionAction, setSubmissionAction] = useState<{ label: string; isDirect: boolean }>({
    label: resolveUserGovernanceLevel(currentUser) === 'Director' ? 'Publish Template' : 'Submit for Approval',
    isDirect: resolveUserGovernanceLevel(currentUser) === 'Director',
  });

  useEffect(() => {
    let mounted = true;
    void fetchTemplateSubmissionAction(currentUser).then((res) => {
      if (mounted) {
        setSubmissionAction({ label: res.buttonLabel, isDirect: res.isDirectPublish });
      }
    });
    return () => {
      mounted = false;
    };
  }, [currentUser, isAddModalOpen]);

  useEffect(() => {
    if (draftToEdit) {
      setName(draftToEdit.name || '');
      setCategoryId(draftToEdit.categoryId || categories[0]?.id || '');
      setDescription(draftToEdit.description || '');
      setTagsInput(draftToEdit.tags ? draftToEdit.tags.join(', ') : '');
      setLayoutType(draftToEdit.layoutType || 'KPI Cards');
      if (draftToEdit.fields && draftToEdit.fields.length > 0) {
        setFields(draftToEdit.fields);
      }
    } else {
      setName('');
      setCategoryId(categories[0]?.id || '');
      setDescription('');
      setTagsInput('');
      setLayoutType('KPI Cards');
      setFields([
        { id: 'f-1', label: 'Reporting Period', type: 'text', required: true, section: 'General Information' },
        { id: 'f-2', label: 'Primary Metrics Data', type: 'textarea', required: true, section: 'Metrics Data' },
      ]);
    }
    setErrors({});
  }, [draftToEdit, isAddModalOpen, categories]);

  if (!isAddModalOpen) return null;

  const validate = () => {
    const newErrors: { name?: string; categoryId?: string; description?: string } = {};
    if (!name.trim()) newErrors.name = 'Template name is required.';
    if (!categoryId) newErrors.categoryId = 'Please select a category.';
    if (!description.trim()) newErrors.description = 'Description is required.';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddField = () => {
    const newField: ReportTemplateField = {
      id: `f-field-${Date.now()}`,
      label: `Metric Field #${fields.length + 1}`,
      type: 'text',
      required: true,
      section: 'General Information',
    };
    setFields([...fields, newField]);
  };

  const handleRemoveField = (id: string) => {
    if (fields.length <= 1) return;
    setFields(fields.filter((f) => f.id !== id));
  };

  const handleFieldChange = (id: string, key: keyof ReportTemplateField, val: any) => {
    setFields(fields.map((f) => (f.id === id ? { ...f, [key]: val } : f)));
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const parsedTags = tagsInput
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const handleSaveDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await saveTemplateDraft(
        {
          name: name.trim(),
          categoryId,
          description: description.trim(),
          tags: parsedTags,
          layoutType,
        },
        draftToEdit?.id
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitForApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await submitTemplateForApproval(
        {
          name: name.trim(),
          categoryId,
          description: description.trim(),
          tags: parsedTags,
          layoutType,
        },
        draftToEdit?.id
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-scale-up">
        {/* Header */}
        <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {draftToEdit ? 'Edit Report Template Draft' : 'Create New Report Template'}
              </h2>
              <span className="text-xs text-slate-500">
                Authoring as <strong className="text-slate-800">{currentUser.name}</strong> ({currentUser.role})
              </span>
            </div>
          </div>

          <button
            onClick={closeAddTemplateModal}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Template Name */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Report Template Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              placeholder="e.g. Executive Quarterly Performance Report"
              className={`w-full px-3.5 py-2 bg-slate-50 border rounded-lg text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 transition-all ${
                errors.name ? 'border-rose-400 ring-rose-500/20' : 'border-slate-200 focus:ring-indigo-500/20 focus:border-indigo-500'
              }`}
            />
            {errors.name && (
              <p className="text-[11px] text-rose-500 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.name}
              </p>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Category <span className="text-rose-500">*</span>
            </label>
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                if (errors.categoryId) setErrors((prev) => ({ ...prev, categoryId: undefined }));
              }}
              className={`w-full px-3.5 py-2 bg-slate-50 border rounded-lg text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 transition-all ${
                errors.categoryId ? 'border-rose-400 ring-rose-500/20' : 'border-slate-200 focus:ring-indigo-500/20 focus:border-indigo-500'
              }`}
            >
              <option value="" disabled>Select category...</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            {errors.categoryId && (
              <p className="text-[11px] text-rose-500 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.categoryId}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Description <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (errors.description) setErrors((prev) => ({ ...prev, description: undefined }));
              }}
              placeholder="Describe the standardized report structure and guidelines for users..."
              className={`w-full px-3.5 py-2 bg-slate-50 border rounded-lg text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 transition-all ${
                errors.description ? 'border-rose-400 ring-rose-500/20' : 'border-slate-200 focus:ring-indigo-500/20 focus:border-indigo-500'
              }`}
            />
            {errors.description && (
              <p className="text-[11px] text-rose-500 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.description}
              </p>
            )}
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Tags <span className="text-slate-400 font-normal">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="Quarterly, OKRs, Finance, Executive"
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>

          {/* Template Fields Builder */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800">Defined Report Fields</label>
              <button
                type="button"
                onClick={handleAddField}
                className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Field</span>
              </button>
            </div>

            <div className="space-y-2">
              {fields.map((f, idx) => (
                <div key={f.id} className="p-3 bg-white rounded-lg border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
                    <span className="text-[10px] font-bold text-slate-400">#{idx + 1}</span>
                    <input
                      type="text"
                      value={f.label}
                      onChange={(e) => handleFieldChange(f.id, 'label', e.target.value)}
                      placeholder="Field Label"
                      className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs text-slate-900 flex-1 font-semibold"
                    />
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-between">
                    <select
                      value={f.type}
                      onChange={(e) => handleFieldChange(f.id, 'type', e.target.value as FieldInputType)}
                      className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 cursor-pointer"
                    >
                      <option value="text">Text</option>
                      <option value="textarea">Textarea</option>
                      <option value="number">Number</option>
                      <option value="currency">Currency ($)</option>
                      <option value="percentage">Percentage (%)</option>
                      <option value="date">Date</option>
                    </select>

                    <label className="flex items-center gap-1 text-[11px] text-slate-600 font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        checked={f.required}
                        onChange={(e) => handleFieldChange(f.id, 'required', e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600"
                      />
                      Required
                    </label>

                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveField(f.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={closeAddTemplateModal}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSaveDraft}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-800 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-4 h-4 text-slate-600" />
              <span>{isSubmitting ? 'Saving...' : 'Save Draft'}</span>
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmitForApproval}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Send className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Submitting...'
                  : submissionAction.label}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
