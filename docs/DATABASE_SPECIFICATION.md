# SQLite Database Specification

## 1. Database runtime

Application database: `server/data/widgetflow.db`, resolved relative to `server/db/database.ts`. The root files `widgetflow.db`, `widgetflow.db-wal`, `widgetflow.db-shm`, and `widgetflow-demo-backup.db` are repository artifacts/backups but are not opened by current server code.

Open-time PRAGMAs: `foreign_keys=ON`, `journal_mode=WAL`. `schema.sql` is executed idempotently. `database.ts` then performs try/catch `ALTER TABLE` and table-rebuild compatibility migrations and creates system/workflow/signature tables. `seedDatabase()` temporarily sets foreign keys OFF, performs one transaction, then ON.

The initialized application DB contains **31 application tables**. Dates are ISO strings or SQLite `datetime('now')` text; booleans are integer 0/1; flexible schemas are JSON text.

## 2. Relationship overview

```text
users
 ├─ report_templates ─┬─ tags
 │                    ├─ sections ── fields
 │                    ├─ versions
 │                    ├─ template comments/audit
 │                    ├─ workflow_definitions ── versions
 │                    └─ reports ─┬─ values
 │                                ├─ comments/audit
 │                                ├─ digital_signatures (legacy)
 │                                ├─ report_signature_audit
 │                                └─ workflow_instances ─┬─ tasks
 │                                                       └─ history
 ├─ template_packs ── template_pack_items
 ├─ content_library_items
 ├─ content_packs (optional owner)
 └─ user_signature_profiles

system_feature_settings
system_element_settings
system_general_settings
admin_audit_log
template_assets (logical creator/usage links, few formal FKs)
notifications -> user + optional template/report
```

## 3. Complete table dictionary

### 3.1 `users`

- **Purpose:** demo identities/directory/hierarchy.
- **Columns:** `id TEXT PK`; `name TEXT NOT NULL`; `email TEXT NOT NULL UNIQUE`; `role TEXT NOT NULL CHECK Employee|Manager|Director|Admin`; `avatar_initials TEXT NOT NULL`; `avatar_bg TEXT NOT NULL`; `department TEXT NOT NULL`; `status TEXT NOT NULL DEFAULT 'Active'`; `manager_user_id TEXT`; `created_at TEXT NOT NULL DEFAULT datetime(now)`.
- **Relationships:** schema declares self-FK `manager_user_id -> users.id ON DELETE SET NULL`; actual migrated DB may have no formal FK because users rebuild omits it.
- **Indexes/constraints:** automatic PK and unique email; no named role/status index.
- **Writes:** seed; Admin create/status; hierarchy seed updates. **Reads:** middleware, repository, Admin, workflows/approver selection.
- **Rules/issues:** no status CHECK; active not enforced; normal API omits status/manager; user delete only seed.

### 3.2 `report_template_categories`

- **Purpose:** template/Standard Pack classification.
- **Columns:** `id TEXT PK`; `name TEXT NOT NULL UNIQUE`; `description TEXT NOT NULL`; `status TEXT DEFAULT 'Active'` (fresh schema says NOT NULL); `created_at TEXT NOT NULL DEFAULT now`.
- **Relationships:** referenced by templates (CASCADE in base), reports (RESTRICT), Standard Packs (SET NULL).
- **Indexes:** automatic PK/unique name.
- **Writes/reads:** seed/Admin CRUD; template/report/Pack queries and builder.
- **Rules:** status no CHECK; inactive not consistently propagated; deleting category has no API.

### 3.3 `report_templates`

- **Purpose:** mutable Draft/governance row and Approved catalog identity.
- **Columns:** `id TEXT PK`; `name`, `description` NOT NULL; `category_id TEXT NOT NULL FK`; `version TEXT NOT NULL DEFAULT 'v1.0'`; `status TEXT NOT NULL CHECK Draft|Pending Approval|Approved|Rejected|Archived|Superseded`; creator ID/name/role NOT NULL; optional requested approver ID/name; `submitted_at`, `rejection_reason`; `rules_json`, `calculations_json`, `theme_json`; created/updated text defaults.
- **FKs:** category CASCADE; creator CASCADE; requested approver SET NULL.
- **Named indexes:** status, category, approver.
- **Writes:** workflowService, seed, migrations. **Reads:** library/requests/approval/report creation/Admin category counts/workflow linkage.
- **Rules:** Approved immutable through save; replacement archives prior normalized identity; denormalized creator/approver names preserve display.

### 3.4 `report_template_tags`

