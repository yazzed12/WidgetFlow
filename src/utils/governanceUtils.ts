import { apiService } from '../services/apiService';
import type { GovernanceLevel } from '../shared/permissionCatalog';
import type { User } from '../types';

export type TemplateSubmissionAction = {
  buttonLabel: 'Publish' | 'Submit for Approval';
  isDirectPublish: boolean;
  helpText: string;
};

export function resolveUserGovernanceLevel(user: User | null | undefined): GovernanceLevel {
  if (!user) return 'Employee';
  if (user.governanceLevel && user.governanceLevel !== 'None') {
    return user.governanceLevel;
  }
  const roleName = user.role || (user as any).legacyRole || '';
  if (roleName === 'Director' || user.roleKey === 'director') return 'Director';
  if (roleName === 'Manager' || user.roleKey === 'manager') return 'Manager';
  if (roleName === 'Employee' || user.roleKey === 'employee') return 'Employee';
  if (roleName === 'Admin') return 'Director';
  return 'Employee';
}

export async function fetchTemplateSubmissionAction(
  currentUser: User | GovernanceLevel | string | undefined
): Promise<TemplateSubmissionAction> {
  const govLevel = typeof currentUser === 'object' && currentUser !== null
    ? resolveUserGovernanceLevel(currentUser)
    : (currentUser as string | undefined);

  try {
    const [config, systemConfig] = await Promise.all([
      apiService.getGovernanceRouting(),
      apiService.getSystemConfig().catch(() => null),
    ]);

    const isGlobalGovernanceEnabled =
      systemConfig?.settings?.['template_governance'] !== false &&
      systemConfig?.settings?.['workflow.template_governance'] !== false;

    if (!isGlobalGovernanceEnabled) {
      return {
        buttonLabel: 'Publish',
        isDirectPublish: true,
        helpText: 'This template will be published immediately because template governance is disabled by system policy.',
      };
    }

    const levelKey = String(govLevel || 'Employee').toLowerCase();
    const route = config?.routes?.[levelKey];

    if (!route || route.isDirectPublish || route.id === 'DIRECT_PUBLISH' || route.strategy === 'DIRECT_PUBLISH') {
      return {
        buttonLabel: 'Publish',
        isDirectPublish: true,
        helpText: 'This template will be published immediately because your organization does not require approval for this submission level.',
      };
    }

    return {
      buttonLabel: 'Submit for Approval',
      isDirectPublish: false,
      helpText: "This template will be sent through your organization's configured approval route.",
    };
  } catch {
    const levelKey = String(govLevel || 'Employee').toLowerCase();
    if (levelKey === 'director') {
      return {
        buttonLabel: 'Publish',
        isDirectPublish: true,
        helpText: 'This template will be published immediately.',
      };
    }
    return {
      buttonLabel: 'Submit for Approval',
      isDirectPublish: false,
      helpText: "This template will be sent through your organization's configured approval route.",
    };
  }
}
