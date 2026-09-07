begin;

do $migration_guard$
begin
  if not exists (select 1 from private.widgetflow_schema_migrations where id = '017_edge_function_service_reads') then
    raise exception 'WidgetFlow migration 017_edge_function_service_reads must be applied first';
  end if;
  if exists (select 1 from private.widgetflow_schema_migrations where id = '018_configuration_read_access') then
    raise exception 'WidgetFlow migration 018_configuration_read_access has already been applied';
  end if;
end
$migration_guard$;

grant select on table public.feature_settings, public.element_settings,
  public.system_settings, public.governance_routes, public.content_library_items
to authenticated;

create policy feature_settings_select_protected_admin on public.feature_settings
for select to authenticated using ((select private.current_user_is_protected_admin()));
create policy element_settings_select_protected_admin on public.element_settings
for select to authenticated using ((select private.current_user_is_protected_admin()));
create policy system_settings_select_protected_admin on public.system_settings
for select to authenticated using ((select private.current_user_is_protected_admin()));
create policy governance_routes_select_protected_admin on public.governance_routes
for select to authenticated using ((select private.current_user_is_protected_admin()));
create policy content_library_items_select_protected_admin on public.content_library_items
for select to authenticated using ((select private.current_user_is_protected_admin()));

revoke insert, update, delete, truncate, references, trigger
on table public.feature_settings, public.element_settings, public.system_settings,
  public.governance_routes, public.content_library_items
from anon, authenticated;
revoke all on table public.feature_settings, public.element_settings, public.system_settings,
  public.governance_routes, public.content_library_items from anon;

insert into private.widgetflow_schema_migrations (id, description)
values ('018_configuration_read_access', 'Protected Admin reads for configuration, governance, and shared content');

commit;
