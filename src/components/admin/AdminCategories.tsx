import React, { useState, useEffect } from 'react';
import { adminService } from '../../features/admin/services/adminService';
import type { Category } from '../../types';
import { AdminInfoTooltip } from './AdminInfoTooltip';
import { useApp } from '../../context/AppContext';
import {
  FolderKanban,
  FolderPlus,
  Edit2,
  CheckCircle2,
  XCircle,
  X,
} from 'lucide-react';

export const AdminCategories: React.FC = () => {
  const { getCategoryTemplateCount } = useApp();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Create Category Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit Category Modal State
  const [categoryToEdit, setCategoryToEdit] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const fetchCategories = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminService.categories();
      setCategories(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Failed to fetch admin categories:', err);
      setError(err.message || 'Unable to load template categories.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) {
      setError('Category name is required.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await adminService.createCategory({ name: catName.trim(), description: catDesc.trim(), status: 'Active' });
      await fetchCategories();
      setShowCreateModal(false);
      setCatName('');
      setCatDesc('');
    } catch (err: any) {
      setError(err.message || 'Failed to create category.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryToEdit || !editName.trim()) return;

    try {
      setIsSubmitting(true);
      await adminService.updateCategory(categoryToEdit.id, {
        name: editName.trim(),
        description: editDesc.trim(),
        status: categoryToEdit.status || 'Active',
      });
      await fetchCategories();
      setCategoryToEdit(null);
    } catch (err: any) {
      alert(err.message || 'Failed to update category');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (cat: Category) => {
    const targetStatus = (cat.status || 'Active') === 'Active' ? 'Inactive' : 'Active';
    try {
      await adminService.updateCategory(cat.id, {
        name: cat.name,
        description: cat.description || '',
        status: targetStatus,
      });
      await fetchCategories();
    } catch (err: any) {
      alert(err.message || 'Failed to update category status');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in p-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-black tracking-tight text-slate-900">Category Administration</h2>
          </div>
          <p className="text-xs text-slate-500 font-medium pt-1">
            Manage report template categories. Inactive categories are hidden from new template creation options without deleting historical records.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer"
        >
          <FolderPlus className="w-4 h-4" />
          <span>Create Category</span>
        </button>
      </div>

      {/* Categories Table */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400">Loading categories...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3.5 px-4">Category Name</th>
                  <th className="py-3.5 px-4">Description</th>
                  <th className="py-3.5 px-4">Associated Templates</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categories.map((c) => {
                  const isActive = (c.status || 'Active') === 'Active';
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-extrabold text-slate-900 flex items-center gap-1.5">
                        <span>{c.name}</span>
                        <AdminInfoTooltip
                          title={c.name}
                          description="Template categorization folder."
                          whoItAffects="Operational template creators."
                          impact="Inactive categories are unavailable for new operational template categorization but remain visible to Admin and do not rewrite existing templates."
                        />
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate font-medium">{c.description || 'No description provided.'}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-700">{getCategoryTemplateCount(c.id)} templates</td>
                      <td className="py-3.5 px-4">
                        {isActive ? (
                          <span className="flex items-center gap-1 text-emerald-700 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Active
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 w-max">
                            <XCircle className="w-3.5 h-3.5" /> Inactive
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setCategoryToEdit(c);
                              setEditName(c.name);
                              setEditDesc(c.description || '');
                            }}
                            className="p-1.5 text-slate-500 hover:text-slate-900 bg-slate-100 rounded-lg cursor-pointer"
                            title="Edit Category"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(c)}
                            className={`px-3 py-1 rounded-lg font-bold text-xs transition-colors cursor-pointer ${isActive
                                ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                              }`}
                          >
                            {isActive ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Category Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-extrabold text-slate-900">Create Template Category</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Category Name *</label>
                <input
                  type="text"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="e.g. Legal & Compliance"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Description</label>
                <textarea
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                  placeholder="Short description of templates under this category..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-600 focus:outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Category Modal */}
      {categoryToEdit && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-extrabold text-slate-900">Edit Category</h3>
              </div>
              <button
                type="button"
                onClick={() => setCategoryToEdit(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Category Name *</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Description</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-600 focus:outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCategoryToEdit(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
