begin;
do $guard$
begin
  if not exists (select 1 from private.widgetflow_schema_migrations where id='031_report_snapshot_shape_compatibility') then raise exception 'WidgetFlow migration 031_report_snapshot_shape_compatibility must be applied first'; end if;
  if exists (select 1 from private.widgetflow_schema_migrations where id='032_report_multi_recipient_send') then raise exception 'WidgetFlow migration 032_report_multi_recipient_send has already been applied'; end if;
end $guard$;

create or replace function public.list_report_recipient_directory()
returns table(user_id uuid, full_name text, email text, role_id uuid, role_key text, role_name text, governance_level text, department text, profile_code text)
language sql stable security definer set search_path = '' as $$
  select p.id,p.full_name,p.email,r.id,r.key,r.name,r.governance_level,p.department,p.profile_code
  from public.profiles p join public.roles r on r.id=p.role_id
  where p.id <> auth.uid() and p.status='Active' and r.is_active and r.role_type in ('System','Custom') and not coalesce(r.is_protected,false)
    and private.current_user_is_active() and private.current_user_has_permission('reports.send')
  order by p.full_name
$$;

create or replace function public.send_report(p_report_id uuid,p_recipient_user_ids uuid[],p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; r public.reports%rowtype; cycle public.report_send_cycles%rowtype; rec record; cycle_no integer; idx integer:=0; count_ids integer;
begin
  if not private.current_user_is_active() or not private.current_user_has_permission('reports.view_own') or not private.current_user_has_permission('reports.send') then raise exception 'FORBIDDEN'; end if;
  select * into a from private.report_actor(); if not found then raise exception 'ACCOUNT_INACTIVE'; end if;
  if p_recipient_user_ids is null or cardinality(p_recipient_user_ids)=0 then raise exception 'RECIPIENTS_REQUIRED'; end if;
  select count(*) into count_ids from unnest(p_recipient_user_ids); if count_ids <> (select count(distinct x) from unnest(p_recipient_user_ids) x) then raise exception 'DUPLICATE_RECIPIENT'; end if;
  select * into r from public.reports where id=p_report_id for update;
  if not found or r.created_by_user_id<>a.user_id or r.status<>'completed' or r.locked_at is not null or r.current_send_cycle_id is not null or r.sent_at is not null then raise exception 'REPORT_NOT_SENDABLE'; end if;
  if exists (select 1 from unnest(p_recipient_user_ids) x where x=auth.uid()) then raise exception 'SELF_RECIPIENT_NOT_ALLOWED'; end if;
  if exists (select 1 from unnest(p_recipient_user_ids) x where not exists (select 1 from public.profiles p join public.roles ro on ro.id=p.role_id where p.id=x and p.status='Active' and ro.is_active and ro.role_type in ('System','Custom') and not coalesce(ro.is_protected,false))) then raise exception 'INVALID_RECIPIENT'; end if;
  select coalesce(max(cycle_number),0)+1 into cycle_no from public.report_send_cycles where report_id=r.id;
  insert into public.report_send_cycles(report_id,cycle_number,sender_user_id,sender_name_snapshot,sender_email_snapshot,sender_role_id_snapshot,sender_role_key_snapshot,sender_role_name_snapshot,sender_governance_level_snapshot,sender_note,content_hash)
  values(r.id,cycle_no,a.user_id,a.full_name,a.email,a.role_id,a.role_key,a.role_name,a.governance_level,nullif(btrim(p_note),''),encode(sha256(convert_to(r.id::text||':'||r.updated_at::text,'utf8')),'hex')) returning * into cycle;
  for rec in select p.id,p.full_name,p.email,p.role_id,ro.key as role_key,ro.name as role_name,ro.governance_level,p.department from public.profiles p join public.roles ro on ro.id=p.role_id where p.id=any(p_recipient_user_ids) order by p.full_name,p.id loop
    idx:=idx+1;
    insert into public.report_assignments(report_id,send_cycle_id,recipient_user_id,recipient_name_snapshot,recipient_email_snapshot,recipient_role_id_snapshot,recipient_role_key_snapshot,recipient_role_name_snapshot,recipient_governance_level_snapshot,assignment_sequence) values(r.id,cycle.id,rec.id,rec.full_name,rec.email,rec.role_id,rec.role_key,rec.role_name,rec.governance_level,idx);
  end loop;
  update public.reports set status='sent',current_send_cycle_id=cycle.id,sent_at=statement_timestamp(),sender_note=nullif(btrim(p_note),''),updated_at=statement_timestamp() where id=r.id;
  for rec in select a.id,a.recipient_user_id from public.report_assignments a where a.send_cycle_id=cycle.id loop
    insert into public.notifications(recipient_user_id,notification_type,title,message,related_report_id,send_cycle_id,report_assignment_id) values(rec.recipient_user_id,'REPORT_RECEIVED','Report received',r.title,r.id,cycle.id,rec.id);
  end loop;
  perform private.report_audit(r.id,'REPORT_SENT','completed','sent',p_note);
  return jsonb_build_object('report',(select to_jsonb(x) from public.reports x where x.id=r.id),'send_cycle',to_jsonb(cycle),'assignments',(select coalesce(jsonb_agg(to_jsonb(x) order by x.assignment_sequence),'[]'::jsonb) from public.report_assignments x where x.send_cycle_id=cycle.id));
end $$;

revoke all on function public.list_report_recipient_directory(),public.send_report(uuid,uuid[],text) from public,anon,authenticated;
grant execute on function public.list_report_recipient_directory(),public.send_report(uuid,uuid[],text) to authenticated;
insert into private.widgetflow_schema_migrations(id,description) values('032_report_multi_recipient_send','Trusted recipient directory and atomic multi-recipient Report send lifecycle');
commit;
