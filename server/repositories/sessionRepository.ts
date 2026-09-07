import { db } from '../db/database.js';

export type SessionRecord = { id: string; userId: string; tokenHash: string; expiresAt: string; revokedAt: string | null };

export const sessionRepository = {
  create(record: { id: string; userId: string; tokenHash: string; createdAt: string; expiresAt: string }) {
    db.prepare(`INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at, last_used_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(record.id, record.userId, record.tokenHash, record.createdAt, record.expiresAt, record.createdAt);
  },
  findByTokenHash(tokenHash: string): SessionRecord | undefined {
    return db.prepare(`SELECT id, user_id AS userId, token_hash AS tokenHash, expires_at AS expiresAt, revoked_at AS revokedAt
      FROM auth_sessions WHERE token_hash = ?`).get(tokenHash) as SessionRecord | undefined;
  },
  touch(id: string) { db.prepare(`UPDATE auth_sessions SET last_used_at = ? WHERE id = ?`).run(new Date().toISOString(), id); },
  revoke(id: string) { return db.prepare(`UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?`).run(new Date().toISOString(), id).changes; },
  revokeForUser(userId: string) { return db.prepare(`UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`).run(new Date().toISOString(), userId).changes; },
};
