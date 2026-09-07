-- Run manually after applying 037 in Supabase SQL Editor.

select exists (
  select 1
  from private.widgetflow_schema_migrations
  where id = '037_report_historical_template_version_read'
) as migration_037_exists;

select
  policyname,
  cmd,
  qual
from pg_policies
where schemaname = 'public'
  and tablename = 'template_versions'
  and policyname = 'template_versions_read_via_visible_report';

select has_table_privilege(
  'authenticated',
  'public.template_versions',
  'SELECT'
) as authenticated_select_granted;

select count(*) = 0 as no_037_write_policies
from pg_policies
where schemaname = 'public'
  and tablename = 'template_versions'
  and policyname = 'template_versions_read_via_visible_report'
  and cmd <> 'SELECT';

select
  (qual::text ilike '%reports%')
  and (qual::text ilike '%current_user_can_read_report%')
  as policy_scoped_to_visible_reports
from pg_policies
where schemaname = 'public'
  and tablename = 'template_versions'
  and policyname = 'template_versions_read_via_visible_report';

-- CASE-oriented checks (execute while signed in as each test user):
-- A/B: a sender or current-cycle assigned recipient should see the
-- exact version through the report detail query.
-- C/F: an unrelated user, or a version with no visible report, should
-- receive no template_versions row.
-- D: UPDATE/INSERT/DELETE remain denied (the migration adds SELECT only).
-- E: superseded versions remain readable when referenced by a visible report.
-- G: template governance policies are unchanged; compare pg_policies for
-- templates/template_fields before and after applying 037.
