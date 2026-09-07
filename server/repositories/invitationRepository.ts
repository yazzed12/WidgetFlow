import { db } from '../db/database.js';

export type InvitationRecord = {
  id: string; userId: string; intendedEmail: string; tokenHash: string; expiresAt: string; consumedAt: string | null;
};

export const invitationRepository = {
  create(record: InvitationRecord & { createdByAdmin: string; createdAt: string }) {
    db.prepare(`UPDATE user_invitations SET consumed_at = ? WHERE user_id = ? AND consumed_at IS NULL`)
      .run(record.createdAt, record.userId);
    db.prepare(`INSERT INTO user_invitations
      (id, user_id, intended_email, token_hash, created_by_admin, created_at, expires_at, consumed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`)
      .run(record.id, record.userId, record.intendedEmail, record.tokenHash, record.createdByAdmin, record.createdAt, record.expiresAt);
  },
  findByTokenHash(tokenHash: string) {
    return db.prepare(`SELECT id, user_id AS userId, intended_email AS intendedEmail, token_hash AS tokenHash,
      expires_at AS expiresAt, consumed_at AS consumedAt FROM user_invitations WHERE token_hash = ?`).get(tokenHash) as InvitationRecord | undefined;
  },
  consumeIfUnused(id: string, consumedAt: string) {
    return db.prepare(`UPDATE user_invitations SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL`).run(consumedAt, id).changes;
  },
};
