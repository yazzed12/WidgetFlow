# WidgetFlow Phase 1 Manual SQL Runbook

These migrations have been generated locally but have **not** been applied. The user remains the sole operator of the Supabase project.

## Before starting

1. Open the Supabase Dashboard for the intended new WidgetFlow project.
2. Confirm you are in the correct project.
3. Open **SQL Editor**.
4. Do not paste a publishable, secret, legacy anon, or service-role key into SQL or this repository.
5. Do not create any Auth user yet. The first real Admin belongs to Phase 2.
6. Do not run any SQLite seed, Demo Reset, or `fullSystemCheck` command.
7. Execute the files below in exact numeric order.
8. Run one whole migration file at a time. Each file owns its `BEGIN`/`COMMIT` transaction.
9. Stop immediately on any error. Do not continue to a later file.
10. Never skip a migration and never edit the private ledger manually.
11. Never rerun a migration recorded in `private.widgetflow_schema_migrations`. Its guard is designed to fail loudly.

The normal successful SQL Editor result for each migration is completion without an error, commonly shown as `Success. No rows returned`. Immediately run the listed read-only verification query before continuing.

## 1. `001_foundation.sql`

Purpose:

- Creates the private schema.
- Creates `private.widgetflow_schema_migrations`.
- Creates the reusable `SECURITY INVOKER` updated-at trigger function.

Run: [001_foundation.sql](/Users/apple/Desktop/gsk-task-1/supabase/migrations/001_foundation.sql)

Expected result: the transaction commits and migration `001_foundation` is recorded.

Verification query:

```sql
select id, description, applied_at
from private.widgetflow_schema_migrations
where id = '001_foundation';
```

Expected: exactly one row.

Do not create additional helper functions or grant access to the private schema.

## 2. `002_identity_roles_permissions.sql`

Purpose:

- Creates `roles`, `permissions`, `role_permissions`, `profiles`, and `user_role_history`.
- Adds profile/role indexes and updated-at triggers.
- Seeds only product System roles, permission definitions, and exact default role-permission mappings.

Run: [002_identity_roles_permissions.sql](/Users/apple/Desktop/gsk-task-1/supabase/migrations/002_identity_roles_permissions.sql)

Expected result: four System roles, 37 permissions, no profiles.

Verification query:

```sql
select
  (select count(*) from public.roles) as role_count,
  (select count(*) from public.permissions) as permission_count,
  (select count(*) from public.profiles) as profile_count,
  (select count(*) from private.widgetflow_schema_migrations where id = '002_identity_roles_permissions') as migration_count;
```

Expected: `role_count = 4`, `permission_count = 37`, `profile_count = 0`, `migration_count = 1`.

Do not insert a profile or create an Auth user.

## 3. `003_configuration_governance.sql`

Purpose:

- Creates categories, feature/element settings, typed system settings, and governance routes.
- Leaves all production-specific configuration and reviewer routes empty.

Run: [003_configuration_governance.sql](/Users/apple/Desktop/gsk-task-1/supabase/migrations/003_configuration_governance.sql)

Expected result: five new empty configuration tables.

Verification query:

```sql
select
  (select count(*) from public.categories) as categories,
  (select count(*) from public.feature_settings) as features,
  (select count(*) from public.element_settings) as elements,
  (select count(*) from public.system_settings) as system_settings,
  (select count(*) from public.governance_routes) as governance_routes,
  (select count(*) from private.widgetflow_schema_migrations where id = '003_configuration_governance') as migration_count;
```

Expected: all five business counts are `0`; `migration_count = 1`.

Do not add Sarah/Omar reviewer routes or copy demo configuration.

## 4. `004_templates.sql`

Purpose:

- Creates templates, sections, fields, tags, immutable version snapshots, comments, and audit events.
- Creates role-queue and assigned-reviewer indexes needed for future atomic RPCs.

Run: [004_templates.sql](/Users/apple/Desktop/gsk-task-1/supabase/migrations/004_templates.sql)

Expected result: seven empty template-domain tables.

Verification query:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'templates', 'template_sections', 'template_fields', 'template_tags',
    'template_versions', 'template_comments', 'template_audit_events'
  )
order by table_name;
```

Expected: exactly seven rows.

Do not migrate demo templates or implement approval RPCs.

## 5. `005_reports_signatures.sql`

Purpose:

- Creates version-bound reports, values, comments, report audit, signature profiles, and one consolidated signature-event stream.
- Establishes lifecycle timestamps and terminal-lock structure without implementing transitions.

Run: [005_reports_signatures.sql](/Users/apple/Desktop/gsk-task-1/supabase/migrations/005_reports_signatures.sql)

Expected result: six empty report/signature tables; no legacy `digital_signatures` table.

Verification query:

```sql
select
  to_regclass('public.reports') as reports,
  to_regclass('public.report_values') as report_values,
  to_regclass('public.report_comments') as report_comments,
  to_regclass('public.report_audit_events') as report_audit_events,
  to_regclass('public.signature_profiles') as signature_profiles,
  to_regclass('public.report_signature_events') as report_signature_events,
  to_regclass('public.digital_signatures') as legacy_digital_signatures;
