begin;

-- ============================================================
-- WidgetFlow
-- Migration 027
-- Operational Active Category Read Access
--
-- Protected Admin keeps its existing full category visibility.
-- Operational authenticated users may read Active categories
-- when they have approved-template visibility.
-- ============================================================

do $migration_guard$
begin

  if not exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '026_protected_admin_template_read'
  ) then
    raise exception
      'Migration 026_protected_admin_template_read must be applied first';
  end if;

  if exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '027_operational_active_category_read'
  ) then
    raise exception
      'Migration 027_operational_active_category_read has already been applied';
  end if;

end
$migration_guard$;


-- ============================================================
-- Operational Category visibility
-- ============================================================

create policy categories_select_active_operational
on public.categories
for select
to authenticated
using (
  status = 'Active'
  and private.current_user_has_permission('templates.view_approved')
);


-- ============================================================
-- Migration ledger
-- ============================================================

insert into private.widgetflow_schema_migrations (
  id,
  description
)
values (
  '027_operational_active_category_read',
  'Allow authorized operational users to read Active template categories'
);

commit;