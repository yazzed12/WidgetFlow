-- Migration 049 verification
-- READ-ONLY
-- Run manually AFTER applying Migration 049.


-- ============================================================
-- 1. MIGRATION CHAIN
-- ============================================================

select
  exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '048_signature_import_storage'
  ) as migration_048_exists,

  exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '049_signature_asset_resolution'
  ) as migration_049_exists;


-- ============================================================
-- 2. FUNCTION INVENTORY
-- ============================================================

select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.prosecdef as security_definer,
  p.proconfig,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_my_signature_asset',
    'resolve_report_signature_asset'
  )
order by p.proname;


-- ============================================================
-- 3. FUNCTION PRIVILEGES
-- ============================================================

select
  has_function_privilege(
    'authenticated',
    'public.get_my_signature_asset()',
    'EXECUTE'
  ) as own_authenticated_execute,

  has_function_privilege(
    'authenticated',
    'public.resolve_report_signature_asset(uuid,uuid)',
    'EXECUTE'
  ) as report_authenticated_execute,

  not has_function_privilege(
    'anon',
    'public.get_my_signature_asset()',
    'EXECUTE'
  ) as own_anon_denied,

  not has_function_privilege(
    'anon',
    'public.resolve_report_signature_asset(uuid,uuid)',
    'EXECUTE'
  ) as report_anon_denied,

  not has_function_privilege(
    'public',
    'public.get_my_signature_asset()',
    'EXECUTE'
  ) as own_public_denied,

  not has_function_privilege(
    'public',
    'public.resolve_report_signature_asset(uuid,uuid)',
    'EXECUTE'
  ) as report_public_denied;


-- ============================================================
-- 4. FUNCTION HARDENING
-- ============================================================

with fn as (
  select
    p.proname,
    p.prosecdef,
    p.proconfig,
    pg_get_functiondef(p.oid) as body
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'get_my_signature_asset',
      'resolve_report_signature_asset'
    )
)
select
  proname,

  prosecdef as security_definer,

  coalesce(
    array_to_string(proconfig, ','),
    ''
  ) ilike '%search_path=""%'
    as empty_search_path,

  position('auth.uid()' in body) > 0
    as derives_caller_from_auth_uid,

  position('p_user_id' in body) = 0
    as no_user_id_parameter,

  position('public.asset_metadata' in body) > 0
    as uses_canonical_asset_metadata,

  position('widgetflow-signatures' in body) > 0
    as checks_private_bucket,

  position('image/png' in body) > 0
    as checks_png_mime,

  position('asset_purpose' in body) > 0
    as checks_asset_purpose,

  position('lifecycle_state' in body) > 0
    as checks_lifecycle_state

from fn
order by proname;


-- ============================================================
-- 5. OWN PROFILE RESOLVER
-- ============================================================

with fn as (
  select pg_get_functiondef(p.oid) as body
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_my_signature_asset'
)
select
  position('private.current_user_is_active()' in body) > 0
    as checks_active_profile,

  position('coalesce(private.current_user_is_active(), false)' in body) > 0
    as active_check_null_safe,

  position('public.signature_profiles' in body) > 0
    as checks_signature_profile,

  position('sp.user_id = actor_id' in body) > 0
    as profile_owned_by_caller,

  position('sp.is_active' in body) > 0
    as profile_must_be_active,

  position('signature_method' in body) > 0
    as checks_uploaded_method,

  position('am.owner_user_id = actor_id' in body) > 0
    as asset_owned_by_caller,

  position('signature_profile' in body) > 0
    as signature_asset_purpose,

  position('am.object_path' in body) > 0
    as validates_object_path

from fn;


-- ============================================================
-- 6. REPORT RESOLVER
-- ============================================================

with fn as (
  select pg_get_functiondef(p.oid) as body
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'resolve_report_signature_asset'
)
select
  position('p_report_id uuid' in body) > 0
    as requires_report_id,

  position('p_signature_asset_id uuid' in body) > 0
    as requires_asset_id,

  position('private.current_user_can_read_report(p_report_id)' in body) > 0
    as reuses_report_visibility_helper,

  position(
    'coalesce(' in body
  ) > 0
    and position(
      'private.current_user_can_read_report(p_report_id)' in body
    ) > 0
    as report_visibility_null_safe,

  position('public.report_values' in body) > 0
    as checks_report_values_snapshot,

  position('signatureAssetId' in body) > 0
    as checks_camelcase_snapshot_asset,

  position('signature_asset_id' in body) > 0
    as checks_snakecase_snapshot_asset,

  position('public.report_signature_events' in body) > 0
    as checks_historical_signature_events,

  position('SIGNATURE_ASSET_NOT_REFERENCED_BY_REPORT' in body) > 0
    as rejects_unreferenced_assets,

  position('am.owner_user_id is not null' in body) > 0
    as requires_asset_owner,

  position('am.owner_user_id::text' in body) > 0
    as validates_owner_path_consistency,

  position('public.signature_profiles' in body) = 0
    as does_not_use_current_profile_for_history