- **Purpose:** repeated template tags.
- **Columns:** `id TEXT PK`; `template_id TEXT NOT NULL FK CASCADE`; `tag TEXT NOT NULL`.
- **Indexes:** PK only; no unique `(template,tag)` and no template index.
- **Writes:** replaced on template save/seed. **Reads:** hydration/client tag filter.

### 3.5 `report_template_sections`

- **Purpose:** ordered template section definitions.
- **Columns:** `id TEXT PK`; `template_id TEXT NOT NULL FK CASCADE`; `name TEXT NOT NULL`; `display_order INTEGER NOT NULL DEFAULT 0`.
- **Indexes:** PK only.
- **Writes:** replace-on-save/seed. **Reads:** template hydration.

### 3.6 `report_template_fields`

- **Purpose:** flattened component registry instances.
- **Columns:** ID PK; template FK CASCADE; optional section FK SET NULL; `section_name`; `field_key`; label/type; required integer default 1; placeholder/description/default; `layout_width`; `validation_rules_json`; `options_json`; display order.
- **Types:** all IDs/text; order/required INTEGER. Current migrated table intentionally has no field-type CHECK. Base schema’s old CHECK lists only 13 legacy types and is rebuilt away.
- **Indexes:** PK only; no `(template,field_key)` unique/index.
- **Writes:** save/seed. **Reads:** hydration, report value mapping.
- **Rules:** service creates DB ID as `<templateId>-<componentId>`; uniqueness is application validation, not DB.

### 3.7 `report_template_versions`

- **Purpose:** immutable JSON snapshots used by reports.
- **Columns:** ID PK; template FK CASCADE; version; `schema_snapshot_json NOT NULL`; `created_by NOT NULL` (not formal FK); created/published text; status default Approved.
- **Constraint/index:** UNIQUE `(template_id,version)` plus PK.
- **Writes:** seed; direct publish/approve/report create fallback. **Reads:** report hydration.
- **Rules:** `INSERT OR REPLACE` can replace a snapshot of same version; therefore immutability is conventional, not DB-enforced.

### 3.8 `reports`

- **Purpose:** report instance header/workflow state.
- **Columns:** ID PK; template FK RESTRICT; optional template-version FK SET NULL; template name/version; title; category FK RESTRICT + name; creator ID/name/role; status CHECK Draft|Completed|Sent|Returned|Signed|Rejected; optional sent recipient/name/time/note; return reason/time; rejection reason/time; created/updated.
- **Indexes:** creator, sent recipient, status.
- **Writes:** seed, classic/dynamic workflow services. **Reads:** repository/dashboard/pages/signature/asset checks.
- **Rules:** denormalized names/version/category; Signed is service lock; template cannot delete while reports exist.

### 3.9 `report_field_values`

- **Purpose:** one typed value per report/template field.
- **Columns:** ID PK; report FK CASCADE; template-field FK CASCADE; nullable `value_text TEXT`, `value_number REAL`.
- **Constraint/index:** UNIQUE `(report_id,template_field_id)`.
- **Writes:** create/update/seed. **Reads:** report hydration and rule/workflow data.
- **Rules:** object/array/boolean commonly JSON in text; no CHECK requiring exactly one value column.

### 3.10 `template_audit_history`

- **Purpose:** template lifecycle audit.
- **Columns:** ID PK; template FK CASCADE; template/person/role/action text NOT NULL; optional comment; timestamp default.
- **Indexes:** PK only.
- **Writes:** template service/seed. **Reads:** no authoritative public repository/API path; local UI substitutes.

### 3.11 `template_comments`

- **Purpose:** request discussion.
- **Columns:** ID PK; template FK CASCADE; user FK CASCADE; denormalized name/role/avatar; message; timestamp.
- **Index:** named `idx_template_comments(template_id)`.
- **Writes/reads:** template comment service/repository.

### 3.12 `report_comments`

- **Purpose:** report review discussion.
- **Columns:** ID PK; report FK CASCADE; user FK CASCADE; denormalized identity; message; created_at.
- **Index:** `idx_report_comments(report_id)`.

### 3.13 `report_audit_history`

- **Purpose:** report lifecycle history.
- **Columns:** ID PK; report FK CASCADE; person/role/action NOT NULL; comment; timestamp.
- **Indexes:** PK only.
- **Writes:** classic service/seed. **Reads:** report hydration/View modal.

### 3.14 `digital_signatures`

