import { randomUUID } from 'node:crypto';
import { db } from '../db/database.js';

export const authAuditRepository = {
  record(event: string, outcome: 'SUCCESS' | 'FAILURE', details: { userId?: string | null; email?: string | null } = {}) {
    db.prepare(`INSERT INTO auth_audit_log (id, user_id, email_normalized, event, outcome, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), details.userId || null, details.email || null, event, outcome, new Date().toISOString());
  },
};
