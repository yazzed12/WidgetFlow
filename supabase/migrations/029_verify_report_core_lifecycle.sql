-- READ ONLY verification for migration 029. Execute manually after applying 029.
select id, description from private.widgetflow_schema_migrations where id in ('028_report_multi_recipient_foundation','029_report_core_lifecycle');
select n.nspname as schema_name, p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef, coalesce(array_to_string(p.proconfig, ','),'') as config
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('create_report_from_template','save_report_draft','complete_report');
select routine_name, grantee, privilege_type from information_schema.routine_privileges where routine_schema='public' and routine_name in ('create_report_from_template','save_report_draft','complete_report');
select table_name, privilege_type, grantee from information_schema.role_table_grants where table_schema='public' and table_name in ('reports','report_values','report_audit_events') and grantee in ('anon','authenticated') order by table_name,grantee,privilege_type;
select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname in ('reports','report_values','report_audit_events','report_send_cycles','report_assignments');
select count(*) as send_cycle_rows from public.report_send_cycles;
select count(*) as assignment_rows from public.report_assignments;
select count(*) as report_rows from public.reports;
select p.proname, pg_get_functiondef(p.oid) like '%auth.uid()%' as uses_auth_uid, pg_get_functiondef(p.oid) like '%set search_path = ''''%' as empty_search_path
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('create_report_from_template','save_report_draft','complete_report');
