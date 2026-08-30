import { db } from './database.js';
import { DEMO_USERS, MOCK_CATEGORIES, INITIAL_TEMPLATES, INITIAL_APPROVAL_RECORDS, INITIAL_NOTIFICATIONS, INITIAL_REPORTS } from '../../src/data/initialData.js';
import { BUILT_IN_CONTENT_PACKS } from '../../src/data/builtInContentPacks.js';
import { SYSTEM_ROLE_DEFINITIONS } from '../../src/shared/permissionCatalog.js';

export function ensureSystemRoles() {
  const transaction = db.transaction(() => {
    const upsertRole = db.prepare(`
      INSERT INTO roles (id, key, name, description, role_type, governance_level, is_active, is_protected, created_by)
      VALUES (?, ?, ?, ?, 'System', ?, 1, 1, NULL)
      ON CONFLICT(id) DO UPDATE SET
        key = excluded.key,
        name = excluded.name,
        description = excluded.description,
        role_type = 'System',
        governance_level = excluded.governance_level,
        is_active = 1,
        is_protected = 1,
        updated_at = datetime('now')
    `);
    const insertPermission = db.prepare(`
      INSERT OR IGNORE INTO role_permissions (id, role_id, permission_key) VALUES (?, ?, ?)
    `);
    for (const role of SYSTEM_ROLE_DEFINITIONS) {
      upsertRole.run(role.id, role.key, role.name, role.description, role.governanceLevel);
      db.prepare(`DELETE FROM role_permissions WHERE role_id = ?`).run(role.id);
      for (const permissionKey of role.permissions) {
        insertPermission.run(`rp-${role.key}-${permissionKey.replace(/[^a-z0-9]+/gi, '-')}`, role.id, permissionKey);
      }
      db.prepare(`UPDATE users SET role_id = ? WHERE role_id IS NULL AND role = ?`).run(role.id, role.name);
    }
  });
  transaction();
}

