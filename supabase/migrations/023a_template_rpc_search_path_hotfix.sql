begin;

-- ============================================================
-- WidgetFlow
-- Migration 023a
-- Template RPC SECURITY DEFINER search_path hotfix
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

  if exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '023a_template_rpc_search_path_hotfix'
  ) then
    raise exception
      'WidgetFlow migration 023a_template_rpc_search_path_hotfix has already been applied';
  end if;
end
$migration_guard$;


-- ============================================================
-- Lock SECURITY DEFINER functions to an empty search_path.
-- Function identity is based on argument TYPES.
-- ============================================================

alter function public.add_template_comment(uuid, text)
  set search_path = '';

alter function public.approve_template(uuid)
  set search_path = '';

alter function public.claim_template_review(uuid)
  set search_path = '';

alter function public.create_template_revision(uuid)
  set search_path = '';

alter function public.reject_template(uuid, text)
  set search_path = '';

alter function public.save_template_draft(
  uuid,
  text,
  text,
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
)
  set search_path = '';

alter function public.submit_template_for_approval(uuid)
  set search_path = '';


-- ============================================================
-- Migration ledger
-- ============================================================

insert into private.widgetflow_schema_migrations (
  id,
  description
)
values (
  '023a_template_rpc_search_path_hotfix',
  'Fix Template lifecycle SECURITY DEFINER RPCs to use an empty fixed search_path'
);

commit;