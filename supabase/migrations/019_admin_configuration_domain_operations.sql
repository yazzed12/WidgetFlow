begin;

do $migration_guard$
begin
  if not exists (select 1 from private.widgetflow_schema_migrations where id = '018_configuration_read_access') then
    raise exception 'WidgetFlow migration 018_configuration_read_access must be applied first';
  end if;
  if exists (select 1 from private.widgetflow_schema_migrations where id = '019_admin_configuration_domain_operations') then
    raise exception 'WidgetFlow migration 019_admin_configuration_domain_operations has already been applied';
  end if;
end
$migration_guard$;

create or replace function public.admin_set_feature_enabled(p_key text, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $function$
declare v_previous boolean;
begin
  if not private.current_user_is_protected_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select enabled into v_previous from public.feature_settings where key = p_key for update;
  if not found then raise exception 'FEATURE_NOT_FOUND'; end if;
  update public.feature_settings set enabled = p_enabled, updated_by_user_id = auth.uid(),
    updated_at = statement_timestamp() where key = p_key;
  perform private.write_admin_audit(auth.uid(), case when p_enabled then 'FEATURE_ENABLED' else 'FEATURE_DISABLED' end,
    'feature', p_key, p_key, jsonb_build_object('enabled', v_previous), jsonb_build_object('enabled', p_enabled),
    jsonb_build_object('flow', 'admin-set-feature'));
end $function$;

create or replace function public.admin_set_element_enabled(p_key text, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $function$
declare v_previous boolean;
begin
  if not private.current_user_is_protected_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select enabled into v_previous from public.element_settings where key = p_key for update;
  if not found then raise exception 'ELEMENT_NOT_FOUND'; end if;
  update public.element_settings set enabled = p_enabled, updated_by_user_id = auth.uid(),
    updated_at = statement_timestamp() where key = p_key;
  perform private.write_admin_audit(auth.uid(), case when p_enabled then 'ELEMENT_ENABLED' else 'ELEMENT_DISABLED' end,
    'element', p_key, p_key, jsonb_build_object('enabled', v_previous), jsonb_build_object('enabled', p_enabled),
    jsonb_build_object('flow', 'admin-set-element'));
end $function$;

create or replace function public.admin_update_system_settings(
  p_organization_name text, p_platform_name text, p_default_template_version text,
  p_allow_report_rejection boolean, p_allow_report_return boolean,
  p_digital_signatures_enabled boolean, p_template_governance_enabled boolean
) returns void language plpgsql security definer set search_path = '' as $function$
declare v_previous jsonb; v_current jsonb;
begin
  if not private.current_user_is_protected_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if nullif(btrim(p_organization_name), '') is null or nullif(btrim(p_platform_name), '') is null
    or nullif(btrim(p_default_template_version), '') is null then raise exception 'INVALID_INPUT'; end if;
  select to_jsonb(s) into v_previous from public.system_settings s where id = 'default' for update;
  insert into public.system_settings (id, organization_name, platform_name, default_template_version,
    allow_report_rejection, allow_report_return, digital_signatures_enabled,
    template_governance_enabled, updated_by_user_id)
  values ('default', btrim(p_organization_name), btrim(p_platform_name), btrim(p_default_template_version),
    p_allow_report_rejection, p_allow_report_return, p_digital_signatures_enabled,
    p_template_governance_enabled, auth.uid())
  on conflict (id) do update set organization_name = excluded.organization_name,
    platform_name = excluded.platform_name, default_template_version = excluded.default_template_version,
    allow_report_rejection = excluded.allow_report_rejection, allow_report_return = excluded.allow_report_return,
    digital_signatures_enabled = excluded.digital_signatures_enabled,
    template_governance_enabled = excluded.template_governance_enabled,
    updated_by_user_id = auth.uid();
  select to_jsonb(s) into v_current from public.system_settings s where id = 'default';
  perform private.write_admin_audit(auth.uid(), 'SYSTEM_SETTINGS_UPDATED', 'system_settings', 'default',
    'System settings', v_previous, v_current, jsonb_build_object('flow', 'admin-update-system-settings'));
end $function$;

create or replace function public.admin_create_content_library_item(
  p_name text, p_description text, p_category text, p_content_type text, p_content_value text
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_item public.content_library_items%rowtype; v_actor record;
begin
  if not private.current_user_is_protected_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if nullif(btrim(p_name), '') is null or nullif(btrim(p_category), '') is null
    or nullif(btrim(p_content_value), '') is null
    or p_content_type not in ('Heading','Text Block','Disclaimer','Instruction','Label','Section Intro')
  then raise exception 'INVALID_INPUT'; end if;
  select p.full_name, r.key as role_key into v_actor from public.profiles p join public.roles r on r.id = p.role_id
    where p.id = auth.uid();
  insert into public.content_library_items (name, description, category, content_type, content_value,
    created_by_user_id, creator_name_snapshot, creator_role_key_snapshot)
  values (btrim(p_name), coalesce(btrim(p_description), ''), btrim(p_category), p_content_type,
    btrim(p_content_value), auth.uid(), v_actor.full_name, v_actor.role_key) returning * into v_item;
  perform private.write_admin_audit(auth.uid(), 'CONTENT_ITEM_CREATED', 'content_library_item', v_item.id::text,
    v_item.name, null, to_jsonb(v_item), jsonb_build_object('flow', 'admin-create-content-item'));
  return jsonb_build_object('id', v_item.id);
end $function$;

create or replace function public.admin_update_content_library_item(
  p_item_id uuid, p_name text, p_description text, p_category text, p_content_type text, p_content_value text
) returns void language plpgsql security definer set search_path = '' as $function$
declare v_item public.content_library_items%rowtype; v_previous jsonb;
begin
  if not private.current_user_is_protected_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_item_id is null or nullif(btrim(p_name), '') is null or nullif(btrim(p_category), '') is null
    or nullif(btrim(p_content_value), '') is null
    or p_content_type not in ('Heading','Text Block','Disclaimer','Instruction','Label','Section Intro')
  then raise exception 'INVALID_INPUT'; end if;
  select * into v_item from public.content_library_items where id = p_item_id for update;
  if not found then raise exception 'CONTENT_ITEM_NOT_FOUND'; end if;
  v_previous := to_jsonb(v_item);
  update public.content_library_items set name = btrim(p_name), description = coalesce(btrim(p_description), ''),
    category = btrim(p_category), content_type = p_content_type, content_value = btrim(p_content_value)
    where id = p_item_id returning * into v_item;
  perform private.write_admin_audit(auth.uid(), 'CONTENT_ITEM_UPDATED', 'content_library_item', v_item.id::text,
    v_item.name, v_previous, to_jsonb(v_item), jsonb_build_object('flow', 'admin-update-content-item'));
end $function$;

create or replace function public.admin_set_content_library_item_enabled(p_item_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $function$
declare v_item public.content_library_items%rowtype;
begin
  if not private.current_user_is_protected_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select * into v_item from public.content_library_items where id = p_item_id for update;
  if not found then raise exception 'CONTENT_ITEM_NOT_FOUND'; end if;
  update public.content_library_items set is_enabled = p_enabled where id = p_item_id;
  perform private.write_admin_audit(auth.uid(), case when p_enabled then 'CONTENT_ITEM_ENABLED' else 'CONTENT_ITEM_DISABLED' end,
    'content_library_item', v_item.id::text, v_item.name, jsonb_build_object('enabled', v_item.is_enabled),
    jsonb_build_object('enabled', p_enabled), jsonb_build_object('flow', 'admin-set-content-item-status'));
end $function$;

create or replace function private.validate_governance_route(
  p_level text, p_strategy text, p_role_id uuid, p_user_id uuid
) returns void language plpgsql stable security definer set search_path = '' as $function$
begin
  if p_level not in ('Employee','Manager','Director')
    or p_strategy not in ('SPECIFIC_USER','ROLE_QUEUE','DIRECT_PUBLISH') then raise exception 'INVALID_GOVERNANCE_ROUTE'; end if;
  if p_strategy = 'DIRECT_PUBLISH' then
    if p_role_id is not null or p_user_id is not null then raise exception 'INVALID_GOVERNANCE_ROUTE'; end if;
    return;
  end if;
  if p_role_id is null or (p_strategy = 'ROLE_QUEUE' and p_user_id is not null)
    or (p_strategy = 'SPECIFIC_USER' and p_user_id is null) then raise exception 'INVALID_GOVERNANCE_ROUTE'; end if;
  if not exists (select 1 from public.roles r where r.id = p_role_id and r.is_active
    and not (r.is_protected and lower(btrim(r.key)) = 'admin')
    and exists (select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_key = 'template_approvals.view')
    and exists (select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_key = 'template_approvals.approve'))
  then raise exception 'INELIGIBLE_GOVERNANCE_ROLE'; end if;
  if p_strategy = 'SPECIFIC_USER' and not exists (select 1 from public.profiles p
    where p.id = p_user_id and p.role_id = p_role_id and p.status = 'Active')
  then raise exception 'INELIGIBLE_GOVERNANCE_REVIEWER'; end if;
  if p_strategy = 'ROLE_QUEUE' and not exists (select 1 from public.profiles p
    where p.role_id = p_role_id and p.status = 'Active')
  then raise exception 'GOVERNANCE_ROLE_QUEUE_EMPTY'; end if;
end $function$;

create or replace function public.admin_update_governance_routes(
  p_employee_strategy text, p_employee_target_role_id uuid, p_employee_specific_user_id uuid,
  p_manager_strategy text, p_manager_target_role_id uuid, p_manager_specific_user_id uuid,
  p_director_strategy text, p_director_target_role_id uuid, p_director_specific_user_id uuid
) returns void language plpgsql security definer set search_path = '' as $function$
declare v_previous jsonb; v_current jsonb; v_route record;
begin
  if not private.current_user_is_protected_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  perform private.validate_governance_route('Employee', p_employee_strategy, p_employee_target_role_id, p_employee_specific_user_id);
  perform private.validate_governance_route('Manager', p_manager_strategy, p_manager_target_role_id, p_manager_specific_user_id);
  perform private.validate_governance_route('Director', p_director_strategy, p_director_target_role_id, p_director_specific_user_id);
  select coalesce(jsonb_agg(to_jsonb(g) order by g.creator_governance_level), '[]'::jsonb)
    into v_previous from public.governance_routes g where g.is_active;
  for v_route in select * from (values
    ('Employee',p_employee_strategy,p_employee_target_role_id,p_employee_specific_user_id),
    ('Manager',p_manager_strategy,p_manager_target_role_id,p_manager_specific_user_id),
    ('Director',p_director_strategy,p_director_target_role_id,p_director_specific_user_id)
  ) as routes(level_name,strategy_name,role_id,user_id)
  loop
    update public.governance_routes set strategy = v_route.strategy_name,
      target_role_id = v_route.role_id, specific_user_id = v_route.user_id,
      updated_by_user_id = auth.uid()
    where creator_governance_level = v_route.level_name and is_active;
    if not found then
      insert into public.governance_routes (creator_governance_level, strategy, target_role_id,
        specific_user_id, created_by_user_id, updated_by_user_id)
      values (v_route.level_name, v_route.strategy_name, v_route.role_id, v_route.user_id, auth.uid(), auth.uid());
    end if;
  end loop;
  select coalesce(jsonb_agg(to_jsonb(g) order by g.creator_governance_level), '[]'::jsonb)
    into v_current from public.governance_routes g where g.is_active;
  perform private.write_admin_audit(auth.uid(), 'GOVERNANCE_ROUTES_UPDATED', 'governance_routes', 'active',
    'Template governance routes', v_previous, v_current, jsonb_build_object('flow', 'admin-update-governance-routes'));
end $function$;

revoke all on function public.admin_set_feature_enabled(text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.admin_set_element_enabled(text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.admin_update_system_settings(text,text,text,boolean,boolean,boolean,boolean) from public, anon, authenticated, service_role;
revoke all on function public.admin_create_content_library_item(text,text,text,text,text) from public, anon, authenticated, service_role;
revoke all on function public.admin_update_content_library_item(uuid,text,text,text,text,text) from public, anon, authenticated, service_role;
revoke all on function public.admin_set_content_library_item_enabled(uuid,boolean) from public, anon, authenticated, service_role;
revoke all on function private.validate_governance_route(text,text,uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_update_governance_routes(text,uuid,uuid,text,uuid,uuid,text,uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_set_feature_enabled(text, boolean) to authenticated;
grant execute on function public.admin_set_element_enabled(text, boolean) to authenticated;
grant execute on function public.admin_update_system_settings(text,text,text,boolean,boolean,boolean,boolean) to authenticated;
grant execute on function public.admin_create_content_library_item(text,text,text,text,text) to authenticated;
grant execute on function public.admin_update_content_library_item(uuid,text,text,text,text,text) to authenticated;
grant execute on function public.admin_set_content_library_item_enabled(uuid,boolean) to authenticated;
grant execute on function public.admin_update_governance_routes(text,uuid,uuid,text,uuid,uuid,text,uuid,uuid) to authenticated;

revoke insert, update, delete, truncate, references, trigger on table public.feature_settings,
  public.element_settings, public.system_settings, public.governance_routes, public.content_library_items
from anon, authenticated;

insert into private.widgetflow_schema_migrations (id, description)
values ('019_admin_configuration_domain_operations', 'Audited protected Admin operations for configuration, governance, and shared content');

commit;
