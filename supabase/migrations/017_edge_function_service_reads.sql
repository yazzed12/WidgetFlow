begin;

do $migration_guard$
begin
  if not exists (
    select 1 from private.widgetflow_schema_migrations where id = '016_admin_governance_dependency_guards'
  ) then
    raise exception 'WidgetFlow migration 016_admin_governance_dependency_guards must be applied first';
  end if;
  if exists (
    select 1 from private.widgetflow_schema_migrations where id = '017_edge_function_service_reads'
  ) then
    raise exception 'WidgetFlow migration 017_edge_function_service_reads has already been applied';
  end if;
end
$migration_guard$;

grant select on table public.roles, public.profiles to service_role;

insert into private.widgetflow_schema_migrations (id, description)
values ('017_edge_function_service_reads', 'Read-only profile and role access for privileged Admin Edge Functions');

commit;
