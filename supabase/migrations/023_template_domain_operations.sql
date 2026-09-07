begin;
do $guard$
begin
  if not exists (select 1 from private.widgetflow_schema_migrations where id = '022_standard_pack_production_bootstrap') then
    raise exception 'WidgetFlow migration 022_standard_pack_production_bootstrap must be applied first';
  end if;
  if exists (select 1 from private.widgetflow_schema_migrations where id = '023_template_domain_operations') then
    raise exception 'WidgetFlow migration 023_template_domain_operations has already been applied';
  end if;
end $guard$;

create or replace function private.template_actor()
returns table(user_id uuid, full_name text, email text, role_id uuid, role_key text, role_name text, governance_level text)
language sql stable security definer set search_path = '' as $$
  select p.id,p.full_name,p.email,r.id,r.key,r.name,r.governance_level
  from public.profiles p join public.roles r on r.id=p.role_id
  where p.id=auth.uid() and p.status='Active' and r.is_active
$$;

create or replace function private.template_snapshot(p_template_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('template',to_jsonb(t),'sections',coalesce((select jsonb_agg(to_jsonb(s) order by s.display_order) from public.template_sections s where s.template_id=t.id),'[]'::jsonb),'fields',coalesce((select jsonb_agg(to_jsonb(f) order by f.display_order) from public.template_fields f where f.template_id=t.id),'[]'::jsonb),'tags',coalesce((select jsonb_agg(to_jsonb(g) order by g.tag) from public.template_tags g where g.template_id=t.id),'[]'::jsonb)) from public.templates t where t.id=p_template_id
$$;

create or replace function private.template_audit(p_template_id uuid,p_event text,p_from text,p_to text,p_comment text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a record; t public.templates%rowtype;
begin
  select * into a from private.template_actor(); if not found then raise exception 'ACCOUNT_INACTIVE'; end if;
  select * into t from public.templates where id=p_template_id;
  insert into public.template_audit_events(template_id,event_type,actor_user_id,actor_name,actor_email,actor_role_id,actor_role_key,actor_role_name,actor_governance_level,template_name_snapshot,template_version_snapshot,from_status,to_status,comment)
  values(p_template_id,p_event,a.user_id,a.full_name,a.email,a.role_id,a.role_key,a.role_name,a.governance_level,t.name,t.version_label,p_from,p_to,p_comment);
end $$;

create or replace function private.template_version_label(p_template_id uuid) returns text language sql stable security definer set search_path = '' as $$
  select 'v1.' || (coalesce(max((regexp_match(version_label,'^v1\\.([0-9]+)$'))[1]::int),0)+1) from public.templates where supersedes_template_id=p_template_id or id=p_template_id
$$;

create or replace function private.guard_template_immutability() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status in ('approved','superseded','archived') and (to_jsonb(old)-'updated_at'-'status'-'supersedes_template_id') is distinct from (to_jsonb(new)-'updated_at'-'status'-'supersedes_template_id') then raise exception 'TEMPLATE_IMMUTABLE'; end if;
  return new;
end $$;
create or replace function private.guard_template_version_immutability() returns trigger language plpgsql set search_path = '' as $$ begin raise exception 'TEMPLATE_VERSION_IMMUTABLE'; end $$;
create trigger templates_immutable_guard before update on public.templates for each row execute function private.guard_template_immutability();
create trigger template_versions_immutable_guard before update or delete on public.template_versions for each row execute function private.guard_template_version_immutability();

create or replace function public.save_template_draft(p_template_id uuid,p_name text,p_description text,p_category_id uuid,p_tags jsonb,p_sections jsonb,p_rules jsonb,p_calculations jsonb,p_theme jsonb,p_header_config jsonb,p_footer_config jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; t public.templates%rowtype; s jsonb; f jsonb; v_section uuid; idx int:=0;
begin
  if not private.current_user_is_active() or not private.current_user_has_permission('templates.create') then raise exception 'FORBIDDEN'; end if;
  if nullif(btrim(p_name),'') is null or not exists(select 1 from public.categories where id=p_category_id and status='Active') then raise exception 'INVALID_INPUT'; end if;
  select * into a from private.template_actor();
  if p_template_id is null then
    insert into public.templates(name,description,category_id,created_by_user_id,creator_name,creator_email,creator_role_id,creator_role_key,creator_role_name,creator_governance_level,rules,calculations,theme,header_config,footer_config)
    values(btrim(p_name),coalesce(p_description,''),p_category_id,a.user_id,a.full_name,a.email,a.role_id,a.role_key,a.role_name,a.governance_level,coalesce(p_rules,'[]'),coalesce(p_calculations,'[]'),coalesce(p_theme,'{}'),coalesce(p_header_config,'{}'),coalesce(p_footer_config,'{}')) returning * into t;
    perform private.template_audit(t.id,'TEMPLATE_CREATED',null,'draft');
  else
    select * into t from public.templates where id=p_template_id for update;
    if not found or t.created_by_user_id<>a.user_id or t.status not in ('draft','rejected') then raise exception 'DRAFT_NOT_EDITABLE'; end if;
    update public.templates set name=btrim(p_name),description=coalesce(p_description,''),category_id=p_category_id,rules=coalesce(p_rules,'[]'),calculations=coalesce(p_calculations,'[]'),theme=coalesce(p_theme,'{}'),header_config=coalesce(p_header_config,'{}'),footer_config=coalesce(p_footer_config,'{}'),status='draft',rejection_reason=null,rejected_at=null where id=t.id returning * into t;
    perform private.template_audit(t.id,'TEMPLATE_DRAFT_SAVED','rejected','draft');
    delete from public.template_sections where template_id=t.id;
  end if;
  if p_template_id is null then delete from public.template_sections where template_id=t.id; end if;
  for s in select * from jsonb_array_elements(coalesce(p_sections,'[]')) loop
    insert into public.template_sections(template_id,name,description,display_order) values(t.id,coalesce(s->>'title','Section '||idx),s->>'description',idx) returning id into v_section;
    for f in select * from jsonb_array_elements(coalesce(s->'components','[]')) loop
      insert into public.template_fields(template_id,section_id,field_key,label,field_type,is_required,placeholder,description,default_value,layout_width,validation_rules,options,configuration,display_order)
      values(t.id,v_section,coalesce(f->>'key',f->>'id','field-'||idx),coalesce(f->>'label','Field'),coalesce(f->>'type','text'),coalesce((f->>'required')::boolean,false),f->>'placeholder',f->>'description',f->'defaultValue',coalesce(f->>'layoutWidth','full'),coalesce(f->'validation','{}'),coalesce(f->'options','[]'),f,coalesce((f->>'order')::int,0));
    end loop; idx:=idx+1;
  end loop;
  delete from public.template_tags where template_id=t.id;
  insert into public.template_tags(template_id,tag) select t.id,value from jsonb_array_elements_text(coalesce(p_tags,'[]'));
  return private.template_snapshot(t.id);
end $$;

create or replace function public.submit_template_for_approval(p_template_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.templates%rowtype; a record; r record; gov boolean;
begin
  if not private.current_user_is_active() or not private.current_user_has_permission('templates.submit') then raise exception 'FORBIDDEN'; end if;
  select * into a from private.template_actor(); select * into t from public.templates where id=p_template_id for update;
  if t.created_by_user_id<>a.user_id or t.status not in ('draft','rejected') then raise exception 'SUBMISSION_NOT_ALLOWED'; end if;
  select template_governance_enabled into gov from public.system_settings where id='default';
  select * into r from public.governance_routes where creator_governance_level=t.creator_governance_level and is_active;
  if not coalesce(gov,true) or r.strategy='DIRECT_PUBLISH' or r.strategy is null then
    update public.templates set status='approved',assignment_strategy='DIRECT_PUBLISH',submitted_at=statement_timestamp(),approved_at=statement_timestamp() where id=t.id;
    update public.templates set status='superseded' where id=t.supersedes_template_id and status='approved';
    insert into public.template_versions(template_id,version_label,schema_snapshot,published_by_user_id,publisher_name,publisher_email,publisher_role_id,publisher_role_key,publisher_role_name,publisher_governance_level) values(t.id,t.version_label,private.template_snapshot(t.id),a.user_id,a.full_name,a.email,a.role_id,a.role_key,a.role_name,a.governance_level);
    perform private.template_audit(t.id,'TEMPLATE_PUBLISHED_DIRECT',t.status,'approved');
  elsif r.strategy='SPECIFIC_USER' then
    if r.specific_user_id=a.user_id or not exists(select 1 from public.profiles p join public.roles ro on ro.id=p.role_id join public.role_permissions rp on rp.role_id=ro.id where p.id=r.specific_user_id and p.status='Active' and ro.is_active and rp.permission_key in ('template_approvals.view','template_approvals.approve') group by p.id having count(distinct rp.permission_key)=2) then raise exception 'REVIEWER_NOT_ELIGIBLE'; end if;
    update public.templates set status='pending_approval',assignment_strategy='SPECIFIC_USER',target_role_id=r.target_role_id,routing_specific_user_id=r.specific_user_id,assigned_reviewer_user_id=r.specific_user_id,assigned_reviewer_name_snapshot=(select p.full_name from public.profiles p where p.id=r.specific_user_id),assigned_reviewer_role_id_snapshot=(select p.role_id from public.profiles p where p.id=r.specific_user_id),assigned_reviewer_role_key_snapshot=(select ro.key from public.profiles p join public.roles ro on ro.id=p.role_id where p.id=r.specific_user_id),assigned_reviewer_role_name_snapshot=(select ro.name from public.profiles p join public.roles ro on ro.id=p.role_id where p.id=r.specific_user_id),assigned_reviewer_governance_level_snapshot=(select ro.governance_level from public.profiles p join public.roles ro on ro.id=p.role_id where p.id=r.specific_user_id),submitted_at=statement_timestamp() where id=t.id;
    perform private.template_audit(t.id,'TEMPLATE_SUBMITTED',t.status,'pending_approval');
  else
    if not exists(select 1 from public.roles ro join public.role_permissions a1 on a1.role_id=ro.id and a1.permission_key='template_approvals.view' join public.role_permissions a2 on a2.role_id=ro.id and a2.permission_key='template_approvals.approve' join public.profiles p on p.role_id=ro.id and p.status='Active' where ro.id=r.target_role_id and ro.is_active and p.id<>a.user_id) then raise exception 'NO_ELIGIBLE_REVIEWER'; end if;
    update public.templates set status='pending_approval',assignment_strategy='ROLE_QUEUE',target_role_id=r.target_role_id,target_role_key_snapshot=(select key from public.roles where id=r.target_role_id),target_role_name_snapshot=(select name from public.roles where id=r.target_role_id),assigned_reviewer_user_id=null,submitted_at=statement_timestamp() where id=t.id;
    perform private.template_audit(t.id,'TEMPLATE_SUBMITTED',t.status,'pending_approval');
  end if;
  return private.template_snapshot(t.id);
end $$;

create or replace function public.claim_template_review(p_template_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.templates%rowtype; a record; r record;
begin
  if not private.current_user_is_active() or not private.current_user_has_permission('template_approvals.view') then raise exception 'FORBIDDEN'; end if;
  select * into a from private.template_actor(); select * into t from public.templates where id=p_template_id for update;
  if t.status<>'pending_approval' or t.assignment_strategy<>'ROLE_QUEUE' or t.assigned_reviewer_user_id is not null or t.created_by_user_id=a.user_id or a.role_id<>t.target_role_id then raise exception 'CLAIM_NOT_ALLOWED'; end if;
  select * into r from public.roles where id=t.target_role_id;
  if not exists(select 1 from public.role_permissions where role_id=r.id and permission_key in ('template_approvals.view','template_approvals.approve') group by role_id having count(distinct permission_key)=2) then raise exception 'REVIEWER_NOT_ELIGIBLE'; end if;
  update public.templates set assigned_reviewer_user_id=a.user_id,assigned_reviewer_name_snapshot=a.full_name,assigned_reviewer_role_id_snapshot=a.role_id,assigned_reviewer_role_key_snapshot=a.role_key,assigned_reviewer_role_name_snapshot=a.role_name,assigned_reviewer_governance_level_snapshot=a.governance_level,claimed_at=statement_timestamp() where id=t.id and assigned_reviewer_user_id is null;
  if not found then raise exception 'CLAIM_CONFLICT'; end if;
  perform private.template_audit(t.id,'TEMPLATE_REVIEW_CLAIMED',t.status,t.status); return private.template_snapshot(t.id);
end $$;

create or replace function public.approve_template(p_template_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.templates%rowtype; a record;
begin
  if not private.current_user_is_active() or not private.current_user_has_permission('template_approvals.view') or not private.current_user_has_permission('template_approvals.approve') then raise exception 'FORBIDDEN'; end if;
  select * into a from private.template_actor(); select * into t from public.templates where id=p_template_id for update;
  if t.status<>'pending_approval' or t.created_by_user_id=a.user_id or t.assigned_reviewer_user_id<>a.user_id then raise exception 'APPROVAL_NOT_ALLOWED'; end if;
  update public.templates set status='approved',approved_at=statement_timestamp() where id=t.id;
  update public.templates set status='superseded' where id=t.supersedes_template_id and status='approved';
  insert into public.template_versions(template_id,version_label,schema_snapshot,published_by_user_id,publisher_name,publisher_email,publisher_role_id,publisher_role_key,publisher_role_name,publisher_governance_level) values(t.id,t.version_label,private.template_snapshot(t.id),a.user_id,a.full_name,a.email,a.role_id,a.role_key,a.role_name,a.governance_level);
  perform private.template_audit(t.id,'TEMPLATE_APPROVED',t.status,'approved'); return private.template_snapshot(t.id);
end $$;

create or replace function public.reject_template(p_template_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.templates%rowtype; a record;
begin
  if nullif(btrim(p_reason),'') is null or not private.current_user_is_active() or not private.current_user_has_permission('template_approvals.view') or not private.current_user_has_permission('template_approvals.reject') then raise exception 'FORBIDDEN'; end if;
  select * into a from private.template_actor(); select * into t from public.templates where id=p_template_id for update;
  if t.status<>'pending_approval' or t.created_by_user_id=a.user_id or t.assigned_reviewer_user_id<>a.user_id then raise exception 'REJECTION_NOT_ALLOWED'; end if;
  update public.templates set status='rejected',rejected_at=statement_timestamp(),rejection_reason=btrim(p_reason) where id=t.id;
  perform private.template_audit(t.id,'TEMPLATE_REJECTED',t.status,'rejected',p_reason); return private.template_snapshot(t.id);
end $$;

create or replace function public.create_template_revision(p_template_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare src public.templates%rowtype; a record; new_id uuid; s record;
begin
  if not private.current_user_is_active() or not private.current_user_has_permission('templates.create') then raise exception 'FORBIDDEN'; end if;
  select * into a from private.template_actor(); select * into src from public.templates where id=p_template_id for update;
  if src.status<>'approved' then raise exception 'REVISION_SOURCE_NOT_APPROVED'; end if;
  insert into public.templates(name,description,category_id,version_label,status,creation_method,created_by_user_id,creator_name,creator_email,creator_role_id,creator_role_key,creator_role_name,creator_governance_level,supersedes_template_id,rules,calculations,theme,header_config,footer_config)
  values(src.name,src.description,src.category_id,private.template_version_label(src.id),'draft','template',a.user_id,a.full_name,a.email,a.role_id,a.role_key,a.role_name,a.governance_level,src.id,src.rules,src.calculations,src.theme,src.header_config,src.footer_config) returning id into new_id;
  insert into public.template_sections(template_id,name,description,display_order) select new_id,name,description,display_order from public.template_sections where template_id=src.id;
  insert into public.template_fields(template_id,section_id,field_key,label,field_type,is_required,placeholder,description,default_value,layout_width,validation_rules,options,configuration,display_order) select new_id,ns.id,f.field_key,f.label,f.field_type,f.is_required,f.placeholder,f.description,f.default_value,f.layout_width,f.validation_rules,f.options,f.configuration,f.display_order from public.template_fields f join public.template_sections os on os.id=f.section_id join public.template_sections ns on ns.template_id=new_id and ns.display_order=os.display_order where f.template_id=src.id;
  insert into public.template_tags(template_id,tag) select new_id,tag from public.template_tags where template_id=src.id;
  perform private.template_audit(new_id,'TEMPLATE_REVISION_CREATED',null,'draft'); return private.template_snapshot(new_id);
end $$;

create or replace function public.add_template_comment(p_template_id uuid,p_message text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; t public.templates%rowtype; c public.template_comments%rowtype;
begin
  if nullif(btrim(p_message),'') is null or not private.current_user_is_active() or not private.current_user_has_permission('template_approvals.comment') then raise exception 'FORBIDDEN'; end if;
  select * into a from private.template_actor(); select * into t from public.templates where id=p_template_id;
  if t.created_by_user_id<>a.user_id and t.assigned_reviewer_user_id<>a.user_id then raise exception 'COMMENT_NOT_ALLOWED'; end if;
  insert into public.template_comments(template_id,author_user_id,author_name,author_email,author_role_id,author_role_key,author_role_name,author_governance_level,message) values(t.id,a.user_id,a.full_name,a.email,a.role_id,a.role_key,a.role_name,a.governance_level,btrim(p_message)) returning * into c;
  perform private.template_audit(t.id,'TEMPLATE_COMMENT_ADDED',t.status,t.status,p_message); return to_jsonb(c);
end $$;

revoke all on function public.save_template_draft(uuid,text,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb),public.submit_template_for_approval(uuid),public.claim_template_review(uuid),public.approve_template(uuid),public.reject_template(uuid,text),public.create_template_revision(uuid),public.add_template_comment(uuid,text) from public,anon;
grant execute on function public.save_template_draft(uuid,text,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb),public.submit_template_for_approval(uuid),public.claim_template_review(uuid),public.approve_template(uuid),public.reject_template(uuid,text),public.create_template_revision(uuid),public.add_template_comment(uuid,text) to authenticated;
revoke all on table public.templates,public.template_sections,public.template_fields,public.template_tags,public.template_versions,public.template_comments,public.template_audit_events from anon,authenticated;
create policy templates_read_approved on public.templates for select to authenticated using (status='approved' and private.current_user_has_permission('templates.view_approved'));
create policy templates_read_own on public.templates for select to authenticated using (created_by_user_id=auth.uid());
create policy templates_read_queue on public.templates for select to authenticated using (status='pending_approval' and private.current_user_has_permission('template_approvals.view') and (assigned_reviewer_user_id=auth.uid() or (assignment_strategy='ROLE_QUEUE' and assigned_reviewer_user_id is null)));
create policy template_children_read on public.template_sections for select to authenticated using (exists(select 1 from public.templates t where t.id=template_id and (t.status='approved' or t.created_by_user_id=auth.uid() or t.assigned_reviewer_user_id=auth.uid())));
create policy template_fields_read on public.template_fields for select to authenticated using (exists(select 1 from public.templates t where t.id=template_id and (t.status='approved' or t.created_by_user_id=auth.uid() or t.assigned_reviewer_user_id=auth.uid())));
create policy template_tags_read on public.template_tags for select to authenticated using (exists(select 1 from public.templates t where t.id=template_id and (t.status='approved' or t.created_by_user_id=auth.uid() or t.assigned_reviewer_user_id=auth.uid())));
create policy template_comments_read on public.template_comments for select to authenticated using (exists(select 1 from public.templates t where t.id=template_id and (t.created_by_user_id=auth.uid() or t.assigned_reviewer_user_id=auth.uid())));
insert into private.widgetflow_schema_migrations(id,description) values('023_template_domain_operations','Trusted Supabase template lifecycle RPCs, routing, snapshots, comments, audit, RLS, and immutability');
commit;
