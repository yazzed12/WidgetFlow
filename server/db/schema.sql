-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('Employee', 'Manager', 'Director', 'Admin')),
  avatar_initials TEXT NOT NULL,
  avatar_bg TEXT NOT NULL,
  department TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Inactive', 'Resigned', 'Terminated')),
  manager_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 1.1 Organization Roles & Permissions (users.role_id is added below by the
-- compatibility migration because legacy databases already contain users.)
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  role_type TEXT NOT NULL CHECK(role_type IN ('System', 'Custom')),
  governance_level TEXT NOT NULL CHECK(governance_level IN ('Employee', 'Manager', 'Director', 'None')),
  is_active INTEGER NOT NULL DEFAULT 1,
  is_protected INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(role_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);

-- 2. Report Template Categories Table
CREATE TABLE IF NOT EXISTS report_template_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. Report Templates Table
CREATE TABLE IF NOT EXISTS report_templates (
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
  target_role_id TEXT REFERENCES roles(id),
  assignment_strategy_snapshot TEXT CHECK(assignment_strategy_snapshot IN ('SPECIFIC_USER', 'ROLE_QUEUE', 'DIRECT_PUBLISH')),
  claimed_at TEXT,
  submitted_at TEXT,
  rejection_reason TEXT,
  rules_json TEXT,
  calculations_json TEXT,
  theme_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tags junction / JSON storage for tags on report_templates
CREATE TABLE IF NOT EXISTS report_template_tags (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES report_templates(id) ON DELETE CASCADE,
  tag TEXT NOT NULL
);

-- 4. Report Template Sections Table
CREATE TABLE IF NOT EXISTS report_template_sections (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES report_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0
);

-- 5. Report Template Fields Table
CREATE TABLE IF NOT EXISTS report_template_fields (
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

-- 4.5. Report Template Versions Table (Immutable Snapshots)
CREATE TABLE IF NOT EXISTS report_template_versions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES report_templates(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  schema_snapshot_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'Approved',
  UNIQUE(template_id, version)
);

-- 6. Reports Table (Report Instances)
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES report_templates(id) ON DELETE RESTRICT,
  template_version_id TEXT REFERENCES report_template_versions(id) ON DELETE SET NULL,
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

-- 7. Report Field Values Table
CREATE TABLE IF NOT EXISTS report_field_values (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  template_field_id TEXT NOT NULL REFERENCES report_template_fields(id) ON DELETE CASCADE,
  value_text TEXT,
  value_number REAL,
  UNIQUE(report_id, template_field_id)
);

-- 8. Template Audit History Table
CREATE TABLE IF NOT EXISTS template_audit_history (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES report_templates(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  person_name TEXT NOT NULL,
  role TEXT NOT NULL,
  action TEXT NOT NULL,
  comment TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 9. Template Request Comments Table
CREATE TABLE IF NOT EXISTS template_comments (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES report_templates(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL,
  user_avatar TEXT NOT NULL,
  message TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 10. Report Comments Table
CREATE TABLE IF NOT EXISTS report_comments (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL,
  user_avatar TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 11. Report Audit History Table
CREATE TABLE IF NOT EXISTS report_audit_history (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  role TEXT NOT NULL,
  action TEXT NOT NULL,
  comment TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 12. Digital Signatures Table (UNIQUE on report_id)
CREATE TABLE IF NOT EXISTS digital_signatures (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL UNIQUE REFERENCES reports(id) ON DELETE CASCADE,
  signed_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signed_by_name TEXT NOT NULL,
  signed_by_role TEXT NOT NULL,
  verification_id TEXT NOT NULL UNIQUE,
  signed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 10. Content Packs Table (Content Library)
CREATE TABLE IF NOT EXISTS content_packs (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK(source_type IN ('system', 'user')),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  icon_name TEXT,
  schema_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 13. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_template_id TEXT REFERENCES report_templates(id) ON DELETE SET NULL,
  related_report_id TEXT REFERENCES reports(id) ON DELETE SET NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_templates_status ON report_templates(status);
CREATE INDEX IF NOT EXISTS idx_templates_category ON report_templates(category_id);
CREATE INDEX IF NOT EXISTS idx_templates_approver ON report_templates(requested_approval_from_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_by ON reports(created_by);
CREATE INDEX IF NOT EXISTS idx_reports_sent_to ON reports(sent_to_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(recipient_user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_template_comments ON template_comments(template_id);
CREATE INDEX IF NOT EXISTS idx_report_comments ON report_comments(report_id);