- **Purpose:** legacy one-signature-per-report model.
- **Columns:** ID PK; `report_id TEXT NOT NULL UNIQUE FK CASCADE`; signer user FK CASCADE; denormalized name/role; `verification_id TEXT NOT NULL UNIQUE`; signed_at.
- **Indexes:** automatic PK and two unique indexes.
- **Writes:** seed only in current service. **Reads:** report hydration legacy `signature`.

### 3.15 `notifications`

- **Purpose:** per-user event inbox.
- **Columns:** ID PK; recipient user FK CASCADE; type/title/message; optional template FK SET NULL; optional report FK SET NULL; `is_read INTEGER NOT NULL DEFAULT 0`; created_at.
- **Index:** `idx_notifications_user_read(recipient_user_id,is_read)`.
- **Writes:** workflow/comment services/seed; read endpoints update. **Reads:** repository/UI.
- **Rules:** type and is_read not CHECK constrained.

### 3.16 `content_packs`

- **Purpose:** system and user-owned multi-section Pack snapshots.
- **Columns:** ID PK; optional owner user FK CASCADE; `source_type CHECK system|user`; name; normalized name; category; description; icon; `schema_json`; created/updated.
- **Indexes:** PK only; no unique name/owner or owner lookup index.
- **Writes:** seed and owner APIs. **Reads:** Studio Content Library.
- **Rules:** system should have null owner and user nonnull owner, but DB has no cross-column CHECK.

### 3.17 `system_feature_settings`

- **Purpose:** Studio module flags.
- **Columns:** `feature_key TEXT PK`; name; category default studio; description; enabled integer default 1; updated_by; updated_at.
- **Writes:** seed/Admin. **Reads:** effective config/Admin.
- **Constraints:** no FK on updater, no boolean CHECK.

### 3.18 `system_element_settings`

- **Purpose:** 23 element availability flags.
- **Columns:** `element_key TEXT PK`; name/category/description; enabled; updated_by/time.
- **Writes/reads:** seed/Admin/effective config.

### 3.19 `system_general_settings`

- **Purpose:** arbitrary typed key/value policy/config.
- **Columns:** `setting_key TEXT PK`; `setting_value TEXT NOT NULL`; `setting_type TEXT NOT NULL DEFAULT 'string'`; updated_by/time.
- **Rules:** service interprets boolean/number/string; no type CHECK or key allowlist.

### 3.20 `admin_audit_log`

- **Purpose:** Admin configuration history.
- **Columns:** ID PK; actor ID/name/role; action; target; previous/new nullable; timestamp.
- **Relationships:** no FKs, preserving audit after user change/deletion.
- **Reads:** newest 200 Admin-only. **Writes:** adminService/seed.

### 3.21 `template_packs`

- **Purpose:** Admin Standard Pack header.
- **Columns:** ID PK; name/description; optional category FK SET NULL; status CHECK Draft|Published|Disabled; creator user FK CASCADE; `structure_json` full canvas snapshot; created/updated.
- **Indexes:** PK only; unique Pack name enforced in service, not DB.
- **Writes:** seed/Admin. **Reads:** Admin and Published user API.

### 3.22 `template_pack_items`

- **Purpose:** ordered compatibility/discovery projection for Standard Packs, including legacy Packs without `structure_json`.
- **Columns:** ID PK; pack FK CASCADE; source type CHECK field|element|content; optional source key; label; configuration JSON; display order; created_at.
- **Indexes:** PK only; no pack index/unique ordering.
- **Writes:** seed/create/update replacement. **Reads:** Pack hydration.

### 3.23 `content_library_items`

- **Purpose:** Admin single organization content snippets.
- **Columns:** ID PK; name; optional description; category; content type CHECK Heading|Text Block|Disclaimer|Instruction|Label|Section Intro; content value; enabled integer default 1; creator user FK CASCADE; created/updated.
- **Indexes:** PK only.
- **Writes:** seed/Admin. **Reads:** Admin, enabled user API, Pack picker.

### 3.24 `template_assets`

- **Purpose:** uploaded file metadata.
- **Columns:** ID PK; filename; MIME; size bytes; storage path; `created_by TEXT NOT NULL`; created_at.
- **Relationships:** no formal creator/template/report FK.
- **Writes:** asset routes; attempted replacement cleanup. **Reads:** asset stream.
- **Rules:** disk existence/path prefix checked on read; orphan lifecycle possible.

### 3.25 `user_signature_profiles`

- **Purpose:** one active signature method/profile per user.
- **Columns:** ID PK; `user_id UNIQUE FK CASCADE`; method CHECK uploaded|drawn|typed; optional asset/drawing/typed name; created/updated; active integer default 1.
- **Writes:** seed/profile API. **Reads:** signing/profile.

