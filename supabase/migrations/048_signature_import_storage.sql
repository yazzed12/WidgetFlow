begin;

do $guard$
begin
  if not exists (select 1 from private.widgetflow_schema_migrations where id = '047_report_signature_typed_font_snapshot') then raise exception 'WidgetFlow migration 047_report_signature_typed_font_snapshot must be applied first'; end if;
  if exists (select 1 from private.widgetflow_schema_migrations where id = '048_signature_import_storage') then raise exception 'WidgetFlow migration 048_signature_import_storage has already been applied'; end if;
end
$guard$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('widgetflow-signatures', 'widgetflow-signatures', false, 10485760, array['image/png']::text[]);

create policy widgetflow_signature_objects_insert on storage.objects for insert to authenticated
with check (bucket_id = 'widgetflow-signatures' and (storage.foldername(name))[1] = (select auth.uid()::text)
  and name ~ ('^signatures/' || (select auth.uid()::text) || '/[0-9a-fA-F-]{36}[.]png$')
  and lower(coalesce(metadata ->> 'mimetype', '')) = 'image/png');

create policy widgetflow_signature_objects_select on storage.objects for select to authenticated
using (bucket_id = 'widgetflow-signatures' and (storage.foldername(name))[1] = (select auth.uid()::text));

create or replace function public.save_my_signature_profile(
  p_signature jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  actor_active boolean := false;

  existing public.signature_profiles%rowtype;

  method text;
  typed_name text;
  typed_font_key text;
  drawing jsonb;
  asset_id_text text;
  asset_id uuid;
  asset_row public.asset_metadata%rowtype;
  uploaded_extraction_version text;

  stroke jsonb;
  point jsonb;
  previous_point jsonb;

  point_count integer := 0;
  meaningful_stroke boolean := false;

  point_x numeric;
  point_y numeric;
  previous_x numeric;
  previous_y numeric;

  result jsonb;
begin
  if actor_id is null then
    raise exception 'FORBIDDEN';
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.id = actor_id
      and lower(btrim(coalesce(p.status, ''))) = 'active'
  )
  into actor_active;

  if not actor_active then
    raise exception 'PROFILE_INACTIVE_OR_MISSING';
  end if;

  if p_signature is null
     or jsonb_typeof(p_signature) <> 'object' then
    raise exception 'INVALID_SIGNATURE';
  end if;

  method := lower(btrim(coalesce(p_signature ->> 'method', '')));
  typed_name := nullif(btrim(p_signature ->> 'typedName'), '');
  typed_font_key := nullif(btrim(p_signature ->> 'typedFontKey'), '');
  drawing := p_signature -> 'drawingData';

  select *
  into existing
  from public.signature_profiles
  where user_id = actor_id
  for update;

  if found and not existing.is_active then
    raise exception 'SIGNATURE_PROFILE_INACTIVE';
  end if;


  if method = 'typed' then

    if typed_name is null then
      raise exception 'TYPED_NAME_REQUIRED';
    end if;

    if typed_font_key is null
       or typed_font_key not in (
         'signature_default',
         'signature_elegant',
         'signature_classic',
         'signature_handwritten'
       ) then
      raise exception 'TYPED_FONT_INVALID';
    end if;

    insert into public.signature_profiles (
      user_id,
      signature_method,
      typed_name,
      typed_font_key,
      drawing_data,
      signature_asset_id,
      source_image_filename,
      extraction_version,
      is_active,
      updated_at
    )
    values (
      actor_id,
      'typed',
      typed_name,
      typed_font_key,
      null,
      null,
      null,
      null,
      true,
      statement_timestamp()
    )
    on conflict (user_id)
    do update set
      signature_method = excluded.signature_method,
      typed_name = excluded.typed_name,
      typed_font_key = excluded.typed_font_key,
      drawing_data = null,
      signature_asset_id = null,
      source_image_filename = null,
      extraction_version = null,
      is_active = true,
      updated_at = statement_timestamp();


  elsif method = 'drawn' then

    if jsonb_typeof(drawing) <> 'object'
       or drawing ->> 'version' <> '1'
       or jsonb_typeof(drawing -> 'strokes') <> 'array' then
      raise exception 'DRAWING_INVALID';
    end if;

    if jsonb_array_length(drawing -> 'strokes') = 0
       or jsonb_array_length(drawing -> 'strokes') > 500
       or pg_column_size(drawing) > 1048576 then
      raise exception 'DRAWING_INVALID';
    end if;

    for stroke in
      select value
      from jsonb_array_elements(drawing -> 'strokes')
    loop

      if jsonb_typeof(stroke) <> 'array'
         or jsonb_array_length(stroke) = 0
         or jsonb_array_length(stroke) > 1000 then
        raise exception 'DRAWING_INVALID';
      end if;

      point_count := point_count + jsonb_array_length(stroke);

      if point_count > 5000 then
        raise exception 'DRAWING_INVALID';
      end if;

      previous_point := null;

      for point in
        select value
        from jsonb_array_elements(stroke)
      loop

        if jsonb_typeof(point) <> 'object' then
          raise exception 'DRAWING_INVALID';
        end if;

        if jsonb_typeof(point -> 'x') <> 'number'
           or jsonb_typeof(point -> 'y') <> 'number' then
          raise exception 'DRAWING_INVALID';
        end if;

        point_x := (point ->> 'x')::numeric;
        point_y := (point ->> 'y')::numeric;

        if point_x < 0 or point_x > 1
           or point_y < 0 or point_y > 1 then
          raise exception 'DRAWING_INVALID';
        end if;

        if previous_point is not null then
          previous_x := (previous_point ->> 'x')::numeric;
          previous_y := (previous_point ->> 'y')::numeric;

          if point_x <> previous_x
             or point_y <> previous_y then
            meaningful_stroke := true;
          end if;
        end if;

        previous_point := point;
      end loop;
    end loop;

    if point_count = 0
       or point_count > 5000
       or not meaningful_stroke then
      raise exception 'DRAWING_INVALID';
    end if;

    insert into public.signature_profiles (
      user_id,
      signature_method,
      typed_name,
      typed_font_key,
      drawing_data,
      signature_asset_id,
      source_image_filename,
      extraction_version,
      is_active,
      updated_at
    )
    values (
      actor_id,
      'drawn',
      null,
      null,
      drawing,
      null,
      null,
      null,
      true,
      statement_timestamp()
    )
    on conflict (user_id)
    do update set
      signature_method = excluded.signature_method,
      typed_name = null,
      typed_font_key = null,
      drawing_data = excluded.drawing_data,
      signature_asset_id = null,
      source_image_filename = null,
      extraction_version = null,
      is_active = true,
      updated_at = statement_timestamp();


  elsif method = 'uploaded' then

    asset_id_text := nullif(btrim(p_signature ->> 'signatureAssetId'), '');
    if asset_id_text is null or asset_id_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      raise exception 'SIGNATURE_ASSET_INVALID';
    end if;
    asset_id := asset_id_text::uuid;
    select * into asset_row from public.asset_metadata
    where id = asset_id and owner_user_id = actor_id and asset_purpose = 'signature_profile'
      and lifecycle_state = 'active' and lower(btrim(mime_type)) = 'image/png'
      and bucket_name = 'widgetflow-signatures'
      and object_path ~ ('^signatures/' || actor_id::text || '/[0-9a-fA-F-]{36}[.]png$')
    for share;
    if not found then
      raise exception 'SIGNATURE_ASSET_NOT_OWNED_OR_INVALID';
    end if;
    uploaded_extraction_version := nullif(btrim(p_signature ->> 'extractionVersion'), '');
    insert into public.signature_profiles (
      user_id, signature_method, typed_name, typed_font_key, drawing_data,
      signature_asset_id, source_image_filename, extraction_version, is_active, updated_at
    ) values (
      actor_id, 'uploaded', null, null, null, asset_row.id, asset_row.original_filename,
      coalesce(uploaded_extraction_version, asset_row.metadata ->> 'extractionVersion'), true,
      statement_timestamp()
    ) on conflict (user_id) do update set
      signature_method = excluded.signature_method, typed_name = null, typed_font_key = null,
      drawing_data = null, signature_asset_id = excluded.signature_asset_id,
      source_image_filename = excluded.source_image_filename, extraction_version = excluded.extraction_version,
      is_active = true, updated_at = statement_timestamp();


  else

    raise exception 'INVALID_METHOD';

  end if;


  select jsonb_build_object(
    'id', sp.id,
    'user_id', sp.user_id,
    'signature_method', sp.signature_method,
    'typed_name', sp.typed_name,
    'typed_font_key', sp.typed_font_key,
    'drawing_data', sp.drawing_data,
    'signature_asset_id', sp.signature_asset_id,
    'source_image_filename', sp.source_image_filename,
    'extraction_version', sp.extraction_version,
    'is_active', sp.is_active,
    'updated_at', sp.updated_at
  )
  into result
  from public.signature_profiles sp
  where sp.user_id = actor_id;

  return result;
