begin;

do $migration_guard$
begin
  if not exists (
    select 1 from private.widgetflow_schema_migrations
    where id = '010_authz_principal_rls'
  ) then
    raise exception 'WidgetFlow migration 010_authz_principal_rls must be applied first';
  end if;

  if exists (
    select 1 from private.widgetflow_schema_migrations
    where id = '011_admin_domain_security'
  ) then
    raise exception 'WidgetFlow migration 011_admin_domain_security has already been applied';
  end if;
end
$migration_guard$;

create or replace function private.is_protected_admin_user(p_user_id uuid)
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
    where p.id = p_user_id
  ), false)
$function$;

create or replace function private.active_protected_admin_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $function$
  select count(*)
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.status = 'Active'
    and r.is_active
    and r.role_type = 'System'
    and lower(btrim(r.key)) = 'admin'
    and r.is_protected
$function$;

create or replace function private.protect_admin_role()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if old.role_type = 'System'
    and lower(btrim(old.key)) = 'admin'
    and old.is_protected
  then
    if tg_op = 'DELETE' then
      raise exception 'PROTECTED_ADMIN';
    end if;

    if new.role_type <> 'System'
      or lower(btrim(new.key)) <> 'admin'
      or new.name <> 'Admin'
      or new.governance_level <> 'None'
      or not new.is_active
      or not new.is_protected
    then
      raise exception 'PROTECTED_ADMIN';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

create trigger roles_protect_admin
before update or delete on public.roles
for each row execute function private.protect_admin_role();

create or replace function private.protect_profile_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'PROFILE_HARD_DELETE_FORBIDDEN';
  end if;

  if (new.role_id is distinct from old.role_id or new.status is distinct from old.status)
    and exists (
      select 1
      from public.roles r
      where r.id = old.role_id
        and r.role_type = 'System'
        and lower(btrim(r.key)) = 'admin'
        and r.is_protected
    )
  then
    if private.active_protected_admin_count() <= 1 then
      raise exception 'LAST_ACTIVE_ADMIN';
    end if;
    raise exception 'PROTECTED_ADMIN';
  end if;

  return new;
end
$function$;

create trigger profiles_protect_lifecycle
before update of role_id, status or delete on public.profiles
for each row execute function private.protect_profile_lifecycle();

