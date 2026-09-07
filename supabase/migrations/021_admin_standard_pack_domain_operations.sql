begin;

do $migration_guard$
begin
  if not exists (select 1 from private.widgetflow_schema_migrations where id = '020_configuration_operational_access') then
    raise exception 'WidgetFlow migration 020_configuration_operational_access must be applied first';
  end if;
  if exists (select 1 from private.widgetflow_schema_migrations where id = '021_admin_standard_pack_domain_operations') then
    raise exception 'WidgetFlow migration 021_admin_standard_pack_domain_operations has already been applied';
  end if;
end
$migration_guard$;

alter table public.standard_pack_versions
  add column if not exists name_snapshot text,
  add column if not exists description_snapshot text,
  add column if not exists category_id_snapshot uuid references public.categories(id) on delete set null,
  add column if not exists category_name_snapshot text;

update public.standard_pack_versions v
set name_snapshot = p.name,
    description_snapshot = p.description,
    category_id_snapshot = p.category_id,
    category_name_snapshot = p.category_name_snapshot
from public.standard_packs p
where p.id = v.pack_id and v.name_snapshot is null;

create index if not exists standard_pack_versions_pack_status_label_idx
  on public.standard_pack_versions (pack_id, status, version_label);

create or replace function private.guard_standard_pack_version_mutation()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'PACK_VERSION_IMMUTABLE'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    if old.status = 'published' and new.status = 'superseded'
      and new.structure_snapshot = old.structure_snapshot
      and new.name_snapshot is not distinct from old.name_snapshot
      and new.description_snapshot is not distinct from old.description_snapshot
      and new.category_id_snapshot is not distinct from old.category_id_snapshot
      and new.category_name_snapshot is not distinct from old.category_name_snapshot
      and new.version_label = old.version_label then
      return new;
    end if;
    raise exception 'PACK_VERSION_IMMUTABLE';
  end if;
  if tg_op = 'UPDATE' and old.status = 'draft' and new.status not in ('draft','published') then
    raise exception 'PACK_INVALID_STATUS';
  end if;
  return new;
end $function$;

create or replace function private.guard_standard_pack_item_mutation()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_version_status text; v_version_id uuid;
begin
  v_version_id := case when tg_op = 'DELETE' then old.pack_version_id else new.pack_version_id end;
  select status into v_version_status from public.standard_pack_versions where id = v_version_id;
  if v_version_status is distinct from 'draft' then raise exception 'PACK_VERSION_IMMUTABLE'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end $function$;

drop trigger if exists standard_pack_versions_immutable_guard on public.standard_pack_versions;
create trigger standard_pack_versions_immutable_guard
before update or delete on public.standard_pack_versions
for each row execute function private.guard_standard_pack_version_mutation();
drop trigger if exists standard_pack_items_immutable_guard on public.standard_pack_items;
create trigger standard_pack_items_immutable_guard
before insert or update or delete on public.standard_pack_items
for each row execute function private.guard_standard_pack_item_mutation();

create or replace function private.validate_standard_pack_payload(p_structure jsonb, p_items jsonb)
returns void language plpgsql immutable security definer set search_path = '' as $function$
declare v_item jsonb;
begin
  if jsonb_typeof(p_structure) <> 'array' or jsonb_typeof(p_items) <> 'array' then raise exception 'PACK_INVALID_PAYLOAD'; end if;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or nullif(btrim(v_item->>'sourceType'), '') is null
      or v_item->>'sourceType' not in ('field','element','content')
      or nullif(btrim(v_item->>'label'), '') is null
      or jsonb_typeof(coalesce(v_item->'configuration', '{}'::jsonb)) <> 'object'
      or (v_item ? 'sourceKey' and jsonb_typeof(v_item->'sourceKey') not in ('string','null'))
    then raise exception 'PACK_INVALID_PAYLOAD'; end if;
  end loop;
end $function$;

create or replace function private.next_standard_pack_version_label(p_pack_id uuid)
returns text language plpgsql security definer set search_path = '' as $function$
declare v_minor integer;
begin
  select coalesce(max((substring(version_label from '^v1\.([0-9]+)$'))::integer), -1) + 1 into v_minor
  from public.standard_pack_versions where pack_id = p_pack_id;
  return 'v1.' || v_minor::text;