end
$function$;

create or replace function public.register_my_signature_asset(
  p_object_path text, p_original_filename text, p_byte_size bigint,
  p_content_hash text, p_extraction_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor record;
  object_metadata jsonb;
  result_id uuid;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN'; end if;
  select * into actor from private.report_actor();
  if not found then raise exception 'PROFILE_INACTIVE_OR_MISSING'; end if;
  if nullif(btrim(p_object_path), '') is null
     or p_object_path !~ ('^signatures/' || actor.user_id::text || '/[0-9a-fA-F-]{36}[.]png$') then raise exception 'SIGNATURE_OBJECT_PATH_INVALID'; end if;
  if nullif(btrim(p_original_filename), '') is null or nullif(btrim(p_content_hash), '') is null
     or p_byte_size is null or p_byte_size < 1 or p_byte_size > 10485760
     or nullif(btrim(coalesce(p_extraction_version, '')), '') is null then raise exception 'SIGNATURE_ASSET_METADATA_INVALID'; end if;
  select so.metadata into object_metadata from storage.objects so
  where so.bucket_id = 'widgetflow-signatures' and so.name = p_object_path
    and lower(coalesce(so.metadata ->> 'mimetype', '')) = 'image/png'
    and (storage.foldername(so.name))[1] = actor.user_id::text;
  if not found then raise exception 'SIGNATURE_OBJECT_NOT_FOUND'; end if;
  insert into public.asset_metadata (bucket_name, object_path, asset_purpose, owner_user_id, owner_name_snapshot, owner_role_key_snapshot, original_filename, mime_type, byte_size, content_hash, lifecycle_state, metadata)
  values ('widgetflow-signatures', p_object_path, 'signature_profile', actor.user_id, actor.full_name, actor.role_key, btrim(p_original_filename), 'image/png', p_byte_size, btrim(p_content_hash), 'active', jsonb_build_object('extractionVersion', btrim(p_extraction_version))) returning id into result_id;
  return result_id;
end
$function$;

revoke all on function public.register_my_signature_asset(text, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.register_my_signature_asset(text, text, bigint, text, text) to authenticated;
revoke all on function public.get_my_signature_profile() from public, anon, authenticated;
revoke all on function public.save_my_signature_profile(jsonb) from public, anon, authenticated;
grant execute on function public.get_my_signature_profile() to authenticated;
grant execute on function public.save_my_signature_profile(jsonb) to authenticated;
insert into private.widgetflow_schema_migrations (id, description) values ('048_signature_import_storage', 'Private imported signature storage, owned asset registration, and uploaded profile persistence');
commit;
