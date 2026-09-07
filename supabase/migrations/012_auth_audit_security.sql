begin;

do $migration_guard$
begin
  if not exists (
    select 1 from private.widgetflow_schema_migrations
    where id = '011_admin_domain_security'
  ) then
    raise exception 'WidgetFlow migration 011_admin_domain_security must be applied first';
  end if;

  if exists (
    select 1 from private.widgetflow_schema_migrations
    where id = '012_auth_audit_security'
  ) then
    raise exception 'WidgetFlow migration 012_auth_audit_security has already been applied';
  end if;
end
$migration_guard$;

create or replace function private.prevent_history_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  raise exception 'HISTORICAL_EVENT_MUTATION_FORBIDDEN';
end
$function$;

revoke all on function private.prevent_history_mutation() from public, anon, authenticated, service_role;

create trigger user_role_history_append_only
before update or delete on public.user_role_history
for each row execute function private.prevent_history_mutation();

create trigger admin_audit_events_append_only
before update or delete on public.admin_audit_events
for each row execute function private.prevent_history_mutation();

create trigger application_auth_events_append_only
before update or delete on public.application_auth_events
for each row execute function private.prevent_history_mutation();

-- Reassert the exact browser posture at the end of the Phase 2A chain.
revoke insert, update, delete, truncate, references, trigger on table
  public.profiles,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.user_role_history,
  public.admin_audit_events,
  public.application_auth_events
from anon, authenticated;

revoke select on table
  public.profiles,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.user_role_history,
  public.admin_audit_events,
  public.application_auth_events
from anon;

insert into private.widgetflow_schema_migrations (id, description)
values ('012_auth_audit_security', 'Append-only identity history and Admin/Auth audit hardening');

commit;
