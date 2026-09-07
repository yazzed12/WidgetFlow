begin;

do $guard$
begin
  if not exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '048_signature_import_storage'
  ) then
    raise exception 'WidgetFlow migration 048_signature_import_storage must be applied first';
  end if;

  if exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '049_signature_asset_resolution'
  ) then
    raise exception 'WidgetFlow migration 049_signature_asset_resolution has already been applied';
  end if;
end
$guard$;


-- ============================================================
-- 1. CURRENT USER SIGNATURE ASSET RESOLUTION
-- ============================================================

create or replace function public.get_my_signature_asset()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  result jsonb;
begin
  if actor_id is null then
    raise exception 'FORBIDDEN';
  end if;

  if not coalesce(private.current_user_is_active(), false) then
    raise exception 'PROFILE_INACTIVE_OR_MISSING';
  end if;

  select jsonb_build_object(
    'signature_asset_id', am.id,
    'bucket_name', am.bucket_name,
    'object_path', am.object_path,
    'mime_type', am.mime_type,
    'original_filename', am.original_filename,
    'extraction_version', sp.extraction_version
  )
  into result
  from public.signature_profiles sp
  join public.asset_metadata am
    on am.id = sp.signature_asset_id
  where sp.user_id = actor_id
    and sp.is_active
    and lower(btrim(coalesce(sp.signature_method, ''))) = 'uploaded'
    and am.owner_user_id = actor_id
    and am.asset_purpose = 'signature_profile'
    and am.lifecycle_state = 'active'
    and am.bucket_name = 'widgetflow-signatures'
    and lower(btrim(am.mime_type)) = 'image/png'
    and am.object_path ~ (
      '^signatures/'
      || actor_id::text
      || '/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}[.]png$'
    )
  limit 1;

  return result;
end
$function$;


-- ============================================================
-- 2. HISTORICAL REPORT SIGNATURE ASSET RESOLUTION
-- ============================================================

create or replace function public.resolve_report_signature_asset(
  p_report_id uuid,
  p_signature_asset_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  result jsonb;
begin
  if actor_id is null then
    raise exception 'FORBIDDEN';
  end if;

  if p_report_id is null then
    raise exception 'REPORT_ID_REQUIRED';
  end if;

  if p_signature_asset_id is null then
    raise exception 'SIGNATURE_ASSET_INVALID';
  end if;

  if not coalesce(
    private.current_user_can_read_report(p_report_id),
    false
  ) then
    raise exception 'REPORT_NOT_VISIBLE';
  end if;


  -- The requested asset must actually be referenced by the
  -- immutable/historical report signature state.
  if not exists (
    select 1
    from public.report_values rv
    where rv.report_id = p_report_id
      and (
        rv.value ->> 'signatureAssetId' = p_signature_asset_id::text
        or rv.value ->> 'signature_asset_id' = p_signature_asset_id::text
        or rv.value -> 'signature' ->> 'signatureAssetId' = p_signature_asset_id::text
        or rv.value -> 'signature' ->> 'signature_asset_id' = p_signature_asset_id::text
      )
  )
  and not exists (
    select 1
    from public.report_signature_events rse
    where rse.report_id = p_report_id
      and rse.signature_asset_id = p_signature_asset_id
  ) then
    raise exception 'SIGNATURE_ASSET_NOT_REFERENCED_BY_REPORT';
  end if;


  select jsonb_build_object(
    'signature_asset_id', am.id,
    'bucket_name', am.bucket_name,
    'object_path', am.object_path,
    'mime_type', am.mime_type,
    'original_filename', am.original_filename
  )
  into result
  from public.asset_metadata am
  where am.id = p_signature_asset_id
    and am.owner_user_id is not null
    and am.asset_purpose = 'signature_profile'
    and am.lifecycle_state = 'active'
    and am.bucket_name = 'widgetflow-signatures'
    and lower(btrim(am.mime_type)) = 'image/png'
    and am.object_path ~ (
      '^signatures/'
      || am.owner_user_id::text
      || '/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}[.]png$'
    )
  limit 1;

  if result is null then
    raise exception 'SIGNATURE_ASSET_NOT_FOUND';
  end if;

  return result;
end
$function$;


-- ============================================================
-- 3. PRIVILEGES
-- ============================================================

revoke all
on function public.get_my_signature_asset()
from public, anon, authenticated;

revoke all
on function public.resolve_report_signature_asset(uuid, uuid)
from public, anon, authenticated;

grant execute
on function public.get_my_signature_asset()
to authenticated;

grant execute
on function public.resolve_report_signature_asset(uuid, uuid)
to authenticated;


-- ============================================================
-- 4. MIGRATION RECORD
-- ============================================================

insert into private.widgetflow_schema_migrations (
  id,
  description
)
values (
  '049_signature_asset_resolution',
  'Authorized private signature asset resolution for own profiles and visible historical reports'
);

commit;