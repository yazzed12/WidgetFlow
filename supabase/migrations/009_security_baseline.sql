begin;

do $migration_guard$
begin
  if exists (
    select 1 from private.widgetflow_schema_migrations
    where id = '009_security_baseline'
  ) then
    raise exception 'WidgetFlow migration 009_security_baseline has already been applied';
  end if;
end
$migration_guard$;

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.user_role_history enable row level security;
alter table public.categories enable row level security;
alter table public.feature_settings enable row level security;
alter table public.element_settings enable row level security;
alter table public.system_settings enable row level security;
alter table public.governance_routes enable row level security;
alter table public.templates enable row level security;
alter table public.template_sections enable row level security;
alter table public.template_fields enable row level security;
alter table public.template_tags enable row level security;
alter table public.template_versions enable row level security;
alter table public.template_comments enable row level security;
alter table public.template_audit_events enable row level security;
alter table public.reports enable row level security;
alter table public.report_values enable row level security;
alter table public.report_comments enable row level security;
alter table public.report_audit_events enable row level security;
alter table public.signature_profiles enable row level security;
alter table public.report_signature_events enable row level security;
alter table public.content_library_items enable row level security;
alter table public.standard_packs enable row level security;
alter table public.standard_pack_versions enable row level security;
alter table public.standard_pack_items enable row level security;
alter table public.user_packs enable row level security;
alter table public.workflow_definitions enable row level security;
alter table public.workflow_versions enable row level security;
alter table public.workflow_instances enable row level security;
alter table public.workflow_tasks enable row level security;
alter table public.workflow_events enable row level security;
alter table public.notifications enable row level security;
alter table public.asset_metadata enable row level security;
alter table public.admin_audit_events enable row level security;
alter table public.application_auth_events enable row level security;

revoke all privileges on table
  public.roles,
  public.permissions,
  public.role_permissions,
  public.profiles,
  public.user_role_history,
  public.categories,
  public.feature_settings,
  public.element_settings,
  public.system_settings,
  public.governance_routes,
  public.templates,
  public.template_sections,
  public.template_fields,
  public.template_tags,
  public.template_versions,
  public.template_comments,
  public.template_audit_events,
  public.reports,
  public.report_values,
  public.report_comments,
  public.report_audit_events,
  public.signature_profiles,
  public.report_signature_events,
  public.content_library_items,
  public.standard_packs,
  public.standard_pack_versions,
  public.standard_pack_items,
  public.user_packs,
  public.workflow_definitions,
  public.workflow_versions,
  public.workflow_instances,
  public.workflow_tasks,
  public.workflow_events,
  public.notifications,
  public.asset_metadata,
  public.admin_audit_events,
  public.application_auth_events
from anon, authenticated;

insert into private.widgetflow_schema_migrations (id, description)
values ('009_security_baseline', 'RLS enabled and Data API roles denied pending explicit Phase 2/3 grants and policies');

commit;
