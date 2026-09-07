begin;

-- ============================================================
-- WidgetFlow
-- Migration 029
-- Report Core Lifecycle — corrected
-- ============================================================

-- ------------------------------------------------------------
-- 0. Migration guard
-- ------------------------------------------------------------
do $guard$
begin
  if not exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '028_report_multi_recipient_foundation'
  ) then
    raise exception
      'WidgetFlow migration 028_report_multi_recipient_foundation must be applied first';
  end if;

  if exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '029_report_core_lifecycle'
  ) then
    raise exception
      'WidgetFlow migration 029_report_core_lifecycle has already been applied';
  end if;
end
$guard$;


-- ============================================================
-- 1. Current Report actor
-- ============================================================

create or replace function private.report_actor()
returns table (
  user_id uuid,
  full_name text,
  email text,
  role_id uuid,
  role_key text,
  role_name text,
  governance_level text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p.id,
    p.full_name,
    p.email,
    r.id,
    r.key,
    r.name,
    r.governance_level
  from public.profiles p
  join public.roles r
    on r.id = p.role_id
  where p.id = auth.uid()
    and p.status = 'Active'
    and r.is_active
$function$;

revoke all
on function private.report_actor()
from public, anon, authenticated;


-- ============================================================
-- 2. Internal immutable Report audit writer
-- ============================================================

create or replace function private.report_audit(
  p_report_id uuid,
  p_event text,
  p_from text,
  p_to text,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  a record;
  r public.reports%rowtype;
begin
  select *
  into a
  from private.report_actor();

  if not found then
    raise exception 'ACCOUNT_INACTIVE';
  end if;

  select *
  into r
  from public.reports
  where id = p_report_id;

  if not found then
    raise exception 'REPORT_NOT_FOUND';
  end if;

  insert into public.report_audit_events (
    report_id,
    event_type,

    actor_user_id,
    actor_name,
    actor_email,
    actor_role_id,
    actor_role_key,
    actor_role_name,
    actor_governance_level,

    report_title_snapshot,

    from_status,
    to_status,
    comment
  )
  values (
    r.id,
    p_event,

    a.user_id,
    a.full_name,
    a.email,
    a.role_id,
    a.role_key,
    a.role_name,
    a.governance_level,

    r.title,

    p_from,
    p_to,
    p_comment
  );
end
$function$;

revoke all
on function private.report_audit(uuid,text,text,text,text)
from public, anon, authenticated;


-- ============================================================
-- 3. Create Report from approved immutable Template version
-- ============================================================

create or replace function public.create_report_from_template(
  p_template_id uuid,
  p_title text default null,
  p_values jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  a record;

  t public.templates%rowtype;
  v public.template_versions%rowtype;
  r public.reports%rowtype;

  f jsonb;
  incoming_key text;

  chosen_title text;
begin

  -- ----------------------------------------------------------
  -- Authorization
  --
  -- reports.create:
  --   may create Reports
  --
  -- reports.view_own:
  --   creator must be able to read the Report afterward
  --
  -- templates.view_approved + templates.use:
  --   prevents SECURITY DEFINER from bypassing Template access
  -- ----------------------------------------------------------

  if not private.current_user_is_active()
     or not private.current_user_has_permission('reports.create')
     or not private.current_user_has_permission('reports.view_own')
     or not private.current_user_has_permission('templates.view_approved')
     or not private.current_user_has_permission('templates.use')
  then
    raise exception 'FORBIDDEN';
  end if;


  select *
  into a
  from private.report_actor();

  if not found then
    raise exception 'ACCOUNT_INACTIVE';
  end if;


  -- ----------------------------------------------------------
  -- Template must currently be Approved.
  -- ----------------------------------------------------------

  select *
  into t
  from public.templates
  where id = p_template_id
    and status = 'approved';

  if not found then
    raise exception 'TEMPLATE_NOT_APPROVED';
  end if;


  -- ----------------------------------------------------------
  -- Bind to the EXACT immutable version represented by the
  -- approved Template row.
  --
  -- Do not simply choose an arbitrary "latest" version.
  -- ----------------------------------------------------------

  select *
  into v
  from public.template_versions
  where template_id = t.id
    and version_label = t.version_label
    and source_status = 'approved';

  if not found then
    raise exception 'TEMPLATE_VERSION_NOT_APPROVED';
  end if;


  -- ----------------------------------------------------------
  -- Snapshot shape validation
  -- ----------------------------------------------------------

  if jsonb_typeof(
       coalesce(v.schema_snapshot -> 'fields', '[]'::jsonb)
     ) <> 'array'
  then
    raise exception 'TEMPLATE_VERSION_INVALID';
  end if;


  -- ----------------------------------------------------------
  -- Values must be an object:
  --
  -- {
  --   "field_key": value
  -- }
  -- ----------------------------------------------------------

  if jsonb_typeof(
       coalesce(p_values, '{}'::jsonb)
     ) <> 'object'
  then
    raise exception 'INVALID_REPORT_VALUES';
  end if;


  -- ----------------------------------------------------------
  -- Reject browser-supplied keys which do not belong to the
  -- immutable Template version snapshot.
  -- ----------------------------------------------------------

  for incoming_key in
    select jsonb_object_keys(
      coalesce(p_values, '{}'::jsonb)
    )
  loop

    if not exists (
      select 1
      from jsonb_array_elements(
        coalesce(v.schema_snapshot -> 'fields', '[]'::jsonb)
      ) as snapshot_field(value)
      where snapshot_field.value ->> 'field_key' = incoming_key
    )
    then
      raise exception 'UNKNOWN_REPORT_FIELD:%', incoming_key;
    end if;

  end loop;


  chosen_title :=
    coalesce(
      nullif(btrim(p_title), ''),
      t.name
    );


  -- ----------------------------------------------------------
  -- Report header snapshot
  -- ----------------------------------------------------------

  insert into public.reports (
    template_id,
    template_version_id,

    template_name_snapshot,
    template_version_snapshot,

    category_id,
    category_name_snapshot,

    title,

    created_by_user_id,
    creator_name,
    creator_email,
    creator_role_id,
    creator_role_key,
    creator_role_name,
    creator_governance_level
  )
  values (
    t.id,
    v.id,

    t.name,
    v.version_label,

    t.category_id,
    (
      select c.name
      from public.categories c
      where c.id = t.category_id
    ),

    chosen_title,

    a.user_id,
    a.full_name,
    a.email,
    a.role_id,
    a.role_key,
    a.role_name,
    a.governance_level
  )
  returning *
  into r;


  -- ----------------------------------------------------------
  -- Create one detached Report value row for every field in
  -- the immutable Template-version snapshot.
  --
  -- Browser values may override the version default.
  --
  -- No Template row is modified.
  -- ----------------------------------------------------------

  for f in
    select value
    from jsonb_array_elements(
      coalesce(v.schema_snapshot -> 'fields', '[]'::jsonb)
    ) as snapshot_field(value)
  loop

    if nullif(btrim(f ->> 'id'), '') is null
       or nullif(btrim(f ->> 'field_key'), '') is null
       or nullif(btrim(f ->> 'label'), '') is null
       or nullif(btrim(f ->> 'field_type'), '') is null
    then
      raise exception 'TEMPLATE_VERSION_INVALID_FIELD';
    end if;


    insert into public.report_values (
      report_id,
      template_field_id,

      field_key,
      field_label_snapshot,
      field_type_snapshot,

      value
    )
    values (
      r.id,
      (f ->> 'id')::uuid,

      f ->> 'field_key',
      f ->> 'label',
      f ->> 'field_type',

      case
        when coalesce(p_values, '{}'::jsonb)
             ? (f ->> 'field_key')
        then p_values -> (f ->> 'field_key')
        else f -> 'default_value'
      end
    );

  end loop;


  perform private.report_audit(
    r.id,
    'REPORT_CREATED',
    null,
    'draft'
  );


  return jsonb_build_object(
    'report',
    to_jsonb(r),

    'values',
    (
      select coalesce(
        jsonb_agg(
          to_jsonb(rv)
          order by rv.created_at, rv.id
        ),
        '[]'::jsonb
      )
      from public.report_values rv
      where rv.report_id = r.id
    )
  );

end
$function$;


-- ============================================================
-- 4. Save editable Report as Draft
-- ============================================================

create or replace function public.save_report_draft(
  p_report_id uuid,
  p_title text,
  p_values jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  a record;
  r public.reports%rowtype;

  item record;

  old_status text;
begin

  if not private.current_user_is_active()
     or not private.current_user_has_permission('reports.view_own')
     or not private.current_user_has_permission('reports.edit_draft')
  then
    raise exception 'FORBIDDEN';
  end if;


  select *
  into a
  from private.report_actor();

  if not found then
    raise exception 'ACCOUNT_INACTIVE';
  end if;


  select *
  into r
  from public.reports
  where id = p_report_id
  for update;

  if not found then
    raise exception 'REPORT_NOT_EDITABLE';
  end if;


  if r.created_by_user_id <> a.user_id then
    raise exception 'REPORT_NOT_EDITABLE';
  end if;


  -- ----------------------------------------------------------
  -- In this phase only Draft and pre-Send Completed Reports
  -- may enter the editing flow.
  --
  -- Editing an already Completed Report returns it to Draft,
  -- because the previous completion validation no longer
  -- represents the edited content.
  -- ----------------------------------------------------------

  if r.status not in ('draft', 'completed')
     or r.locked_at is not null
  then
    raise exception 'REPORT_NOT_EDITABLE';
  end if;


  if nullif(btrim(p_title), '') is null then
    raise exception 'INVALID_INPUT';
  end if;


  if jsonb_typeof(
       coalesce(p_values, '{}'::jsonb)
     ) <> 'object'
  then
    raise exception 'INVALID_REPORT_VALUES';
  end if;


  -- ----------------------------------------------------------
  -- Validate ALL incoming field keys before changing anything.
  -- ----------------------------------------------------------

  for item in
    select key, value
    from jsonb_each(
      coalesce(p_values, '{}'::jsonb)
    )
  loop

    if not exists (
      select 1
      from public.report_values rv
      where rv.report_id = r.id
        and rv.field_key = item.key
    )
    then
      raise exception 'UNKNOWN_REPORT_FIELD:%', item.key;
    end if;

  end loop;


  -- ----------------------------------------------------------
  -- Apply values
  -- ----------------------------------------------------------

  for item in
    select key, value
    from jsonb_each(
      coalesce(p_values, '{}'::jsonb)
    )
  loop

    update public.report_values
    set
      value = item.value,
      updated_at = statement_timestamp()
    where report_id = r.id
      and field_key = item.key;

  end loop;


  old_status := r.status;


  update public.reports
  set
    title = btrim(p_title),

    -- Completed content edited → Draft again.
    status =
      case
        when r.status = 'completed'
        then 'draft'
        else r.status
      end,

    -- New content must be re-completed/revalidated.
    completed_at =
      case
        when r.status = 'completed'
        then null
        else completed_at
      end,

    updated_at = statement_timestamp()

  where id = r.id
  returning *
  into r;


  perform private.report_audit(
    r.id,
    'REPORT_DRAFT_SAVED',
    old_status,
    r.status
  );


  return jsonb_build_object(
    'report',
    to_jsonb(r),

    'values',
    (
      select coalesce(
        jsonb_agg(
          to_jsonb(rv)
          order by rv.created_at, rv.id
        ),
        '[]'::jsonb
      )
      from public.report_values rv
      where rv.report_id = r.id
    )
  );

end
$function$;


-- ============================================================
-- 5. Complete / validate Report
-- ============================================================

create or replace function public.complete_report(
  p_report_id uuid,
  p_title text default null,
  p_values jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  a record;

  r public.reports%rowtype;
  version_row public.template_versions%rowtype;

  item record;
  required_field jsonb;

  field_value jsonb;

  old_status text;
begin

  if not private.current_user_is_active()
     or not private.current_user_has_permission('reports.view_own')
     or not private.current_user_has_permission('reports.complete')
  then
    raise exception 'FORBIDDEN';
  end if;


  select *
  into a
  from private.report_actor();

  if not found then
    raise exception 'ACCOUNT_INACTIVE';
  end if;


  select *
  into r
  from public.reports
  where id = p_report_id
  for update;

  if not found then
    raise exception 'REPORT_NOT_COMPLETABLE';
  end if;


  if r.created_by_user_id <> a.user_id
     or r.status not in ('draft', 'completed')
     or r.locked_at is not null
  then
    raise exception 'REPORT_NOT_COMPLETABLE';
  end if;


  -- ----------------------------------------------------------
  -- Optional values supplied during Complete.
  -- ----------------------------------------------------------

  if p_values is not null then

    if jsonb_typeof(p_values) <> 'object' then
      raise exception 'INVALID_REPORT_VALUES';
    end if;


    -- Validate all keys first.

    for item in
      select key, value
      from jsonb_each(p_values)
    loop

      if not exists (
        select 1
        from public.report_values rv
        where rv.report_id = r.id
          and rv.field_key = item.key
      )
      then
        raise exception 'UNKNOWN_REPORT_FIELD:%', item.key;
      end if;

    end loop;


    -- Apply only after full validation.

    for item in
      select key, value
      from jsonb_each(p_values)
    loop

      update public.report_values
      set
        value = item.value,
        updated_at = statement_timestamp()
      where report_id = r.id
        and field_key = item.key;

    end loop;

  end if;


  -- ----------------------------------------------------------
  -- IMPORTANT:
  --
  -- Required-field validation comes from the immutable
  -- Template VERSION SNAPSHOT bound to this Report.
  --
  -- It does NOT depend on mutable/current Template composition.
  -- ----------------------------------------------------------

  select *
  into version_row
  from public.template_versions tv
  where tv.id = r.template_version_id
    and tv.template_id = r.template_id;

  if not found then
    raise exception 'REPORT_TEMPLATE_VERSION_MISSING';
  end if;


  if jsonb_typeof(
       coalesce(
         version_row.schema_snapshot -> 'fields',
         '[]'::jsonb
       )
     ) <> 'array'
  then
    raise exception 'REPORT_TEMPLATE_VERSION_INVALID';
  end if;


  for required_field in

    select value
    from jsonb_array_elements(
      coalesce(
        version_row.schema_snapshot -> 'fields',
        '[]'::jsonb
      )
    ) as snapshot_field(value)

    where coalesce(
      (snapshot_field.value ->> 'is_required')::boolean,
      false
    )

  loop

    field_value := null;


    select rv.value
    into field_value
    from public.report_values rv
    where rv.report_id = r.id
      and rv.field_key =
          required_field ->> 'field_key';


    if not found then
      raise exception
        'REQUIRED_FIELD_MISSING:%',
        required_field ->> 'field_key';
    end if;


    if field_value is null
       or field_value = 'null'::jsonb
       or (
         jsonb_typeof(field_value) = 'string'
         and nullif(
           btrim(field_value #>> '{}'),
           ''
         ) is null
       )
    then
      raise exception
        'REQUIRED_FIELD_MISSING:%',
        required_field ->> 'field_key';
    end if;

  end loop;


  old_status := r.status;


  update public.reports
  set
    title =
      coalesce(
        nullif(btrim(p_title), ''),
        title
      ),

    status = 'completed',

    -- Represents validation of the CURRENT content.
    completed_at = statement_timestamp(),

    updated_at = statement_timestamp()

  where id = r.id
  returning *
  into r;


  perform private.report_audit(
    r.id,
    'REPORT_COMPLETED',
    old_status,
    'completed'
  );


  return jsonb_build_object(
    'report',
    to_jsonb(r),

    'values',
    (
      select coalesce(
        jsonb_agg(
          to_jsonb(rv)
          order by rv.created_at, rv.id
        ),
        '[]'::jsonb
      )
      from public.report_values rv
      where rv.report_id = r.id
    )
  );

end
$function$;


-- ============================================================
-- 6. Function privileges
-- ============================================================

revoke all
on function public.create_report_from_template(uuid,text,jsonb)
from public, anon, authenticated;

revoke all
on function public.save_report_draft(uuid,text,jsonb)
from public, anon, authenticated;

revoke all
on function public.complete_report(uuid,text,jsonb)
from public, anon, authenticated;


grant execute
on function public.create_report_from_template(uuid,text,jsonb)
to authenticated;

grant execute
on function public.save_report_draft(uuid,text,jsonb)
to authenticated;

grant execute
on function public.complete_report(uuid,text,jsonb)
to authenticated;


-- ============================================================
-- 7. Migration ledger
-- ============================================================

insert into private.widgetflow_schema_migrations (
  id,
  description
)
values (
  '029_report_core_lifecycle',
  'Trusted Supabase Report create, draft save and completion lifecycle using immutable Template-version snapshots, strict field validation and audit history'
);


commit;