-- READ ONLY verification for migration 021. Do not treat this file as a data migration.
select id, description, applied_at from private.widgetflow_schema_migrations
where id = '021_admin_standard_pack_domain_operations';

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('standard_packs','standard_pack_versions','standard_pack_items')
order by c.relname;

select indexname, indexdef from pg_indexes where schemaname = 'public'
  and indexname in ('standard_pack_versions_pack_status_label_idx');

select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'standard_pack_versions'
  and column_name in ('name_snapshot','description_snapshot','category_id_snapshot','category_name_snapshot')
order by column_name;

select policyname, tablename from pg_policies
where schemaname = 'public' and policyname in (
  'standard_packs_select_operational','standard_pack_versions_select_operational',
  'standard_pack_items_select_operational')
order by tablename, policyname;

select tgrelid::regclass as source_table, tgname, tgenabled from pg_trigger
where not tgisinternal and tgname in ('standard_pack_versions_immutable_guard','standard_pack_items_immutable_guard')
order by tgrelid::regclass::text, tgname;

select n.nspname as schema_name, p.proname, p.prosecdef as security_definer, p.proconfig,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'public' and p.proname in ('admin_create_standard_pack','admin_save_standard_pack_draft',
  'admin_create_standard_pack_version','admin_publish_standard_pack','admin_set_standard_pack_status'))
  or (n.nspname = 'private' and p.proname in ('guard_standard_pack_version_mutation','guard_standard_pack_item_mutation',
    'validate_standard_pack_payload','next_standard_pack_version_label'))
order by n.nspname, p.proname;

select 'authenticated_pack_writes_denied' as check_name, not exists (
  select 1 from information_schema.role_table_grants where table_schema = 'public'
    and grantee = 'authenticated' and table_name in ('standard_packs','standard_pack_versions','standard_pack_items')
    and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
) as passed;

select 'no_broad_true_pack_policies' as check_name, not exists (
  select 1 from pg_policies where schemaname = 'public'
    and tablename in ('standard_packs','standard_pack_versions','standard_pack_items')
    and regexp_replace(coalesce(qual,''), '\s', '', 'g') in ('true','(true)')
) as passed;
