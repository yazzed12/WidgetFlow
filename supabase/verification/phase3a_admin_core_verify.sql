-- WidgetFlow Phase 3A read-only verification. Run after migrations 014-016.
-- This file intentionally performs SELECT statements only.

select id, description, applied_at
from private.widgetflow_schema_migrations
where id in ('014_admin_core_read_access', '015_admin_core_domain_operations', '016_admin_governance_dependency_guards')
order by id;

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('categories', 'standard_packs', 'standard_pack_versions', 'standard_pack_items');

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('categories', 'standard_packs', 'standard_pack_versions', 'standard_pack_items')
order by tablename, policyname;

select 'no_anon_phase3a_policies' as check_name,
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('categories', 'standard_packs', 'standard_pack_versions', 'standard_pack_items')
      and 'anon' = any(roles)
  ) as passed;

select 'no_broad_true_phase3a_policies' as check_name,
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('categories', 'standard_packs', 'standard_pack_versions', 'standard_pack_items')
      and regexp_replace(coalesce(qual, ''), '\\s', '', 'g') in ('true', '(true)')
  ) as passed;

select table_name, privilege_type, grantee
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('profiles', 'roles', 'role_permissions', 'categories', 'standard_packs', 'standard_pack_versions', 'standard_pack_items')
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

select 'no_authenticated_sensitive_writes' as check_name,
  not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'authenticated'
      and table_name in ('profiles', 'roles', 'role_permissions', 'user_role_history', 'admin_audit_events')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
  ) as passed;

select 'packs_authenticated_select_only' as check_name,
  not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'authenticated'
      and table_name in ('standard_packs', 'standard_pack_versions', 'standard_pack_items')
      and privilege_type <> 'SELECT'
  ) as passed;

select n.nspname as schema_name, p.proname, p.prosecdef as security_definer, p.proconfig,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  exists (
    select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ) as public_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'public' and p.proname in (
    'admin_overview_summary', 'admin_create_custom_role', 'admin_update_role',
    'admin_create_category', 'admin_update_category'
  ))
  or (n.nspname = 'private' and p.proname in (
    'validate_permission_keys', 'enforce_governance_reviewer_dependencies'
  ))
order by n.nspname, p.proname;

select key, name, role_type, governance_level, is_active, is_protected
from public.roles where lower(btrim(key)) = 'admin';

select 'permission_catalog_has_37_rows' as check_name,
  (select count(*) from public.permissions) = 37 as passed;

select 'active_protected_admin_exists' as check_name,
  exists (
    select 1 from public.profiles p join public.roles r on r.id = p.role_id
    where p.status = 'Active' and r.is_active and r.role_type = 'System'
      and lower(btrim(r.key)) = 'admin' and r.is_protected
  ) as passed;

select 'all_profiles_have_profile_code' as check_name,
  not exists (select 1 from public.profiles where profile_code is null or btrim(profile_code) = '') as passed;

select 'no_legacy_auth_tables' as check_name,
  not exists (
    select 1 from information_schema.tables where table_schema = 'public'
      and table_name in ('sessions', 'credentials', 'password_reset_tokens', 'auth_users')
  ) as passed;

select tgrelid::regclass as guarded_table, tgname, tgenabled, tgdeferrable, tginitdeferred
from pg_trigger
where not tgisinternal and tgname in (
  'profiles_governance_reviewer_guard', 'roles_governance_reviewer_guard',
  'role_permissions_governance_reviewer_guard', 'admin_audit_events_append_only',
  'application_auth_events_append_only', 'user_role_history_append_only'
)
order by guarded_table::text, tgname;

select 'current_caller_is_active_protected_admin' as check_name,
  private.current_user_is_protected_admin() as passed;