export function seedDatabase() {
  db.pragma('foreign_keys = OFF;');

  // Ensure users table schema allows Admin role
  try {
    const tableSql = (db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`).get() as any)?.sql || '';
    if (tableSql && !tableSql.includes("'Admin'")) {
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
        INSERT INTO users_dg_tmp (id, name, email, role, avatar_initials, avatar_bg, department, created_at)
        SELECT id, name, email, role, avatar_initials, avatar_bg, department, created_at FROM users WHERE role IN ('Employee', 'Manager', 'Director');
        DROP TABLE users;
        ALTER TABLE users_dg_tmp RENAME TO users;
      `);
    }
  } catch {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN role_id TEXT REFERENCES roles(id) ON DELETE RESTRICT;`);
  } catch {}
  try {
    db.exec(`UPDATE users SET role_id = 'role-' || LOWER(role) WHERE role_id IS NULL OR role_id = '';`);
  } catch {}

  const transaction = db.transaction(() => {
    // Clear existing data safely
    db.prepare('DELETE FROM notifications').run();
    db.prepare('DELETE FROM digital_signatures').run();
    db.prepare('DELETE FROM report_audit_history').run();
    db.prepare('DELETE FROM report_comments').run();
    db.prepare('DELETE FROM report_field_values').run();
    db.prepare('DELETE FROM reports').run();
    db.prepare('DELETE FROM template_comments').run();
    db.prepare('DELETE FROM template_audit_history').run();
    db.prepare('DELETE FROM report_template_fields').run();
    db.prepare('DELETE FROM report_template_sections').run();
    db.prepare('DELETE FROM report_template_tags').run();
    db.prepare('DELETE FROM report_template_versions').run();
    db.prepare('DELETE FROM report_templates').run();
    db.prepare('DELETE FROM report_template_categories').run();
    db.prepare('DELETE FROM users').run();

    // Demo Reset deliberately removes Custom roles and restores the canonical
    // protected four-role baseline.
    db.prepare('DELETE FROM role_permissions').run();
    db.prepare('DELETE FROM roles').run();

    const insertRole = db.prepare(`
      INSERT INTO roles (id, key, name, description, role_type, governance_level, is_active, is_protected, created_by)
      VALUES (?, ?, ?, ?, 'System', ?, 1, 1, NULL)
    `);
    const insertRolePermission = db.prepare(`
      INSERT INTO role_permissions (id, role_id, permission_key) VALUES (?, ?, ?)
    `);
    for (const role of SYSTEM_ROLE_DEFINITIONS) {
      insertRole.run(role.id, role.key, role.name, role.description, role.governanceLevel);
      for (const permissionKey of role.permissions) {
        insertRolePermission.run(`rp-${role.key}-${permissionKey.replace(/[^a-z0-9]+/gi, '-')}`, role.id, permissionKey);
      }
    }

    // 1. Seed Users
    db.prepare('DELETE FROM users').run();
    const insertUser = db.prepare(`
      INSERT INTO users (id, name, email, role, role_id, avatar_initials, avatar_bg, department, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const u of DEMO_USERS) {
      const roleId = `role-${String(u.role).toLowerCase()}`;
      insertUser.run(u.id, u.name, u.email, u.role, roleId, u.avatarInitials, u.avatarBg, u.department, u.status || 'Active');
    }
    db.prepare(`UPDATE users SET manager_user_id = 'user-manager' WHERE id = 'user-employee'`).run();
    db.prepare(`UPDATE users SET manager_user_id = 'user-director' WHERE id = 'user-manager'`).run();

    // 1.5. Seed Default User Signature Profiles
    db.prepare('DELETE FROM user_signature_profiles').run();
    db.prepare('DELETE FROM report_signature_audit').run();
    const insertSigProfile = db.prepare(`
      INSERT INTO user_signature_profiles (id, user_id, method, typed_name, created_at, updated_at, is_active)
      VALUES (?, ?, 'typed', ?, datetime('now'), datetime('now'), 1)
    `);
    for (const u of DEMO_USERS) {
      insertSigProfile.run(`sigprof-${u.id}`, u.id, u.name);
    }

    // 1.8. Seed System Configuration & Admin Audit
    db.prepare('DELETE FROM system_feature_settings').run();
    db.prepare('DELETE FROM system_element_settings').run();
    db.prepare('DELETE FROM system_general_settings').run();
    db.prepare('DELETE FROM admin_audit_log').run();
    db.prepare('DELETE FROM template_pack_items').run();
    db.prepare('DELETE FROM template_packs').run();
    db.prepare('DELETE FROM content_library_items').run();

    const insertFeature = db.prepare(`
      INSERT INTO system_feature_settings (feature_key, feature_name, category, description, enabled, updated_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const studioFeatures = [
      { key: 'studio.templates', name: 'Templates', cat: 'studio', desc: 'Pre-built layout starter templates.' },
      { key: 'studio.elements', name: 'Elements', cat: 'studio', desc: 'Toolbox of form inputs, content primitives, and business widgets.' },
      { key: 'studio.content_library', name: 'Content Library', cat: 'studio', desc: 'Multi-component reusable Content Packs.' },
      { key: 'studio.text', name: 'Text', cat: 'studio', desc: 'Standalone text primitives (headings and paragraphs).' },
      { key: 'studio.sections', name: 'Sections', cat: 'studio', desc: 'Multi-section organization and drag-and-drop ordering.' },
      { key: 'studio.data_fields', name: 'Data Fields', cat: 'studio', desc: 'Enterprise single ready-made business fields.' },
      { key: 'studio.themes', name: 'Themes', cat: 'studio', desc: 'Global design system tokens for typography, colors, and density.' },
      { key: 'studio.workflow', name: 'Workflow', cat: 'studio', desc: 'Multi-stage review and approval routing paths.' },
      { key: 'studio.packs', name: 'Packs', cat: 'studio', desc: 'Allow template creators to use administrator-defined reusable building packs.' },
    ];
    for (const f of studioFeatures) {
      insertFeature.run(f.key, f.name, f.cat, f.desc, 1, 'user-admin');
    }

    const insertElement = db.prepare(`
      INSERT INTO system_element_settings (element_key, element_name, category, description, enabled, updated_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const studioElements = [
      { key: 'elements.text', name: 'Text Input', cat: 'Basic Inputs', desc: 'Short single-line text entry.' },
      { key: 'elements.textarea', name: 'Text Area', cat: 'Basic Inputs', desc: 'Multi-line text notes.' },
      { key: 'elements.number', name: 'Number Input', cat: 'Basic Inputs', desc: 'Numeric input with validation.' },
      { key: 'elements.date', name: 'Date', cat: 'Basic Inputs', desc: 'Calendar date selector.' },
      { key: 'elements.datetime', name: 'Date & Time', cat: 'Basic Inputs', desc: 'Timestamp date-time picker.' },

      { key: 'elements.select', name: 'Dropdown Select', cat: 'Choice Inputs', desc: 'Single dropdown choice.' },
      { key: 'elements.checkbox', name: 'Checkbox', cat: 'Choice Inputs', desc: 'Binary toggle or option check.' },
      { key: 'elements.radio', name: 'Radio Group', cat: 'Choice Inputs', desc: 'Single-option radio buttons.' },
      { key: 'elements.rating', name: 'Rating Scale', cat: 'Choice Inputs', desc: 'Star rating evaluation input.' },
      { key: 'elements.acknowledgement', name: 'Acknowledgement', cat: 'Choice Inputs', desc: 'Legal confirmation check.' },

      { key: 'elements.currency', name: 'Currency Input', cat: 'Financial', desc: 'Monetary input with currency symbol.' },
      { key: 'elements.percentage', name: 'Percentage Input', cat: 'Financial', desc: 'Percentage ratio input.' },

      { key: 'elements.heading', name: 'Section Heading', cat: 'Layout', desc: 'Title headings (H1/H2/H3).' },
      { key: 'elements.paragraph', name: 'Paragraph Text', cat: 'Layout', desc: 'Body paragraph text.' },
      { key: 'elements.divider', name: 'Section Divider', cat: 'Layout', desc: 'Horizontal divider line.' },
      { key: 'elements.spacer', name: 'Layout Spacer', cat: 'Layout', desc: 'Vertical space buffer.' },
      { key: 'elements.image', name: 'Image Asset', cat: 'Layout', desc: 'Static image display.' },
      { key: 'elements.info_box', name: 'Info / Callout Box', cat: 'Layout', desc: 'Highlighted callout box.' },

      { key: 'elements.file', name: 'File Attachment', cat: 'Advanced', desc: 'File attachment upload field.' },
      { key: 'elements.signature', name: 'Document Signature', cat: 'Advanced', desc: 'Role-based digital signature block.' },
      { key: 'elements.table', name: 'Data Table V2', cat: 'Advanced', desc: 'Itemized calculations & formulas.' },
      { key: 'elements.repeating_group', name: 'Repeating Group', cat: 'Advanced', desc: 'Multi-field repeating record container.' },
      { key: 'elements.kpi', name: 'KPI Metric Block', cat: 'Advanced', desc: 'Executive summary metric card.' },
    ];

    for (const e of studioElements) {
      insertElement.run(e.key, e.name, e.cat, e.desc, 1, 'user-admin');
    }

    const insertSetting = db.prepare(`
      INSERT INTO system_general_settings (setting_key, setting_value, setting_type, updated_by)
      VALUES (?, ?, ?, ?)
    `);
    insertSetting.run('org_name', 'WidgetFlow Demo Company', 'string', 'user-admin');
    insertSetting.run('platform_name', 'WidgetFlow', 'string', 'user-admin');
    insertSetting.run('default_template_version', '1.0', 'string', 'user-admin');
    insertSetting.run('allow_rejection', 'true', 'boolean', 'user-admin');
    insertSetting.run('allow_return', 'true', 'boolean', 'user-admin');
    insertSetting.run('digital_signature', 'true', 'boolean', 'user-admin');
    insertSetting.run('template_governance', 'true', 'boolean', 'user-admin');
    insertSetting.run('demo_mode', 'true', 'boolean', 'user-admin');
    insertSetting.run('governance.routing.employee', 'role-manager', 'string', 'user-admin');
    insertSetting.run('governance.strategy.employee', 'SPECIFIC_USER', 'string', 'user-admin');
    insertSetting.run('governance.user.employee', 'user-manager', 'string', 'user-admin');
    insertSetting.run('governance.routing.manager', 'role-director', 'string', 'user-admin');
    insertSetting.run('governance.strategy.manager', 'SPECIFIC_USER', 'string', 'user-admin');
    insertSetting.run('governance.user.manager', 'user-director', 'string', 'user-admin');
    insertSetting.run('governance.routing.director', 'DIRECT_PUBLISH', 'string', 'user-admin');
    insertSetting.run('governance.strategy.director', 'DIRECT_PUBLISH', 'string', 'user-admin');
    insertSetting.run('governance.user.director', 'DIRECT_PUBLISH', 'string', 'user-admin');

    const insertAudit = db.prepare(`
      INSERT INTO admin_audit_log (id, actor_id, actor_name, actor_role, action, target, previous_value, new_value, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertAudit.run(`adm-aud-1`, 'user-admin', 'Lina Nasser', 'Admin', 'System Initialization', 'Platform Configuration', 'Unconfigured', 'Operational Baseline', new Date().toISOString());

    // 1b. Seed Content Library Items
    const insertContentItem = db.prepare(`
      INSERT INTO content_library_items (id, name, description, category, content_type, content_value, enabled, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 1, 'user-admin')
    `);

    const contentItems = [
      { id: 'cli-1', name: 'Executive Summary Heading', desc: 'Standard H2 header for executive sections', cat: 'Analytics & BI', type: 'Heading', val: 'Executive Summary' },
      { id: 'cli-2', name: 'Confidentiality Notice', desc: 'Legal confidentiality disclosure statement', cat: 'HR & Operations', type: 'Disclaimer', val: 'Confidential — For internal organizational use only.' },
      { id: 'cli-3', name: 'Management Commentary', desc: 'Standard guidance prompt for management feedback', cat: 'Finance', type: 'Text Block', val: 'Please provide management commentary, key achievements, and risk mitigation highlights for the reporting period.' },
      { id: 'cli-4', name: 'Risk Statement', desc: 'Financial forecast audit disclaimer', cat: 'Finance', type: 'Disclaimer', val: 'All financial forecasts and risk disclosures contained herein are based on current estimates and subject to executive audit review.' },
      { id: 'cli-5', name: 'Prepared By Block', desc: 'Standard submission readiness checklist instruction', cat: 'HR & Operations', type: 'Instruction', val: 'Ensure all fields are completed and initial signatures attached before submitting for manager review.' },
      { id: 'cli-6', name: 'Approval Statement', desc: 'Executive confirmation declaration', cat: 'Analytics & BI', type: 'Disclaimer', val: 'By signing below, the approver confirms that the report metrics have been verified against corporate compliance standards.' },
      { id: 'cli-7', name: 'Standard Disclaimer', desc: 'Internal decision-making report footer statement', cat: 'Technology', type: 'Disclaimer', val: 'This report is produced automatically by WidgetFlow for internal management decision-making.' },
    ];
    for (const ci of contentItems) {
      insertContentItem.run(ci.id, ci.name, ci.desc, ci.cat, ci.type, ci.val);
    }

    // 1c. Seed Building Block Packs
    const insertPack = db.prepare(`
      INSERT INTO template_packs (id, name, description, category_id, status, created_by)
      VALUES (?, ?, ?, ?, ?, 'user-admin')
    `);

    const insertPackItem = db.prepare(`
      INSERT INTO template_pack_items (id, pack_id, source_type, source_key, label, configuration_json, display_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const seedPacks = [
      {
        id: 'pack-exec-kpi',
        name: 'Executive KPI Pack',
        desc: 'Standardized key performance indicator metrics for executive reporting.',
        catId: 'cat-analytics',
        status: 'Published',
        items: [
          { type: 'field', key: 'reporting_period', label: 'Reporting Period', config: { type: 'date', required: true }, order: 0 },
          { type: 'field', key: 'kpi_name', label: 'KPI Name', config: { type: 'text', required: true }, order: 1 },
          { type: 'field', key: 'current_value', label: 'Current Value', config: { type: 'currency', required: true }, order: 2 },
          { type: 'field', key: 'target_value', label: 'Target Value', config: { type: 'currency', required: true }, order: 3 },
          { type: 'field', key: 'variance_pct', label: 'Variance %', config: { type: 'percentage', required: true }, order: 4 },
          { type: 'field', key: 'kpi_status', label: 'Status', config: { type: 'select', options: ['On Track', 'At Risk', 'Critical'], required: true }, order: 5 },
          { type: 'field', key: 'exec_comments', label: 'Executive Comments', config: { type: 'textarea', required: false }, order: 6 },
        ],
      },
      {
        id: 'pack-fin-summary',
        name: 'Financial Summary Pack',
        desc: 'Core revenue, expenses, budget variance, and financial commentary bundle.',
        catId: 'cat-finance',
        status: 'Published',
        items: [
          { type: 'field', key: 'reporting_period', label: 'Reporting Period', config: { type: 'date', required: true }, order: 0 },
          { type: 'field', key: 'revenue', label: 'Revenue', config: { type: 'currency', required: true }, order: 1 },
          { type: 'field', key: 'expenses', label: 'Expenses', config: { type: 'currency', required: true }, order: 2 },
          { type: 'field', key: 'gross_profit', label: 'Gross Profit', config: { type: 'currency', required: true }, order: 3 },
          { type: 'field', key: 'budget', label: 'Budget', config: { type: 'currency', required: true }, order: 4 },
          { type: 'field', key: 'budget_variance', label: 'Budget Variance', config: { type: 'percentage', required: true }, order: 5 },
          { type: 'field', key: 'fin_comments', label: 'Finance Commentary', config: { type: 'textarea', required: false }, order: 6 },
        ],
      },
      {
        id: 'pack-ops',
        name: 'Operations Pack',
        desc: 'Departmental activity tracking, risk logs, and resource utilization metrics.',
        catId: 'cat-hr',
        status: 'Published',
        items: [
          { type: 'field', key: 'reporting_date', label: 'Reporting Date', config: { type: 'date', required: true }, order: 0 },
          { type: 'field', key: 'department', label: 'Department', config: { type: 'select', options: ['Operations', 'Sales', 'Finance', 'IT'], required: true }, order: 1 },
          { type: 'field', key: 'activities', label: 'Completed Activities', config: { type: 'textarea', required: true }, order: 2 },
          { type: 'field', key: 'issues', label: 'Issues', config: { type: 'textarea', required: false }, order: 3 },
          { type: 'field', key: 'risks', label: 'Risks', config: { type: 'textarea', required: false }, order: 4 },
          { type: 'field', key: 'utilization', label: 'Resource Utilization', config: { type: 'percentage', required: true }, order: 5 },
          { type: 'field', key: 'next_steps', label: 'Next Steps', config: { type: 'textarea', required: false }, order: 6 },
        ],
      },
      {
        id: 'pack-proj-status',
        name: 'Project Status Pack',
        desc: 'Project milestones, progress tracking, key risks, and next action items.',
        catId: 'cat-devtools',
        status: 'Published',
        items: [
          { type: 'field', key: 'project_name', label: 'Project Name', config: { type: 'text', required: true }, order: 0 },
          { type: 'field', key: 'project_manager', label: 'Project Manager', config: { type: 'text', required: true }, order: 1 },
          { type: 'field', key: 'reporting_period', label: 'Reporting Period', config: { type: 'date', required: true }, order: 2 },
          { type: 'field', key: 'overall_status', label: 'Overall Status', config: { type: 'select', options: ['Green', 'Amber', 'Red'], required: true }, order: 3 },
          { type: 'field', key: 'progress_pct', label: 'Progress %', config: { type: 'percentage', required: true }, order: 4 },
          { type: 'field', key: 'milestones', label: 'Milestone Status', config: { type: 'textarea', required: false }, order: 5 },
          { type: 'field', key: 'key_risks', label: 'Key Risks', config: { type: 'textarea', required: false }, order: 6 },
          { type: 'field', key: 'issues', label: 'Issues', config: { type: 'textarea', required: false }, order: 7 },
          { type: 'field', key: 'next_actions', label: 'Next Actions', config: { type: 'textarea', required: false }, order: 8 },
        ],
      },
      {
        id: 'pack-mgmt-review',
        name: 'Management Review Pack',
        desc: 'Executive review bundle combining fields, elements, content, and signatures.',
        catId: 'cat-analytics',
        status: 'Published',
        items: [
          { type: 'field', key: 'reporting_period', label: 'Reporting Period', config: { type: 'date', required: true }, order: 0 },
          { type: 'field', key: 'overall_status', label: 'Overall Status', config: { type: 'select', options: ['On Track', 'At Risk', 'Critical'], required: true }, order: 1 },
          { type: 'field', key: 'progress', label: 'Progress', config: { type: 'percentage', required: true }, order: 2 },
          { type: 'field', key: 'key_risks', label: 'Key Risks', config: { type: 'textarea', required: false }, order: 3 },
          { type: 'content', key: 'cli-3', label: 'Management Commentary', config: { contentType: 'Text Block', value: 'Please provide management commentary, key achievements, and risk mitigation highlights for the reporting period.' }, order: 4 },
          { type: 'element', key: 'elements.signature', label: 'Director Signature', config: { signatureRole: 'Receiver' }, order: 5 },
        ],
      },
    ];

    for (const p of seedPacks) {
      insertPack.run(p.id, p.name, p.desc, p.catId, p.status);
      p.items.forEach((item, idx) => {
        insertPackItem.run(`item-${p.id}-${idx}`, p.id, item.type, item.key, item.label, JSON.stringify(item.config), item.order);
      });
    }

    // 2. Seed Categories
    const insertCategory = db.prepare(`
      INSERT INTO report_template_categories (id, name, description)
      VALUES (?, ?, ?)
    `);
    for (const c of MOCK_CATEGORIES) {
      insertCategory.run(c.id, c.name, c.description);
    }

    // 3. Seed Report Templates, Sections & Fields
    const insertTemplate = db.prepare(`
      INSERT INTO report_templates (
        id, name, description, category_id, version, status,
        created_by, created_by_name, created_by_role,
        requested_approval_from_user_id, requested_approval_from_name,
        submitted_at, rejection_reason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertTag = db.prepare(`
      INSERT INTO report_template_tags (id, template_id, tag)
      VALUES (?, ?, ?)
    `);

    const insertSection = db.prepare(`
      INSERT INTO report_template_sections (id, template_id, name, display_order)
      VALUES (?, ?, ?, ?)
    `);

    const insertField = db.prepare(`
      INSERT INTO report_template_fields (
        id, template_id, section_id, section_name, field_key, label, field_type,
        required, placeholder, description, default_value, layout_width,
        validation_rules_json, options_json, display_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const t of INITIAL_TEMPLATES) {
      insertTemplate.run(
        t.id,
        t.name,
        t.description,
        t.categoryId,
        t.version || 'v1.0',
        t.status,
        t.createdById,
        t.createdByName,
        t.createdByRole,
        t.requestedApprovalFromUserId || null,
        t.requestedApprovalFromName || null,
        (t as any).submittedAt || null,
        (t as any).rejectionReason || null,
        t.createdAt,
        t.updatedAt
      );

      t.tags.forEach((tag: string, idx: number) => {
        insertTag.run(`tag-${t.id}-${idx}`, t.id, tag);
      });

      const sectionMap = new Map<string, string>();
      if (t.sections) {
        t.sections.forEach((secName: string, sIdx: number) => {
          const secId = `sec-${t.id}-${sIdx}`;
          insertSection.run(secId, t.id, secName, sIdx);
          sectionMap.set(secName, secId);
        });
      }

      const fieldsToInsert = t.components || t.fields || [];
      if (fieldsToInsert) {
        fieldsToInsert.forEach((f: any, fIdx: number) => {
          const secName = f.section || 'General';
          const secId = sectionMap.get(secName) || null;
          const fieldKey = f.key || f.id;
          const layoutW = f.layoutWidth || (f.layout && f.layout.width) || 'full';
          const configExtension = {
            ...(f.validation || {}),
            columns: f.columns,
            minRows: f.minRows,
            maxRows: f.maxRows,
            allowAddRow: f.allowAddRow,
            allowDeleteRow: f.allowDeleteRow,
            allowReorderRows: f.allowReorderRows,
            showRowNumbers: f.showRowNumbers,
            showFooter: f.showFooter,
            aggregates: f.aggregates,
            tableConfig: f.tableConfig,
            repeatingGroupConfig: f.repeatingGroupConfig,
            signatureConfig: f.signatureConfig,
            signatureRole: f.signatureRole || f.signatureConfig?.signatureRole,
            ratingConfig: f.ratingConfig,
            acknowledgementConfig: f.acknowledgementConfig,
            fileConfig: f.fileConfig,
            headingConfig: f.headingConfig,
            paragraphConfig: f.paragraphConfig,
            dividerConfig: f.dividerConfig,
            spacerConfig: f.spacerConfig,
            imageConfig: f.imageConfig,
            infoBoxConfig: f.infoBoxConfig,
            nestedComponents: f.nestedComponents,
            kpiConfig: f.kpiConfig,
          };
          const valJson = JSON.stringify(configExtension);
          const optJson = f.options ? JSON.stringify(f.options) : null;

          insertField.run(
            f.id,
            t.id,
            secId,
            secName,
            fieldKey,
            f.label || fieldKey,
            f.type,
            f.required ? 1 : 0,
            f.placeholder || null,
            f.description || null,
            f.defaultValue !== undefined ? String(f.defaultValue) : null,
            layoutW,
            valJson,
            optJson,
            f.order !== undefined ? f.order : fIdx
          );
        });
      }

      const snapshotJson = JSON.stringify(t);
      const versionId = `ver-${t.id}-${t.version || 'v1.0'}`;
      db.prepare(`
        INSERT OR REPLACE INTO report_template_versions (id, template_id, version, schema_snapshot_json, created_by, created_at, published_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(versionId, t.id, t.version || 'v1.0', snapshotJson, t.createdById, t.createdAt, t.updatedAt, t.status);
    }

    // 4. Seed Template Audit Records
    const insertTemplateAudit = db.prepare(`
      INSERT INTO template_audit_history (id, template_id, template_name, person_name, role, action, comment, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const rec of INITIAL_APPROVAL_RECORDS) {
      insertTemplateAudit.run(
        rec.id,
        rec.templateId,
        rec.templateName,
        rec.personName,
        rec.role,
        rec.action,
        rec.comment || null,
        rec.timestamp
      );
    }

    // 5. Seed Reports, Values & Signatures
    const insertReport = db.prepare(`
      INSERT INTO reports (
        id, template_id, template_version_id, template_name, template_version, title, category_id, category_name,
        created_by, created_by_name, created_by_role, status,
        sent_to_user_id, sent_to_name, sent_at, sender_note,
        return_reason, returned_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertFieldValue = db.prepare(`
      INSERT OR REPLACE INTO report_field_values (id, report_id, template_field_id, value_text, value_number)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertReportAudit = db.prepare(`
      INSERT INTO report_audit_history (id, report_id, person_name, role, action, comment, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertSignature = db.prepare(`
      INSERT INTO digital_signatures (id, report_id, signed_by_user_id, signed_by_name, signed_by_role, verification_id, signed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const rep of INITIAL_REPORTS) {
      const verRow = db.prepare(`SELECT id FROM report_template_versions WHERE template_id = ?`).get(rep.templateId) as any;
      const versionId = verRow?.id || null;
      insertReport.run(
        rep.id,
        rep.templateId,
        versionId,
        rep.templateName,
        (rep as any).templateVersion || 'v1.0',
        rep.title,
        rep.categoryId,
        rep.categoryName,
        rep.createdById,
        rep.createdByName,
        rep.createdByRole,
        rep.status,
        rep.sentToId || null,
        rep.sentToName || null,
        rep.sentAt || null,
        rep.senderNote || null,
        rep.returnReason || null,
        rep.returnedAt || null,
        rep.createdAt,
        rep.updatedAt
      );

      if (rep.data) {
        Object.entries(rep.data).forEach(([fieldId, val], vIdx) => {
          const isNum = typeof val === 'number';
          insertFieldValue.run(
            `val-${rep.id}-${vIdx}`,
            rep.id,
            fieldId,
            isNum ? null : String(val),
            isNum ? Number(val) : null
          );
        });
      }

      if (rep.auditHistory) {
        for (const aud of rep.auditHistory) {
          insertReportAudit.run(
            aud.id,
            rep.id,
            aud.personName,
            aud.role,
            aud.action,
            aud.comment || null,
            aud.timestamp
          );
        }
      }

      if (rep.signature) {
        insertSignature.run(
          rep.signature.id,
          rep.id,
          rep.signature.signedByUserId,
          rep.signature.signedByName,
          rep.signature.signedByRole,
          rep.signature.verificationId,
          rep.signature.signedAt
        );
      }
    }

    // 6. Seed Notifications
    const insertNotif = db.prepare(`
      INSERT INTO notifications (id, recipient_user_id, type, title, message, related_template_id, related_report_id, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const n of INITIAL_NOTIFICATIONS) {
      insertNotif.run(
        n.id,
        n.userId,
        n.type,
        n.title,
        n.message,
        n.relatedEntityId || null,
        n.relatedReportId || null,
        n.read ? 1 : 0,
        n.timestamp
      );
    }
    // 7. Seed Flagship Workflow Definition & Snapshot
    const flagWfJson = JSON.stringify({
      id: 'wf-cap-ex',
      name: 'Capital Expenditure Approval Workflow',
      description: 'Multi-level approval workflow with conditional Director routing for requests over $50,000.',
      templateId: 'tpl-req-1',
      version: 'v1.0',
      status: 'Active',
      steps: [
        { id: 'step-start', name: 'Submit Request', type: 'start', assignee: { strategy: 'specific_user', userId: 'user-employee' }, actions: [], transitions: [{ id: 'tr-1', targetStepId: 'step-mgr' }] },
        { id: 'step-mgr', name: 'Manager Review', type: 'review', assignee: { strategy: 'role', role: 'Manager' }, actions: ['Approve', 'Return for Changes', 'Reject'], transitions: [{ id: 'tr-cond-dir', targetStepId: 'step-dir', conditionGroup: { operator: 'AND', conditions: [{ fieldKey: 'total', operator: 'greater_than', value: 50000 }] } }, { id: 'tr-end', targetStepId: 'step-end' }] },
        { id: 'step-dir', name: 'Director Sign-off', type: 'approval', assignee: { strategy: 'role', role: 'Director' }, actions: ['Approve', 'Sign', 'Reject'], requiresSignature: true, transitions: [{ id: 'tr-end', targetStepId: 'step-end' }] },
        { id: 'step-end', name: 'Completed', type: 'end', assignee: { strategy: 'role', role: 'Manager' }, actions: [], transitions: [] },
      ],
    });

    db.prepare('DELETE FROM workflow_definitions').run();
    db.prepare('DELETE FROM workflow_versions').run();

    db.prepare(`
      INSERT INTO workflow_definitions (id, name, description, template_id, version, status, definition_json, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run('wf-cap-ex', 'Capital Expenditure Approval Workflow', 'Multi-level approval workflow', 'tpl-req-1', 'v1.0', 'Active', flagWfJson, 'user-manager');

    db.prepare(`
      INSERT INTO workflow_versions (id, workflow_id, version, snapshot_json, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run('wfv-wf-cap-ex-v1.0', 'wf-cap-ex', 'v1.0', flagWfJson, 'user-manager');

    // 8. Seed Built-in Content Packs
    db.prepare("DELETE FROM content_packs WHERE source_type = 'system'").run();
    const insertContentPack = db.prepare(`
      INSERT INTO content_packs (id, owner_user_id, source_type, name, normalized_name, category, description, icon_name, schema_json, created_at, updated_at)
      VALUES (?, NULL, 'system', ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    for (const p of BUILT_IN_CONTENT_PACKS) {
      insertContentPack.run(
        p.id,
        p.name,
        p.normalizedName || p.name.trim().toLowerCase().replace(/\s+/g, ' '),
        p.category,
        p.description,
        p.iconName || 'Package',
        JSON.stringify(p.sections)
      );
    }
  });

  transaction();
  db.pragma('foreign_keys = ON;');
}
