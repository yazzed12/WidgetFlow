-- Read-only verification for Migration 045.


select id, description
from private.widgetflow_schema_migrations
where id in (
  '044_signature_profile_v2_foundation',
  '045_signature_self_service'
)
order by id;


select
  p.oid::regprocedure as function_signature,
  p.prosecdef as security_definer,

  exists (
    select 1
    from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
    where cfg in (
      'search_path=""',
      'search_path='
    )
  ) as empty_search_path,

  has_function_privilege(
    'authenticated',
    p.oid,
    'EXECUTE'
  ) as authenticated_execute,

  has_function_privilege(
    'anon',
    p.oid,
    'EXECUTE'
  ) as anon_execute,

  coalesce(
    (
      select bool_or(
        acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
      )
      from aclexplode(
        coalesce(
          p.proacl,
          acldefault('f', p.proowner)
        )
      ) acl
    ),
    false
  ) as public_execute,

  pg_get_functiondef(p.oid) like '%auth.uid()%'
    as uses_auth_uid,

  pg_get_functiondef(p.oid) like '%public.profiles%'
    as checks_application_profile,

  pg_get_functiondef(p.oid) like '%PROFILE_INACTIVE_OR_MISSING%'
    as blocks_inactive_or_missing_profile,

  pg_get_functiondef(p.oid) like '%signature_profiles%'
    as references_signature_profiles,

  pg_get_functiondef(p.oid) like '%typed_font_key%'
    as handles_typed_font,

  pg_get_functiondef(p.oid) like '%TYPED_NAME_REQUIRED%'
    as validates_typed_name,

  pg_get_functiondef(p.oid) like '%DRAWING_INVALID%'
    as validates_drawing,

  pg_get_functiondef(p.oid) like '%jsonb_typeof(point -> ''x'') <> ''number''%'
    and pg_get_functiondef(p.oid) like '%jsonb_typeof(point -> ''y'') <> ''number''%'
    as requires_numeric_json_coordinates,

  pg_get_functiondef(p.oid) like '%meaningful_stroke%'
    as checks_meaningful_stroke,

  pg_get_functiondef(p.oid) like '%UPLOADED_SIGNATURE_STORAGE_UNAVAILABLE%'
    as uploaded_blocked_without_safe_storage,

  pg_get_functiondef(p.oid) like '%source_image_filename%'
    and pg_get_functiondef(p.oid) like '%extraction_version%'
    as handles_v2_metadata,

  pg_get_functiondef(p.oid) like '%drawing_data = null%'
    and pg_get_functiondef(p.oid) like '%signature_asset_id = null%'
    as clears_incompatible_fields,

  pg_get_functiondef(p.oid) like '%updated_at = statement_timestamp()%'
    as updates_timestamp,

  pg_get_functiondef(p.oid) not like '%p_user_id%'
    as no_user_id_parameter

from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_my_signature_profile',
    'save_my_signature_profile'
  )
order by p.proname;


select
  has_table_privilege(
    'authenticated',
    'public.signature_profiles',
    'INSERT'
  ) as authenticated_insert,

  has_table_privilege(
    'authenticated',
    'public.signature_profiles',
    'UPDATE'
  ) as authenticated_update,

  has_table_privilege(
    'authenticated',
    'public.signature_profiles',
    'DELETE'
  ) as authenticated_delete;


select
  exists (
    select 1
    from pg_class c
    join pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'report_values'
  ) as report_values_present,

  exists (
    select 1
    from pg_class c
    join pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'report_signature_events'
  ) as report_signature_events_present,

  exists (
    select 1
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'send_report'
  ) as send_report_present,

  exists (
    select 1
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'sign_report'
  ) as sign_report_present;