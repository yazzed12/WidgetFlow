-- WidgetFlow Phase 3B read-only verification. Run after migrations 017-020.
-- Every statement in this file is a SELECT.

select id, description, applied_at
from private.widgetflow_schema_migrations
where id in ('017_edge_function_service_reads', '018_configuration_read_access',
  '019_admin_configuration_domain_operations', '020_configuration_operational_access')
order by id;

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (
  'feature_settings', 'element_settings', 'system_settings', 'governance_routes',
  'content_library_items', 'standard_packs', 'standard_pack_versions', 'standard_pack_items'
)
order by c.relname;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in (
  'feature_settings', 'element_settings', 'system_settings', 'governance_routes',
  'content_library_items', 'standard_packs', 'standard_pack_versions', 'standard_pack_items'
)
order by tablename, policyname;

select 'no_anon_phase3b_policies' as check_name, not exists (
  select 1 from pg_policies where schemaname = 'public'
    and tablename in ('feature_settings','element_settings','system_settings','governance_routes',
      'content_library_items','standard_packs','standard_pack_versions','standard_pack_items')
    and 'anon' = any(roles)
) as passed;

select 'no_broad_true_phase3b_policies' as check_name, not exists (
  select 1 from pg_policies where schemaname = 'public'
    and tablename in ('feature_settings','element_settings','system_settings','governance_routes',
      'content_library_items','standard_packs','standard_pack_versions','standard_pack_items')
    and regexp_replace(coalesce(qual, ''), '\s', '', 'g') in ('true', '(true)')
) as passed;

select 'authenticated_configuration_writes_denied' as check_name, not exists (
  select 1 from information_schema.role_table_grants where table_schema = 'public'
    and grantee = 'authenticated'
    and table_name in ('feature_settings','element_settings','system_settings','governance_routes','content_library_items')
    and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
) as passed;

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated','service_role')
  and table_name in ('roles','profiles','feature_settings','element_settings','system_settings',
    'governance_routes','content_library_items','standard_packs','standard_pack_versions','standard_pack_items')
order by table_name, grantee, privilege_type;

select 'service_role_017_profile_role_select_only' as check_name,
  has_table_privilege('service_role', 'public.roles', 'SELECT')
  and has_table_privilege('service_role', 'public.profiles', 'SELECT')
  and not has_table_privilege('service_role', 'public.roles', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_table_privilege('service_role', 'public.profiles', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  as passed;

select n.nspname as schema_name, p.proname, p.prosecdef as security_definer, p.proconfig,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where acl.grantee = 0 and acl.privilege_type = 'EXECUTE') as public_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'public' and p.proname in (
  'current_effective_system_config','admin_set_feature_enabled','admin_set_element_enabled',
  'admin_update_system_settings','admin_create_content_library_item',
  'admin_update_content_library_item','admin_set_content_library_item_enabled',
  'admin_update_governance_routes'
)) or (n.nspname = 'private' and p.proname = 'validate_governance_route')
order by n.nspname, p.proname;

select key, name, role_type, governance_level, is_active, is_protected
from public.roles where lower(btrim(key)) = 'admin';

select 'permission_catalog_has_37_rows' as check_name,
  (select count(*) from public.permissions) = 37 as passed;

select 'all_profiles_are_valid' as check_name, not exists (
  select 1 from public.profiles p left join public.roles r on r.id = p.role_id
  where p.profile_code is null or btrim(p.profile_code) = '' or r.id is null
    or p.status not in ('Active','Inactive','Resigned','Terminated')
) as passed;

select 'protected_admin_exists' as check_name, exists (
  select 1 from public.profiles p join public.roles r on r.id = p.role_id
  where p.status = 'Active' and r.is_active and r.role_type = 'System'
    and lower(btrim(r.key)) = 'admin' and r.is_protected
) as passed;

select 'no_legacy_auth_tables' as check_name, not exists (
  select 1 from information_schema.tables where table_schema = 'public'
    and table_name in ('sessions','credentials','password_reset_tokens','auth_users')
) as passed;

select c.relname as source_table, t.tgname, t.tgenabled, t.tgdeferrable, t.tginitdeferred
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal and t.tgname in (
  'profiles_governance_reviewer_guard','roles_governance_reviewer_guard',
  'role_permissions_governance_reviewer_guard','admin_audit_events_append_only'
)
order by c.relname, t.tgname;

select 'operational_content_policy_requires_enabled' as check_name, exists (
  select 1 from pg_policies where schemaname = 'public' and tablename = 'content_library_items'
    and policyname = 'content_library_items_select_operational' and lower(qual) like '%is_enabled%'
) as passed;

select 'operational_pack_policies_require_published' as check_name,
  (select count(*) from pg_policies where schemaname = 'public'
    and tablename in ('standard_packs','standard_pack_versions')
    and policyname like '%select_operational' and lower(qual) like '%published%') = 2 as passed;

select 'current_caller_is_active_protected_admin' as check_name,
  private.current_user_is_protected_admin() as passed;
