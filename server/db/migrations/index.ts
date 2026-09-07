import type Database from 'better-sqlite3';
import type { Migration } from './migrationRunner.js';

function tableExists(db: Database.Database, table: string): boolean {
  return Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table));
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  return tableExists(db, table) &&
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((row) => row.name === column);
}

function addColumn(db: Database.Database, table: string, column: string, definition: string) {
  if (tableExists(db, table) && !columnExists(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

const compatibilityAndRuntimeTables: Migration = {
  version: 1,
  name: 'compatibility_and_runtime_tables',
  up(db) {
    addColumn(db, 'reports', 'rejection_reason', 'TEXT');
    addColumn(db, 'reports', 'rejected_at', 'TEXT');
    addColumn(db, 'reports', 'template_version', `TEXT DEFAULT 'v1.0'`);
    addColumn(db, 'reports', 'template_version_id', 'TEXT REFERENCES report_template_versions(id)');
    addColumn(db, 'report_templates', 'rules_json', 'TEXT');
    addColumn(db, 'report_templates', 'theme_json', 'TEXT');
    addColumn(db, 'users', 'manager_user_id', 'TEXT REFERENCES users(id) ON DELETE SET NULL');
    addColumn(db, 'users', 'status', `TEXT DEFAULT 'Active'`);
    addColumn(db, 'users', 'role_id', 'TEXT REFERENCES roles(id) ON DELETE RESTRICT');
    addColumn(db, 'report_template_categories', 'status', `TEXT DEFAULT 'Active'`);
    addColumn(db, 'template_packs', 'structure_json', 'TEXT');
    addColumn(db, 'report_templates', 'target_role_id', 'TEXT REFERENCES roles(id)');
    addColumn(db, 'report_templates', 'assignment_strategy_snapshot', 'TEXT');
    addColumn(db, 'report_templates', 'claimed_at', 'TEXT');
    addColumn(db, 'report_template_fields', 'field_key', 'TEXT');
    addColumn(db, 'report_template_fields', 'description', 'TEXT');
    addColumn(db, 'report_template_fields', 'default_value', 'TEXT');
    addColumn(db, 'report_template_fields', 'layout_width', `TEXT DEFAULT 'full'`);
    addColumn(db, 'report_template_fields', 'validation_rules_json', 'TEXT');
    db.exec(`CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id)`);

    db.exec(`
      CREATE TABLE IF NOT EXISTS system_feature_settings (
        feature_key TEXT PRIMARY KEY, feature_name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'studio',
        description TEXT, enabled INTEGER NOT NULL DEFAULT 1, updated_by TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS system_element_settings (
        element_key TEXT PRIMARY KEY, element_name TEXT NOT NULL, category TEXT NOT NULL,
        description TEXT, enabled INTEGER NOT NULL DEFAULT 1, updated_by TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS system_general_settings (
        setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL, setting_type TEXT NOT NULL DEFAULT 'string',
        updated_by TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS admin_audit_log (
        id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, actor_role TEXT NOT NULL,
        action TEXT NOT NULL, target TEXT NOT NULL, previous_value TEXT, new_value TEXT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS template_packs (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
        category_id TEXT REFERENCES report_template_categories(id) ON DELETE SET NULL,
        status TEXT NOT NULL CHECK(status IN ('Draft', 'Published', 'Disabled')),
        created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, structure_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS template_pack_items (
        id TEXT PRIMARY KEY, pack_id TEXT NOT NULL REFERENCES template_packs(id) ON DELETE CASCADE,
        source_type TEXT NOT NULL CHECK(source_type IN ('field', 'element', 'content')), source_key TEXT,
        label TEXT NOT NULL, configuration_json TEXT NOT NULL, display_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS content_library_items (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, category TEXT NOT NULL,
        content_type TEXT NOT NULL CHECK(content_type IN ('Heading', 'Text Block', 'Disclaimer', 'Instruction', 'Label', 'Section Intro')),
        content_value TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
        created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS template_assets (
        id TEXT PRIMARY KEY, filename TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL,
        storage_path TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS workflow_definitions (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
        template_id TEXT REFERENCES report_templates(id) ON DELETE CASCADE, version TEXT NOT NULL DEFAULT 'v1.0',
        status TEXT NOT NULL CHECK(status IN ('Draft', 'Active', 'Archived')), definition_json TEXT NOT NULL,
        created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS workflow_versions (
        id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
        version TEXT NOT NULL, snapshot_json TEXT NOT NULL, created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS workflow_instances (
        id TEXT PRIMARY KEY, report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
        workflow_version_id TEXT NOT NULL REFERENCES workflow_versions(id) ON DELETE RESTRICT,
        current_step_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('In Progress', 'Returned', 'Rejected', 'Completed')),
        started_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS workflow_tasks (
        id TEXT PRIMARY KEY, workflow_instance_id TEXT NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
        step_id TEXT NOT NULL, step_name TEXT NOT NULL, assigned_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        assigned_role TEXT, status TEXT NOT NULL CHECK(status IN ('Pending', 'Completed', 'Returned', 'Rejected', 'Cancelled')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS workflow_history (
        id TEXT PRIMARY KEY, workflow_instance_id TEXT NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
        step_id TEXT NOT NULL, step_name TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id),
        actor_name TEXT NOT NULL, actor_role TEXT NOT NULL, action TEXT NOT NULL, comment TEXT,
        signature_verification_id TEXT, timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS user_signature_profiles (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        method TEXT NOT NULL CHECK(method IN ('uploaded', 'drawn', 'typed')), asset_reference TEXT,
        drawing_reference TEXT, typed_name TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')), is_active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS report_signature_audit (
        id TEXT PRIMARY KEY, report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
        component_id TEXT, component_key TEXT, signed_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        signed_by_name TEXT NOT NULL, signed_by_role TEXT NOT NULL,
        signature_role TEXT NOT NULL CHECK(signature_role IN ('sender', 'receiver')),
        signature_method TEXT NOT NULL CHECK(signature_method IN ('uploaded', 'drawn', 'typed')),
        typed_name TEXT, signature_data_url TEXT, verification_id TEXT NOT NULL UNIQUE,
        confirmation_statement TEXT, signed_content_hash TEXT, is_active INTEGER NOT NULL DEFAULT 1,
        signed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    db.prepare(`UPDATE report_templates SET assignment_strategy_snapshot = 'SPECIFIC_USER'
      WHERE requested_approval_from_user_id IS NOT NULL AND assignment_strategy_snapshot IS NULL`).run();
  },
};

const normalizeDirectPublishSemantics: Migration = {
  version: 2,
  name: 'normalize_direct_publish_semantics',
  up(db) {
    db.prepare(`UPDATE report_templates
      SET target_role_id = NULL, requested_approval_from_user_id = NULL, requested_approval_from_name = NULL
      WHERE assignment_strategy_snapshot = 'DIRECT_PUBLISH'
         OR target_role_id = 'DIRECT_PUBLISH'
         OR requested_approval_from_user_id = 'DIRECT_PUBLISH'`).run();

    for (const level of ['employee', 'manager', 'director']) {
      const strategy = db.prepare(`SELECT setting_value FROM system_general_settings WHERE setting_key = ?`)
        .get(`governance.strategy.${level}`) as { setting_value?: string } | undefined;
      const target = db.prepare(`SELECT setting_value FROM system_general_settings WHERE setting_key = ?`)
        .get(`governance.routing.${level}`) as { setting_value?: string } | undefined;
      if (strategy?.setting_value === 'DIRECT_PUBLISH' || target?.setting_value === 'DIRECT_PUBLISH') {
        db.prepare(`INSERT INTO system_general_settings (setting_key, setting_value, setting_type, updated_at)
          VALUES (?, 'DIRECT_PUBLISH', 'string', datetime('now'))
          ON CONFLICT(setting_key) DO UPDATE SET setting_value = 'DIRECT_PUBLISH', setting_type = 'string', updated_at = datetime('now')`)
          .run(`governance.strategy.${level}`);
        db.prepare(`DELETE FROM system_general_settings WHERE setting_key IN (?, ?)`)
          .run(`governance.routing.${level}`, `governance.user.${level}`);
      }
    }
  },
};

const enforceTemplateTargetRoleForeignKey: Migration = {
  version: 3,
  name: 'enforce_template_target_role_foreign_key',
  disableForeignKeys: true,
  up(db) {
    const hasTargetRoleForeignKey = (db.prepare(`PRAGMA foreign_key_list(report_templates)`).all() as Array<{ from: string; table: string }>)
      .some((foreignKey) => foreignKey.from === 'target_role_id' && foreignKey.table === 'roles');
    if (hasTargetRoleForeignKey) return;

    db.exec(`
      CREATE TABLE report_templates_migration_v3 (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
        category_id TEXT NOT NULL REFERENCES report_template_categories(id) ON DELETE CASCADE,
        version TEXT NOT NULL DEFAULT 'v1.0',
        status TEXT NOT NULL CHECK(status IN ('Draft', 'Pending Approval', 'Approved', 'Rejected', 'Archived', 'Superseded')),
        created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_by_name TEXT NOT NULL, created_by_role TEXT NOT NULL,
        requested_approval_from_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        requested_approval_from_name TEXT, target_role_id TEXT REFERENCES roles(id),
        assignment_strategy_snapshot TEXT CHECK(assignment_strategy_snapshot IN ('SPECIFIC_USER', 'ROLE_QUEUE', 'DIRECT_PUBLISH')),
        claimed_at TEXT, submitted_at TEXT, rejection_reason TEXT, rules_json TEXT, calculations_json TEXT, theme_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO report_templates_migration_v3
        (id, name, description, category_id, version, status, created_by, created_by_name, created_by_role,
         requested_approval_from_user_id, requested_approval_from_name, target_role_id, assignment_strategy_snapshot,
         claimed_at, submitted_at, rejection_reason, rules_json, calculations_json, theme_json, created_at, updated_at)
      SELECT id, name, description, category_id, version, status, created_by, created_by_name, created_by_role,
         requested_approval_from_user_id, requested_approval_from_name, target_role_id, assignment_strategy_snapshot,
         claimed_at, submitted_at, rejection_reason, rules_json, calculations_json, theme_json, created_at, updated_at
      FROM report_templates;
      DROP TABLE report_templates;
      ALTER TABLE report_templates_migration_v3 RENAME TO report_templates;
      CREATE INDEX IF NOT EXISTS idx_templates_status ON report_templates(status);
      CREATE INDEX IF NOT EXISTS idx_templates_category ON report_templates(category_id);
      CREATE INDEX IF NOT EXISTS idx_templates_approver ON report_templates(requested_approval_from_user_id);
    `);
  },
};

const createAuthenticationTables: Migration = {
  version: 4,
  name: 'create_authentication_tables',
  up(db) {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_normalized_unique ON users(LOWER(TRIM(email)));
      CREATE TABLE IF NOT EXISTS user_credentials (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        password_hash TEXT NOT NULL,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        password_set_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);
      CREATE TABLE IF NOT EXISTS user_invitations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        intended_email TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_by_admin TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_user_invitations_user ON user_invitations(user_id);
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_reset_tokens(user_id);
      CREATE TABLE IF NOT EXISTS auth_audit_log (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        email_normalized TEXT,
        event TEXT NOT NULL,
        outcome TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_auth_audit_user ON auth_audit_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_auth_audit_created ON auth_audit_log(created_at);
    `);
  },
};

export const migrations: Migration[] = [
  compatibilityAndRuntimeTables,
  normalizeDirectPublishSemantics,
  enforceTemplateTargetRoleForeignKey,
  createAuthenticationTables,
];
