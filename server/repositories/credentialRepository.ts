import { db } from '../db/database.js';

export const credentialRepository = {
  findByUserId(userId: string) {
    return db.prepare(`SELECT user_id AS userId, password_hash AS passwordHash, is_enabled AS isEnabled,
      password_set_at AS passwordSetAt FROM user_credentials WHERE user_id = ?`).get(userId) as
      { userId: string; passwordHash: string; isEnabled: number; passwordSetAt: string } | undefined;
  },
  findByNormalizedEmail(email: string) {
    return db.prepare(`SELECT u.id AS userId, u.email, c.password_hash AS passwordHash, c.is_enabled AS isEnabled
      FROM users u JOIN user_credentials c ON c.user_id = u.id WHERE LOWER(TRIM(u.email)) = ?`).get(email) as
      { userId: string; email: string; passwordHash: string; isEnabled: number } | undefined;
  },
  upsert(userId: string, passwordHash: string) {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO user_credentials (user_id, password_hash, is_enabled, password_set_at, created_at, updated_at)
      VALUES (?, ?, 1, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET password_hash = excluded.password_hash, is_enabled = 1,
        password_set_at = excluded.password_set_at, updated_at = excluded.updated_at`)
      .run(userId, passwordHash, now, now, now);
  },
};
