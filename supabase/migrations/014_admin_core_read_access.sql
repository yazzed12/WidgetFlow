begin;

do $migration_guard$
begin
  if not exists (
    select 1 from private.widgetflow_schema_migrations where id = '013_profile_codes'
  ) then
    raise exception 'WidgetFlow migration 013_profile_codes must be applied first';
  end if;
  if exists (
    select 1 from private.widgetflow_schema_migrations where id = '014_admin_core_read_access'
  ) then
    raise exception 'WidgetFlow migration 014_admin_core_read_access has already been applied';
  end if;
end
$migration_guard$;

grant select on table
  public.categories,
  public.standard_packs,
  public.standard_pack_versions,
  public.standard_pack_items
to authenticated;

create policy categories_select_protected_admin
on public.categories for select to authenticated
using ((select private.current_user_is_protected_admin()));

create policy standard_packs_select_protected_admin
on public.standard_packs for select to authenticated
using ((select private.current_user_is_protected_admin()));

create policy standard_pack_versions_select_protected_admin
on public.standard_pack_versions for select to authenticated
using ((select private.current_user_is_protected_admin()));

create policy standard_pack_items_select_protected_admin
on public.standard_pack_items for select to authenticated
using ((select private.current_user_is_protected_admin()));

-- Reads are explicit and protected. Browser roles never receive table mutation grants.
revoke insert, update, delete, truncate, references, trigger
on table public.categories, public.standard_packs, public.standard_pack_versions,
  public.standard_pack_items
from anon, authenticated;
revoke all on table public.categories, public.standard_packs,
  public.standard_pack_versions, public.standard_pack_items from anon;

create or replace function public.admin_overview_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_recent_audit jsonb;
begin
  if not private.current_user_is_protected_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', recent.id,
      'eventType', recent.event_type,
      'actorName', recent.actor_name,
      'actorRoleName', recent.actor_role_name,
      'targetType', recent.target_type,
      'targetLabel', recent.target_label,
      'occurredAt', recent.occurred_at
    ) order by recent.occurred_at desc
  ), '[]'::jsonb)
  into v_recent_audit
  from (
    select e.id, e.event_type, e.actor_name, e.actor_role_name,
      e.target_type, e.target_label, e.occurred_at
    from public.admin_audit_events e
    order by e.occurred_at desc
    limit 5
  ) recent;

  return jsonb_build_object(
    'userCount', (select count(*) from public.profiles),
    'activeUserCount', (select count(*) from public.profiles where status = 'Active'),
    'roleCount', (select count(*) from public.roles),
    'customRoleCount', (select count(*) from public.roles where role_type = 'Custom'),
    'categoryCount', (select count(*) from public.categories),
    'activeCategoryCount', (select count(*) from public.categories where status = 'Active'),
    'packCount', (select count(*) from public.standard_packs),
    'publishedPackCount', (select count(*) from public.standard_packs where status = 'published'),
    'contentItemCount', (select count(*) from public.content_library_items),
    'enabledContentItemCount', (select count(*) from public.content_library_items where is_enabled),
    'featureCount', (select count(*) from public.feature_settings),
    'enabledFeatureCount', (select count(*) from public.feature_settings where enabled),
    'elementCount', (select count(*) from public.element_settings),
    'enabledElementCount', (select count(*) from public.element_settings where enabled),
    'auditEventCount', (select count(*) from public.admin_audit_events),
    'recentAudit', v_recent_audit
  );
end
$function$;

revoke all on function public.admin_overview_summary() from public, anon, authenticated, service_role;
grant execute on function public.admin_overview_summary() to authenticated;

insert into private.widgetflow_schema_migrations (id, description)
values ('014_admin_core_read_access', 'Protected Admin reads and aggregate overview for the Admin core cutover');

commit;
