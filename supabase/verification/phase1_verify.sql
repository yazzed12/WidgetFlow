-- WidgetFlow Phase 1 verification package.
-- READ ONLY: this file contains SELECT statements only.
-- Run only after migrations 001 through 009 have all succeeded.

-- 1. Migration ledger.
-- Expected: nine rows, all with status = APPLIED, ordered 001 through 009.
with expected(id) as (
  values
    ('001_foundation'),
    ('002_identity_roles_permissions'),
    ('003_configuration_governance'),
    ('004_templates'),
    ('005_reports_signatures'),
    ('006_reusable_content'),
    ('007_workflows'),
    ('008_notifications_assets_audit'),
    ('009_security_baseline')
)
select
  e.id,
  case when m.id is null then 'MISSING' else 'APPLIED' end as status,
  m.description,
  m.applied_at
from expected e
left join private.widgetflow_schema_migrations m using (id)
order by e.id;

-- 2. Expected application tables.
-- Expected: 37 rows and every status = PRESENT.
with expected(table_name) as (
  select unnest(array[
    'roles', 'permissions', 'role_permissions', 'profiles', 'user_role_history',
    'categories', 'feature_settings', 'element_settings', 'system_settings', 'governance_routes',
    'templates', 'template_sections', 'template_fields', 'template_tags', 'template_versions',
    'template_comments', 'template_audit_events', 'reports', 'report_values', 'report_comments',
    'report_audit_events', 'signature_profiles', 'report_signature_events', 'content_library_items',
    'standard_packs', 'standard_pack_versions', 'standard_pack_items', 'user_packs',
    'workflow_definitions', 'workflow_versions', 'workflow_instances', 'workflow_tasks',
    'workflow_events', 'notifications', 'asset_metadata', 'admin_audit_events',
    'application_auth_events'
  ]::text[])
)
select
  e.table_name,
  case when t.table_name is null then 'MISSING' else 'PRESENT' end as status
from expected e
left join information_schema.tables t
  on t.table_schema = 'public' and t.table_name = e.table_name
order by e.table_name;

-- 3. Foreign keys are present and validated.
-- Expected: every row has constraint_validated = true; no rows should identify an unexpected delete action.
select
  source.relname as source_table,
  con.conname as constraint_name,
  target_namespace.nspname || '.' || target.relname as target_table,
  case con.confdeltype
    when 'a' then 'NO ACTION'
    when 'r' then 'RESTRICT'
    when 'c' then 'CASCADE'
    when 'n' then 'SET NULL'
    when 'd' then 'SET DEFAULT'
  end as on_delete,
  con.convalidated as constraint_validated
from pg_constraint con
join pg_class source on source.oid = con.conrelid
join pg_namespace source_namespace on source_namespace.oid = source.relnamespace
join pg_class target on target.oid = con.confrelid
join pg_namespace target_namespace on target_namespace.oid = target.relnamespace
where con.contype = 'f'
  and source_namespace.nspname = 'public'
order by source.relname, con.conname;

-- 4. Required high-value indexes.
-- Expected: every row has status = PRESENT.
with expected(index_name) as (
  select unnest(array[
    'roles_key_normalized_uq', 'roles_name_normalized_uq', 'profiles_email_normalized_uq',
    'profiles_role_status_idx', 'profiles_manager_idx', 'categories_name_normalized_uq',
    'governance_routes_active_level_uq', 'templates_creator_status_idx',
    'templates_status_category_idx', 'templates_unclaimed_role_queue_idx',
    'templates_reviewer_pending_idx', 'template_versions_template_published_idx',
    'reports_creator_status_idx', 'reports_recipient_status_idx', 'reports_status_updated_idx',
    'report_audit_report_time_idx', 'report_signature_events_report_time_idx',
    'user_packs_owner_name_uq', 'standard_pack_versions_pack_status_idx',
    'workflow_tasks_user_pending_idx', 'workflow_tasks_role_pending_idx',
    'workflow_events_instance_time_idx', 'notifications_recipient_unread_idx',
    'asset_metadata_owner_state_idx', 'admin_audit_time_idx'
  ]::text[])
)
select
  e.index_name,
  case when i.indexname is null then 'MISSING' else 'PRESENT' end as status
from expected e
left join pg_indexes i
  on i.schemaname = 'public' and i.indexname = e.index_name
order by e.index_name;

