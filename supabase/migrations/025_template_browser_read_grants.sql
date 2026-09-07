begin;

-- ============================================================
-- WidgetFlow
-- Migration 025
-- Template Browser Read Grants
--
-- Purpose:
-- Restore authenticated SELECT privileges required for the
-- Supabase browser repository.
--
-- RLS remains the authority for WHICH rows are visible.
-- This migration grants no INSERT / UPDATE / DELETE privileges.
-- Anonymous access remains denied.
-- ============================================================


-- ============================================================
-- 1. Migration guards
-- ============================================================

do $migration_guard$
begin

  if not exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '023_template_domain_operations'
  ) then
    raise exception
      'WidgetFlow migration 023_template_domain_operations must be applied first';
  end if;

  if not exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '024_template_production_bootstrap'
  ) then
    raise exception
      'WidgetFlow migration 024_template_production_bootstrap must be applied first';
  end if;

  if exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '025_template_browser_read_grants'
  ) then
    raise exception
      'WidgetFlow migration 025_template_browser_read_grants has already been applied';
  end if;

end
$migration_guard$;


-- ============================================================
-- 2. Explicitly preserve anonymous denial
-- ============================================================

revoke all privileges on table
  public.templates,
  public.template_sections,
  public.template_fields,
  public.template_tags,
  public.template_versions,
  public.template_comments,
  public.template_audit_events
from anon;


-- ============================================================
-- 3. Authenticated browser READ contract
--
-- RLS policies continue to determine which rows each user can
-- actually see.
-- ============================================================

grant select on table
  public.templates,
  public.template_sections,
  public.template_fields,
  public.template_tags,
  public.template_versions,
  public.template_comments,
  public.template_audit_events
to authenticated;


-- ============================================================
-- 4. Explicitly keep browser writes denied
-- ============================================================

revoke insert, update, delete, truncate, references, trigger
on table
  public.templates,
  public.template_sections,
  public.template_fields,
  public.template_tags,
  public.template_versions,
  public.template_comments,
  public.template_audit_events
from authenticated;


-- ============================================================
-- 5. Migration ledger
-- ============================================================

insert into private.widgetflow_schema_migrations (
  id,
  description
)
values (
  '025_template_browser_read_grants',
  'Authenticated read grants for RLS-governed Template domain tables'
);


commit;