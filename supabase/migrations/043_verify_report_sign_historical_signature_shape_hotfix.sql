-- Read-only verification for Migration 043. Do not execute as part of migration deployment.

select id, description
from private.widgetflow_schema_migrations
where id in (
  '042_notifications_personal_access',
  '043_report_sign_historical_signature_shape_hotfix'
)
order by id;

with target as (
  select
    p.oid,
    p.oid::regprocedure as function_signature,
    p.prosecdef as security_definer,
    p.proconfig,
    pg_get_functiondef(p.oid) as function_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'sign_report'
    and oidvectortypes(p.proargtypes) = 'uuid, uuid, jsonb'
)
select
  function_signature,
  security_definer,
  coalesce(proconfig @> array['search_path='], false) as empty_search_path,
  has_function_privilege('authenticated', oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('anon', oid, 'EXECUTE') as anon_execute,
  has_function_privilege('public', oid, 'EXECUTE') as public_execute,

  function_def like '%report_signature_assignments%' as references_mapping,
  function_def like '%template_versions%'
    and function_def like '%schema_snapshot%' as references_snapshot,

  function_def like '%{configuration,signatureConfig,signatureRole}%'
    as supports_nested_configuration_signature_config,
  function_def like '%{configuration,signatureRole}%'
    as supports_nested_configuration_role,
  function_def like '%{configuration,field_key}%'
    and function_def like '%{configuration,key}%'
    as supports_nested_configuration_business_key,
  function_def like '%{configuration,field_type}%'
    and function_def like '%{configuration,type}%'
    as supports_nested_configuration_type,

  function_def not like '%value ->> ''id''%'
    and function_def not like '%value #>> ''{configuration,id}''%'
    as no_component_id_field_fallback,

  function_def like '%mapping_row.signature_field_key%'
    as writes_mapped_field_key,

  -- Specific non-regex checks for the report_values insert/upsert contract.
  -- Avoids regex portability/escaping problems in Supabase SQL Editor.
  function_def like '%insert into public.report_values%'
    and function_def like '%template_field_id,%'
    and function_def like '%report_row.id,%'
    and function_def like '%null,%'
    and function_def like '%mapping_row.signature_field_key,%'
    and function_def like '%do update set%'
    and function_def like '%template_field_id = null%'
    as preserves_null_template_field_id,

  function_def not like '%btrim(signature_row.drawing_data)%'
    as no_invalid_btrim_jsonb,
  function_def like '%signature_row.drawing_data is not null%'
    and function_def like '%signature_row.drawing_data <> ''null''::jsonb%'
    and function_def like '%signature_row.drawing_data <> ''{}''::jsonb%'
    and function_def like '%signature_row.drawing_data <> ''[]''::jsonb%'
    as jsonb_safe_drawing_validation,

  function_def like '%total_mapped_signers%'
    and function_def like '%signed_mapped_signers%'
    and function_def like '%from public.report_signature_assignments mapping_check%'
    as preserves_mapped_signer_finalization
from target;


