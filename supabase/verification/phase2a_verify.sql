-- WidgetFlow Phase 2A verification (READ-ONLY).
-- Run after migrations 010-012. Every statement below is observational.

-- Expected: exactly three rows, in order, each applied once.
select id, description, applied_at
from private.widgetflow_schema_migrations
where id in (
  '010_authz_principal_rls',
  '011_admin_domain_security',
  '012_auth_audit_security'
)
order by id;

-- Expected: all seven rows show rls_enabled = true.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'profiles', 'roles', 'permissions', 'role_permissions',
    'user_role_history', 'admin_audit_events', 'application_auth_events'
  )
order by c.relname;

-- Expected: the seven Phase 2A SELECT policies, all restricted to authenticated.
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles', 'roles', 'permissions', 'role_permissions',
    'user_role_history', 'admin_audit_events', 'application_auth_events'
  )
order by tablename, policyname;

-- Expected: zero rows. No broad true policy may exist.
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and (
    lower(pg_catalog.regexp_replace(coalesce(qual, ''), '\s', '', 'g')) in ('true', '(true)')
    or lower(pg_catalog.regexp_replace(coalesce(with_check, ''), '\s', '', 'g')) in ('true', '(true)')
  );

-- Expected: zero rows. anon must not appear on these policies.
select schemaname, tablename, policyname, roles
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles', 'roles', 'permissions', 'role_permissions',
    'user_role_history', 'admin_audit_events', 'application_auth_events'
  )
  and 'anon' = any(roles);

-- Expected: authenticated has SELECT=true and all write privilege flags=false.
select
  c.relname as table_name,
  pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
  pg_catalog.has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_insert,
  pg_catalog.has_table_privilege('authenticated', c.oid, 'UPDATE') as authenticated_update,
  pg_catalog.has_table_privilege('authenticated', c.oid, 'DELETE') as authenticated_delete,
  pg_catalog.has_table_privilege('authenticated', c.oid, 'TRUNCATE') as authenticated_truncate,
  pg_catalog.has_table_privilege('authenticated', c.oid, 'REFERENCES') as authenticated_references,
  pg_catalog.has_table_privilege('authenticated', c.oid, 'TRIGGER') as authenticated_trigger
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'profiles', 'roles', 'permissions', 'role_permissions',
    'user_role_history', 'admin_audit_events', 'application_auth_events'
  )
order by c.relname;

-- Expected: all anon privilege flags are false.
select
  c.relname as table_name,
  pg_catalog.has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
  pg_catalog.has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
  pg_catalog.has_table_privilege('anon', c.oid, 'UPDATE') as anon_update,
  pg_catalog.has_table_privilege('anon', c.oid, 'DELETE') as anon_delete
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'profiles', 'roles', 'permissions', 'role_permissions',
    'user_role_history', 'admin_audit_events', 'application_auth_events'
  )
order by c.relname;

-- Expected: every listed function is SECURITY DEFINER and has search_path="".
select
  n.nspname as function_schema,
  p.proname as function_name,
  p.prosecdef as security_definer,
  p.proconfig as function_configuration
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where (n.nspname, p.proname) in (
  ('private', 'current_role_id'),
  ('private', 'current_user_is_active'),
  ('private', 'current_user_is_protected_admin'),
  ('private', 'current_user_has_permission'),
  ('private', 'is_protected_admin_user'),
  ('private', 'active_protected_admin_count'),
  ('private', 'write_admin_audit'),
  ('public', 'current_principal'),
  ('public', 'admin_create_profile_domain'),
  ('public', 'admin_create_admin_profile_domain'),
  ('public', 'admin_set_profile_status_domain'),
  ('public', 'admin_change_profile_role_domain'),
  ('public', 'admin_record_password_reset_domain'),
  ('public', 'admin_record_account_create_failure_domain')
)
order by n.nspname, p.proname;

-- Expected:
-- * current_principal: authenticated=true, anon=false
-- * public admin_* functions: service_role=true, authenticated=false, anon=false
-- * private arbitrary-user/internal functions: no browser execution.
select
  n.nspname as function_schema,
  p.proname as function_name,
  pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('private', 'public')
  and (
    p.proname in (
      'current_role_id', 'current_user_is_active',
      'current_user_is_protected_admin', 'current_user_has_permission',
      'is_protected_admin_user', 'active_protected_admin_count',
      'write_admin_audit', 'current_principal'
    )
    or p.proname like 'admin\_%' escape '\'
  )
order by n.nspname, p.proname;

-- Expected: one row; System/None/active/protected are all true for the Admin role.
select id, key, name, role_type, governance_level, is_active, is_protected
from public.roles
where lower(btrim(key)) = 'admin';

-- Expected baseline before bootstrap: profiles=0, roles=4, permissions=37.
-- Profile count increases after bootstrap/account creation; role count may increase
-- when custom roles are added in a later verified phase.
select
  (select count(*) from public.profiles) as profile_count,
  (select count(*) from public.roles) as role_count,
  (select count(*) from public.permissions) as permission_count,
  (select count(*) from public.admin_audit_events) as admin_audit_count,
  (select count(*) from public.application_auth_events) as application_auth_event_count;

-- Expected: zero rows. Detects the known local seed identities without embedding
-- their literal names or IDs in this artifact.
with forbidden_identity(value) as (
  select lower(value)
  from unnest(array[
    'Ah' || 'med',
    'Sa' || 'rah',
    'Om' || 'ar',
    'Li' || 'na'
  ]) as values_to_check(value)
)
select p.id, p.full_name, p.email
from public.profiles p
where exists (
  select 1
  from forbidden_identity f
  where lower(p.full_name) like '%' || f.value || '%'
);

-- Expected: zero rows. Supabase Auth owns credentials and sessions.
with forbidden_table(table_name) as (
  select value
  from unnest(array[
    'user_' || 'credentials',
    'auth_' || 'sessions',
    'user_' || 'invitations',
    'password_' || 'reset_tokens'
  ]) as forbidden(value)
)
select n.nspname as schema_name, c.relname as table_name
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
join forbidden_table f on f.table_name = c.relname
where n.nspname = 'public'
  and c.relkind in ('r', 'p');

-- Expected: all three append-only triggers are enabled (tgenabled = O).
select c.relname as table_name, t.tgname as trigger_name, t.tgenabled
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid = t.tgrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and t.tgname in (
    'user_role_history_append_only',
    'admin_audit_events_append_only',
    'application_auth_events_append_only'
  )
order by c.relname;
