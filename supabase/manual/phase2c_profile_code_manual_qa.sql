-- OPTIONAL MANUAL QA ONLY. Review before running after migration 013.
-- All changes are enclosed in a transaction and rolled back.
begin;

-- 1. profile_code is immutable. If profiles exist, the attempted change must
-- raise PROFILE_CODE_IMMUTABLE and is caught only when that exact guard fires.
do $immutability_test$
declare
  v_profile_id uuid;
begin
  select p.id into v_profile_id
  from public.profiles p
  order by p.created_at, p.id
  limit 1;

  if v_profile_id is null then
    raise notice 'SKIP: no profile exists for immutability test';
    return;
  end if;

  begin
    update public.profiles
    set profile_code = 'ZZ-999-0123'
    where id = v_profile_id;
    raise exception 'TEST_FAILED_PROFILE_CODE_CHANGED';
  exception
    when raise_exception then
      if sqlerrm <> 'PROFILE_CODE_IMMUTABLE' then
        raise;
      end if;
  end;
end
$immutability_test$;

-- 2. A non-protected user's role can change without changing profile_code.
do $role_change_test$
declare
  v_profile public.profiles%rowtype;
  v_new_role_id uuid;
  v_code_before text;
begin
  select p.* into v_profile
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where not (
    r.role_type = 'System'
    and lower(btrim(r.key)) = 'admin'
    and r.is_protected
  )
  order by p.created_at, p.id
  limit 1;

  if not found then
    raise notice 'SKIP: no non-protected profile exists for role-change test';
    return;
  end if;

  select r.id into v_new_role_id
  from public.roles r
  where r.id <> v_profile.role_id
    and r.is_active
    and not r.is_protected
    and not (r.role_type = 'System' and lower(btrim(r.key)) = 'admin')
  order by r.created_at, r.id
  limit 1;

  if v_new_role_id is null then
    raise notice 'SKIP: no alternate assignable role exists';
    return;
  end if;

  v_code_before := v_profile.profile_code;
  update public.profiles set role_id = v_new_role_id where id = v_profile.id;

  if (select p.profile_code from public.profiles p where p.id = v_profile.id)
    is distinct from v_code_before
  then
    raise exception 'TEST_FAILED_ROLE_CHANGE_REGENERATED_PROFILE_CODE';
  end if;
end
$role_change_test$;

-- 3. Status change and account re-enable preserve the original profile_code.
do $status_change_test$
declare
  v_profile public.profiles%rowtype;
  v_code_before text;
begin
  select p.* into v_profile
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where not (
    r.role_type = 'System'
    and lower(btrim(r.key)) = 'admin'
    and r.is_protected
  )
  order by p.created_at, p.id
  limit 1;

  if not found then
    raise notice 'SKIP: no non-protected profile exists for status test';
    return;
  end if;

  v_code_before := v_profile.profile_code;
  update public.profiles set status = 'Inactive' where id = v_profile.id;
  update public.profiles set status = 'Active' where id = v_profile.id;

  if (select p.profile_code from public.profiles p where p.id = v_profile.id)
    is distinct from v_code_before
  then
    raise exception 'TEST_FAILED_STATUS_CHANGE_REGENERATED_PROFILE_CODE';
  end if;
end
$status_change_test$;

rollback;
