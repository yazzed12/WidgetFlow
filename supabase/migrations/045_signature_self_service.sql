begin;

do $guard$
begin
  if not exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '044_signature_profile_v2_foundation'
  ) then
    raise exception 'WidgetFlow migration 044_signature_profile_v2_foundation must be applied first';
  end if;

  if exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '045_signature_self_service'
  ) then
    raise exception 'WidgetFlow migration 045_signature_self_service has already been applied';
  end if;
end
$guard$;


create or replace function public.get_my_signature_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  actor_active boolean := false;
  result jsonb;
begin
  if actor_id is null then
    raise exception 'FORBIDDEN';
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.user_id = actor_id
      and lower(btrim(coalesce(p.status, ''))) = 'active'
  )
  into actor_active;

  if not actor_active then
    raise exception 'PROFILE_INACTIVE_OR_MISSING';
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
  where sp.user_id = actor_id
    and sp.is_active = true;

  return result;
end
$function$;


create or replace function public.save_my_signature_profile(p_signature jsonb)
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
    where p.user_id = actor_id
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

    raise exception 'UPLOADED_SIGNATURE_STORAGE_UNAVAILABLE';


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


revoke all on function public.get_my_signature_profile()
from public, anon, authenticated;

revoke all on function public.save_my_signature_profile(jsonb)
from public, anon, authenticated;

grant execute on function public.get_my_signature_profile()
to authenticated;

grant execute on function public.save_my_signature_profile(jsonb)
to authenticated;


insert into private.widgetflow_schema_migrations (id, description)
values (
  '045_signature_self_service',
  'Authenticated self-service signature profile RPCs with V2 validation'
);

commit;