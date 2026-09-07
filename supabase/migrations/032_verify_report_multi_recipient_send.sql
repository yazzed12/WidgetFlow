-- READ ONLY verification for migration 032.
select id,description from private.widgetflow_schema_migrations where id in ('031_report_snapshot_shape_compatibility','032_report_multi_recipient_send');
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,p.prosecdef,coalesce(array_to_string(p.proconfig,','),'') config from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('list_report_recipient_directory','send_report');
select routine_name,grantee,privilege_type from information_schema.routine_privileges where routine_schema='public' and routine_name in ('list_report_recipient_directory','send_report');
select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name in ('reports','report_send_cycles','report_assignments','report_audit_events','notifications') and grantee in ('anon','authenticated');
select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('list_report_recipient_directory','send_report');