create or replace function private.write_admin_audit(
  p_actor_user_id uuid,
  p_event_type text,
  p_target_type text,
  p_target_id text,
  p_target_label text,
  p_previous_value jsonb,
  p_new_value jsonb,
  p_context jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor public.profiles%rowtype;
  v_actor_role public.roles%rowtype;
begin
  select * into strict v_actor
  from public.profiles p
  where p.id = p_actor_user_id;

  select * into strict v_actor_role
  from public.roles r
  where r.id = v_actor.role_id;

  insert into public.admin_audit_events (
    event_type,
    actor_user_id,
    actor_name,
    actor_email,
    actor_role_id,
    actor_role_key,
    actor_role_name,
    target_type,
    target_id,
    target_label,
    previous_value,
    new_value,
    context
  ) values (
    p_event_type,
    v_actor.id,
    v_actor.full_name,
    v_actor.email,
    v_actor_role.id,
    v_actor_role.key,
    v_actor_role.name,
    p_target_type,
    p_target_id,
    p_target_label,
    p_previous_value,
    p_new_value,
    coalesce(p_context, '{}'::jsonb)
  );
end
$function$;

revoke all on function private.is_protected_admin_user(uuid) from public, anon, authenticated, service_role;
revoke all on function private.active_protected_admin_count() from public, anon, authenticated, service_role;
revoke all on function private.protect_admin_role() from public, anon, authenticated, service_role;
revoke all on function private.protect_profile_lifecycle() from public, anon, authenticated, service_role;
revoke all on function private.write_admin_audit(uuid, text, text, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated, service_role;

create or replace function public.admin_create_profile_domain(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_full_name text,
  p_email text,
  p_role_id uuid,
  p_department text default '',
  p_manager_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role public.roles%rowtype;
  v_profile public.profiles%rowtype;
  v_auth_email text;
begin
  if not private.is_protected_admin_user(p_actor_user_id) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if p_target_user_id is null
    or nullif(btrim(p_full_name), '') is null
    or nullif(btrim(p_email), '') is null
  then
    raise exception 'INVALID_INPUT';
  end if;

  select u.email into v_auth_email
  from auth.users u
  where u.id = p_target_user_id;

  if not found then
    raise exception 'TARGET_AUTH_USER_NOT_FOUND';
  end if;

  if lower(btrim(coalesce(v_auth_email, ''))) <> lower(btrim(p_email)) then
    raise exception 'AUTH_EMAIL_MISMATCH';
  end if;

  if exists (
    select 1 from public.profiles p
    where p.id = p_target_user_id or lower(btrim(p.email)) = lower(btrim(p_email))
  ) then
    raise exception 'EMAIL_ALREADY_EXISTS';
  end if;

  select * into v_role
  from public.roles r
  where r.id = p_role_id;

  if not found then
    raise exception 'ROLE_NOT_FOUND';
  end if;
  if not v_role.is_active then
    raise exception 'ROLE_INACTIVE';
  end if;
  if v_role.is_protected
    or (v_role.role_type = 'System' and lower(btrim(v_role.key)) = 'admin')
  then
    raise exception 'PROTECTED_ADMIN';
  end if;

  if p_manager_user_id is not null and not exists (
    select 1
    from public.profiles manager_profile
    join public.roles manager_role on manager_role.id = manager_profile.role_id
    where manager_profile.id = p_manager_user_id
      and manager_profile.status = 'Active'
      and manager_role.is_active
  ) then
    raise exception 'MANAGER_NOT_ACTIVE';
  end if;

  insert into public.profiles (
    id, full_name, email, role_id, department, manager_user_id, status
  ) values (
    p_target_user_id,
    btrim(p_full_name),
    lower(btrim(p_email)),
    v_role.id,
    coalesce(btrim(p_department), ''),
    p_manager_user_id,
    'Active'
  )
  returning * into v_profile;

  perform private.write_admin_audit(
    p_actor_user_id,
    'ACCOUNT_CREATED',
    'profile',
    v_profile.id::text,
    v_profile.full_name,
    null,
    jsonb_build_object(
      'status', v_profile.status,
      'roleId', v_role.id,
      'roleKey', v_role.key,
      'roleName', v_role.name
    ),
    jsonb_build_object('flow', 'admin-create-user')
  );

  insert into public.application_auth_events (
    event_type, user_id, user_name_snapshot, user_email_snapshot,
    actor_user_id, actor_name_snapshot, outcome, context
  )
  select
    'ACCOUNT_CREATED', v_profile.id, v_profile.full_name, v_profile.email,
    actor.id, actor.full_name, 'success', jsonb_build_object('flow', 'admin-create-user')
  from public.profiles actor
  where actor.id = p_actor_user_id;

  return jsonb_build_object(
    'id', v_profile.id,
    'fullName', v_profile.full_name,
    'email', v_profile.email,
    'roleId', v_role.id,
    'roleKey', v_role.key,
    'roleName', v_role.name,
    'department', v_profile.department,
    'managerUserId', v_profile.manager_user_id,
    'status', v_profile.status
  );
end
$function$;

create or replace function public.admin_create_admin_profile_domain(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_full_name text,
  p_email text,
  p_department text default 'Administration'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin_role public.roles%rowtype;
  v_profile public.profiles%rowtype;
  v_auth_email text;
begin
  if not private.is_protected_admin_user(p_actor_user_id) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if p_target_user_id is null
    or nullif(btrim(p_full_name), '') is null
    or nullif(btrim(p_email), '') is null
  then
    raise exception 'INVALID_INPUT';
  end if;

  select u.email into v_auth_email
  from auth.users u
  where u.id = p_target_user_id;
  if not found then
    raise exception 'TARGET_AUTH_USER_NOT_FOUND';
  end if;
  if lower(btrim(coalesce(v_auth_email, ''))) <> lower(btrim(p_email)) then
    raise exception 'AUTH_EMAIL_MISMATCH';
  end if;

  if exists (
    select 1 from public.profiles p
    where p.id = p_target_user_id or lower(btrim(p.email)) = lower(btrim(p_email))
  ) then
    raise exception 'EMAIL_ALREADY_EXISTS';
  end if;

  select * into v_admin_role
  from public.roles r
  where r.role_type = 'System'
    and lower(btrim(r.key)) = 'admin'
    and r.is_active
    and r.is_protected;
  if not found then
    raise exception 'PROTECTED_ADMIN_ROLE_INVALID';
  end if;

  insert into public.profiles (
    id, full_name, email, role_id, department, status
  ) values (
    p_target_user_id,
    btrim(p_full_name),
    lower(btrim(p_email)),
    v_admin_role.id,
    coalesce(btrim(p_department), 'Administration'),
    'Active'
  )
  returning * into v_profile;

  perform private.write_admin_audit(
    p_actor_user_id,
    'ADMIN_ACCOUNT_CREATED',
    'profile',
    v_profile.id::text,
    v_profile.full_name,
    null,
    jsonb_build_object(
      'status', v_profile.status,
      'roleId', v_admin_role.id,
      'roleKey', v_admin_role.key,
      'roleName', v_admin_role.name
    ),
    jsonb_build_object('flow', 'admin-create-admin')
  );

  insert into public.application_auth_events (
    event_type, user_id, user_name_snapshot, user_email_snapshot,
    actor_user_id, actor_name_snapshot, outcome, context
  )
  select
    'ADMIN_ACCOUNT_CREATED', v_profile.id, v_profile.full_name, v_profile.email,
    actor.id, actor.full_name, 'success', jsonb_build_object('flow', 'admin-create-admin')
  from public.profiles actor
  where actor.id = p_actor_user_id;

  return jsonb_build_object(
    'id', v_profile.id,
    'fullName', v_profile.full_name,
    'email', v_profile.email,
    'roleId', v_admin_role.id,
    'roleKey', v_admin_role.key,
    'roleName', v_admin_role.name,
    'department', v_profile.department,
    'status', v_profile.status
  );
end
$function$;

create or replace function public.admin_set_profile_status_domain(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_profile public.profiles%rowtype;
  v_previous_status text;
begin
  if not private.is_protected_admin_user(p_actor_user_id) then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_status not in ('Active', 'Inactive', 'Resigned', 'Terminated') then
    raise exception 'INVALID_INPUT';
  end if;

  select * into v_profile
  from public.profiles p
  where p.id = p_target_user_id
  for update;
  if not found then
    raise exception 'TARGET_NOT_FOUND';
  end if;

  if p_target_user_id = p_actor_user_id then
    raise exception 'PROTECTED_ADMIN';
  end if;
  if private.is_protected_admin_user(p_target_user_id) then
    if private.active_protected_admin_count() <= 1 then
      raise exception 'LAST_ACTIVE_ADMIN';
    end if;
    raise exception 'PROTECTED_ADMIN';
  end if;

  v_previous_status := v_profile.status;
  update public.profiles
  set status = p_status
  where id = p_target_user_id
  returning * into v_profile;

  perform private.write_admin_audit(
    p_actor_user_id,
    'ACCOUNT_STATUS_CHANGED',
    'profile',
    v_profile.id::text,
    v_profile.full_name,
    jsonb_build_object('status', v_previous_status),
    jsonb_build_object('status', v_profile.status),
    jsonb_build_object('flow', 'admin-set-user-status')
  );

  insert into public.application_auth_events (
    event_type, user_id, user_name_snapshot, user_email_snapshot,
    actor_user_id, actor_name_snapshot, outcome, context
  )
  select
    'ACCOUNT_STATUS_CHANGED', v_profile.id, v_profile.full_name, v_profile.email,
    actor.id, actor.full_name, 'success',
    jsonb_build_object('previousStatus', v_previous_status, 'status', v_profile.status)
  from public.profiles actor
  where actor.id = p_actor_user_id;

  return jsonb_build_object(
    'id', v_profile.id,
    'status', v_profile.status,
    'previousStatus', v_previous_status
  );
end
$function$;

create or replace function public.admin_change_profile_role_domain(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_new_role_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor public.profiles%rowtype;
  v_actor_role public.roles%rowtype;
  v_profile public.profiles%rowtype;
  v_previous_role public.roles%rowtype;
  v_new_role public.roles%rowtype;
begin
  if not private.is_protected_admin_user(p_actor_user_id) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select * into v_actor from public.profiles p where p.id = p_actor_user_id;
  select * into v_actor_role from public.roles r where r.id = v_actor.role_id;

  select * into v_profile
  from public.profiles p
  where p.id = p_target_user_id
  for update;
  if not found then
    raise exception 'TARGET_NOT_FOUND';
  end if;

  select * into v_previous_role from public.roles r where r.id = v_profile.role_id;
  if v_previous_role.role_type = 'System'
    and lower(btrim(v_previous_role.key)) = 'admin'
    and v_previous_role.is_protected
  then
    if private.active_protected_admin_count() <= 1 then
      raise exception 'LAST_ACTIVE_ADMIN';
    end if;
    raise exception 'PROTECTED_ADMIN';
  end if;

  select * into v_new_role from public.roles r where r.id = p_new_role_id;
  if not found then
    raise exception 'ROLE_NOT_FOUND';
  end if;
  if not v_new_role.is_active then
    raise exception 'ROLE_INACTIVE';
  end if;
  if v_new_role.is_protected
    or (v_new_role.role_type = 'System' and lower(btrim(v_new_role.key)) = 'admin')
  then
    raise exception 'PROTECTED_ADMIN';
  end if;

  if v_previous_role.id = v_new_role.id then
    raise exception 'INVALID_INPUT';
  end if;

  update public.profiles
  set role_id = v_new_role.id
  where id = v_profile.id;

  insert into public.user_role_history (
    user_id,
    previous_role_id,
    new_role_id,
    previous_role_key,
    previous_role_name,
    new_role_key,
    new_role_name,
    changed_by_user_id,
    changed_by_name,
    changed_by_role_key,
    reason
  ) values (
    v_profile.id,
    v_previous_role.id,
    v_new_role.id,
    v_previous_role.key,
    v_previous_role.name,
    v_new_role.key,
    v_new_role.name,
    v_actor.id,
    v_actor.full_name,
    v_actor_role.key,
    nullif(btrim(p_reason), '')
  );

  perform private.write_admin_audit(
    p_actor_user_id,
    'ACCOUNT_ROLE_CHANGED',
    'profile',
    v_profile.id::text,
    v_profile.full_name,
    jsonb_build_object(
      'roleId', v_previous_role.id,
      'roleKey', v_previous_role.key,
      'roleName', v_previous_role.name
    ),
    jsonb_build_object(
      'roleId', v_new_role.id,
      'roleKey', v_new_role.key,
      'roleName', v_new_role.name
    ),
    jsonb_build_object('flow', 'admin-change-user-role', 'reason', nullif(btrim(p_reason), ''))
  );

  return jsonb_build_object(
    'id', v_profile.id,
    'roleId', v_new_role.id,
    'roleKey', v_new_role.key,
    'roleName', v_new_role.name
  );
end
$function$;

create or replace function public.admin_record_password_reset_domain(
  p_actor_user_id uuid,
  p_target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target public.profiles%rowtype;
begin
  if not private.is_protected_admin_user(p_actor_user_id) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select * into v_target
  from public.profiles p
  where p.id = p_target_user_id;
  if not found then
    raise exception 'TARGET_NOT_FOUND';
  end if;
  if exists (
    select 1
    from public.roles r
    where r.id = v_target.role_id
      and r.role_type = 'System'
      and lower(btrim(r.key)) = 'admin'
      and r.is_protected
  ) then
    raise exception 'PROTECTED_ADMIN';
  end if;

  perform private.write_admin_audit(
    p_actor_user_id,
    'ACCOUNT_PASSWORD_RESET',
    'profile',
    v_target.id::text,
    v_target.full_name,
    null,
    null,
    jsonb_build_object('flow', 'admin-reset-password', 'passwordMaterialStored', false)
  );

  insert into public.application_auth_events (
    event_type, user_id, user_name_snapshot, user_email_snapshot,
    actor_user_id, actor_name_snapshot, outcome, context
  )
  select
    'ADMIN_PASSWORD_RESET', v_target.id, v_target.full_name, v_target.email,
    actor.id, actor.full_name, 'success',
    jsonb_build_object('flow', 'admin-reset-password', 'passwordMaterialStored', false)
  from public.profiles actor
  where actor.id = p_actor_user_id;
end
$function$;

create or replace function public.admin_record_account_create_failure_domain(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_target_email text,
  p_flow text,
  p_compensation_succeeded boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not private.is_protected_admin_user(p_actor_user_id) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  perform private.write_admin_audit(
    p_actor_user_id,
    'ACCOUNT_CREATE_FAILED',
    'auth_user',
    p_target_user_id::text,
    coalesce(nullif(btrim(p_target_email), ''), 'unknown'),
    null,
    null,
    jsonb_build_object(
      'flow', p_flow,
      'compensationSucceeded', p_compensation_succeeded
    )
  );

  insert into public.application_auth_events (
    event_type, user_email_snapshot, actor_user_id, actor_name_snapshot,
    outcome, context
  )
  select
    'ACCOUNT_CREATE_FAILED', lower(btrim(p_target_email)), actor.id, actor.full_name,
    'failure', jsonb_build_object(
      'flow', p_flow,
      'compensationSucceeded', p_compensation_succeeded
    )
  from public.profiles actor
  where actor.id = p_actor_user_id;
end
$function$;

revoke all on function public.admin_create_profile_domain(uuid, uuid, text, text, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.admin_create_admin_profile_domain(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_set_profile_status_domain(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_change_profile_role_domain(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_record_password_reset_domain(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_record_account_create_failure_domain(uuid, uuid, text, text, boolean) from public, anon, authenticated;

grant execute on function public.admin_create_profile_domain(uuid, uuid, text, text, uuid, text, uuid) to service_role;
grant execute on function public.admin_create_admin_profile_domain(uuid, uuid, text, text, text) to service_role;
grant execute on function public.admin_set_profile_status_domain(uuid, uuid, text) to service_role;
grant execute on function public.admin_change_profile_role_domain(uuid, uuid, uuid, text) to service_role;
grant execute on function public.admin_record_password_reset_domain(uuid, uuid) to service_role;
grant execute on function public.admin_record_account_create_failure_domain(uuid, uuid, text, text, boolean) to service_role;

insert into private.widgetflow_schema_migrations (id, description)
values ('011_admin_domain_security', 'Service-only Admin domain operations and protected Admin invariants');

commit;
