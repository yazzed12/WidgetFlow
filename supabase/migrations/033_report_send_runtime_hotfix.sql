begin;
do $guard$
begin
  if not exists (select 1 from private.widgetflow_schema_migrations where id='032_report_multi_recipient_send') then raise exception 'WidgetFlow migration 032_report_multi_recipient_send must be applied first'; end if;
  if exists (select 1 from private.widgetflow_schema_migrations where id='033_report_send_runtime_hotfix') then raise exception 'WidgetFlow migration 033_report_send_runtime_hotfix has already been applied'; end if;
end $guard$;

create or replace function public.send_report(p_report_id uuid,p_recipient_user_ids uuid[],p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor record; report_row public.reports%rowtype; cycle_row public.report_send_cycles%rowtype; recipient_row record; assignment_row record; cycle_no integer; idx integer:=0; input_count integer;
begin
  if not private.current_user_is_active() or not private.current_user_has_permission('reports.view_own') or not private.current_user_has_permission('reports.send') then raise exception 'FORBIDDEN'; end if;
  select * into actor from private.report_actor(); if not found then raise exception 'ACCOUNT_INACTIVE'; end if;
  if p_recipient_user_ids is null or cardinality(p_recipient_user_ids)=0 then raise exception 'RECIPIENTS_REQUIRED'; end if;
  select count(*) into input_count from unnest(p_recipient_user_ids); if input_count <> (select count(distinct recipient_id) from unnest(p_recipient_user_ids) as input_ids(recipient_id)) then raise exception 'DUPLICATE_RECIPIENT'; end if;
  select * into report_row from public.reports where id=p_report_id for update;
  if not found or report_row.created_by_user_id<>actor.user_id or report_row.status<>'completed' or report_row.locked_at is not null or report_row.current_send_cycle_id is not null or report_row.sent_at is not null then raise exception 'REPORT_NOT_SENDABLE'; end if;
  if exists (select 1 from unnest(p_recipient_user_ids) as input_ids(recipient_id) where input_ids.recipient_id=auth.uid()) then raise exception 'SELF_RECIPIENT_NOT_ALLOWED'; end if;
  if exists (select 1 from unnest(p_recipient_user_ids) as input_ids(recipient_id) where not exists (select 1 from public.profiles profile_row join public.roles role_row on role_row.id=profile_row.role_id where profile_row.id=input_ids.recipient_id and profile_row.status='Active' and role_row.is_active and role_row.role_type in ('System','Custom') and not coalesce(role_row.is_protected,false))) then raise exception 'INVALID_RECIPIENT'; end if;
  select coalesce(max(existing_cycle.cycle_number),0)+1 into cycle_no from public.report_send_cycles existing_cycle where existing_cycle.report_id=report_row.id;
  insert into public.report_send_cycles(report_id,cycle_number,sender_user_id,sender_name_snapshot,sender_email_snapshot,sender_role_id_snapshot,sender_role_key_snapshot,sender_role_name_snapshot,sender_governance_level_snapshot,sender_note,content_hash)
  values(report_row.id,cycle_no,actor.user_id,actor.full_name,actor.email,actor.role_id,actor.role_key,actor.role_name,actor.governance_level,nullif(btrim(p_note),''),encode(sha256(convert_to(report_row.id::text||':'||report_row.updated_at::text,'utf8')),'hex')) returning * into cycle_row;
  for recipient_row in select profile_row.id,profile_row.full_name,profile_row.email,profile_row.role_id,role_row.key as role_key,role_row.name as role_name,role_row.governance_level from public.profiles profile_row join public.roles role_row on role_row.id=profile_row.role_id where profile_row.id=any(p_recipient_user_ids) order by profile_row.full_name,profile_row.id loop
    idx:=idx+1;
    insert into public.report_assignments(report_id,send_cycle_id,recipient_user_id,recipient_name_snapshot,recipient_email_snapshot,recipient_role_id_snapshot,recipient_role_key_snapshot,recipient_role_name_snapshot,recipient_governance_level_snapshot,assignment_sequence) values(report_row.id,cycle_row.id,recipient_row.id,recipient_row.full_name,recipient_row.email,recipient_row.role_id,recipient_row.role_key,recipient_row.role_name,recipient_row.governance_level,idx);
  end loop;
  update public.reports set status='sent',current_send_cycle_id=cycle_row.id,sent_at=statement_timestamp(),sender_note=nullif(btrim(p_note),''),updated_at=statement_timestamp() where id=report_row.id;
  for assignment_row in select created_assignment.id,created_assignment.recipient_user_id from public.report_assignments created_assignment where created_assignment.send_cycle_id=cycle_row.id loop
    insert into public.notifications(recipient_user_id,notification_type,title,message,related_report_id,send_cycle_id,report_assignment_id) values(assignment_row.recipient_user_id,'REPORT_RECEIVED','Report received',report_row.title,report_row.id,cycle_row.id,assignment_row.id);
  end loop;
  perform private.report_audit(report_row.id,'REPORT_SENT','completed','sent',p_note);
  return jsonb_build_object('report',(select to_jsonb(updated_report) from public.reports updated_report where updated_report.id=report_row.id),'send_cycle',to_jsonb(cycle_row),'assignments',(select coalesce(jsonb_agg(to_jsonb(created_assignment) order by created_assignment.assignment_sequence),'[]'::jsonb) from public.report_assignments created_assignment where created_assignment.send_cycle_id=cycle_row.id));
end $$;

revoke all on function public.send_report(uuid,uuid[],text) from public,anon,authenticated;
grant execute on function public.send_report(uuid,uuid[],text) to authenticated;
insert into private.widgetflow_schema_migrations(id,description) values('033_report_send_runtime_hotfix','Fix send_report PL/pgSQL actor/table alias collision without changing lifecycle semantics');
commit;
