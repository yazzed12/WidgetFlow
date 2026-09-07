begin;

do $migration_guard$
begin
  if not exists (
    select 1 from private.widgetflow_schema_migrations where id = '014_admin_core_read_access'
  ) then
    raise exception 'WidgetFlow migration 014_admin_core_read_access must be applied first';
  end if;
  if exists (
    select 1 from private.widgetflow_schema_migrations where id = '015_admin_core_domain_operations'
  ) then
    raise exception 'WidgetFlow migration 015_admin_core_domain_operations has already been applied';
  end if;
end
$migration_guard$;

create or replace function private.validate_permission_keys(p_permission_keys text[])
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_keys text[];
begin
  select coalesce(array_agg(distinct btrim(value) order by btrim(value)), array[]::text[])
  into v_keys
  from unnest(coalesce(p_permission_keys, array[]::text[])) as supplied(value)
  where nullif(btrim(value), '') is not null;

  if cardinality(v_keys) <> coalesce(cardinality(p_permission_keys), 0) then
    raise exception 'INVALID_PERMISSION_KEYS';
  end if;
  if exists (
    select 1 from unnest(v_keys) supplied(value)
    where not exists (select 1 from public.permissions p where p.key = supplied.value)
  ) then
    raise exception 'INVALID_PERMISSION_KEYS';
  end if;
  return v_keys;
end
$function$;

