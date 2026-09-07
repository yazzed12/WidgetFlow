begin;

do $migration_guard$
begin
  if not exists (
    select 1 from private.widgetflow_schema_migrations where id = '015_admin_core_domain_operations'
  ) then
    raise exception 'WidgetFlow migration 015_admin_core_domain_operations must be applied first';
  end if;
  if exists (
    select 1 from private.widgetflow_schema_migrations where id = '016_admin_governance_dependency_guards'
  ) then
    raise exception 'WidgetFlow migration 016_admin_governance_dependency_guards has already been applied';
  end if;
end
$migration_guard$;

-- A deferred constraint sees the final transaction state. This is important for the
-- atomic permission replacement performed by admin_update_role: a temporary delete
-- must not be mistaken for a permanently empty reviewer queue.
create or replace function private.enforce_governance_reviewer_dependencies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1
    from public.governance_routes route
    where route.is_active
      and route.strategy = 'SPECIFIC_USER'
      and not exists (
        select 1
        from public.profiles reviewer
        join public.roles role on role.id = reviewer.role_id
        where reviewer.id = route.specific_user_id
          and reviewer.status = 'Active'
          and reviewer.role_id = route.target_role_id
          and role.is_active
          and exists (
            select 1 from public.role_permissions rp
            where rp.role_id = role.id and rp.permission_key = 'template_approvals.view'
          )
          and exists (
            select 1 from public.role_permissions rp
            where rp.role_id = role.id and rp.permission_key = 'template_approvals.approve'
          )
      )
  ) then
    raise exception 'GOVERNANCE_REVIEWER_DEPENDENCY';
  end if;

  if exists (
    select 1
    from public.governance_routes route
    where route.is_active
      and route.strategy = 'ROLE_QUEUE'
      and not exists (
        select 1
        from public.profiles reviewer
        join public.roles role on role.id = reviewer.role_id
        where reviewer.role_id = route.target_role_id
          and reviewer.status = 'Active'
          and role.is_active
          and exists (
            select 1 from public.role_permissions rp
            where rp.role_id = role.id and rp.permission_key = 'template_approvals.view'
          )
          and exists (
            select 1 from public.role_permissions rp
            where rp.role_id = role.id and rp.permission_key = 'template_approvals.approve'
          )
      )
  ) then
    raise exception 'GOVERNANCE_ROLE_QUEUE_EMPTY';
  end if;

  return null;
end
$function$;

create constraint trigger profiles_governance_reviewer_guard
after update of status, role_id on public.profiles
deferrable initially deferred
for each row execute function private.enforce_governance_reviewer_dependencies();

create constraint trigger roles_governance_reviewer_guard
after update of is_active on public.roles
deferrable initially deferred
for each row execute function private.enforce_governance_reviewer_dependencies();

create constraint trigger role_permissions_governance_reviewer_guard
after insert or update or delete on public.role_permissions
deferrable initially deferred
for each row execute function private.enforce_governance_reviewer_dependencies();

revoke all on function private.enforce_governance_reviewer_dependencies()
from public, anon, authenticated, service_role;

-- Reassert the intended operation boundaries after the hardening layer.
revoke all on function public.admin_set_profile_status_domain(uuid, uuid, text)
from public, anon, authenticated;
revoke all on function public.admin_change_profile_role_domain(uuid, uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.admin_set_profile_status_domain(uuid, uuid, text) to service_role;
grant execute on function public.admin_change_profile_role_domain(uuid, uuid, uuid, text) to service_role;

insert into private.widgetflow_schema_migrations (id, description)
values ('016_admin_governance_dependency_guards', 'Deferred reviewer dependency guards for future user and role changes');

commit;