end $function$;

create or replace function public.admin_create_standard_pack(
  p_name text, p_description text, p_category_id uuid, p_structure jsonb, p_items jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_pack public.standard_packs%rowtype; v_version public.standard_pack_versions%rowtype;
  v_category_name text; v_actor record; v_item jsonb; v_order integer := 0;
begin
  if not private.current_user_is_protected_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if nullif(btrim(p_name), '') is null then raise exception 'PACK_NAME_REQUIRED'; end if;
  perform private.validate_standard_pack_payload(p_structure, p_items);
  if p_category_id is not null then
    select name into v_category_name from public.categories where id = p_category_id and status = 'Active';
    if not found then raise exception 'PACK_CATEGORY_NOT_FOUND'; end if;
  end if;
  select p.full_name, r.key as role_key into v_actor from public.profiles p join public.roles r on r.id = p.role_id where p.id = auth.uid();
  insert into public.standard_packs (name, description, category_id, category_name_snapshot, status,
    created_by_user_id, creator_name_snapshot, creator_role_key_snapshot)
  values (btrim(p_name), coalesce(btrim(p_description), ''), p_category_id, v_category_name, 'draft', auth.uid(), v_actor.full_name, v_actor.role_key)
  returning * into v_pack;
  insert into public.standard_pack_versions (pack_id, version_label, status, structure_snapshot,
    name_snapshot, description_snapshot, category_id_snapshot, category_name_snapshot,
    created_by_user_id, creator_name_snapshot, creator_role_key_snapshot)
  values (v_pack.id, 'v1.0', 'draft', p_structure, v_pack.name, v_pack.description, v_pack.category_id,
    v_pack.category_name_snapshot, auth.uid(), v_actor.full_name, v_actor.role_key)
  returning * into v_version;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    insert into public.standard_pack_items (pack_version_id, source_type, source_key, label, configuration_snapshot, display_order)
    values (v_version.id, v_item->>'sourceType', nullif(v_item->>'sourceKey',''), btrim(v_item->>'label'), coalesce(v_item->'configuration','{}'::jsonb), v_order);
    v_order := v_order + 1;
  end loop;
  perform private.write_admin_audit(auth.uid(), 'STANDARD_PACK_CREATED', 'standard_pack', v_pack.id::text, v_pack.name, null,
    jsonb_build_object('status', v_pack.status, 'version', v_version.version_label), jsonb_build_object('flow','admin-create-standard-pack'));
  return jsonb_build_object('id', v_pack.id, 'versionId', v_version.id);
end $function$;

create or replace function public.admin_save_standard_pack_draft(
  p_pack_id uuid, p_name text, p_description text, p_category_id uuid, p_structure jsonb, p_items jsonb
) returns void language plpgsql security definer set search_path = '' as $function$
declare v_pack public.standard_packs%rowtype; v_version public.standard_pack_versions%rowtype; v_category_name text; v_item jsonb; v_order integer := 0; v_previous jsonb;
begin
  if not private.current_user_is_protected_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if nullif(btrim(p_name), '') is null then raise exception 'PACK_NAME_REQUIRED'; end if;
  perform private.validate_standard_pack_payload(p_structure, p_items);
  select * into v_pack from public.standard_packs where id = p_pack_id for update;
  if not found then raise exception 'PACK_NOT_FOUND'; end if;
  if v_pack.status = 'archived' then raise exception 'PACK_ALREADY_ARCHIVED'; end if;
  select * into v_version from public.standard_pack_versions where pack_id = p_pack_id and status = 'draft' for update;
  if not found then raise exception 'PACK_DRAFT_NOT_FOUND'; end if;
  if p_category_id is not null then
    select name into v_category_name from public.categories where id = p_category_id and status = 'Active';
    if not found then raise exception 'PACK_CATEGORY_NOT_FOUND'; end if;
  end if;
  v_previous := jsonb_build_object('name',v_version.name_snapshot,'description',v_version.description_snapshot,'categoryId',v_version.category_id_snapshot,'structure',v_version.structure_snapshot);
  update public.standard_pack_versions set structure_snapshot = p_structure, name_snapshot = btrim(p_name),
    description_snapshot = coalesce(btrim(p_description), ''), category_id_snapshot = p_category_id,
    category_name_snapshot = v_category_name
  where id = v_version.id;
  delete from public.standard_pack_items where pack_version_id = v_version.id;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    insert into public.standard_pack_items (pack_version_id, source_type, source_key, label, configuration_snapshot, display_order)
    values (v_version.id, v_item->>'sourceType', nullif(v_item->>'sourceKey',''), btrim(v_item->>'label'), coalesce(v_item->'configuration','{}'::jsonb), v_order);
    v_order := v_order + 1;
  end loop;
  perform private.write_admin_audit(auth.uid(), 'STANDARD_PACK_DRAFT_SAVED', 'standard_pack', p_pack_id::text, v_pack.name,
    v_previous, jsonb_build_object('name',btrim(p_name),'description',coalesce(btrim(p_description),''),'categoryId',p_category_id,'version',v_version.version_label), jsonb_build_object('flow','admin-save-standard-pack-draft'));
end $function$;

create or replace function public.admin_create_standard_pack_version(p_pack_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_pack public.standard_packs%rowtype; v_source public.standard_pack_versions%rowtype; v_draft public.standard_pack_versions%rowtype; v_label text;
begin
  if not private.current_user_is_protected_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select * into v_pack from public.standard_packs where id = p_pack_id for update;
  if not found then raise exception 'PACK_NOT_FOUND'; end if;
  if v_pack.status = 'archived' then raise exception 'PACK_ALREADY_ARCHIVED'; end if;
  select * into v_source from public.standard_pack_versions where pack_id = p_pack_id and status = 'published' for update;
  if not found then raise exception 'PACK_PUBLISHED_VERSION_NOT_FOUND'; end if;
  if exists (select 1 from public.standard_pack_versions where pack_id = p_pack_id and status = 'draft') then raise exception 'PACK_VERSION_CONFLICT'; end if;
  v_label := private.next_standard_pack_version_label(p_pack_id);
  insert into public.standard_pack_versions (pack_id, version_label, status, structure_snapshot,
    name_snapshot, description_snapshot, category_id_snapshot, category_name_snapshot,
    created_by_user_id, creator_name_snapshot, creator_role_key_snapshot)
  values (p_pack_id, v_label, 'draft', v_source.structure_snapshot, v_source.name_snapshot, v_source.description_snapshot,
    v_source.category_id_snapshot, v_source.category_name_snapshot, auth.uid(), v_source.creator_name_snapshot, v_source.creator_role_key_snapshot)
  returning * into v_draft;
  insert into public.standard_pack_items (pack_version_id, source_type, source_key, source_content_item_id, label, configuration_snapshot, display_order)
  select v_draft.id, source_type, source_key, source_content_item_id, label, configuration_snapshot, display_order
  from public.standard_pack_items where pack_version_id = v_source.id order by display_order;
  perform private.write_admin_audit(auth.uid(), 'STANDARD_PACK_VERSION_CREATED', 'standard_pack', p_pack_id::text, v_pack.name,
    jsonb_build_object('version',v_source.version_label), jsonb_build_object('version',v_label), jsonb_build_object('flow','admin-create-standard-pack-version'));
  return jsonb_build_object('id', v_draft.id, 'versionLabel', v_label);
end $function$;

create or replace function public.admin_publish_standard_pack(p_pack_id uuid, p_version_id uuid)
returns void language plpgsql security definer set search_path = '' as $function$
declare v_pack public.standard_packs%rowtype; v_draft public.standard_pack_versions%rowtype; v_published public.standard_pack_versions%rowtype; v_previous jsonb;
begin
  if not private.current_user_is_protected_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select * into v_pack from public.standard_packs where id = p_pack_id for update;
  if not found then raise exception 'PACK_NOT_FOUND'; end if;
  select * into v_draft from public.standard_pack_versions where id = p_version_id and pack_id = p_pack_id and status = 'draft' for update;
  if not found then raise exception 'PACK_DRAFT_NOT_FOUND'; end if;
  perform private.validate_standard_pack_payload(v_draft.structure_snapshot,
    coalesce((select jsonb_agg(jsonb_build_object('sourceType',i.source_type,'sourceKey',i.source_key,'label',i.label,'configuration',i.configuration_snapshot) order by i.display_order)
      from public.standard_pack_items i where i.pack_version_id = v_draft.id), '[]'::jsonb));
  select * into v_published from public.standard_pack_versions where pack_id = p_pack_id and status = 'published' for update;
  v_previous := jsonb_build_object('packStatus',v_pack.status,'publishedVersion',v_published.version_label);
  if found then update public.standard_pack_versions set status = 'superseded' where id = v_published.id; end if;
  update public.standard_pack_versions set status = 'published', published_at = statement_timestamp() where id = v_draft.id;
  update public.standard_packs set name = v_draft.name_snapshot, description = v_draft.description_snapshot,
    category_id = v_draft.category_id_snapshot, category_name_snapshot = v_draft.category_name_snapshot, status = 'published'
  where id = p_pack_id;
  perform private.write_admin_audit(auth.uid(), 'STANDARD_PACK_PUBLISHED', 'standard_pack', p_pack_id::text, v_draft.name_snapshot,
    v_previous, jsonb_build_object('packStatus','published','publishedVersion',v_draft.version_label), jsonb_build_object('flow','admin-publish-standard-pack'));
end $function$;

create or replace function public.admin_set_standard_pack_status(p_pack_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $function$
declare v_pack public.standard_packs%rowtype; v_previous text;
begin
  if not private.current_user_is_protected_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_status not in ('disabled','published','archived') then raise exception 'PACK_INVALID_STATUS'; end if;
  select * into v_pack from public.standard_packs where id = p_pack_id for update;
  if not found then raise exception 'PACK_NOT_FOUND'; end if;
  v_previous := v_pack.status;
  if v_pack.status = 'archived' then raise exception 'PACK_ALREADY_ARCHIVED'; end if;
  if p_status = 'disabled' and v_pack.status <> 'published' then raise exception 'PACK_INVALID_STATUS'; end if;
  if p_status = 'published' and v_pack.status <> 'disabled' then raise exception 'PACK_INVALID_STATUS'; end if;
  if p_status = 'published' and not exists (select 1 from public.standard_pack_versions where pack_id = p_pack_id and status = 'published') then
    raise exception 'PACK_PUBLISHED_VERSION_NOT_FOUND';
  end if;
  update public.standard_packs set status = p_status where id = p_pack_id;
  perform private.write_admin_audit(auth.uid(), case when p_status = 'disabled' then 'STANDARD_PACK_DISABLED' when p_status = 'published' then 'STANDARD_PACK_ENABLED' else 'STANDARD_PACK_ARCHIVED' end,
    'standard_pack', p_pack_id::text, v_pack.name, jsonb_build_object('status',v_previous), jsonb_build_object('status',p_status), jsonb_build_object('flow','admin-set-standard-pack-status'));
end $function$;

revoke all on function private.guard_standard_pack_version_mutation() from public, anon, authenticated, service_role;
revoke all on function private.guard_standard_pack_item_mutation() from public, anon, authenticated, service_role;
revoke all on function private.validate_standard_pack_payload(jsonb,jsonb) from public, anon, authenticated, service_role;
revoke all on function private.next_standard_pack_version_label(uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_create_standard_pack(text,text,uuid,jsonb,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.admin_save_standard_pack_draft(uuid,text,text,uuid,jsonb,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.admin_create_standard_pack_version(uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_publish_standard_pack(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_set_standard_pack_status(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.admin_create_standard_pack(text,text,uuid,jsonb,jsonb) to authenticated;
grant execute on function public.admin_save_standard_pack_draft(uuid,text,text,uuid,jsonb,jsonb) to authenticated;
grant execute on function public.admin_create_standard_pack_version(uuid) to authenticated;
grant execute on function public.admin_publish_standard_pack(uuid,uuid) to authenticated;
grant execute on function public.admin_set_standard_pack_status(uuid,text) to authenticated;

revoke insert, update, delete, truncate, references, trigger
on table public.standard_packs, public.standard_pack_versions, public.standard_pack_items
from anon, authenticated;

insert into private.widgetflow_schema_migrations (id, description)
values ('021_admin_standard_pack_domain_operations', 'Protected Admin Standard Pack draft, version, publish, status, and immutability lifecycle');

commit;
