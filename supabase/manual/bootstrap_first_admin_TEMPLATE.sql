-- TEMPLATE ONLY. Replace every angle-bracket placeholder locally before use.
-- This script never creates an auth.users row and never accepts a password.
begin;

do $bootstrap$
declare
  v_user_id_text constant text := '51deba23-be04-4edd-92a4-7a3608de0f5a';
  v_full_name constant text := 'Yazzed Mohamed';
  v_email constant text := 'yazzed@admin.firm';
  v_user_id uuid;
  v_auth_email text;
  v_admin_role public.roles%rowtype;
begin
  -- Serialize accidental concurrent bootstrap attempts. The second transaction
  -- will re-check the active-Admin invariant after the first one commits.
  perform pg_catalog.pg_advisory_xact_lock(864203021);

  if v_user_id_text like '<%>'
    or v_full_name like '<%>'
    or v_email like '<%>'
  then
    raise exception 'BOOTSTRAP_PLACEHOLDER_NOT_REPLACED';
  end if;

  begin
    v_user_id := v_user_id_text::uuid;
  exception when invalid_text_representation then
    raise exception 'BOOTSTRAP_AUTH_USER_UUID_INVALID';
  end;

  if nullif(btrim(v_full_name), '') is null
    or nullif(btrim(v_email), '') is null
  then
    raise exception 'BOOTSTRAP_IDENTITY_INVALID';
  end if;

  select u.email into v_auth_email
  from auth.users u
  where u.id = v_user_id;
  if not found then
    raise exception 'BOOTSTRAP_AUTH_USER_NOT_FOUND';
  end if;

  if lower(btrim(coalesce(v_auth_email, ''))) <> lower(btrim(v_email)) then
    raise exception 'BOOTSTRAP_AUTH_EMAIL_MISMATCH';
  end if;

  if exists (select 1 from public.profiles p where p.id = v_user_id) then
    raise exception 'BOOTSTRAP_PROFILE_ALREADY_EXISTS';
  end if;

  if exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.status = 'Active'
      and r.is_active
      and r.role_type = 'System'
      and lower(btrim(r.key)) = 'admin'
      and r.is_protected
  ) then
    raise exception 'BOOTSTRAP_ACTIVE_ADMIN_ALREADY_EXISTS';
  end if;

  select * into v_admin_role
  from public.roles r
  where r.role_type = 'System'
    and lower(btrim(r.key)) = 'admin'
    and r.is_active
    and r.is_protected;
  if not found then
    raise exception 'BOOTSTRAP_ADMIN_ROLE_INVALID';
  end if;

  insert into public.profiles (
    id, full_name, email, role_id, department, status
  ) values (
    v_user_id,
    btrim(v_full_name),
    lower(btrim(v_email)),
    v_admin_role.id,
    'Administration',
    'Active'
  );

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
    new_value,
    context
  ) values (
    'FIRST_ADMIN_BOOTSTRAPPED',
    v_user_id,
    btrim(v_full_name),
    lower(btrim(v_email)),
    v_admin_role.id,
    v_admin_role.key,
    v_admin_role.name,
    'profile',
    v_user_id::text,
    btrim(v_full_name),
    jsonb_build_object(
      'status', 'Active',
      'roleId', v_admin_role.id,
      'roleKey', v_admin_role.key,
      'roleName', v_admin_role.name
    ),
    jsonb_build_object('flow', 'manual-first-admin-bootstrap')
  );

  insert into public.application_auth_events (
    event_type,
    user_id,
    user_name_snapshot,
    user_email_snapshot,
    actor_user_id,
    actor_name_snapshot,
    outcome,
    context
  ) values (
    'FIRST_ADMIN_BOOTSTRAPPED',
    v_user_id,
    btrim(v_full_name),
    lower(btrim(v_email)),
    v_user_id,
    btrim(v_full_name),
    'success',
    jsonb_build_object('flow', 'manual-first-admin-bootstrap')
  );
end
$bootstrap$;

commit;
