begin;

do $guard$
begin
  if not exists (select 1 from private.widgetflow_schema_migrations where id = '047_report_signature_typed_font_snapshot') then
    raise exception 'WidgetFlow migration 047_report_signature_typed_font_snapshot must be applied first';
  end if;
  if exists (select 1 from private.widgetflow_schema_migrations where id = '053_unanimous_signature_cycle_return') then
    raise exception 'WidgetFlow migration 053_unanimous_signature_cycle_return has already been applied';
  end if;
end
$guard$;

create or replace function public.return_report(p_report_id uuid, p_assignment_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor record;
  report_row public.reports%rowtype;
  assignment_row public.report_assignments%rowtype;
  cycle_row public.report_send_cycles%rowtype;
  old_status text;
begin
  if not private.current_user_is_active() then raise exception 'FORBIDDEN'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'RETURN_REASON_REQUIRED'; end if;
  select * into actor from private.report_actor();
  if not found then raise exception 'ACCOUNT_INACTIVE'; end if;

  select * into report_row from public.reports where id = p_report_id for update;
  if not found then raise exception 'REPORT_NOT_FOUND'; end if;
  if report_row.created_by_user_id = actor.user_id then raise exception 'SELF_RECIPIENT_ACTION_NOT_ALLOWED'; end if;
  if report_row.status <> 'sent' or report_row.locked_at is not null or report_row.current_send_cycle_id is null then
    raise exception 'REPORT_NOT_ACTIONABLE';
  end if;

  select * into assignment_row
  from public.report_assignments
  where id = p_assignment_id
    and report_id = report_row.id
    and send_cycle_id = report_row.current_send_cycle_id
  for update;
  if not found then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;
  if assignment_row.recipient_user_id <> actor.user_id then raise exception 'ASSIGNMENT_NOT_OWNED'; end if;
  if assignment_row.assignment_status <> 'pending' then raise exception 'REPORT_NOT_ACTIONABLE'; end if;

  select * into cycle_row
  from public.report_send_cycles
  where id = assignment_row.send_cycle_id and report_id = report_row.id
  for update;
  if not found then raise exception 'SEND_CYCLE_NOT_FOUND'; end if;
  if cycle_row.status <> 'active' then raise exception 'REPORT_NOT_ACTIONABLE'; end if;
  old_status := report_row.status;

  update public.report_assignments
  set assignment_status = 'returned', return_reason = btrim(p_reason), returned_at = statement_timestamp(), closed_at = statement_timestamp(), updated_at = statement_timestamp()
  where id = assignment_row.id;

  update public.report_assignments
  set assignment_status = 'cancelled', closed_at = statement_timestamp(), updated_at = statement_timestamp()
  where send_cycle_id = assignment_row.send_cycle_id and id <> assignment_row.id and assignment_status = 'pending';

  update public.report_send_cycles
  set status = 'returned', closed_at = statement_timestamp()
  where id = cycle_row.id;

  update public.reports
  set status = 'draft', current_send_cycle_id = null, sent_at = null, returned_at = statement_timestamp(), return_reason = btrim(p_reason), updated_at = statement_timestamp()
  where id = report_row.id;

  insert into public.notifications(recipient_user_id, notification_type, title, message, related_report_id, send_cycle_id, report_assignment_id)
  values(report_row.created_by_user_id, 'REPORT_RETURNED', 'Report returned', report_row.title, report_row.id, assignment_row.send_cycle_id, assignment_row.id);

  insert into public.report_audit_events(report_id, event_type, actor_user_id, actor_name, actor_email, actor_role_id, actor_role_key, actor_role_name, actor_governance_level, report_title_snapshot, from_status, to_status, comment, event_data, send_cycle_id, report_assignment_id)
  values(report_row.id, 'REPORT_RETURNED', actor.user_id, actor.full_name, actor.email, actor.role_id, actor.role_key, actor.role_name, actor.governance_level, report_row.title, old_status, 'draft', btrim(p_reason), jsonb_build_object('assignment_id', assignment_row.id, 'send_cycle_id', assignment_row.send_cycle_id, 'remaining_pending_assignments_cancelled', true, 'send_cycle_invalidated', true), assignment_row.send_cycle_id, assignment_row.id);

  return jsonb_build_object(
    'report', (select to_jsonb(updated_report) from public.reports updated_report where updated_report.id = report_row.id),
    'assignment', (select to_jsonb(updated_assignment) from public.report_assignments updated_assignment where updated_assignment.id = assignment_row.id),
    'send_cycle', (select to_jsonb(updated_cycle) from public.report_send_cycles updated_cycle where updated_cycle.id = assignment_row.send_cycle_id),
    'assignments', (select coalesce(jsonb_agg(to_jsonb(all_assignment) order by all_assignment.assignment_sequence), '[]'::jsonb) from public.report_assignments all_assignment where all_assignment.send_cycle_id = assignment_row.send_cycle_id)
  );
end
$$;

revoke all on function public.return_report(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.return_report(uuid, uuid, text) to authenticated;

insert into private.widgetflow_schema_migrations(id, description)
values ('053_unanimous_signature_cycle_return', 'Allow current-cycle Return after partial signing and invalidate the cycle');

commit;
