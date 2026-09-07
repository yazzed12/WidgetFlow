-- Phase 2C read-only verification. Run after applying 013_profile_codes.sql.
-- Every statement below is observational and performs no writes.

select
  '013 migration recorded' as check_name,
  exists (
    select 1 from private.widgetflow_schema_migrations
    where id = '013_profile_codes'
  ) as passed;

select
  'profile_code column shape' as check_name,
  c.data_type,
  c.is_nullable,
  (c.data_type = 'text' and c.is_nullable = 'NO') as passed
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'profiles'
  and c.column_name = 'profile_code';

select
  'profile_code unique constraint' as check_name,
  exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'profiles'
      and c.conname = 'profiles_profile_code_uq'
      and c.contype = 'u'
  ) as passed;

select
  'profile_code format constraint' as check_name,
  exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'profiles'
      and c.conname = 'profiles_profile_code_format_ck'
      and c.contype = 'c'
      and pg_catalog.pg_get_constraintdef(c.oid) like '%[0-9]{3,}%'
  ) as passed;

select
  'profile_code row integrity' as check_name,
  count(*) filter (where p.profile_code is null) as null_count,
  count(*) - count(distinct p.profile_code) as duplicate_count,
  count(*) filter (
    where p.profile_code !~ '^[A-Z]{2}-[0-9]{3,}-[0-9]{4}$'
  ) as invalid_format_count,
  count(*) filter (where p.profile_code is null) = 0
    and count(*) = count(distinct p.profile_code)
    and count(*) filter (
      where p.profile_code !~ '^[A-Z]{2}-[0-9]{3,}-[0-9]{4}$'
    ) = 0 as passed
from public.profiles p;

select
  'private counter posture' as check_name,
  pg_catalog.to_regclass('private.profile_code_counters') is not null as table_exists,
  not pg_catalog.has_table_privilege('anon', 'private.profile_code_counters', 'SELECT')
    and not pg_catalog.has_table_privilege('anon', 'private.profile_code_counters', 'INSERT')
    and not pg_catalog.has_table_privilege('anon', 'private.profile_code_counters', 'UPDATE')
    and not pg_catalog.has_table_privilege('authenticated', 'private.profile_code_counters', 'SELECT')
    and not pg_catalog.has_table_privilege('authenticated', 'private.profile_code_counters', 'INSERT')
    and not pg_catalog.has_table_privilege('authenticated', 'private.profile_code_counters', 'UPDATE')
    as passed;

select
  'private profile-code helpers' as check_name,
  pg_catalog.to_regprocedure('private.profile_code_prefix(uuid)') is not null
    and pg_catalog.to_regprocedure('private.next_profile_code(uuid,timestamp with time zone)') is not null
    and pg_catalog.to_regprocedure('private.assign_profile_code()') is not null
    and pg_catalog.to_regprocedure('private.protect_profile_code()') is not null
    as passed;

select
  'private helper execute grants' as check_name,
  not exists (
    select 1
    from information_schema.routine_privileges rp
    where rp.specific_schema = 'private'
      and rp.routine_name in (
        'profile_code_prefix',
        'next_profile_code',
        'assign_profile_code',
        'protect_profile_code'
      )
      and rp.grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
      and rp.privilege_type = 'EXECUTE'
  ) as passed;

select
  'profile-code triggers' as check_name,
  count(*) filter (where t.tgname = 'profiles_assign_profile_code') = 1
    and count(*) filter (where t.tgname = 'profiles_protect_profile_code') = 1
    as passed
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid = t.tgrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'profiles'
  and not t.tgisinternal;

select
  'existing protected Admin has profile code' as check_name,
  count(*) > 0
    and count(*) filter (where p.profile_code is null) = 0 as passed,
  array_agg(p.profile_code order by p.created_at, p.id) as admin_profile_codes
from public.profiles p
join public.roles r on r.id = p.role_id
where p.status = 'Active'
  and r.is_active
  and r.role_type = 'System'
  and lower(btrim(r.key)) = 'admin'
  and r.is_protected;

select
  'current_principal exposes profile_code' as check_name,
  pg_catalog.pg_get_function_result(
    pg_catalog.to_regprocedure('public.current_principal()')
  ) like '%profile_code text%' as passed;

select
  'profile UUID remains auth UUID' as check_name,
  count(*) filter (where u.id is null) = 0 as passed,
  count(*) filter (where u.id is null) as orphan_count
from public.profiles p
left join auth.users u on u.id = p.id;

select
  'profile UUID auth foreign key remains' as check_name,
  exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class child on child.oid = c.conrelid
    join pg_catalog.pg_namespace child_ns on child_ns.oid = child.relnamespace
    join pg_catalog.pg_class parent on parent.oid = c.confrelid
    join pg_catalog.pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
    where c.contype = 'f'
      and child_ns.nspname = 'public'
      and child.relname = 'profiles'
      and parent_ns.nspname = 'auth'
      and parent.relname = 'users'
  ) as passed;

select
  'role and status domain functions remain' as check_name,
  pg_catalog.to_regprocedure(
    'public.admin_change_profile_role_domain(uuid,uuid,uuid,text)'
  ) is not null
    and pg_catalog.to_regprocedure(
      'public.admin_set_profile_status_domain(uuid,uuid,text)'
    ) is not null as passed;

select
  'no browser profile writes' as check_name,
  not pg_catalog.has_table_privilege('anon', 'public.profiles', 'INSERT')
    and not pg_catalog.has_table_privilege('anon', 'public.profiles', 'UPDATE')
    and not pg_catalog.has_table_privilege('anon', 'public.profiles', 'DELETE')
    and not pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'INSERT')
    and not pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
    and not pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'DELETE')
    as passed;

select
  'migrations 001 through 012 remain recorded' as check_name,
  count(*) = 12 as passed,
  count(*) as recorded_count
from private.widgetflow_schema_migrations m
where m.id in (
  '001_foundation',
  '002_identity_roles_permissions',
  '003_configuration_governance',
  '004_templates',
  '005_reports_signatures',
  '006_reusable_content',
  '007_workflows',
  '008_notifications_assets_audit',
  '009_security_baseline',
  '010_authz_principal_rls',
  '011_admin_domain_security',
  '012_auth_audit_security'
);

select
  'role counts' as check_name,
  count(*) as total_roles,
  count(*) filter (
    where r.role_type = 'System'
      and lower(btrim(r.key)) in ('employee', 'manager', 'director', 'admin')
  ) as canonical_system_roles,
  count(*) filter (
    where r.role_type = 'System'
      and lower(btrim(r.key)) in ('employee', 'manager', 'director', 'admin')
  ) = 4 as passed
from public.roles r;

select
  'permission count' as check_name,
  count(*) as permission_count,
  count(*) = 37 as passed
from public.permissions;
