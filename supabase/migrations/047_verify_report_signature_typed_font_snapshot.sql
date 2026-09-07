-- WidgetFlow Migration 047 verification (read-only; run manually in Supabase SQL Editor)

select exists (
  select 1 from private.widgetflow_schema_migrations
  where id = '046_signature_self_service_profile_identity_hotfix'
) as migration_046_exists;

select exists (
  select 1 from private.widgetflow_schema_migrations
  where id = '047_report_signature_typed_font_snapshot'
) as migration_047_exists;

select
  n.nspname as schema_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.prosecdef as security_definer,
  p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    (p.proname = 'send_report' and pg_get_function_identity_arguments(p.oid) = 'p_report_id uuid, p_recipient_user_ids uuid[], p_note text, p_signature_mappings jsonb')
    or (p.proname = 'sign_report' and pg_get_function_identity_arguments(p.oid) = 'p_report_id uuid, p_assignment_id uuid, p_payload jsonb')
  );

select
  has_function_privilege('authenticated', 'public.send_report(uuid,uuid[],text,jsonb)', 'EXECUTE') as send_authenticated_execute,
  has_function_privilege('authenticated', 'public.sign_report(uuid,uuid,jsonb)', 'EXECUTE') as sign_authenticated_execute,
  not has_function_privilege('anon', 'public.send_report(uuid,uuid[],text,jsonb)', 'EXECUTE') as send_anon_denied,
  not has_function_privilege('anon', 'public.sign_report(uuid,uuid,jsonb)', 'EXECUTE') as sign_anon_denied;

with functions as (
  select p.proname, pg_get_functiondef(p.oid) as body
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('send_report', 'sign_report')
)
select
  proname,
  body ilike '%typedFontKey%' as has_typed_font_key,
  body ilike '%drawingData%' as has_drawing_data,
  body ilike '%signatureAssetId%' as has_signature_asset_id,
  body ilike '%public.signature_profiles%' as reads_signature_profiles,
  body ilike '%public.report_values%' as writes_report_values,
  body ilike '%field_key%' as uses_canonical_field_key,
  body not ilike '%value ->> ''id''%' as avoids_component_id_identity,
  body ilike '%template_field_id%null%' as avoids_template_field_fk,
  body ilike '%signatureRole%' as uses_structured_signature_role,
  body ilike '%required%' as checks_required_metadata
from functions;

select
  to_regclass('public.reports') is not null as reports_exists,
  to_regclass('public.report_send_cycles') is not null as send_cycles_exists,
  to_regclass('public.report_assignments') is not null as assignments_exists,
  to_regclass('public.template_versions') is not null as template_versions_exists,
  to_regclass('public.signature_profiles') is not null as signature_profiles_exists,
  to_regclass('public.report_signature_events') is not null as signature_events_exists;

select
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'signature_profiles' and column_name = 'typed_font_key') as typed_font_key_column_exists,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'signature_profiles' and column_name = 'drawing_data') as drawing_data_column_exists,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'signature_profiles' and column_name = 'signature_asset_id') as signature_asset_id_column_exists;

-- Migration 047 is snapshot-only: it must not alter report lifecycle/event schemas.
select count(*) as report_values_columns
from information_schema.columns
where table_schema = 'public' and table_name = 'report_values';
