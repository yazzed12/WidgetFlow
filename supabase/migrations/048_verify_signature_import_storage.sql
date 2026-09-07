-- Migration 048 verification (read-only; run manually in Supabase SQL Editor)
select exists (select 1 from private.widgetflow_schema_migrations where id = '047_report_signature_typed_font_snapshot') as migration_047_exists,
       exists (select 1 from private.widgetflow_schema_migrations where id = '048_signature_import_storage') as migration_048_exists;

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'widgetflow-signatures';

select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'widgetflow_signature_objects_%';

select has_function_privilege('authenticated', 'public.register_my_signature_asset(text,text,bigint,text,text)', 'EXECUTE') as register_authenticated_execute,
       not has_function_privilege('anon', 'public.register_my_signature_asset(text,text,bigint,text,text)', 'EXECUTE') as register_anon_denied,
       not has_function_privilege('public', 'public.register_my_signature_asset(text,text,bigint,text,text)', 'EXECUTE') as register_public_denied,
       has_function_privilege('authenticated', 'public.save_my_signature_profile(jsonb)', 'EXECUTE') as save_authenticated_execute,
       not has_function_privilege('anon', 'public.save_my_signature_profile(jsonb)', 'EXECUTE') as save_anon_denied;

with fn as (
  select p.proname, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid) as body
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('register_my_signature_asset','save_my_signature_profile','get_my_signature_profile')
)
select proname, prosecdef as security_definer, proconfig,
       body ilike '%auth.uid()%' as derives_identity_from_auth_uid,
       body ilike '%public.asset_metadata%' as uses_canonical_asset_metadata,
       body ilike '%image/png%' as validates_png,
       body ilike '%owner_user_id%' as validates_ownership,
       body ilike '%widgetflow-signatures%' as validates_private_signature_location,
       body ilike '%method = ''uploaded''%' as supports_uploaded_method,
       body ilike '%typed_font_key%' as preserves_typed_support,
       body ilike '%drawing_data%' as preserves_drawn_support,
       body not ilike '%p_user_id%' as no_user_id_bypass,
       body ilike '%signature_asset_id%' as exposes_or_persists_asset_id
from fn;

select column_name, is_nullable, data_type
from information_schema.columns
where table_schema = 'public' and table_name in ('asset_metadata','signature_profiles')
  and column_name in ('id','owner_user_id','bucket_name','object_path','asset_purpose','mime_type','signature_asset_id','source_image_filename','extraction_version');

select to_regclass('public.report_signature_events') is not null as report_signature_events_exists,
       to_regclass('public.report_values') is not null as report_values_exists;
