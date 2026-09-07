begin;

-- Local synchronization for the manually-applied 030 hardening. The current
-- 029 definition already contains exact-version binding, templates.use and
-- immutable-version completion/editing behavior. This preserves the ledger
-- sequence for local review without re-executing 030 remotely.
do $guard$
begin
  if not exists (select 1 from private.widgetflow_schema_migrations where id = '029_report_core_lifecycle') then
    raise exception 'WidgetFlow migration 029_report_core_lifecycle must be applied first';
  end if;
  if exists (select 1 from private.widgetflow_schema_migrations where id = '030_report_core_lifecycle_hardening') then
    raise exception 'WidgetFlow migration 030_report_core_lifecycle_hardening has already been applied';
  end if;
end $guard$;
insert into private.widgetflow_schema_migrations(id, description)
values ('030_report_core_lifecycle_hardening', 'Repository synchronization for manually-applied Report core hardening');
commit;
