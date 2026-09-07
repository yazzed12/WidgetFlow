import { db } from '../db/database.js';

export type ResetRecord = { id: string; userId: string; tokenHash: string; expiresAt: string; consumedAt: string | null };

export const passwordResetRepository = {
  create(record: ResetRecord & { createdAt: string }) {
    db.prepare(`UPDATE password_reset_tokens SET consumed_at = ? WHERE user_id = ? AND consumed_at IS NULL`)
      .run(record.createdAt, record.userId);
    db.prepare(`INSERT INTO password_reset_tokens (id, user_id, token_hash, created_at, expires_at, consumed_at)
      VALUES (?, ?, ?, ?, ?, NULL)`).run(record.id, record.userId, record.tokenHash, record.createdAt, record.expiresAt);
  },
  findByTokenHash(tokenHash: string) {
    return db.prepare(`SELECT id, user_id AS userId, token_hash AS tokenHash, expires_at AS expiresAt,
      consumed_at AS consumedAt FROM password_reset_tokens WHERE token_hash = ?`).get(tokenHash) as ResetRecord | undefined;
  },
  consumeIfUnused(id: string, consumedAt: string) {
    return db.prepare(`UPDATE password_reset_tokens SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL`).run(consumedAt, id).changes;
  },
};
