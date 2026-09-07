begin;

-- ============================================================
-- WidgetFlow Migration 037
-- Historical report template-version read access
-- ============================================================

do $migration_guard$
begin
  if not exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '036_report_sign_runtime_hotfix'
  ) then
    raise exception
      'WidgetFlow migration 036_report_sign_runtime_hotfix must be applied first';
  end if;

  if exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '037_report_historical_template_version_read'
  ) then
    raise exception
      'WidgetFlow migration 037_report_historical_template_version_read has already been applied';
  end if;
end
$migration_guard$;

-- A historical version is visible only through a report that the
-- current user is already authorized to read. The established report
-- authorization helper is reused so this policy does not create a
-- second, divergent report-visibility model.
create policy template_versions_read_via_visible_report
on public.template_versions
for select
to authenticated
using (
  exists (
    select 1
    from public.reports r
    where r.template_version_id = template_versions.id
      and private.current_user_can_read_report(r.id)
  )
);

insert into private.widgetflow_schema_migrations (
  id,
  description
)
values (
  '037_report_historical_template_version_read',
  'Read-only access to historical template snapshots referenced by visible reports'
);

commit;