-- 5. RLS baseline.
-- Expected: 37 rows; rls_enabled = true on every row.
with expected(table_name) as (
  select unnest(array[
    'roles', 'permissions', 'role_permissions', 'profiles', 'user_role_history',
    'categories', 'feature_settings', 'element_settings', 'system_settings', 'governance_routes',
    'templates', 'template_sections', 'template_fields', 'template_tags', 'template_versions',
    'template_comments', 'template_audit_events', 'reports', 'report_values', 'report_comments',
    'report_audit_events', 'signature_profiles', 'report_signature_events', 'content_library_items',
    'standard_packs', 'standard_pack_versions', 'standard_pack_items', 'user_packs',
    'workflow_definitions', 'workflow_versions', 'workflow_instances', 'workflow_tasks',
    'workflow_events', 'notifications', 'asset_metadata', 'admin_audit_events',
    'application_auth_events'
  ]::text[])
)
select
  e.table_name,
  coalesce(c.relrowsecurity, false) as rls_enabled
from expected e
left join (
  pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
) on c.relname = e.table_name
order by e.table_name;

-- 6. Phase 1 intentionally has no Data API policies yet.
-- Expected: policy_count = 0.
select count(*) as policy_count
from pg_policies
where schemaname = 'public'
  and tablename in (
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

-- 7. No dangerous unrestricted policy predicate.
-- Expected: zero rows.
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and (
    regexp_replace(coalesce(qual, ''), '[[:space:]]', '', 'g') in ('true', '(true)')
    or regexp_replace(coalesce(with_check, ''), '[[:space:]]', '', 'g') in ('true', '(true)')
  );

-- 8. anon/authenticated have no table privileges on WidgetFlow application tables.
-- Expected: zero rows.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and table_name in (
    'roles', 'permissions', 'role_permissions', 'profiles', 'user_role_history',
    'categories', 'feature_settings', 'element_settings', 'system_settings', 'governance_routes',
    'templates', 'template_sections', 'template_fields', 'template_tags', 'template_versions',
    'template_comments', 'template_audit_events', 'reports', 'report_values', 'report_comments',
    'report_audit_events', 'signature_profiles', 'report_signature_events', 'content_library_items',
    'standard_packs', 'standard_pack_versions', 'standard_pack_items', 'user_packs',
    'workflow_definitions', 'workflow_versions', 'workflow_instances', 'workflow_tasks',
    'workflow_events', 'notifications', 'asset_metadata', 'admin_audit_events',
    'application_auth_events'
  )
order by grantee, table_name, privilege_type;

-- 9. Product system roles only; these are roles, not users.
-- Expected: exactly Employee, Manager, Director, Admin. Admin is protected and all are active.
select key, name, role_type, governance_level, is_active, is_protected
from public.roles
order by key;

-- 10. Permission catalog sourced from src/shared/permissionCatalog.ts.
-- Expected: permission_count = 37.
select count(*) as permission_count
from public.permissions;

-- 11. System-role permission counts.
-- Expected: employee = 33, manager = 36, director = 37, admin = 0.
select r.key as role_key, count(rp.permission_key) as permission_count
from public.roles r
left join public.role_permissions rp on rp.role_id = r.id
where r.role_type = 'System'
group by r.key
order by r.key;

-- 12. Production begins without WidgetFlow profiles.
-- Expected: profile_count = 0.
select count(*) as profile_count
from public.profiles;

-- 13. No legacy demo identities were seeded.
-- Expected: zero rows.
select id, full_name, email
from public.profiles
where lower(full_name) in ('ahmed hassan', 'sarah mohamed', 'omar ali', 'lina nasser')
   or lower(email) like '%demo%';

-- 14. Supabase Auth replacement tables were not recreated in public.
-- Expected: all values are null.
select
  to_regclass('public.user_credentials') as user_credentials,
  to_regclass('public.auth_sessions') as auth_sessions,
  to_regclass('public.user_invitations') as user_invitations,
  to_regclass('public.password_reset_tokens') as password_reset_tokens,
  to_regclass('public.digital_signatures') as legacy_digital_signatures;

-- 15. No SECURITY DEFINER WidgetFlow function exists.
-- Expected: zero rows. private.set_updated_at is SECURITY INVOKER.
select n.nspname as schema_name, p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
  and p.prosecdef;

-- 16. Workflow role authority is UUID-backed, not a legacy assigned_role string.
-- Expected: assigned_role_id exists; assigned_role does not.
select
  max((column_name = 'assigned_role_id')::int) as has_assigned_role_id,
  max((column_name = 'assigned_role')::int) as has_legacy_assigned_role
from information_schema.columns
where table_schema = 'public' and table_name = 'workflow_tasks';

-- 17. Governance remains separate from role identity.
-- Expected: governance_level exists on roles and creator_governance_level exists on routes.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'roles' and column_name = 'governance_level')
    or (table_name = 'governance_routes' and column_name = 'creator_governance_level')
  )
order by table_name, column_name;
