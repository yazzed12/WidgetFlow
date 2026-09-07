begin;

do $migration_guard$
begin
  if not exists (
    select 1 from private.widgetflow_schema_migrations
    where id = '012_auth_audit_security'
  ) then
    raise exception 'WidgetFlow migration 012_auth_audit_security must be applied first';
  end if;

  if exists (
    select 1 from private.widgetflow_schema_migrations
    where id = '013_profile_codes'
  ) then
    raise exception 'WidgetFlow migration 013_profile_codes has already been applied';
  end if;
end
$migration_guard$;

-- UUID remains the relational and authorization identity. profile_code is an
-- immutable, display-only business identifier generated exclusively in SQL.
alter table public.profiles
  add column profile_code text;

create table private.profile_code_counters (
  prefix text not null,
  period_key text not null,
  last_value bigint not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint profile_code_counters_pkey primary key (prefix, period_key),
  constraint profile_code_counters_prefix_ck check (prefix ~ '^[A-Z]{2}$'),
  constraint profile_code_counters_period_ck check (period_key ~ '^[0-9]{4}$'),
  constraint profile_code_counters_value_ck check (last_value > 0)
);

alter table private.profile_code_counters enable row level security;
revoke all privileges on table private.profile_code_counters
from public, anon, authenticated, service_role;

create function private.profile_code_prefix(p_role_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_role public.roles%rowtype;
begin
  select * into v_role
  from public.roles r
  where r.id = p_role_id;

  if not found then
    raise exception 'PROFILE_CODE_ROLE_NOT_FOUND';
  end if;
  if not v_role.is_active then
    raise exception 'PROFILE_CODE_ROLE_INACTIVE';
  end if;

  if v_role.role_type = 'Custom' then
    return 'CU';
  end if;

  if v_role.role_type <> 'System' then
    raise exception 'PROFILE_CODE_ROLE_TYPE_UNSUPPORTED';
  end if;

  case lower(btrim(v_role.key))
    when 'admin' then return 'AD';
    when 'employee' then return 'EM';
    when 'manager' then return 'MG';
    when 'director' then return 'DR';
    else raise exception 'PROFILE_CODE_SYSTEM_ROLE_UNKNOWN';
  end case;
end
$function$;

create function private.next_profile_code(
  p_role_id uuid,
  p_created_at timestamptz
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_prefix text;
  v_period text;
  v_sequence bigint;
begin
  if p_created_at is null then
    raise exception 'PROFILE_CODE_CREATED_AT_REQUIRED';
  end if;

  v_prefix := private.profile_code_prefix(p_role_id);
  -- The creation period is always derived in UTC, never from a browser clock.
  v_period := pg_catalog.to_char(p_created_at at time zone 'UTC', 'MMYY');

  insert into private.profile_code_counters as counters (
    prefix, period_key, last_value
  ) values (
    v_prefix, v_period, 1
  )
  on conflict (prefix, period_key)
  do update set
    last_value = counters.last_value + 1,
    updated_at = statement_timestamp()
  returning last_value into v_sequence;

  return v_prefix
    || '-'
    || pg_catalog.lpad(v_sequence::text, 3, '0')
    || '-'
    || v_period;
end
$function$;

revoke all on function private.profile_code_prefix(uuid)
from public, anon, authenticated, service_role;
revoke all on function private.next_profile_code(uuid, timestamptz)
from public, anon, authenticated, service_role;

-- Existing profiles have no historical creation-role snapshot. The only safe
-- deterministic backfill uses each profile's role at migration time.
do $profile_code_backfill$
declare
  v_profile record;
begin
  for v_profile in
    select p.id, p.role_id, p.created_at
    from public.profiles p
    order by p.created_at, p.id
    for update
  loop
    update public.profiles p
    set profile_code = private.next_profile_code(
      v_profile.role_id,
      v_profile.created_at
    )
    where p.id = v_profile.id;
  end loop;
end
$profile_code_backfill$;

do $profile_code_integrity$
begin
  if exists (select 1 from public.profiles p where p.profile_code is null) then
    raise exception 'PROFILE_CODE_BACKFILL_NULL';
  end if;

  if exists (
    select p.profile_code
    from public.profiles p
    group by p.profile_code
    having count(*) > 1
  ) then
    raise exception 'PROFILE_CODE_BACKFILL_DUPLICATE';
  end if;

  if exists (
    select 1 from public.profiles p
    where p.profile_code !~ '^[A-Z]{2}-[0-9]{3,}-[0-9]{4}$'
  ) then
    raise exception 'PROFILE_CODE_BACKFILL_FORMAT';
  end if;
end
$profile_code_integrity$;

alter table public.profiles
  add constraint profiles_profile_code_uq unique (profile_code),
  add constraint profiles_profile_code_format_ck
    check (profile_code ~ '^[A-Z]{2}-[0-9]{3,}-[0-9]{4}$'),
  alter column profile_code set not null;

create function private.assign_profile_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.profile_code is not null then
    raise exception 'PROFILE_CODE_MANAGED';
  end if;

  new.profile_code := private.next_profile_code(new.role_id, new.created_at);
  return new;
end
$function$;

create trigger profiles_assign_profile_code
before insert on public.profiles
for each row execute function private.assign_profile_code();

create function private.protect_profile_code()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if old.profile_code is distinct from new.profile_code then
    raise exception 'PROFILE_CODE_IMMUTABLE';
  end if;
  return new;
end
$function$;

create trigger profiles_protect_profile_code
before update of profile_code on public.profiles
for each row execute function private.protect_profile_code();

revoke all on function private.assign_profile_code()
from public, anon, authenticated, service_role;
revoke all on function private.protect_profile_code()
from public, anon, authenticated, service_role;

-- PostgreSQL cannot change a RETURNS TABLE shape with CREATE OR REPLACE.
-- DROP defaults to RESTRICT, so any unexpected database dependency aborts this
-- transaction instead of being cascaded or weakening authorization behavior.
drop function public.current_principal();

create function public.current_principal()
returns table (
  user_id uuid,
  full_name text,
  email text,
  profile_code text,
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
    p.profile_code,
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

revoke all on function public.current_principal()
from public, anon, authenticated, service_role;
grant execute on function public.current_principal() to authenticated;

-- Adding a column must not broaden the existing profile write boundary.
revoke insert, update, delete, truncate, references, trigger
on table public.profiles from anon, authenticated;

insert into private.widgetflow_schema_migrations (id, description)
values (
  '013_profile_codes',
  'Immutable business-facing profile codes with atomic monthly role-prefix allocation'
);

commit;
