begin;

-- ============================================================
-- WidgetFlow
-- Migration 026
-- Protected Admin Approved Template Read Access
--
-- Purpose:
-- Allow the protected Admin identity to read approved Templates
-- without granting ordinary editable Template permissions.
--
-- Existing operational-role permission behavior remains unchanged.
-- ============================================================


-- ============================================================
-- 1. Migration guards
-- ============================================================

do $migration_guard$
begin

  if not exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '025_template_browser_read_grants'
  ) then
    raise exception
      'WidgetFlow migration 025_template_browser_read_grants must be applied first';
  end if;

  if exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '026_protected_admin_template_read'
  ) then
    raise exception
      'WidgetFlow migration 026_protected_admin_template_read has already been applied';
  end if;

end
$migration_guard$;


-- ============================================================
-- 2. Extend approved Template read policy
--
-- Operational users:
--   still require templates.view_approved
--
-- Protected Admin:
--   authorized through protected Admin identity,
--   not ordinary role_permissions.
-- ============================================================

alter policy templates_read_approved
on public.templates
using (
  status = 'approved'
  and (
    private.current_user_is_protected_admin()
    or private.current_user_has_permission('templates.view_approved')
  )
);


-- ============================================================
-- 3. Migration ledger
-- ============================================================

insert into private.widgetflow_schema_migrations (
  id,
  description
)
values (
  '026_protected_admin_template_read',
  'Protected Admin read access to approved Templates through protected identity'
);


commit;