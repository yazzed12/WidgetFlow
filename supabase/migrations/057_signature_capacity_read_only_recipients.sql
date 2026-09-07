begin;

do $guard$
begin
  if not exists (select 1 from private.widgetflow_schema_migrations where id = '056_report_rejection_terminal_workflow') then
    raise exception 'WidgetFlow migration 056_report_rejection_terminal_workflow must be applied first';
  end if;
  if exists (select 1 from private.widgetflow_schema_migrations where id = '057_signature_capacity_read_only_recipients') then
    raise exception 'WidgetFlow migration 057_signature_capacity_read_only_recipients has already been applied';
  end if;
end
$guard$;

-- Restrict recipient mutations to recipients explicitly mapped to a current
-- Receiver signature field. Read access remains assignment/cycle based.
create or replace function public.return_report(p_report_id uuid, p_assignment_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; r public.reports%rowtype; x public.report_assignments%rowtype; c public.report_send_cycles%rowtype;
begin
  if not private.current_user_is_active() then raise exception 'FORBIDDEN'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'RETURN_REASON_REQUIRED'; end if;
  select * into a from private.report_actor(); if not found then raise exception 'ACCOUNT_INACTIVE'; end if;
  select * into r from public.reports where id=p_report_id for update;
  if not found then raise exception 'REPORT_NOT_FOUND'; end if;
  if r.created_by_user_id=a.user_id then raise exception 'SELF_RECIPIENT_ACTION_NOT_ALLOWED'; end if;
  if r.status <> 'sent' or r.locked_at is not null or r.current_send_cycle_id is null then raise exception 'REPORT_NOT_ACTIONABLE'; end if;
  select * into x from public.report_assignments where id=p_assignment_id and report_id=r.id and send_cycle_id=r.current_send_cycle_id for update;
  if not found then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;
  if x.recipient_user_id<>a.user_id then raise exception 'ASSIGNMENT_NOT_OWNED'; end if;
  if x.assignment_status<>'pending' then raise exception 'REPORT_NOT_ACTIONABLE'; end if;
  if not exists (select 1 from public.report_signature_assignments m where m.report_id=r.id and m.send_cycle_id=r.current_send_cycle_id and m.report_assignment_id=x.id and m.recipient_user_id=a.user_id) then raise exception 'SIGNATURE_ASSIGNMENT_REQUIRED'; end if;
  select * into c from public.report_send_cycles where id=x.send_cycle_id and report_id=r.id for update;
  if not found or c.status<>'active' then raise exception 'REPORT_NOT_ACTIONABLE'; end if;
  update public.report_assignments set assignment_status='returned',return_reason=btrim(p_reason),returned_at=statement_timestamp(),closed_at=statement_timestamp(),updated_at=statement_timestamp() where id=x.id;
  update public.report_assignments set assignment_status='cancelled',closed_at=statement_timestamp(),updated_at=statement_timestamp() where send_cycle_id=x.send_cycle_id and id<>x.id and assignment_status='pending';
  update public.report_send_cycles set status='returned',closed_at=statement_timestamp() where id=c.id;
  update public.reports set status='draft',current_send_cycle_id=null,sent_at=null,returned_at=statement_timestamp(),return_reason=btrim(p_reason),updated_at=statement_timestamp() where id=r.id;
  insert into public.notifications(recipient_user_id,notification_type,title,message,related_report_id,send_cycle_id,report_assignment_id) values(r.created_by_user_id,'REPORT_RETURNED','Report returned',r.title,r.id,x.send_cycle_id,x.id);
  insert into public.report_audit_events(report_id,event_type,actor_user_id,actor_name,actor_email,actor_role_id,actor_role_key,actor_role_name,actor_governance_level,report_title_snapshot,from_status,to_status,comment,event_data,send_cycle_id,report_assignment_id) values(r.id,'REPORT_RETURNED',a.user_id,a.full_name,a.email,a.role_id,a.role_key,a.role_name,a.governance_level,r.title,'sent','draft',btrim(p_reason),jsonb_build_object('assignment_id',x.id,'send_cycle_id',x.send_cycle_id,'remaining_pending_assignments_cancelled',true),x.send_cycle_id,x.id);
  return jsonb_build_object('report',(select to_jsonb(z) from public.reports z where z.id=r.id),'assignment',(select to_jsonb(z) from public.report_assignments z where z.id=x.id),'send_cycle',(select to_jsonb(z) from public.report_send_cycles z where z.id=c.id));
end $$;

create or replace function public.reject_report(p_report_id uuid,p_assignment_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; r public.reports%rowtype; x public.report_assignments%rowtype; c public.report_send_cycles%rowtype;
begin
  if not private.current_user_is_active() then raise exception 'FORBIDDEN'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'REJECTION_REASON_REQUIRED'; end if;
  select * into a from private.report_actor(); if not found then raise exception 'ACCOUNT_INACTIVE'; end if;
  select * into r from public.reports where id=p_report_id for update;
  if not found then raise exception 'REPORT_NOT_FOUND'; end if;
  if r.created_by_user_id=a.user_id then raise exception 'SELF_RECIPIENT_ACTION_NOT_ALLOWED'; end if;
  if r.status<>'sent' or r.locked_at is not null or r.current_send_cycle_id is null then raise exception 'REPORT_NOT_ACTIONABLE'; end if;
  select * into x from public.report_assignments where id=p_assignment_id and report_id=r.id and send_cycle_id=r.current_send_cycle_id for update;
  if not found then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;
  if x.recipient_user_id<>a.user_id then raise exception 'ASSIGNMENT_NOT_OWNED'; end if;
  if x.assignment_status<>'pending' then raise exception 'REPORT_NOT_ACTIONABLE'; end if;
  if not exists (select 1 from public.report_signature_assignments m where m.report_id=r.id and m.send_cycle_id=r.current_send_cycle_id and m.report_assignment_id=x.id and m.recipient_user_id=a.user_id) then raise exception 'SIGNATURE_ASSIGNMENT_REQUIRED'; end if;
  select * into c from public.report_send_cycles where id=x.send_cycle_id and report_id=r.id for update;
  if not found or c.status<>'active' then raise exception 'REPORT_NOT_ACTIONABLE'; end if;
  update public.report_assignments set assignment_status='rejected',rejection_reason=btrim(p_reason),rejected_at=statement_timestamp(),closed_at=statement_timestamp() where id=x.id;
  update public.report_assignments set assignment_status='cancelled',closed_at=statement_timestamp() where send_cycle_id=x.send_cycle_id and id<>x.id and assignment_status='pending';
  update public.report_send_cycles set status='rejected',closed_at=statement_timestamp() where id=c.id;
  update public.reports set status='rejected',rejected_at=statement_timestamp(),locked_at=statement_timestamp(),rejection_reason=btrim(p_reason),updated_at=statement_timestamp() where id=r.id;
  insert into public.notifications(recipient_user_id,notification_type,title,message,related_report_id,send_cycle_id,report_assignment_id) values(r.created_by_user_id,'REPORT_REJECTED','Report Rejected',r.title||' was rejected by '||a.full_name||'. Reason: '||btrim(p_reason),r.id,x.send_cycle_id,x.id);
  insert into public.notifications(recipient_user_id,notification_type,title,message,related_report_id,send_cycle_id,report_assignment_id)
  select other_a.recipient_user_id,'REPORT_REJECTED','Report Rejected','The report sent to you by '||r.creator_name||' was rejected by '||a.full_name||'. The approval process has ended.',r.id,x.send_cycle_id,other_a.id
  from public.report_assignments other_a where other_a.send_cycle_id=x.send_cycle_id and other_a.recipient_user_id<>a.user_id;
  insert into public.report_audit_events(report_id,event_type,actor_user_id,actor_name,actor_email,actor_role_id,actor_role_key,actor_role_name,actor_governance_level,report_title_snapshot,from_status,to_status,comment,event_data,send_cycle_id,report_assignment_id) values(r.id,'REPORT_REJECTED',a.user_id,a.full_name,a.email,a.role_id,a.role_key,a.role_name,a.governance_level,r.title,'sent','rejected',btrim(p_reason),jsonb_build_object('assignment_id',x.id,'send_cycle_id',x.send_cycle_id,'terminal',true),x.send_cycle_id,x.id);
  return jsonb_build_object('report',(select to_jsonb(z) from public.reports z where z.id=r.id),'assignment',(select to_jsonb(z) from public.report_assignments z where z.id=x.id),'send_cycle',(select to_jsonb(z) from public.report_send_cycles z where z.id=c.id));
end $$;

revoke all on function public.return_report(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.return_report(uuid,uuid,text) to authenticated;
revoke all on function public.reject_report(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reject_report(uuid,uuid,text) to authenticated;
insert into private.widgetflow_schema_migrations(id,description) values ('057_signature_capacity_read_only_recipients','Signature-capacity-aware view-only recipients and signer-only mutations');
commit;
