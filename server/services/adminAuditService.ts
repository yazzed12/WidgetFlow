import { db } from '../db/database.js';

export type AdminAuditInput = {
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  target: string;
  previousValue?: string;
  newValue?: string;
};

export const adminAuditService = {
  record(entry: AdminAuditInput) {
    const id = `adm-aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    db.prepare(`INSERT INTO admin_audit_log
      (id, actor_id, actor_name, actor_role, action, target, previous_value, new_value, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, entry.actorId, entry.actorName, entry.actorRole, entry.action, entry.target,
        entry.previousValue || '', entry.newValue || '', new Date().toISOString());
  },
};
