import type Database from 'better-sqlite3';

export type Migration = { version: number; name: string; disableForeignKeys?: boolean; up: (db: Database.Database) => void };
export type AppliedMigration = { version: number; name: string };

function ensureMigrationLedger(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}

export function runMigrations(db: Database.Database, migrations: Migration[]): AppliedMigration[] {
  ensureMigrationLedger(db);
  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  const seen = new Set<number>();
  for (const migration of ordered) {
    if (!Number.isInteger(migration.version) || migration.version <= 0 || seen.has(migration.version)) {
      throw new Error(`Invalid or duplicate database migration version: ${migration.version}`);
    }
    seen.add(migration.version);
  }

  const existing = new Set(
    (db.prepare(`SELECT version FROM schema_migrations`).all() as Array<{ version: number }>).map((row) => row.version)
  );
  const applied: AppliedMigration[] = [];
  for (const migration of ordered) {
    if (existing.has(migration.version)) continue;
    if (migration.disableForeignKeys) db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        migration.up(db);
        const violations = db.pragma('foreign_key_check') as unknown[];
        if (violations.length > 0) throw new Error(`Migration ${migration.version} produced foreign key violations.`);
        db.prepare(`INSERT INTO schema_migrations (version, name) VALUES (?, ?)`).run(migration.version, migration.name);
      })();
    } finally {
      if (migration.disableForeignKeys) db.pragma('foreign_keys = ON');
    }
    applied.push({ version: migration.version, name: migration.name });
  }
  db.pragma('foreign_keys = ON');
  return applied;
}