### 3.26 `report_signature_audit`

- **Purpose:** current component-level signature evidence/history.
- **Columns:** ID PK; report FK CASCADE; optional component ID/key; signer user FK CASCADE plus name/role; signature role CHECK sender|receiver; method CHECK uploaded|drawn|typed; typed/image data; verification ID UNIQUE; confirmation; content hash; active integer; signed_at.
- **Indexes:** PK and unique verification.
- **Writes:** sign/send/return supersession. **Reads:** report hydration/asset access.
- **Rules:** no DB unique active role/report; service replay check.

### 3.27 `workflow_definitions`

- **Purpose:** mutable workflow definition.
- **Columns:** ID PK; name; description; optional template FK CASCADE; version default v1.0; status CHECK Draft|Active|Archived; definition JSON; created_by text; created/updated.
- **Writes:** seed/workflow save/publish. **Reads:** workflows/send.
- **Rules:** creator not FK; no one-active-per-template unique constraint; query chooses latest.

### 3.28 `workflow_versions`

- **Purpose:** workflow snapshot.
- **Columns:** ID PK; workflow FK CASCADE; version; snapshot JSON; created_by text; created_at.
- **Constraints:** no UNIQUE `(workflow_id,version)`; service deterministic ID and replace.

### 3.29 `workflow_instances`

- **Purpose:** per-report workflow execution.
- **Columns:** ID PK; report FK CASCADE; workflow version FK RESTRICT; current step; status CHECK In Progress|Returned|Rejected|Completed; started/completed.
- **Indexes:** PK only; no report index/unique, multiple instances allowed.

### 3.30 `workflow_tasks`

- **Purpose:** assigned step action.
- **Columns:** ID PK; instance FK CASCADE; step ID/name; optional assigned user FK SET NULL; optional assigned role; status CHECK Pending|Completed|Returned|Rejected|Cancelled; created/completed.
- **Rules:** assigned_role has no role CHECK; pending task queries scan without named index.

### 3.31 `workflow_history`

- **Purpose:** immutable-ish workflow events.
- **Columns:** ID PK; instance FK CASCADE; step ID/name; actor user FK (NO ACTION); denormalized identity; action; comment; signature verification; timestamp.
- **Reads/writes:** dynamic workflow service/detail API.

## 4. Named index inventory

1. `idx_templates_status`
2. `idx_templates_category`
3. `idx_templates_approver`
4. `idx_reports_created_by`
5. `idx_reports_sent_to`
6. `idx_reports_status`
7. `idx_notifications_user_read`
8. `idx_template_comments`
9. `idx_report_comments`

The base file calls these “Performance Indexes”; there are actually **9 named indexes**, plus automatic PK/UNIQUE indexes. The master count does not claim eight named indexes after this code-level recount.

## 5. Initialization and migration behavior

Compatibility operations:

- add reports rejection/version/version-ID columns;
- add template rules/theme; user manager/status; category status;
- rebuild users if Admin absent;
- create system config/audit/Standard Pack/Content item tables;
- rebuild template status CHECK if Archived absent;
- add field key/description/default/layout/validation;
- create assets/workflow/profile/signature-audit tables;
- rebuild field table to remove legacy type CHECK;
- rebuild reports if Rejected absent.

All `ALTER` duplicates are swallowed. No migration transaction spans the whole initialization. Rebuilds disable FKs and use positional `INSERT ... SELECT` in places.

Known compatibility risks:

- users rebuild loses formal manager self-FK;
- legacy template-status rebuild definition omits `theme_json` after earlier add;
- legacy reports rebuild definition omits `template_version_id` after earlier add;
- failures are often silently ignored, leaving schema variant-dependent behavior.

## 6. Seed and reset interaction

Startup always seeds. Core users/templates/reports/config/audits/Standard Packs/Content items/signature profiles and system Content Packs are reset. Workflow definitions/versions are reset. Workflow instances/tasks/history, user Content Packs, template assets and disk files are not fully cleared. See `DEMO_AND_SEED_DATA.md`.

## 7. Backup/artifact files

- Active: `server/data/widgetflow.db`, its `-wal` and `-shm` files.
- Root artifacts: `widgetflow.db`, `widgetflow.db-wal`, `widgetflow.db-shm`.
- Named backup: `widgetflow-demo-backup.db`.
- No application backup/restore code references the root backup.

Sources: `server/db/schema.sql`, `server/db/database.ts`, `server/db/seed.ts`, actual `sqlite_master`/PRAGMA inspection of `server/data/widgetflow.db`, and every SQL statement under `server/`.