create or replace function public.admin_create_custom_role(
  p_name text,
  p_description text,
  p_governance_level text,
  p_is_active boolean,
  p_permission_keys text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role public.roles%rowtype;
  v_key text;
  v_permissions text[];
begin
  if not private.current_user_is_protected_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if nullif(btrim(p_name), '') is null
    or p_governance_level not in ('Employee', 'Manager', 'Director', 'None')
  then raise exception 'INVALID_INPUT'; end if;
  if exists (select 1 from public.roles where lower(btrim(name)) = lower(btrim(p_name))) then
    raise exception 'ROLE_NAME_EXISTS';
  end if;

  v_permissions := private.validate_permission_keys(p_permission_keys);
  v_key := trim(both '-' from regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g'));
  if v_key = '' then v_key := 'custom-role'; end if;
  if exists (select 1 from public.roles where lower(btrim(key)) = v_key) then
    v_key := v_key || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);
  end if;

  insert into public.roles (
    key, name, description, role_type, governance_level, is_active, is_protected, created_by_user_id
  ) values (
    v_key, btrim(p_name), coalesce(btrim(p_description), ''), 'Custom', p_governance_level,
    coalesce(p_is_active, true), false, auth.uid()
  ) returning * into v_role;

  insert into public.role_permissions (role_id, permission_key)
  select v_role.id, value from unnest(v_permissions) supplied(value);

  perform private.write_admin_audit(
    auth.uid(), 'ROLE_CREATED', 'role', v_role.id::text, v_role.name, null,
    jsonb_build_object('key', v_role.key, 'name', v_role.name, 'roleType', v_role.role_type,
      'governanceLevel', v_role.governance_level, 'isActive', v_role.is_active,
      'permissions', to_jsonb(v_permissions)),
    jsonb_build_object('flow', 'admin-create-custom-role')
  );
  return jsonb_build_object('id', v_role.id);
exception when unique_violation then
  raise exception 'ROLE_NAME_EXISTS';
end
$function$;

create or replace function public.admin_update_role(
  p_role_id uuid,
  p_name text,
  p_description text,
  p_governance_level text,
  p_is_active boolean,
  p_permission_keys text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role public.roles%rowtype;
  v_permissions text[];
  v_previous_permissions text[];
  v_previous jsonb;
  v_event_type text;
begin
  if not private.current_user_is_protected_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_role_id is null or nullif(btrim(p_name), '') is null
    or p_governance_level not in ('Employee', 'Manager', 'Director', 'None')
  then raise exception 'INVALID_INPUT'; end if;

  select * into v_role from public.roles where id = p_role_id for update;
  if not found then raise exception 'ROLE_NOT_FOUND'; end if;
  if v_role.role_type = 'System' and lower(btrim(v_role.key)) = 'admin' and v_role.is_protected then
    raise exception 'PROTECTED_ADMIN';
  end if;
  if exists (
    select 1 from public.roles r where r.id <> p_role_id
      and lower(btrim(r.name)) = lower(btrim(p_name))
  ) then raise exception 'ROLE_NAME_EXISTS'; end if;

  if v_role.role_type = 'System' and (
    btrim(p_name) <> v_role.name
    or p_governance_level <> v_role.governance_level
    or not coalesce(p_is_active, false)
  ) then raise exception 'PROTECTED_SYSTEM_ROLE'; end if;

  if v_role.role_type = 'Custom' and not coalesce(p_is_active, false)
    and exists (select 1 from public.profiles where role_id = p_role_id and status = 'Active')
  then raise exception 'ROLE_IN_USE'; end if;

  v_permissions := private.validate_permission_keys(p_permission_keys);
  select coalesce(array_agg(permission_key order by permission_key), array[]::text[])
  into v_previous_permissions from public.role_permissions where role_id = p_role_id;
  v_previous := jsonb_build_object('name', v_role.name, 'description', v_role.description,
    'governanceLevel', v_role.governance_level, 'isActive', v_role.is_active,
    'permissions', to_jsonb(v_previous_permissions));

  update public.roles set
    name = case when role_type = 'System' then name else btrim(p_name) end,
    description = coalesce(btrim(p_description), ''),
    governance_level = case when role_type = 'System' then governance_level else p_governance_level end,
    is_active = case when role_type = 'System' then true else coalesce(p_is_active, false) end
  where id = p_role_id returning * into v_role;

  delete from public.role_permissions where role_id = p_role_id;
  insert into public.role_permissions (role_id, permission_key)
  select p_role_id, value from unnest(v_permissions) supplied(value);

  v_event_type := case
    when (v_previous->>'isActive')::boolean is distinct from v_role.is_active
      then case when v_role.is_active then 'ROLE_ACTIVATED' else 'ROLE_DEACTIVATED' end
    when v_previous_permissions is distinct from v_permissions then 'ROLE_PERMISSIONS_CHANGED'
    else 'ROLE_UPDATED'
  end;

  perform private.write_admin_audit(
    auth.uid(), v_event_type, 'role', v_role.id::text, v_role.name, v_previous,
    jsonb_build_object('name', v_role.name, 'description', v_role.description,
      'governanceLevel', v_role.governance_level, 'isActive', v_role.is_active,
      'permissions', to_jsonb(v_permissions)),
    jsonb_build_object('flow', 'admin-update-role',
      'permissionsChanged', v_previous_permissions is distinct from v_permissions)
  );
  return jsonb_build_object('id', v_role.id);
exception when unique_violation then
  raise exception 'ROLE_NAME_EXISTS';
end
$function$;

create or replace function public.admin_create_category(
  p_name text,
  p_description text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_category public.categories%rowtype;
  v_actor_name text;
begin
  if not private.current_user_is_protected_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if nullif(btrim(p_name), '') is null or p_status not in ('Active', 'Inactive') then
    raise exception 'INVALID_INPUT';
  end if;
  if exists (select 1 from public.categories where lower(btrim(name)) = lower(btrim(p_name))) then
    raise exception 'CATEGORY_NAME_EXISTS';
  end if;
  select full_name into v_actor_name from public.profiles where id = auth.uid();
  insert into public.categories (name, description, status, created_by_user_id, created_by_name)
  values (btrim(p_name), coalesce(btrim(p_description), ''), p_status, auth.uid(), v_actor_name)
  returning * into v_category;
  perform private.write_admin_audit(
    auth.uid(), 'CATEGORY_CREATED', 'category', v_category.id::text, v_category.name, null,
    jsonb_build_object('name', v_category.name, 'description', v_category.description, 'status', v_category.status),
    jsonb_build_object('flow', 'admin-create-category')
  );
  return jsonb_build_object('id', v_category.id);
exception when unique_violation then raise exception 'CATEGORY_NAME_EXISTS';
end
$function$;

create or replace function public.admin_update_category(
  p_category_id uuid,
  p_name text,
  p_description text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_category public.categories%rowtype;
  v_previous jsonb;
  v_event_type text;
begin
  if not private.current_user_is_protected_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_category_id is null or nullif(btrim(p_name), '') is null
    or p_status not in ('Active', 'Inactive') then raise exception 'INVALID_INPUT'; end if;
  select * into v_category from public.categories where id = p_category_id for update;
  if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;
  if exists (select 1 from public.categories where id <> p_category_id
    and lower(btrim(name)) = lower(btrim(p_name))) then raise exception 'CATEGORY_NAME_EXISTS'; end if;
  v_previous := jsonb_build_object('name', v_category.name, 'description', v_category.description,
    'status', v_category.status);
  update public.categories set name = btrim(p_name), description = coalesce(btrim(p_description), ''),
    status = p_status where id = p_category_id returning * into v_category;
  v_event_type := case
    when v_previous->>'status' is distinct from v_category.status
      then case when v_category.status = 'Active' then 'CATEGORY_ACTIVATED' else 'CATEGORY_DEACTIVATED' end
    else 'CATEGORY_UPDATED'
  end;
  perform private.write_admin_audit(
    auth.uid(), v_event_type, 'category', v_category.id::text, v_category.name, v_previous,
    jsonb_build_object('name', v_category.name, 'description', v_category.description, 'status', v_category.status),
    jsonb_build_object('flow', 'admin-update-category')
  );
  return jsonb_build_object('id', v_category.id);
exception when unique_violation then raise exception 'CATEGORY_NAME_EXISTS';
end
$function$;

revoke all on function private.validate_permission_keys(text[]) from public, anon, authenticated, service_role;
revoke all on function public.admin_create_custom_role(text, text, text, boolean, text[]) from public, anon, authenticated, service_role;
revoke all on function public.admin_update_role(uuid, text, text, text, boolean, text[]) from public, anon, authenticated, service_role;
revoke all on function public.admin_create_category(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.admin_update_category(uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.admin_create_custom_role(text, text, text, boolean, text[]) to authenticated;
grant execute on function public.admin_update_role(uuid, text, text, text, boolean, text[]) to authenticated;
grant execute on function public.admin_create_category(text, text, text) to authenticated;
grant execute on function public.admin_update_category(uuid, text, text, text) to authenticated;

-- Keep the browser mutation surface RPC-only.
revoke insert, update, delete, truncate, references, trigger
on table public.roles, public.permissions, public.role_permissions, public.categories,
  public.profiles, public.user_role_history, public.admin_audit_events
from anon, authenticated;

insert into private.widgetflow_schema_migrations (id, description)
values ('015_admin_core_domain_operations', 'Trusted Admin role and category domain operations');

commit;
