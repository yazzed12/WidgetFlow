import { db } from '../db/database.js';

type GovernanceLevelKey = 'employee' | 'manager' | 'director';

function setting(key: string): string | null {
  return (db.prepare(`SELECT setting_value FROM system_general_settings WHERE setting_key = ?`).get(key) as { setting_value?: string } | undefined)?.setting_value || null;
}

export const governancePolicyService = {
  isTemplateGovernanceEnabled(): boolean {
    const value = setting('template_governance');
    return value !== 'false' && value !== '0';
  },

  targetRoleIds(): Partial<Record<GovernanceLevelKey, string>> {
    const result: Partial<Record<GovernanceLevelKey, string>> = {};
    for (const level of ['employee', 'manager', 'director'] as GovernanceLevelKey[]) {
      if (setting(`governance.strategy.${level}`) === 'DIRECT_PUBLISH') continue;
      const targetRoleId = setting(`governance.routing.${level}`);
      if (targetRoleId) result[level] = targetRoleId;
    }
    return result;
  },
};
