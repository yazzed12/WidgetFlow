import { configurationService } from '../features/configuration/services/configurationService';
import type { GovernanceLevel } from '../shared/permissionCatalog';
import type { User } from '../types';

export type TemplateSubmissionAction = {
  buttonLabel: 'Publish' | 'Submit for Approval';
  isDirectPublish: boolean;
  helpText: string;
};

export function resolveUserGovernanceLevel(user: User | null | undefined): GovernanceLevel {
  return user?.governanceLevel || 'None';
}

export async function fetchTemplateSubmissionAction(
  currentUser: User | GovernanceLevel | string | undefined
): Promise<TemplateSubmissionAction> {
  void currentUser;

  try {
    const systemConfig = await configurationService.effectiveConfig();

    const isGlobalGovernanceEnabled = systemConfig.settings.template_governance !== false;

    if (!isGlobalGovernanceEnabled) {
      return {
        buttonLabel: 'Publish',
        isDirectPublish: true,
        helpText: 'This template will be published immediately because template governance is disabled by system policy.',
      };
    }

    const route = systemConfig.governance;

    if (route && (route.isDirectPublish || route.strategy === 'DIRECT_PUBLISH')) {
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
    return {
      buttonLabel: 'Submit for Approval',
      isDirectPublish: false,
      helpText: 'Submission routing could not be verified. The server will enforce the configured governance policy.',
    };
  }
}
