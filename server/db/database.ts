import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.resolve(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.resolve(dataDir, 'widgetflow.db');
const schemaPath = path.resolve(__dirname, './schema.sql');

export const db = new Database(dbPath);

// Enable SQLite Foreign Key Constraints and WAL mode
db.pragma('foreign_keys = ON;');
db.pragma('journal_mode = WAL;');

export function initDatabase() {
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schemaSql);

  // Auto-migration for reports table rejection_reason / rejected_at / template_version columns
  try {
    db.exec(`ALTER TABLE reports ADD COLUMN rejection_reason TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE reports ADD COLUMN rejected_at TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE reports ADD COLUMN template_version TEXT DEFAULT 'v1.0';`);
  } catch {}
  try {
    db.exec(`ALTER TABLE reports ADD COLUMN template_version_id TEXT REFERENCES report_template_versions(id);`);
  } catch {}
  try {
    db.exec(`ALTER TABLE report_templates ADD COLUMN rules_json TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE report_templates ADD COLUMN theme_json TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN manager_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'Active';`);
  } catch {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN role_id TEXT REFERENCES roles(id) ON DELETE RESTRICT;`);
  } catch {}
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);`);
  try {
    db.exec(`ALTER TABLE report_template_categories ADD COLUMN status TEXT DEFAULT 'Active';`);
  } catch {}

  // Auto-migration for users table CHECK constraint if needed
  try {
    const tableSql = (db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`).get() as any)?.sql || '';
    if (tableSql && !tableSql.includes('Admin')) {
      db.pragma('foreign_keys = OFF;');
      db.exec(`
        CREATE TABLE IF NOT EXISTS users_dg_tmp (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          role TEXT NOT NULL CHECK(role IN ('Employee', 'Manager', 'Director', 'Admin')),
          role_id TEXT REFERENCES roles(id),
          avatar_initials TEXT NOT NULL,
          avatar_bg TEXT NOT NULL,
          department TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'Active',
          manager_user_id TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      db.exec(`INSERT INTO users_dg_tmp (id, name, email, role, avatar_initials, avatar_bg, department, status, manager_user_id, created_at) SELECT id, name, email, role, NULL, avatar_initials, avatar_bg, department, status, manager_user_id, created_at FROM users;`);
      db.exec(`DROP TABLE users;`);
      db.exec(`ALTER TABLE users_dg_tmp RENAME TO users;`);
      db.pragma('foreign_keys = ON;');
    }
  } catch (err: any) {
    console.error('Users migration error:', err);
  }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN role_id TEXT REFERENCES roles(id) ON DELETE RESTRICT;`);
  } catch {}
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);`);
  try {
    db.exec(`UPDATE users SET role_id = 'role-' || LOWER(role) WHERE role_id IS NULL OR role_id = '';`);
  } catch {}

  // Create System Configuration & Admin Audit Tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_feature_settings (
      feature_key TEXT PRIMARY KEY,
      feature_name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'studio',
      description TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS system_element_settings (
      element_key TEXT PRIMARY KEY,
      element_name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS system_general_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      setting_type TEXT NOT NULL DEFAULT 'string',
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      previous_value TEXT,
      new_value TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS template_packs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      category_id TEXT REFERENCES report_template_categories(id) ON DELETE SET NULL,
      status TEXT NOT NULL CHECK(status IN ('Draft', 'Published', 'Disabled')),
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      structure_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS template_pack_items (
      id TEXT PRIMARY KEY,
      pack_id TEXT NOT NULL REFERENCES template_packs(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL CHECK(source_type IN ('field', 'element', 'content')),
      source_key TEXT,
      label TEXT NOT NULL,
      configuration_json TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS content_library_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      content_type TEXT NOT NULL CHECK(content_type IN ('Heading', 'Text Block', 'Disclaimer', 'Instruction', 'Label', 'Section Intro')),
      content_value TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Backward-compatible Canvas structure storage for Admin Standard Packs.
  try {
    db.exec(`ALTER TABLE template_packs ADD COLUMN structure_json TEXT;`);
  } catch {}

  // Auto-migration for report_templates status CHECK constraint
  try {
    const tableSql = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='report_templates'`).get() as any;
    if (tableSql?.sql && !tableSql.sql.includes('Archived')) {
      db.exec(`PRAGMA foreign_keys = OFF;`);
      db.exec(`
        CREATE TABLE report_templates_dg_tmp (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          category_id TEXT NOT NULL REFERENCES report_template_categories(id) ON DELETE CASCADE,
          version TEXT NOT NULL DEFAULT 'v1.0',
          status TEXT NOT NULL CHECK(status IN ('Draft', 'Pending Approval', 'Approved', 'Rejected', 'Archived', 'Superseded')),
          created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_by_name TEXT NOT NULL,
          created_by_role TEXT NOT NULL,
          requested_approval_from_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          requested_approval_from_name TEXT,
          submitted_at TEXT,
          rejection_reason TEXT,
          rules_json TEXT,
          calculations_json TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO report_templates_dg_tmp SELECT id, name, description, category_id, version, status, created_by, created_by_name, created_by_role, requested_approval_from_user_id, requested_approval_from_name, submitted_at, rejection_reason, rules_json, calculations_json, created_at, updated_at FROM report_templates;
        DROP TABLE report_templates;
        ALTER TABLE report_templates_dg_tmp RENAME TO report_templates;
        PRAGMA foreign_keys = ON;
      `);
    }
  } catch {}

  // Auto-migration for report_templates governance routing columns
  try {
    db.exec(`ALTER TABLE report_templates ADD COLUMN target_role_id TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE report_templates ADD COLUMN assignment_strategy_snapshot TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE report_templates ADD COLUMN claimed_at TEXT;`);
  } catch {}

  // Safe legacy snapshot backfill: ONLY set SPECIFIC_USER when a valid existing requested_approval_from_user_id proves it was directly assigned
  try {
    db.prepare(`
      UPDATE report_templates
      SET assignment_strategy_snapshot = 'SPECIFIC_USER'
      WHERE requested_approval_from_user_id IS NOT NULL
        AND assignment_strategy_snapshot IS NULL
    `).run();
  } catch {}

  // Auto-migration for report_template_fields table columns
  try {
    db.exec(`ALTER TABLE report_template_fields ADD COLUMN field_key TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE report_template_fields ADD COLUMN description TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE report_template_fields ADD COLUMN default_value TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE report_template_fields ADD COLUMN layout_width TEXT DEFAULT 'full';`);
  } catch {}
  try {
    db.exec(`ALTER TABLE report_template_fields ADD COLUMN validation_rules_json TEXT;`);
  } catch {}

  // Create template_assets table
  db.exec(`
    CREATE TABLE IF NOT EXISTS template_assets (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Create Workflow Engine Tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_definitions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      template_id TEXT REFERENCES report_templates(id) ON DELETE CASCADE,
      version TEXT NOT NULL DEFAULT 'v1.0',
      status TEXT NOT NULL CHECK(status IN ('Draft', 'Active', 'Archived')),
      definition_json TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workflow_versions (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
      version TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workflow_instances (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      workflow_version_id TEXT NOT NULL REFERENCES workflow_versions(id) ON DELETE RESTRICT,
      current_step_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('In Progress', 'Returned', 'Rejected', 'Completed')),
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS workflow_tasks (
      id TEXT PRIMARY KEY,
      workflow_instance_id TEXT NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
      step_id TEXT NOT NULL,
      step_name TEXT NOT NULL,
      assigned_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      assigned_role TEXT,
      status TEXT NOT NULL CHECK(status IN ('Pending', 'Completed', 'Returned', 'Rejected', 'Cancelled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS workflow_history (
      id TEXT PRIMARY KEY,
      workflow_instance_id TEXT NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
      step_id TEXT NOT NULL,
      step_name TEXT NOT NULL,
      actor_id TEXT NOT NULL REFERENCES users(id),
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      comment TEXT,
      signature_verification_id TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_signature_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      method TEXT NOT NULL CHECK(method IN ('uploaded', 'drawn', 'typed')),
      asset_reference TEXT,
      drawing_reference TEXT,
      typed_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS report_signature_audit (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      component_id TEXT,
      component_key TEXT,
      signed_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      signed_by_name TEXT NOT NULL,
      signed_by_role TEXT NOT NULL,
      signature_role TEXT NOT NULL CHECK(signature_role IN ('sender', 'receiver')),
      signature_method TEXT NOT NULL CHECK(signature_method IN ('uploaded', 'drawn', 'typed')),
      typed_name TEXT,
      signature_data_url TEXT,
      verification_id TEXT NOT NULL UNIQUE,
      confirmation_statement TEXT,
      signed_content_hash TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      signed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migrate CHECK constraint on report_template_fields table if needed
  const fieldsTableInfo = (db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='report_template_fields'`).get() as any)?.sql || '';
  if (fieldsTableInfo && fieldsTableInfo.includes('CHECK(field_type IN')) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS report_template_fields_migrated (
          id TEXT PRIMARY KEY,
          template_id TEXT NOT NULL REFERENCES report_templates(id) ON DELETE CASCADE,
          section_id TEXT REFERENCES report_template_sections(id) ON DELETE SET NULL,
          section_name TEXT NOT NULL,
          field_key TEXT,
          label TEXT NOT NULL,
          field_type TEXT NOT NULL,
          required INTEGER NOT NULL DEFAULT 1,
          placeholder TEXT,
          description TEXT,
          default_value TEXT,
          layout_width TEXT DEFAULT 'full',
          validation_rules_json TEXT,
          options_json TEXT,
          display_order INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO report_template_fields_migrated SELECT id, template_id, section_id, section_name, field_key, label, field_type, required, placeholder, description, default_value, layout_width, validation_rules_json, options_json, display_order FROM report_template_fields;
        DROP TABLE report_template_fields;
        ALTER TABLE report_template_fields_migrated RENAME TO report_template_fields;
      `);
    })();
  }

  // Migrate CHECK constraint on reports table if needed
  const tableInfo = (db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='reports'`).get() as any)?.sql || '';
  if (tableInfo && !tableInfo.includes('Rejected')) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS reports_migrated (
          id TEXT PRIMARY KEY,
          template_id TEXT NOT NULL REFERENCES report_templates(id) ON DELETE RESTRICT,
          template_name TEXT NOT NULL,
          template_version TEXT NOT NULL DEFAULT 'v1.0',
          title TEXT NOT NULL,
          category_id TEXT NOT NULL REFERENCES report_template_categories(id) ON DELETE RESTRICT,
          category_name TEXT NOT NULL,
          created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_by_name TEXT NOT NULL,
          created_by_role TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('Draft', 'Completed', 'Sent', 'Returned', 'Signed', 'Rejected')),
          sent_to_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          sent_to_name TEXT,
          sent_at TEXT,
          sender_note TEXT,
          return_reason TEXT,
          returned_at TEXT,
          rejection_reason TEXT,
          rejected_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO reports_migrated SELECT id, template_id, template_name, 'v1.0', title, category_id, category_name, created_by, created_by_name, created_by_role, status, sent_to_user_id, sent_to_name, sent_at, sender_note, return_reason, returned_at, rejection_reason, rejected_at, created_at, updated_at FROM reports;
        DROP TABLE reports;
        ALTER TABLE reports_migrated RENAME TO reports;
      `);
    })();
  }
}
