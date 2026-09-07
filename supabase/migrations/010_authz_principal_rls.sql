begin;

do $migration_guard$
begin
  if not exists (
    select 1 from private.widgetflow_schema_migrations
    where id = '009_security_baseline'
  ) then
    raise exception 'WidgetFlow migration 009_security_baseline must be applied first';
  end if;

  if exists (
    select 1 from private.widgetflow_schema_migrations
    where id = '010_authz_principal_rls'
  ) then
    raise exception 'WidgetFlow migration 010_authz_principal_rls has already been applied';
  end if;
end
$migration_guard$;

-- These narrowly-scoped SECURITY DEFINER helpers avoid recursive policies on
-- profiles. They derive the caller exclusively from auth.uid(), use no dynamic
-- SQL, and cannot inspect an arbitrary user supplied by a browser caller.
create or replace function private.current_role_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select p.role_id
  from public.profiles p
  where p.id = auth.uid()
$function$;

create or replace function private.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select p.status = 'Active' and r.is_active
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = auth.uid()
  ), false)
$function$;

create or replace function private.current_user_is_protected_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select p.status = 'Active'
      and r.is_active
      and r.role_type = 'System'
      and lower(btrim(r.key)) = 'admin'
      and r.is_protected
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = auth.uid()
  ), false)
$function$;

create or replace function private.current_user_has_permission(p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select p.status = 'Active'
      and r.is_active
      and exists (
        select 1
        from public.role_permissions rp
        where rp.role_id = r.id
          and rp.permission_key = p_permission_key
      )
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = auth.uid()
  ), false)
$function$;

revoke all on function private.current_role_id() from public, anon, authenticated;
revoke all on function private.current_user_is_active() from public, anon, authenticated;
revoke all on function private.current_user_is_protected_admin() from public, anon, authenticated;
revoke all on function private.current_user_has_permission(text) from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.current_role_id() to authenticated;
grant execute on function private.current_user_is_active() to authenticated;
grant execute on function private.current_user_is_protected_admin() to authenticated;
grant execute on function private.current_user_has_permission(text) to authenticated;

create or replace function public.current_principal()
returns table (
  user_id uuid,
  full_name text,
  email text,
  profile_status text,
  role_id uuid,
  role_key text,
  role_name text,
  role_type text,
  governance_level text,
  role_active boolean,
  role_protected boolean,
  effective_permissions text[]
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p.id,
    p.full_name,
    p.email,
    p.status,
    r.id,
    r.key,
    r.name,
    r.role_type,
    r.governance_level,
    r.is_active,
    r.is_protected,
    case
      when p.status = 'Active' and r.is_active then coalesce(
        (
          select array_agg(rp.permission_key order by rp.permission_key)
          from public.role_permissions rp
          where rp.role_id = r.id
        ),
        array[]::text[]
      )
      else array[]::text[]
    end
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = auth.uid()
$function$;

revoke all on function public.current_principal() from public, anon, authenticated;
grant execute on function public.current_principal() to authenticated;

grant select on table
  public.profiles,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.user_role_history,
  public.admin_audit_events,
  public.application_auth_events
to authenticated;

create policy profiles_select_own_or_protected_admin
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or private.current_user_is_protected_admin()
);

create policy roles_select_own_or_protected_admin
on public.roles
for select
to authenticated
using (
  (
    private.current_user_is_active()
    and id = private.current_role_id()
  )
  or private.current_user_is_protected_admin()
);

create policy permissions_select_protected_admin
on public.permissions
for select
to authenticated
using (private.current_user_is_protected_admin());

create policy role_permissions_select_protected_admin
on public.role_permissions
for select
to authenticated
using (private.current_user_is_protected_admin());

create policy user_role_history_select_protected_admin
on public.user_role_history
for select
to authenticated
using (private.current_user_is_protected_admin());

create policy admin_audit_events_select_protected_admin
on public.admin_audit_events
for select
to authenticated
using (private.current_user_is_protected_admin());

create policy application_auth_events_select_protected_admin
on public.application_auth_events
for select
to authenticated
using (private.current_user_is_protected_admin());

insert into private.widgetflow_schema_migrations (id, description)
values ('010_authz_principal_rls', 'Current principal resolution and read-only identity authorization policies');

commit;
