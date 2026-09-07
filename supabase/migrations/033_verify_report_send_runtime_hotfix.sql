-- READ ONLY verification for migration 033.
select id,description from private.widgetflow_schema_migrations where id in ('032_report_multi_recipient_send','033_report_send_runtime_hotfix');
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,p.prosecdef,coalesce(array_to_string(p.proconfig,','),'') config from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='send_report';
select routine_name,grantee,privilege_type from information_schema.routine_privileges where routine_schema='public' and routine_name='send_report';
select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='send_report';
select count(*) as active_cycles from public.report_send_cycles where status='active';
select count(*) as assignments from public.report_assignments;
select count(*) as notifications from public.notifications where send_cycle_id is not null;