from fn;


-- ============================================================
-- 7. PRIVATE STORAGE BUCKET
-- ============================================================

select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,

  public = false
    as bucket_is_private,

  file_size_limit = 10485760
    as bucket_size_limit_pass,

  allowed_mime_types = array['image/png']::text[]
    as bucket_png_only_pass

from storage.buckets
where id = 'widgetflow-signatures';


-- ============================================================
-- 8. MIGRATION 048 STORAGE POLICIES STILL PRESENT
-- ============================================================

select
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname in (
    'widgetflow_signature_objects_insert',
    'widgetflow_signature_objects_select'
  )
order by policyname;


-- ============================================================
-- 9. DIRECT ASSET TABLE ACCESS REMAINS CLOSED
-- ============================================================

select
  has_table_privilege(
    'anon',
    'public.asset_metadata',
    'SELECT'
  ) as anon_asset_select,

  has_table_privilege(
    'authenticated',
    'public.asset_metadata',
    'SELECT'
  ) as authenticated_asset_select,

  has_table_privilege(
    'anon',
    'public.asset_metadata',
    'INSERT'
  ) as anon_asset_insert,

  has_table_privilege(
    'authenticated',
    'public.asset_metadata',
    'INSERT'
  ) as authenticated_asset_insert;


-- ============================================================
-- 10. REPORT CORE OBJECTS STILL PRESENT
-- ============================================================

select
  to_regclass('public.reports') is not null
    as reports_present,

  to_regclass('public.report_values') is not null
    as report_values_present,

  to_regclass('public.report_assignments') is not null
    as assignments_present,

  to_regclass('public.report_signature_assignments') is not null
    as signature_assignments_present,

  to_regclass('public.report_signature_events') is not null
    as signature_events_present;


-- ============================================================
-- 11. FINAL SUMMARY
-- ============================================================

with migration_check as (
  select
    exists (
      select 1
      from private.widgetflow_schema_migrations
      where id = '048_signature_import_storage'
    )
    and
    exists (
      select 1
      from private.widgetflow_schema_migrations
      where id = '049_signature_asset_resolution'
    ) as pass
),

bucket_check as (
  select exists (
    select 1
    from storage.buckets
    where id = 'widgetflow-signatures'
      and public = false
      and file_size_limit = 10485760
      and allowed_mime_types = array['image/png']::text[]
  ) as pass
),

rpc_check as (
  select
    has_function_privilege(
      'authenticated',
      'public.get_my_signature_asset()',
      'EXECUTE'
    )
    and
    has_function_privilege(
      'authenticated',
      'public.resolve_report_signature_asset(uuid,uuid)',
      'EXECUTE'
    )
    and
    not has_function_privilege(
      'anon',
      'public.get_my_signature_asset()',
      'EXECUTE'
    )
    and
    not has_function_privilege(
      'anon',
      'public.resolve_report_signature_asset(uuid,uuid)',
      'EXECUTE'
    )
    and
    not has_function_privilege(
      'public',
      'public.get_my_signature_asset()',
      'EXECUTE'
    )
    and
    not has_function_privilege(
      'public',
      'public.resolve_report_signature_asset(uuid,uuid)',
      'EXECUTE'
    ) as pass
),

reference_check as (
  select
    position(
      'public.report_values'
      in pg_get_functiondef(p.oid)
    ) > 0
    and
    position(
      'public.report_signature_events'
      in pg_get_functiondef(p.oid)
    ) > 0
    and
    position(
      'private.current_user_can_read_report(p_report_id)'
      in pg_get_functiondef(p.oid)
    ) > 0
    as pass
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'resolve_report_signature_asset'
)

select
  (select pass from migration_check)
    as migration_chain_pass,

  (select pass from bucket_check)
    as private_bucket_pass,

  (select pass from rpc_check)
    as rpc_security_pass,

  (select pass from reference_check)
    as report_reference_pass;