```

Expected: the first six values are populated and `legacy_digital_signatures` is null.

Do not create report transition/signature functions or insert signatures.

## 6. `006_reusable_content.sql`

Purpose:

- Creates the Content Library, Admin Standard Packs with immutable versions/items, and user-owned Packs.

Run: [006_reusable_content.sql](/Users/apple/Desktop/gsk-task-1/supabase/migrations/006_reusable_content.sql)

Expected result: five empty reusable-content tables.

Verification query:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'content_library_items', 'standard_packs', 'standard_pack_versions',
    'standard_pack_items', 'user_packs'
  )
order by table_name;
```

Expected: exactly five rows.

Do not seed built-in/demo Packs, content items, or data fields.

## 7. `007_workflows.sql`

Purpose:

- Creates workflow definitions, immutable versions, instances, tasks, and append-only-ready events.
- Uses UUID role/user assignments instead of legacy role strings.

Run: [007_workflows.sql](/Users/apple/Desktop/gsk-task-1/supabase/migrations/007_workflows.sql)

Expected result: five empty workflow tables.

Verification query:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'workflow_tasks'
  and column_name in ('assigned_role_id', 'assigned_role', 'assigned_user_id', 'claimed_by_user_id')
order by column_name;
```

Expected: `assigned_role_id`, `assigned_user_id`, and `claimed_by_user_id`; no `assigned_role` row.

Do not enable workflows as production authority or create action RPCs.

## 8. `008_notifications_assets_audit.sql`

Purpose:

- Creates notifications, future private-Storage metadata, Admin audit events, and application Auth events.
- Completes signature-to-asset foreign keys.

Run: [008_notifications_assets_audit.sql](/Users/apple/Desktop/gsk-task-1/supabase/migrations/008_notifications_assets_audit.sql)

Expected result: four new empty tables and validated asset foreign keys.

Verification query:

```sql
select
  to_regclass('public.notifications') as notifications,
  to_regclass('public.asset_metadata') as asset_metadata,
  to_regclass('public.admin_audit_events') as admin_audit_events,
  to_regclass('public.application_auth_events') as application_auth_events,
  (select count(*) from private.widgetflow_schema_migrations where id = '008_notifications_assets_audit') as migration_count;
```

Expected: all four table values are populated and `migration_count = 1`.

Do not create Storage buckets or place service/secret credentials in SQL.

## 9. `009_security_baseline.sql`

Purpose:

- Enables RLS on all 37 public WidgetFlow tables.
- Revokes every table privilege from `anon` and `authenticated`.
- Creates no policies, leaving the Data API deny-by-default.

Run: [009_security_baseline.sql](/Users/apple/Desktop/gsk-task-1/supabase/migrations/009_security_baseline.sql)

Expected result: security baseline commits and migration `009_security_baseline` is recorded.

Verification query:

```sql
select
  count(*) filter (where c.relrowsecurity) as rls_enabled_count,
  count(*) as widgetflow_table_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'roles', 'permissions', 'role_permissions', 'profiles', 'user_role_history',
    'categories', 'feature_settings', 'element_settings', 'system_settings', 'governance_routes',
    'templates', 'template_sections', 'template_fields', 'template_tags', 'template_versions',
    'template_comments', 'template_audit_events', 'reports', 'report_values', 'report_comments',
    'report_audit_events', 'signature_profiles', 'report_signature_events', 'content_library_items',
    'standard_packs', 'standard_pack_versions', 'standard_pack_items', 'user_packs',
    'workflow_definitions', 'workflow_versions', 'workflow_instances', 'workflow_tasks',
    'workflow_events', 'notifications', 'asset_metadata', 'admin_audit_events',
    'application_auth_events'
  );
```

Expected: `rls_enabled_count = 37`, `widgetflow_table_count = 37`.

Do not add permissive policies or broad grants. Phase 2/3 will introduce reviewed grants and row-specific policies together.

## Final Phase 1 verification

Open and run [phase1_verify.sql](/Users/apple/Desktop/gsk-task-1/supabase/verification/phase1_verify.sql). It contains read-only `SELECT` statements only.

Review every result against the expected result in its preceding comment. In particular confirm:

- Nine ledger rows are applied.
- All 37 application tables exist and have RLS enabled.
- Policy count is zero.
- `anon` and `authenticated` have zero WidgetFlow table privileges.
- There are four System roles, 37 permissions, and zero profiles.
- There are no demo identities.
- No local credential/session/invitation/reset-token tables exist.
- No `SECURITY DEFINER` WidgetFlow function exists.
- Workflow role assignment is UUID-backed.

If any result differs, stop. Do not create the first Admin and do not proceed to Phase 2 until the discrepancy is reviewed.
