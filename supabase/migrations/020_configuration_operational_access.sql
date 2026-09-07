begin;

do $migration_guard$
begin
  if not exists (select 1 from private.widgetflow_schema_migrations where id = '019_admin_configuration_domain_operations') then
    raise exception 'WidgetFlow migration 019_admin_configuration_domain_operations must be applied first';
  end if;
  if exists (select 1 from private.widgetflow_schema_migrations where id = '020_configuration_operational_access') then
    raise exception 'WidgetFlow migration 020_configuration_operational_access has already been applied';
  end if;
end
$migration_guard$;

create or replace function public.current_effective_system_config()
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_features jsonb; v_elements jsonb; v_settings jsonb; v_governance jsonb;
begin
  if not private.current_user_is_active() then raise exception 'ACCOUNT_INACTIVE'; end if;
  select coalesce(jsonb_object_agg(f.key, f.enabled order by f.key), '{}'::jsonb) into v_features
    from public.feature_settings f;
  select coalesce(jsonb_object_agg(e.key, e.enabled order by e.key), '{}'::jsonb) into v_elements
    from public.element_settings e;
  select jsonb_build_object('org_name', s.organization_name, 'platform_name', s.platform_name,
    'default_template_version', s.default_template_version, 'allow_rejection', s.allow_report_rejection,
    'allow_return', s.allow_report_return, 'digital_signature', s.digital_signatures_enabled,
    'template_governance', s.template_governance_enabled)
    into v_settings from public.system_settings s where s.id = 'default';
  select jsonb_build_object('creatorLevel', r.governance_level, 'strategy', g.strategy,
    'isDirectPublish', g.strategy = 'DIRECT_PUBLISH') into v_governance
  from public.profiles p join public.roles r on r.id = p.role_id and r.is_active
  left join public.governance_routes g on g.creator_governance_level = r.governance_level and g.is_active
  where p.id = auth.uid() and p.status = 'Active';
  return jsonb_build_object('features', v_features, 'elements', v_elements,
    'settings', coalesce(v_settings, '{}'::jsonb), 'governance', v_governance);
end $function$;

create policy content_library_items_select_operational on public.content_library_items
for select to authenticated using (
  is_enabled and (select private.current_user_is_active())
  and (select private.current_user_has_permission('studio.content.use'))
);
create policy standard_packs_select_operational on public.standard_packs
for select to authenticated using (
  status = 'published' and (select private.current_user_is_active())
  and (select private.current_user_has_permission('studio.standard_packs.use'))
);
create policy standard_pack_versions_select_operational on public.standard_pack_versions
for select to authenticated using (
  status = 'published' and (select private.current_user_is_active())
  and (select private.current_user_has_permission('studio.standard_packs.use'))
  and exists (select 1 from public.standard_packs p where p.id = pack_id and p.status = 'published')
);
create policy standard_pack_items_select_operational on public.standard_pack_items
for select to authenticated using (
  (select private.current_user_is_active())
  and (select private.current_user_has_permission('studio.standard_packs.use'))
  and exists (select 1 from public.standard_pack_versions v join public.standard_packs p on p.id = v.pack_id
    where v.id = pack_version_id and v.status = 'published' and p.status = 'published')
);

revoke all on function public.current_effective_system_config() from public, anon, authenticated, service_role;
grant execute on function public.current_effective_system_config() to authenticated;
revoke all on table public.user_packs from anon, authenticated;

insert into private.widgetflow_schema_migrations (id, description)
values ('020_configuration_operational_access', 'Effective configuration and permission-gated operational shared-content reads');

commit;
