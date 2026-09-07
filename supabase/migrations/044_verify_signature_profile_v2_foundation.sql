-- Read-only verification for Migration 044.

select id, description
from private.widgetflow_schema_migrations
where id in ('043_report_sign_historical_signature_shape_hotfix', '044_signature_profile_v2_foundation')
order by id;

select column_name, is_nullable, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'signature_profiles'
  and column_name in (
    'id', 'user_id', 'signature_method', 'signature_asset_id', 'typed_name',
    'drawing_data', 'is_active', 'created_at', 'updated_at',
    'typed_font_key', 'source_image_filename', 'extraction_version'
  )
order by ordinal_position;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.signature_profiles'::regclass
  and conname = 'signature_profiles_typed_font_key_nonblank';

select count(*) as typed_rows_with_default_font
from public.signature_profiles
where signature_method = 'typed'
  and typed_font_key = 'signature_default';

select
  exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'report_values') as report_values_unchanged_target_exists,
  exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'report_signature_events') as report_signature_events_unchanged_target_exists,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'send_report') as send_rpc_exists,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'sign_report') as sign_rpc_exists;

select
  count(*) filter (where typed_font_key is null) as typed_rows_still_null,
  count(*) filter (where typed_font_key is not null and btrim(typed_font_key) = '') as blank_font_keys
from public.signature_profiles
where signature_method = 'typed';
