import React, { useState } from 'react';
import { useSystemConfig } from '../../context/SystemConfigContext';
import { configurationService } from '../../features/configuration/services/configurationService';
import { AdminInfoTooltip } from './AdminInfoTooltip';
import {
  Settings,
  Building,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

export const AdminSystemSettings: React.FC = () => {
  const { config, updateSettings } = useSystemConfig();
  const [orgName, setOrgName] = useState(config.settings?.org_name || '');
  const [platformName, setPlatformName] = useState(config.settings?.platform_name || '');
  const [defaultVersion, setDefaultVersion] = useState(config.settings?.default_template_version || '');

  const [allowRejection, setAllowRejection] = useState(config.settings?.allow_rejection ?? false);
  const [allowReturn, setAllowReturn] = useState(config.settings?.allow_return ?? false);
  const [digitalSignature, setDigitalSignature] = useState(config.settings?.digital_signature ?? false);
  const [templateGovernance, setTemplateGovernance] = useState(config.settings?.template_governance ?? false);

  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  React.useEffect(() => {
    if (config.settings) {
      if (config.settings.org_name !== undefined) setOrgName(config.settings.org_name);
      if (config.settings.platform_name !== undefined) setPlatformName(config.settings.platform_name);
      if (config.settings.default_template_version !== undefined) setDefaultVersion(config.settings.default_template_version);
      if (config.settings.allow_rejection !== undefined) setAllowRejection(Boolean(config.settings.allow_rejection));
      if (config.settings.allow_return !== undefined) setAllowReturn(Boolean(config.settings.allow_return));
      if (config.settings.digital_signature !== undefined) setDigitalSignature(Boolean(config.settings.digital_signature));
      if (config.settings.template_governance !== undefined) setTemplateGovernance(Boolean(config.settings.template_governance));
    }
  }, [config.settings]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      await updateSettings({
        org_name: orgName,
        platform_name: platformName,
        default_template_version: defaultVersion,
        allow_rejection: allowRejection,
        allow_return: allowReturn,
        digital_signature: digitalSignature,
        template_governance: templateGovernance,
      });
      setToastMessage('System settings saved successfully');
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to save system settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in p-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-slate-800 flex items-center gap-3 text-xs font-bold animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-amber-600" />
            <h2 className="text-xl font-black tracking-tight text-slate-900">System Settings</h2>
          </div>
          <p className="text-xs text-slate-500 font-medium pt-1">
            Global organization policies, review settings, digital signatures, and governance controls.
          </p>
        </div>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6 max-w-4xl">
        {/* Section 1: Organization & Platform Settings */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Building className="w-5 h-5 text-purple-600" />
            <h3 className="text-sm font-extrabold text-slate-900">Organization & Branding</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="space-y-1">
              <label className="font-bold text-slate-700">Organization Name</label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-purple-600 focus:outline-none font-medium"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700">Platform Brand Name</label>
              <input
                type="text"
                value={platformName}
                onChange={(e) => setPlatformName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-purple-600 focus:outline-none font-medium"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700">Default Template Version</label>
              <input
                type="text"
                value={defaultVersion}
                onChange={(e) => setDefaultVersion(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-purple-600 focus:outline-none font-medium"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Review & Governance Controls */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-extrabold text-slate-900">Review & Governance Policies</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <label className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between cursor-pointer">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-slate-900">Allow Report Rejection</span>
                  <AdminInfoTooltip
                    title="Report Rejection Policy"
                    description="Allows assigned reviewers with permission to permanently reject a sent report."
                    whoItAffects="Assigned reviewers and report authors."
                    impact="Disabling prevents future rejection actions while preserving existing historical rejected report records."
                  />
                </div>
                <div className="text-[11px] text-slate-500">Permit reviewers to reject submitted reports.</div>
              </div>
              <input
                type="checkbox"
                checked={allowRejection}
                onChange={(e) => setAllowRejection(e.target.checked)}
                className="w-4 h-4 text-purple-600 rounded"
              />
            </label>

            <label className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between cursor-pointer">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-slate-900">Allow Return for Changes</span>
                  <AdminInfoTooltip
                    title="Return for Changes Policy"
                    description="Allows assigned reviewers to return a sent report to its author with revision feedback."
                    whoItAffects="Assigned reviewers and report authors."
                    impact="Disabling hides return controls for new review actions. Existing returned reports remain editable by authors."
                  />
                </div>
                <div className="text-[11px] text-slate-500">Permit reviewers to return reports for author edit.</div>
              </div>
              <input
                type="checkbox"
                checked={allowReturn}
                onChange={(e) => setAllowReturn(e.target.checked)}
                className="w-4 h-4 text-purple-600 rounded"
              />
            </label>

            <label className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between cursor-pointer">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-slate-900">Digital Signatures</span>
                  <AdminInfoTooltip
                    title="Digital Signature Policy"
                    description="Controls whether cryptographic digital signing is available across WidgetFlow."
                    whoItAffects="Report authors and assigned reviewers."
                    impact="Disabling turns off signing actions for new workflow steps. Existing signed reports and audit records remain intact."
                    dependencies="Users also require Sign Report permission and must satisfy assignment rules."
                  />
                </div>
                <div className="text-[11px] text-slate-500">Require cryptographic signature audit records.</div>
              </div>
              <input
                type="checkbox"
                checked={digitalSignature}
                onChange={(e) => setDigitalSignature(e.target.checked)}
                className="w-4 h-4 text-purple-600 rounded"
              />
            </label>

            <label className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between cursor-pointer">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-slate-900">Template Governance Policy</span>
                  <AdminInfoTooltip
                    title="Template Governance Policy"
                    description="Controls whether template submissions follow configured organizational review routes."
                    whoItAffects="All template creators and governance reviewers."
                    impact="Disabling bypasses review routing and direct-publishes new template submissions. Existing approval requests keep their original routing."
                  />
                </div>
                <div className="text-[11px] text-slate-500">Enforce approval routing and versioning snapshots upon submission.</div>
              </div>
              <input
                type="checkbox"
                checked={templateGovernance}
                onChange={(e) => setTemplateGovernance(e.target.checked)}
                className="w-4 h-4 text-purple-600 rounded"
              />
            </label>
          </div>
        </div>

        {/* Section 2b: Configurable Template Governance Target Role Routing */}
        <TemplateGovernanceRoutingCard isGovernanceEnabled={templateGovernance} />

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer disabled:opacity-50"
          >
            {isSaving ? 'Saving Settings...' : 'Save Settings'}
          </button>
        </div>
      </form>

    </div>
  );
};

const TemplateGovernanceRoutingCard: React.FC<{ isGovernanceEnabled: boolean }> = ({ isGovernanceEnabled }) => {
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  const [employeeTarget, setEmployeeTarget] = React.useState('');
  const [employeeStrategy, setEmployeeStrategy] = React.useState<'SPECIFIC_USER' | 'ROLE_QUEUE' | 'DIRECT_PUBLISH'>('SPECIFIC_USER');
  const [employeeUser, setEmployeeUser] = React.useState('');

  const [managerTarget, setManagerTarget] = React.useState('');
  const [managerStrategy, setManagerStrategy] = React.useState<'SPECIFIC_USER' | 'ROLE_QUEUE' | 'DIRECT_PUBLISH'>('SPECIFIC_USER');
  const [managerUser, setManagerUser] = React.useState('');

  const [directorTarget, setDirectorTarget] = React.useState('DIRECT_PUBLISH');
  const [directorStrategy, setDirectorStrategy] = React.useState<'SPECIFIC_USER' | 'ROLE_QUEUE' | 'DIRECT_PUBLISH'>('DIRECT_PUBLISH');
  const [directorUser, setDirectorUser] = React.useState('DIRECT_PUBLISH');

  const load = async () => {
    try {
      setLoading(true);
      const res = await configurationService.governance();
      setData(res);
      if (res.routes) {
        setEmployeeTarget(res.routes.employee.id);
        setEmployeeStrategy(res.routes.employee.strategy || 'SPECIFIC_USER');
        setEmployeeUser(res.routes.employee.specificUserId || '');

        setManagerTarget(res.routes.manager.id);
        setManagerStrategy(res.routes.manager.strategy || 'SPECIFIC_USER');
        setManagerUser(res.routes.manager.specificUserId || '');

        setDirectorTarget(res.routes.director.id);
        setDirectorStrategy(res.routes.director.strategy || 'DIRECT_PUBLISH');
        setDirectorUser(res.routes.director.specificUserId || 'DIRECT_PUBLISH');
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Unable to load governance routing.');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { void load(); }, []);

  const handleSaveRouting = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccessMsg(null);
      const res = await configurationService.updateGovernance({
        employeeTargetRoleId: employeeTarget,
        employeeStrategy,
        employeeSpecificUserId: employeeUser,
        managerTargetRoleId: managerTarget,
        managerStrategy,
        managerSpecificUserId: managerUser,
        directorTargetRoleId: directorTarget,
        directorStrategy,
        directorSpecificUserId: directorUser,
      });
      setData(res);
      setSuccessMsg('Template Governance routing configuration saved successfully.');
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setError(err.message || 'Failed to save governance routing configuration.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 bg-white rounded-2xl border border-slate-200 text-xs text-slate-400 font-semibold">Loading Template Governance routing config...</div>;

  const eligibleRoles = data?.eligibleRoles || [];

  const findRoleObj = (targetRoleId: string) => {
    if (!targetRoleId || targetRoleId === 'DIRECT_PUBLISH') return null;
    const targetLower = targetRoleId.trim().toLowerCase();
    return (
      eligibleRoles.find(
        (r: any) =>
          r.id === targetRoleId ||
          r.key === targetRoleId ||
          r.id.toLowerCase() === targetLower ||
          r.key.toLowerCase() === targetLower ||
          r.name.toLowerCase() === targetLower
      ) || null
    );
  };

  const getEligibleUsersForRole = (targetRoleId: string) => {
    const roleObj = findRoleObj(targetRoleId);
    return roleObj?.eligibleUsers || [];
  };

  const getLiveRouteStatus = (
    targetRoleId: string,
    strategy: 'SPECIFIC_USER' | 'ROLE_QUEUE' | 'DIRECT_PUBLISH',
    specificUserId: string
  ) => {
    if (targetRoleId === 'DIRECT_PUBLISH' || strategy === 'DIRECT_PUBLISH') {
      return { isRouteValid: true, statusMessage: '✓ Direct Publish (No Approval Required)' };
    }
    const roleObj = findRoleObj(targetRoleId);
    if (!roleObj) {
      return { isRouteValid: false, statusMessage: '⚠ Configured target role not found' };
    }
    if (!roleObj.hasReviewPermissions) {
      return {
        isRouteValid: false,
        statusMessage: `⚠ Role "${roleObj.name}" lacks required template review permissions (template_approvals.view & template_approvals.approve)`,
      };
    }

    const eligibleUsers = roleObj.eligibleUsers || [];
    if (strategy === 'SPECIFIC_USER') {
      const selectedUser = eligibleUsers.find((u: any) => u.id === specificUserId);
      if (selectedUser) {
        return { isRouteValid: true, statusMessage: `✓ Valid Configuration (Reviewer: ${selectedUser.name})` };
      } else if (eligibleUsers.length === 0) {
        if (roleObj.activeUserCount > 0) {
          return {
            isRouteValid: false,
            statusMessage: `⚠ ${roleObj.name} has ${roleObj.activeUserCount} active user(s), but none have required review permissions`,
          };
        } else {
          return { isRouteValid: false, statusMessage: `⚠ 0 Active users available in selected Target Role` };
        }
      } else {
        return { isRouteValid: false, statusMessage: `⚠ Please select an assigned reviewer from ${roleObj.name}` };
      }
    } else if (strategy === 'ROLE_QUEUE') {
      if (eligibleUsers.length > 0) {
        return { isRouteValid: true, statusMessage: `✓ Role Queue Active (${eligibleUsers.length} Eligible Reviewer${eligibleUsers.length === 1 ? '' : 's'})` };
      } else if (roleObj.activeUserCount > 0) {
        return { isRouteValid: false, statusMessage: `⚠ ${roleObj.name} has active users, but none have required review permissions` };
      } else {
        return { isRouteValid: false, statusMessage: `⚠ 0 Active Users available in Target Role Queue` };
      }
    }
    return { isRouteValid: false, statusMessage: '⚠ Incomplete Configuration' };
  };

  const handleEmployeeTargetChange = (newTargetId: string) => {
    setEmployeeTarget(newTargetId);
    const eligible = getEligibleUsersForRole(newTargetId);
    if (eligible.length === 1) {
      setEmployeeUser(eligible[0].id);
    } else if (!eligible.some((u: any) => u.id === employeeUser)) {
      setEmployeeUser('');
    }
  };

  const handleManagerTargetChange = (newTargetId: string) => {
    setManagerTarget(newTargetId);
    const eligible = getEligibleUsersForRole(newTargetId);
    if (eligible.length === 1) {
      setManagerUser(eligible[0].id);
    } else if (!eligible.some((u: any) => u.id === managerUser)) {
      setManagerUser('');
    }
  };

  const handleDirectorTargetChange = (newTargetId: string) => {
    setDirectorTarget(newTargetId);
    const eligible = getEligibleUsersForRole(newTargetId);
    if (eligible.length === 1) {
      setDirectorUser(eligible[0].id);
    } else if (!eligible.some((u: any) => u.id === directorUser)) {
      setDirectorUser('');
    }
  };

  const handleEmployeeStrategyChange = (newStrategy: 'SPECIFIC_USER' | 'ROLE_QUEUE' | 'DIRECT_PUBLISH') => {
    setEmployeeStrategy(newStrategy);
    if (newStrategy === 'DIRECT_PUBLISH') {
      setEmployeeTarget('DIRECT_PUBLISH');
      setEmployeeUser('DIRECT_PUBLISH');
    } else {
      if (employeeTarget === 'DIRECT_PUBLISH') {
        const defaultRole = eligibleRoles.find((r: any) => r.hasReviewPermissions)?.id || eligibleRoles[0]?.id || '';
        setEmployeeTarget(defaultRole);
        const eligible = getEligibleUsersForRole(defaultRole);
        setEmployeeUser(eligible.length === 1 ? eligible[0].id : '');
      }
    }
  };

  const handleManagerStrategyChange = (newStrategy: 'SPECIFIC_USER' | 'ROLE_QUEUE' | 'DIRECT_PUBLISH') => {
    setManagerStrategy(newStrategy);
    if (newStrategy === 'DIRECT_PUBLISH') {
      setManagerTarget('DIRECT_PUBLISH');
      setManagerUser('DIRECT_PUBLISH');
    } else {
      if (managerTarget === 'DIRECT_PUBLISH') {
        const defaultRole = eligibleRoles.find((r: any) => r.hasReviewPermissions)?.id || eligibleRoles[0]?.id || '';
        setManagerTarget(defaultRole);
        const eligible = getEligibleUsersForRole(defaultRole);
        setManagerUser(eligible.length === 1 ? eligible[0].id : '');
      }
    }
  };

  const handleDirectorStrategyChange = (newStrategy: 'SPECIFIC_USER' | 'ROLE_QUEUE' | 'DIRECT_PUBLISH') => {
    setDirectorStrategy(newStrategy);
    if (newStrategy === 'DIRECT_PUBLISH') {
      setDirectorTarget('DIRECT_PUBLISH');
      setDirectorUser('DIRECT_PUBLISH');
    } else {
      if (directorTarget === 'DIRECT_PUBLISH') {
        const defaultRole = eligibleRoles.find((r: any) => r.hasReviewPermissions)?.id || eligibleRoles[0]?.id || '';
        setDirectorTarget(defaultRole);
        const eligible = getEligibleUsersForRole(defaultRole);
        setDirectorUser(eligible.length === 1 ? eligible[0].id : '');
      }
    }
  };

  const empStatus = getLiveRouteStatus(employeeTarget, employeeStrategy, employeeUser);
  const mgrStatus = getLiveRouteStatus(managerTarget, managerStrategy, managerUser);
  const dirStatus = getLiveRouteStatus(directorTarget, directorStrategy, directorUser);

  const empEligibleUsers = getEligibleUsersForRole(employeeTarget);
  const mgrEligibleUsers = getEligibleUsersForRole(managerTarget);
  const dirEligibleUsers = getEligibleUsersForRole(directorTarget);

  return (
    <div className={`bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4 transition-opacity ${!isGovernanceEnabled ? 'opacity-60 pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-indigo-600" />
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-extrabold text-slate-900">Template Governance Routing &amp; Assignment Strategy</h3>
              <AdminInfoTooltip
                title="Template Governance Routing"
                description="Template Governance Routing controls where newly submitted templates go for review. You can choose the reviewing role and how a reviewer is assigned. Changes affect new submissions only; existing approval requests keep their original routing."
                whoItAffects="Template authors across Employee, Manager, and Director levels."
                impact="Determines whether templates require review and who evaluates them before firm publication."
                dependencies="Only active roles with approval permission can be assigned as target approval roles."
              />
            </div>
            <p className="text-[11px] text-slate-500 font-medium">Configure target approval roles and reviewer assignment strategies for Template submissions.</p>
          </div>
        </div>
        {!isGovernanceEnabled && <span className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-[10px] font-bold">Policy Disabled</span>}
      </div>

      {error && <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /><span>{error}</span></div>}
      {successMsg && <div className="p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /><span>{successMsg}</span></div>}

      <div className="space-y-4 text-xs">
        {/* Employee Level Route */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-slate-900">Employee Level Submissions</span>
                <AdminInfoTooltip
                  title="Employee Governance Level"
                  description="Defines the review route used by templates submitted by roles operating at Employee governance level."
                  whoItAffects="Users assigned to Employee governance level roles."
                  impact="Submissions from these users are routed according to the selected strategy."
                />
              </div>
              <div className="text-[11px] text-slate-500">Route new Template requests from Employee-level authors.</div>
            </div>
            <span className={`px-2.5 py-1 rounded-full border text-[10px] font-bold ${empStatus.isRouteValid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
              {empStatus.statusMessage}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <div className="flex items-center gap-1 mb-1">
                <label className="font-bold text-slate-700">Assignment Strategy</label>
                <AdminInfoTooltip
                  title="Assignment Strategy"
                  description="Controls what happens when users at this governance level submit a template."
                  whoItAffects="Template authors and reviewers."
                  impact="Specific User sends to a designated reviewer. Role Queue places in a shared role queue. Direct Publish publishes templates immediately without approval."
                  warning="Direct Publish will make new templates available immediately across the organization without review."
                />
              </div>
              <select
                value={employeeStrategy}
                onChange={(e) => handleEmployeeStrategyChange(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600"
              >
                <option value="SPECIFIC_USER">Specific User (Direct Assignment)</option>
                <option value="ROLE_QUEUE">Role Queue (Take for Review)</option>
                <option value="DIRECT_PUBLISH">Direct Publish (Immediate Publication)</option>
              </select>
            </div>

            {employeeStrategy !== 'DIRECT_PUBLISH' && (
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <label className="font-bold text-slate-700">Target Approval Role</label>
                  <AdminInfoTooltip
                    title="Target Approval Role"
                    description="The organizational role responsible for receiving new template approval requests from this governance level. Changing the Target Approval Role clears the selected reviewer if that user does not belong to the newly selected role."
                    whoItAffects="Reviewers in the selected target role."
                    dependencies="Only active roles with template_approvals.approve permission can be selected."
                  />
                </div>
                <select
                  value={employeeTarget}
                  onChange={(e) => handleEmployeeTargetChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600"
                >
                  {eligibleRoles.map((r: any) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.roleType} Role) — {r.activeUserCount} Active User{r.activeUserCount === 1 ? '' : 's'}
                      {r.hasReviewPermissions
                        ? ` (${r.eligibleUserCount} Eligible Reviewer${r.eligibleUserCount === 1 ? '' : 's'})`
                        : ' (⚠ Lacks Approval Permission)'}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {employeeStrategy === 'SPECIFIC_USER' && (
            <div className="pt-1">
              <div className="flex items-center gap-1 mb-1">
                <label className="font-bold text-slate-700">Assigned Specific Reviewer</label>
                <AdminInfoTooltip
                  title="Specific User Assignment"
                  description="Only active users in the selected Target Approval Role who currently have the required template review permissions (template_approvals.view & approve) can be assigned."
                  whoItAffects="The designated individual reviewer."
                  warning="If the selected user becomes inactive or loses review permissions, new template submissions will be blocked."
                />
              </div>
              <select
                value={employeeUser}
                onChange={(e) => setEmployeeUser(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600"
              >
                <option value="">Select reviewer from Target Role...</option>
                {empEligibleUsers.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.profileCode}) — {u.department}
                  </option>
                ))}
              </select>
            </div>
          )}

          {employeeStrategy === 'DIRECT_PUBLISH' && (
            <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl text-[11px] text-indigo-900 font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Templates submitted by Employee-level authors will be published immediately without requiring reviewer approval.</span>
            </div>
          )}
        </div>

        {/* Manager Level Route */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-slate-900">Manager Level Submissions</span>
                <AdminInfoTooltip
                  title="Manager Governance Level"
                  description="Defines the review route used by templates submitted by roles operating at Manager governance level."
                  whoItAffects="Users assigned to Manager governance level roles."
                  impact="Submissions from Manager-level authors are routed according to the selected strategy."
                />
              </div>
              <div className="text-[11px] text-slate-500">Route new Template requests from Manager-level authors.</div>
            </div>
            <span className={`px-2.5 py-1 rounded-full border text-[10px] font-bold ${mgrStatus.isRouteValid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
              {mgrStatus.statusMessage}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <div className="flex items-center gap-1 mb-1">
                <label className="font-bold text-slate-700">Assignment Strategy</label>
                <AdminInfoTooltip
                  title="Assignment Strategy"
                  description="Controls what happens when users at Manager governance level submit a template."
                  whoItAffects="Template authors and reviewers."
                />
              </div>
              <select
                value={managerStrategy}
                onChange={(e) => handleManagerStrategyChange(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600"
              >
                <option value="SPECIFIC_USER">Specific User (Direct Assignment)</option>
                <option value="ROLE_QUEUE">Role Queue (Take for Review)</option>
                <option value="DIRECT_PUBLISH">Direct Publish (Immediate Publication)</option>
              </select>
            </div>

            {managerStrategy !== 'DIRECT_PUBLISH' && (
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <label className="font-bold text-slate-700">Target Approval Role</label>
                  <AdminInfoTooltip
                    title="Target Approval Role"
                    description="The organizational role responsible for receiving new template approval requests from Manager governance level."
                    whoItAffects="Reviewers in the selected target role."
                  />
                </div>
                <select
                  value={managerTarget}
                  onChange={(e) => handleManagerTargetChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600"
                >
                  {eligibleRoles.map((r: any) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.roleType} Role) — {r.activeUserCount} Active User{r.activeUserCount === 1 ? '' : 's'}
                      {r.hasReviewPermissions
                        ? ` (${r.eligibleUserCount} Eligible Reviewer${r.eligibleUserCount === 1 ? '' : 's'})`
                        : ' (⚠ Lacks Approval Permission)'}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {managerStrategy === 'SPECIFIC_USER' && (
            <div className="pt-1">
              <div className="flex items-center gap-1 mb-1">
                <label className="font-bold text-slate-700">Assigned Specific Reviewer</label>
                <AdminInfoTooltip
                  title="Specific User Assignment"
                  description="Only active users in the selected Target Approval Role who currently have the required template review permissions can be assigned."
                />
              </div>
              <select
                value={managerUser}
                onChange={(e) => setManagerUser(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600"
              >
                <option value="">Select reviewer from Target Role...</option>
                {mgrEligibleUsers.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.profileCode}) — {u.department}
                  </option>
                ))}
              </select>
            </div>
          )}

          {managerStrategy === 'DIRECT_PUBLISH' && (
            <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl text-[11px] text-indigo-900 font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Templates submitted by Manager-level authors will be published immediately without requiring reviewer approval.</span>
            </div>
          )}
        </div>

        {/* Director Level Route */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-slate-900">Director Level Behavior</span>
                <AdminInfoTooltip
                  title="Director Governance Level"
                  description="Defines the review route used by templates submitted by roles operating at Director governance level."
                  whoItAffects="Users assigned to Director governance level roles."
                  impact="Direct Publish publishes templates immediately upon submission. Specific User / Role Queue routes submissions to a selected reviewer."
                />
              </div>
              <div className="text-[11px] text-slate-500">Configure publication behavior for Director-level authors.</div>
            </div>
            <span className={`px-2.5 py-1 rounded-full border text-[10px] font-bold ${dirStatus.isRouteValid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
              {dirStatus.statusMessage}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <div className="flex items-center gap-1 mb-1">
                <label className="font-bold text-slate-700">Assignment Strategy</label>
                <AdminInfoTooltip
                  title="Assignment Strategy"
                  description="Controls what happens when users at Director governance level submit a template."
                  whoItAffects="Template authors and reviewers."
                />
              </div>
              <select
                value={directorStrategy}
                onChange={(e) => handleDirectorStrategyChange(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600"
              >
                <option value="DIRECT_PUBLISH">Direct Publish (Immediate Publication)</option>
                <option value="SPECIFIC_USER">Specific User (Direct Assignment)</option>
                <option value="ROLE_QUEUE">Role Queue (Take for Review)</option>
              </select>
            </div>

            {directorStrategy !== 'DIRECT_PUBLISH' && (
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <label className="font-bold text-slate-700">Target Approval Role</label>
                  <AdminInfoTooltip
                    title="Target Approval Role"
                    description="The organizational role responsible for receiving new template approval requests from Director governance level."
                    whoItAffects="Reviewers in the selected target role."
                  />
                </div>
                <select
                  value={directorTarget}
                  onChange={(e) => handleDirectorTargetChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600"
                >
                  {eligibleRoles.map((r: any) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.roleType} Role) — {r.activeUserCount} Active User{r.activeUserCount === 1 ? '' : 's'}
                      {r.hasReviewPermissions
                        ? ` (${r.eligibleUserCount} Eligible Reviewer${r.eligibleUserCount === 1 ? '' : 's'})`
                        : ' (⚠ Lacks Approval Permission)'}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {directorStrategy === 'SPECIFIC_USER' && (
            <div className="pt-1">
              <div className="flex items-center gap-1 mb-1">
                <label className="font-bold text-slate-700">Assigned Specific Reviewer</label>
                <AdminInfoTooltip
                  title="Specific User Assignment"
                  description="Only active users in the selected Target Approval Role who currently have the required template review permissions can be assigned."
                />
              </div>
              <select
                value={directorUser}
                onChange={(e) => setDirectorUser(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600"
              >
                <option value="">Select reviewer from Target Role...</option>
                {dirEligibleUsers.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.profileCode}) — {u.department}
                  </option>
                ))}
              </select>
            </div>
          )}

          {directorStrategy === 'DIRECT_PUBLISH' && (
            <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl text-[11px] text-indigo-900 font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Templates submitted by Director-level authors will be published immediately without requiring reviewer approval.</span>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            disabled={saving || !isGovernanceEnabled}
            onClick={() => void handleSaveRouting()}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Saving Routing...' : 'Save Governance Routing'}
          </button>
        </div>
      </div>
    </div>
  );
};
