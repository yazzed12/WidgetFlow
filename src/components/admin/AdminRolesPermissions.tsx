import React, { useEffect, useState } from 'react';
import { Copy, Edit3, Plus, ShieldCheck, X, AlertTriangle, Users, Layers, CheckCircle2, Lock } from 'lucide-react';
import { adminService } from '../../features/admin/services/adminService';
import type { AdminPermissionDefinition } from '../../features/admin/types/adminTypes';
import type { GovernanceLevel, PermissionKey } from '../../shared/permissionCatalog';
import type { OrganizationalRole } from '../../types';
import { AdminInfoTooltip } from './AdminInfoTooltip';

type EditorState = {
  id?: string;
  key?: string;
  name: string;
  description: string;
  governanceLevel: GovernanceLevel;
  isActive: boolean;
  permissions: PermissionKey[];
  roleType?: 'System' | 'Custom';
  isProtected?: boolean;
  isCustomEdited?: boolean;
};

const blankRole = (): EditorState => ({
  name: '', description: '', governanceLevel: 'None', isActive: true, permissions: [], roleType: 'Custom', isProtected: false,
});

export const AdminRolesPermissions: React.FC = () => {
  const [roles, setRoles] = useState<OrganizationalRole[]>([]);
  const [permissionDefinitions, setPermissionDefinitions] = useState<AdminPermissionDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [presetFeedback, setPresetFeedback] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const data = await adminService.roleCatalog();
      setRoles(data.roles);
      setPermissionDefinitions(data.permissions);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Unable to load roles.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openRole = (role: OrganizationalRole) => {
    setError(null);
    setSuccessMsg(null);
    setPresetFeedback(null);
    setEditor({
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description || '',
      governanceLevel: role.governanceLevel,
      isActive: role.isActive,
      permissions: [...role.permissions],
      roleType: role.roleType,
      isProtected: role.key === 'admin' || (role.roleType === 'System' && role.isProtected && role.key === 'admin'),
      isCustomEdited: false,
    });
  };

  const togglePermission = (permission: PermissionKey) => {
    if (!editor || editor.isProtected) return;
    setEditor({
      ...editor,
      permissions: editor.permissions.includes(permission)
        ? editor.permissions.filter((key) => key !== permission)
        : [...editor.permissions, permission],
      isCustomEdited: true,
    });
  };

  const handleGovernanceLevelChange = (newLevel: GovernanceLevel) => {
    if (!editor || editor.isProtected) return;
    if (editor.roleType === 'System') return; // Governance level is protected for system roles

    if (editor.isCustomEdited) {
      const confirmApply = window.confirm(
        `Apply ${newLevel} permission preset?\n\nThis will replace your current permission selections with the current ${newLevel} role permissions.`
      );
      if (!confirmApply) return;
    }

    let presetPermissions: PermissionKey[] = [];
    if (newLevel !== 'None') {
      const matchingSystemRole = roles.find((r) => r.roleType === 'System' && r.governanceLevel === newLevel);
      if (matchingSystemRole) {
        presetPermissions = [...matchingSystemRole.permissions];
      }
    }

    setEditor({
      ...editor,
      governanceLevel: newLevel,
      permissions: presetPermissions,
      isCustomEdited: false,
    });
    setPresetFeedback(`Permission preset applied from ${newLevel === 'None' ? 'None (Blank)' : newLevel + ' Level'}`);
  };

  const save = async () => {
    if (!editor || editor.isProtected) return;
    if (!editor.name.trim()) { setError('Role name is required.'); return; }
    try {
      setSaving(true);
      setError(null);
      setSuccessMsg(null);
      const payload = {
        name: editor.name.trim(),
        description: editor.description.trim(),
        governanceLevel: editor.governanceLevel,
        isActive: editor.isActive,
        permissions: editor.permissions,
      };
      if (editor.id) {
        await adminService.updateRole(editor.id, payload);
        setSuccessMsg(`Role "${editor.name}" permissions updated successfully.`);
      } else {
        await adminService.createRole(payload);
        setSuccessMsg(`Custom Role "${editor.name}" created successfully.`);
      }
      setEditor(null);
      await load();
    } catch (err: any) {
      setError(err.message || 'Unable to save role.');
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async (role: OrganizationalRole) => {
    const name = window.prompt('Name for the duplicated role:', `${role.name} Copy`);
    if (!name?.trim()) return;
    try {
      await adminService.createRole({ name: name.trim(), description: role.description,
        governanceLevel: role.governanceLevel, isActive: true, permissions: role.permissions });
      await load();
    } catch (err: any) {
      setError(err.message || 'Unable to duplicate role.');
    }
  };

  const deactivate = async (role: OrganizationalRole) => {
    try {
      await adminService.updateRole(role.id, { name: role.name, description: role.description,
        governanceLevel: role.governanceLevel, isActive: false, permissions: role.permissions });
      await load();
    } catch (err: any) {
      setError(err.message || 'Unable to deactivate role.');
    }
  };

  const activate = async (role: OrganizationalRole) => {
    try {
      await adminService.updateRole(role.id, { name: role.name, description: role.description,
        governanceLevel: role.governanceLevel, isActive: true, permissions: role.permissions });
      await load();
    } catch (err: any) {
      setError(err.message || 'Unable to activate role.');
    }
  };

  // Metrics Widgets
  const totalRolesCount = roles.length;
  const customRolesCount = roles.filter((r) => r.roleType === 'Custom').length;
  const activeRolesCount = roles.filter((r) => r.isActive).length;
  const totalAssignedUsers = roles.reduce((sum, r) => sum + r.assignedUsers, 0);
  const permissionGroups = Object.values(permissionDefinitions.reduce<Record<string, { id: string; label: string; permissions: [string, string][] }>>((groups, permission) => {
    const group = groups[permission.groupKey] ?? { id: permission.groupKey, label: permission.groupKey.replace(/[-_]/g, ' '), permissions: [] };
    group.permissions.push([permission.key, permission.label]);
    groups[permission.groupKey] = group;
    return groups;
  }, {}));
  const permissionCount = permissionDefinitions.length;

  return (
    <div className="space-y-6 animate-fade-in p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-purple-600" />
            <h2 className="text-xl font-black tracking-tight text-slate-900">Roles &amp; Permissions</h2>
          </div>
          <p className="text-xs text-slate-500 font-medium pt-1">
            Configure organizational role capabilities without writing code. Control system role permissions and custom presets.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setError(null); setSuccessMsg(null); setEditor(blankRole()); }}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Create Role
        </button>
      </div>

      {error && <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /><span>{error}</span></div>}
      {successMsg && <div className="p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /><span>{successMsg}</span></div>}

      {/* Admin Summary Widgets */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Roles</div>
          <div className="text-lg font-black text-slate-900 mt-1 flex items-center justify-between">
            {totalRolesCount}
            <ShieldCheck className="w-4 h-4 text-purple-500" />
          </div>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Custom Roles</div>
          <div className="text-lg font-black text-slate-900 mt-1 flex items-center justify-between">
            {customRolesCount}
            <Layers className="w-4 h-4 text-indigo-500" />
          </div>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Roles</div>
          <div className="text-lg font-black text-emerald-600 mt-1 flex items-center justify-between">
            {activeRolesCount}
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Catalog Perms</div>
          <div className="text-lg font-black text-slate-900 mt-1 flex items-center justify-between">
            {permissionCount}
            <ShieldCheck className="w-4 h-4 text-blue-500" />
          </div>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Assigned Users</div>
          <div className="text-lg font-black text-slate-900 mt-1 flex items-center justify-between">
            {totalAssignedUsers}
            <Users className="w-4 h-4 text-amber-500" />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400 font-semibold">Loading organizational roles...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3.5 px-4">Role Name</th>
                  <th className="py-3.5 px-4">Type</th>
                  <th className="py-3.5 px-4">Governance Level</th>
                  <th className="py-3.5 px-4">Assigned Users</th>
                  <th className="py-3.5 px-4">Permissions</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {roles.map((role) => {
                  const isProtectedAdmin = role.key === 'admin';
                  const isSystemRole = role.roleType === 'System';
                  return (
                    <tr key={role.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                          {role.name}
                          {isProtectedAdmin && <Lock className="w-3 h-3 text-slate-400" />}
                        </div>
                        <div className="text-[10px] text-slate-500 max-w-xs truncate">{role.description}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${isSystemRole ? 'bg-indigo-50 text-indigo-800 border-indigo-200' : 'bg-purple-50 text-purple-800 border-purple-200'}`}>
                          {role.roleType} Role
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-700">
                        {role.governanceLevel === 'None' ? 'None' : `${role.governanceLevel} Level`}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-700">{role.assignedUsers}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-700">
                        {isProtectedAdmin ? <span className="text-slate-400 font-normal">Protected authority · 0 ordinary</span> : `${role.permissions.length} Enabled`}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${role.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {role.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex justify-end gap-2">
                          {isProtectedAdmin ? (
                            <span className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg font-bold text-slate-400 text-[11px]">
                              Protected
                            </span>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => openRole(role)}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg font-bold text-slate-700 cursor-pointer flex items-center gap-1"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                {isSystemRole ? 'Edit Permissions' : 'Edit'}
                              </button>
                              {!isSystemRole && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void duplicate(role)}
                                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg font-bold text-slate-700 cursor-pointer flex items-center gap-1"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                    Duplicate
                                  </button>
                                  {role.isActive ? (
                                    <button
                                      type="button"
                                      onClick={() => void deactivate(role)}
                                      className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg font-bold text-rose-700 cursor-pointer"
                                    >
                                      Deactivate
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => void activate(role)}
                                      className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg font-bold text-emerald-700 cursor-pointer"
                                    >
                                      Activate
                                    </button>
                                  )}
                                </>
                              )}
                            </>
                          )}
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

      {/* Role Editor Modal */}
      {editor && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  {editor.isProtected
                    ? 'View Protected Admin Role'
                    : editor.roleType === 'System'
                    ? `Edit System Role (${editor.name}) Permissions`
                    : editor.id
                    ? `Edit Custom Role (${editor.name})`
                    : 'Create Custom Role'}
                </h3>
                <p className="text-xs text-slate-500">
                  Governance Level defines template approval routing; operational permissions control capability visibility across WidgetFlow.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditor(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {presetFeedback && (
              <div className="p-2.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-xl text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                <span>{presetFeedback}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-xs">
              <label className="space-y-1">
                <span className="font-bold text-slate-700">Role Name</span>
                <input
                  disabled={editor.roleType === 'System' || editor.isProtected}
                  value={editor.name}
                  onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 disabled:bg-slate-100 disabled:text-slate-600 font-semibold"
                />
              </label>
              <label className="space-y-1">
                <div className="flex items-center gap-1">
                  <span className="font-bold text-slate-700">Governance Level</span>
                  <AdminInfoTooltip
                    title="Governance Level vs Permissions"
                    description="Governance Level determines how templates created by this role enter the organization’s approval routing. Permissions determine what users in the role are allowed to do."
                    whoItAffects="Users assigned to this role."
                    impact="Changing Governance Level adjusts which template review route is assigned to templates authored by this role."
                  />
                </div>
                <select
                  disabled={editor.roleType === 'System' || editor.isProtected}
                  value={editor.governanceLevel}
                  onChange={(e) => handleGovernanceLevelChange(e.target.value as GovernanceLevel)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-600 font-semibold"
                >
                  <option value="Employee">Employee Level</option>
                  <option value="Manager">Manager Level</option>
                  <option value="Director">Director Level</option>
                  <option value="None">None</option>
                </select>
              </label>
              <label className="col-span-2 space-y-1">
                <span className="font-bold text-slate-700">Description</span>
                <textarea
                  disabled={editor.isProtected}
                  value={editor.description}
                  onChange={(e) => setEditor({ ...editor, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 disabled:bg-slate-100"
                  rows={2}
                />
              </label>
              {!editor.isProtected && editor.roleType !== 'System' && (
                <label className="col-span-2 flex items-center gap-2 font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={editor.isActive}
                    onChange={(e) => setEditor({ ...editor, isActive: e.target.checked })}
                  />
                  <span>Active Role</span>
                </label>
              )}
            </div>

            {/* Permission Summary Counter */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="font-extrabold text-slate-900">
                Permission Summary: <span className="text-purple-700">{editor.permissions.length}</span> / {permissionCount} Enabled
              </div>
              <div className="flex flex-wrap gap-2 text-[10px] font-bold">
                {permissionGroups.map((group) => {
                  const count = group.permissions.filter(([k]) => editor.permissions.includes(k as PermissionKey)).length;
                  return (
                    <span key={group.id} className="px-2 py-0.5 bg-white border border-slate-200 rounded-md text-slate-600">
                      {group.label}: {count}/{group.permissions.length}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Permissions Grid */}
            <div className="grid md:grid-cols-2 gap-4">
              {permissionGroups.map((group) => (
                <section key={group.id} className="border border-slate-200 rounded-2xl p-4 bg-white">
                  <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-900 mb-3 border-b border-slate-100 pb-2">
                    {group.label}
                  </h4>
                  <div className="space-y-2">
                    {group.permissions.map(([key, label]) => {
                      const isChecked = editor.permissions.includes(key as PermissionKey);
                      return (
                        <label key={key} className="flex items-center gap-2 text-xs text-slate-700 font-medium hover:text-slate-900 cursor-pointer">
                          <input
                            type="checkbox"
                            disabled={editor.isProtected}
                            checked={isChecked}
                            onChange={() => togglePermission(key as PermissionKey)}
                            className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                          />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <div />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setEditor(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  {editor.isProtected ? 'Close' : 'Cancel'}
                </button>
                {!editor.isProtected && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void save()}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl cursor-pointer disabled:opacity-50 shadow-xs"
                  >
                    {saving ? 'Saving...' : editor.id ? 'Save Changes' : 'Create Role'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
