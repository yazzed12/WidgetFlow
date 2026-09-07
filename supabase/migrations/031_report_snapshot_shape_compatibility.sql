begin;

-- ============================================================
-- WidgetFlow
-- Migration 031
-- Report Snapshot Shape Compatibility
-- ============================================================


-- ============================================================
-- 0. Migration guard
-- ============================================================

do $guard$
begin

  if not exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '030_report_core_lifecycle_hardening'
  ) then
    raise exception
      'WidgetFlow migration 030_report_core_lifecycle_hardening must be applied first';
  end if;


  if exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '031_report_snapshot_shape_compatibility'
  ) then
    raise exception
      'WidgetFlow migration 031_report_snapshot_shape_compatibility has already been applied';
  end if;

end
$guard$;


-- ============================================================
-- 1. Normalize immutable Template-version snapshot fields
--
-- Supports both:
--
-- Canonical:
--   field_key
--   field_type
--   is_required
--   default_value
--
-- Legacy:
--   key
--   type
--   required
--   defaultValue
--
-- Historical IDs are NOT assumed to be UUID.
-- ============================================================

create or replace function private.normalized_report_snapshot_fields(
  p_template_id uuid,
  p_snapshot jsonb
)
returns table (
  raw_id text,
  effective_key text,
  effective_label text,
  effective_type text,
  effective_required boolean,
  effective_default jsonb,
  safe_template_field_id uuid
)
language plpgsql
security definer
set search_path = ''
as $function$

declare
  f jsonb;

  k text;
  label text;
  typ text;

  req text;
  rid text;

  safe_id uuid;

  normalized_required boolean;
begin

  -- ----------------------------------------------------------
  -- Snapshot fields must actually exist and must be an array.
  -- Do NOT silently convert missing fields into [].
  -- ----------------------------------------------------------

  if p_snapshot is null
     or jsonb_typeof(p_snapshot) <> 'array'
  then
    raise exception 'TEMPLATE_VERSION_INVALID';
  end if;


  -- ----------------------------------------------------------
  -- Normalize every historical/current snapshot field.
  -- ----------------------------------------------------------

  for f in
    select value
    from jsonb_array_elements(p_snapshot)
  loop

    -- --------------------------------------------------------
    -- Canonical:
    -- field_key
    --
    -- Legacy:
    -- key
    -- --------------------------------------------------------

    k :=
      coalesce(
        nullif(
          btrim(f ->> 'field_key'),
          ''
        ),
        nullif(
          btrim(f ->> 'key'),
          ''
        )
      );


    -- --------------------------------------------------------
    -- Label
    -- --------------------------------------------------------

    label :=
      nullif(
        btrim(f ->> 'label'),
        ''
      );


    -- --------------------------------------------------------
    -- Canonical:
    -- field_type
    --
    -- Legacy:
    -- type
    -- --------------------------------------------------------

    typ :=
      coalesce(
        nullif(
          btrim(f ->> 'field_type'),
          ''
        ),
        nullif(
          btrim(f ->> 'type'),
          ''
        )
      );


    -- --------------------------------------------------------
    -- Mandatory normalized structural fields.
    -- --------------------------------------------------------

    if k is null
       or label is null
       or typ is null
    then
      raise exception 'TEMPLATE_VERSION_INVALID_FIELD';
    end if;


    -- --------------------------------------------------------
    -- Reject duplicate normalized field keys.
    --
    -- Example:
    --
    -- { "field_key": "revenue" }
    -- { "key": "revenue" }
    --
    -- inside the same snapshot is invalid.
    -- --------------------------------------------------------

    if (
      select count(*)
      from jsonb_array_elements(p_snapshot) as x(value)
      where coalesce(
        nullif(
          btrim(x.value ->> 'field_key'),
          ''
        ),
        nullif(
          btrim(x.value ->> 'key'),
          ''
        )
      ) = k
    ) > 1
    then
      raise exception
        'TEMPLATE_VERSION_DUPLICATE_FIELD_KEY:%',
        k;
    end if;


    -- --------------------------------------------------------
    -- Historical raw component ID.
    --
    -- This may be:
    --
    -- UUID
    --
    -- OR legacy IDs such as:
    -- finance-revenue
    -- executive-overall-status
    --
    -- Never cast before validation.
    -- --------------------------------------------------------

    rid :=
      nullif(
        btrim(f ->> 'id'),
        ''
      );


    safe_id := null;


    -- --------------------------------------------------------
    -- Strategy A:
    --
    -- If raw ID looks like UUID, only use it when:
    --
    -- tf.id = raw UUID
    -- AND same Template
    -- AND same normalized field key
    -- --------------------------------------------------------

    if rid is not null
       and rid ~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then

      select tf.id
      into safe_id
      from public.template_fields tf
      where tf.id = rid::uuid
        and tf.template_id = p_template_id
        and tf.field_key = k;

    end if;


    -- --------------------------------------------------------
    -- Strategy B:
    --
    -- Legacy/non-UUID ID, missing ID, or stale UUID:
    --
    -- attempt safe lookup by:
    --
    -- Template + normalized business field key.
    --
    -- public.template_fields already has uniqueness on:
    -- (template_id, field_key)
    -- --------------------------------------------------------

    if safe_id is null then

      select tf.id
      into safe_id
      from public.template_fields tf
      where tf.template_id = p_template_id
        and tf.field_key = k;

    end if;


    -- --------------------------------------------------------
    -- Required flag compatibility.
    --
    -- Canonical:
    -- is_required
    --
    -- Legacy:
    -- required
    --
    -- Accepted:
    -- true
    -- false
    -- "true"
    -- "false"
    --
    -- Missing:
    -- false
    --
    -- Reject malformed values such as:
    -- 1
    -- yes
    -- required
    -- --------------------------------------------------------

    req :=
      coalesce(
        f ->> 'is_required',
        f ->> 'required'
      );


    if req is null then

      normalized_required := false;


    elsif lower(btrim(req)) = 'true' then

      normalized_required := true;


    elsif lower(btrim(req)) = 'false' then

      normalized_required := false;


    else

      raise exception
        'TEMPLATE_VERSION_INVALID_REQUIRED_FLAG:%',
        k;

    end if;


    -- --------------------------------------------------------
    -- Return normalized field.
    --
    -- Canonical default:
    -- default_value
    --
    -- Legacy default:
    -- defaultValue
    --
    -- Key-presence matters because JSON null is a legitimate
    -- explicit default representation.
    -- --------------------------------------------------------

    return query
    select
      rid,
      k,
      label,
      typ,
      normalized_required,

      case

        when f ? 'default_value'
          then f -> 'default_value'

        when f ? 'defaultValue'
          then f -> 'defaultValue'

        else null

      end,

      safe_id;

  end loop;

end
$function$;


-- Internal helper must never be directly browser-callable.

revoke all
on function private.normalized_report_snapshot_fields(uuid,jsonb)
from public, anon, authenticated;


-- ============================================================
-- 2. Create Report from immutable Template version
--    with historical/current snapshot compatibility
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

  n record;

  chosen_title text;
begin

  -- ----------------------------------------------------------
  -- Preserve 030 authorization.
  -- ----------------------------------------------------------

  if not private.current_user_is_active()
     or not private.current_user_has_permission('reports.create')
     or not private.current_user_has_permission('reports.view_own')
     or not private.current_user_has_permission('templates.view_approved')
     or not private.current_user_has_permission('templates.use')
  then
    raise exception 'FORBIDDEN';
  end if;


  -- ----------------------------------------------------------
  -- Resolve active Report actor.
  -- ----------------------------------------------------------

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
  -- Preserve exact immutable Template-version binding.
  --
  -- DO NOT restore:
  -- ORDER BY published_at DESC
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
  -- Incoming values must be an object.
  -- ----------------------------------------------------------

  if jsonb_typeof(
       coalesce(
         p_values,
         '{}'::jsonb
       )
     ) <> 'object'
  then
    raise exception 'INVALID_REPORT_VALUES';
  end if;


  -- ----------------------------------------------------------
  -- Validate incoming business keys against NORMALIZED
  -- immutable snapshot keys.
  --
  -- This supports both:
  --
  -- field_key = revenue
  --
  -- and legacy:
  --
  -- key = revenue
  -- ----------------------------------------------------------

  for n in
    select key
    from jsonb_each(
      coalesce(
        p_values,
        '{}'::jsonb
      )
    )
  loop

    if not exists (

      select 1
      from private.normalized_report_snapshot_fields(
        t.id,
        v.schema_snapshot -> 'fields'
      ) s

      where s.effective_key = n.key

    )
    then

      raise exception
        'UNKNOWN_REPORT_FIELD:%',
        n.key;

    end if;

  end loop;


  chosen_title :=
    coalesce(
      nullif(
        btrim(p_title),
        ''
      ),
      t.name
    );


  -- ----------------------------------------------------------
  -- Create Report header.
  --
  -- Status defaults to draft.
  -- recipient remains NULL.
  -- current_send_cycle_id remains NULL.
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
  -- Materialize normalized immutable snapshot fields into
  -- Report-owned values.
  -- ----------------------------------------------------------

  for n in

    select *
    from private.normalized_report_snapshot_fields(
      t.id,
      v.schema_snapshot -> 'fields'
    )

  loop

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

      n.safe_template_field_id,

      n.effective_key,
      n.effective_label,
      n.effective_type,

      -- ------------------------------------------------------
      -- Explicit key-presence semantics.
      --
      -- If browser explicitly sends:
      --
      -- "revenue": null
      --
      -- preserve JSON null.
      --
      -- Do NOT replace it with default.
      -- ------------------------------------------------------

      case

        when coalesce(
               p_values,
               '{}'::jsonb
             ) ? n.effective_key
        then
          p_values -> n.effective_key

        else
          n.effective_default

      end
    );

  end loop;


  -- ----------------------------------------------------------
  -- Trusted audit event.
  -- ----------------------------------------------------------

  perform private.report_audit(
    r.id,
    'REPORT_CREATED',
    null,
    'draft'
  );


  -- ----------------------------------------------------------
  -- Return created Report + values.
  -- ----------------------------------------------------------

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
-- 3. Complete Report using normalized immutable snapshot
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
  v public.template_versions%rowtype;

  n record;
  item record;

  val jsonb;

  old_status text;
begin

  -- ----------------------------------------------------------
  -- Preserve 030 authorization.
  -- ----------------------------------------------------------

  if not private.current_user_is_active()
     or not private.current_user_has_permission('reports.view_own')
     or not private.current_user_has_permission('reports.complete')
  then
    raise exception 'FORBIDDEN';
  end if;


  -- ----------------------------------------------------------
  -- Resolve actor explicitly.
  -- ----------------------------------------------------------

  select *
  into a
  from private.report_actor();

  if not found then
    raise exception 'ACCOUNT_INACTIVE';
  end if;


  -- ----------------------------------------------------------
  -- Lock Report row.
  -- ----------------------------------------------------------

  select *
  into r
  from public.reports
  where id = p_report_id
  for update;


  -- ----------------------------------------------------------
  -- Preserve ALL 030 lifecycle guards.
  --
  -- A Report may only be completed before Send.
  -- ----------------------------------------------------------

  if not found
     or r.created_by_user_id <> a.user_id
     or r.status not in ('draft', 'completed')
     or r.locked_at is not null
     or r.current_send_cycle_id is not null
     or r.sent_at is not null
  then
    raise exception 'REPORT_NOT_COMPLETABLE';
  end if;


  -- ----------------------------------------------------------
  -- Exact immutable Template version attached to this Report.
  -- ----------------------------------------------------------

  select *
  into v
  from public.template_versions
  where id = r.template_version_id
    and template_id = r.template_id;

  if not found then
    raise exception 'REPORT_TEMPLATE_VERSION_MISSING';
  end if;


  -- ----------------------------------------------------------
  -- Optional values may be supplied atomically with Complete.
  -- ----------------------------------------------------------

  if p_values is not null then

    if jsonb_typeof(p_values) <> 'object' then
      raise exception 'INVALID_REPORT_VALUES';
    end if;


    -- --------------------------------------------------------
    -- Validate all incoming keys before updates.
    -- --------------------------------------------------------

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

        raise exception
          'UNKNOWN_REPORT_FIELD:%',
          item.key;

      end if;

    end loop;


    -- --------------------------------------------------------
    -- Apply only after complete key validation.
    -- --------------------------------------------------------

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
  -- Required-field validation comes ONLY from immutable
  -- version snapshot normalization.
  --
  -- Supports:
  --
  -- is_required
  -- required
  --
  -- Does NOT derive required behavior from live
  -- public.template_fields.
  -- ----------------------------------------------------------

  for n in

    select *
    from private.normalized_report_snapshot_fields(
      r.template_id,
      v.schema_snapshot -> 'fields'
    )
    where effective_required

  loop

    val := null;


    select rv.value
    into val
    from public.report_values rv
    where rv.report_id = r.id
      and rv.field_key = n.effective_key;


    -- --------------------------------------------------------
    -- A required snapshot field must actually have a Report
    -- value row.
    -- --------------------------------------------------------

    if not found then
      raise exception
        'REQUIRED_FIELD_MISSING:%',
        n.effective_key;
    end if;


    -- --------------------------------------------------------
    -- Missing required values:
    --
    -- SQL NULL
    -- JSON null
    -- blank string
    -- whitespace-only string
    -- empty array
    -- empty object
    --
    -- Valid:
    --
    -- 0
    -- false
    -- non-empty string
    -- non-empty array
    -- non-empty object
    -- --------------------------------------------------------

    if val is null

       or val = 'null'::jsonb

       or (
         jsonb_typeof(val) = 'string'
         and nullif(
               btrim(val #>> '{}'),
               ''
             ) is null
       )

       or (
         jsonb_typeof(val) = 'array'
         and jsonb_array_length(val) = 0
       )

       or (
         jsonb_typeof(val) = 'object'
         and val = '{}'::jsonb
       )
    then

      raise exception
        'REQUIRED_FIELD_MISSING:%',
        n.effective_key;

    end if;

  end loop;


  old_status := r.status;


  -- ----------------------------------------------------------
  -- Current content is now validated as Completed.
  -- ----------------------------------------------------------

  update public.reports
  set
    title =
      coalesce(
        nullif(
          btrim(p_title),
          ''
        ),
        title
      ),

    status = 'completed',

    completed_at = statement_timestamp(),

    updated_at = statement_timestamp()

  where id = r.id

  returning *
  into r;


  -- ----------------------------------------------------------
  -- Trusted audit event.
  -- ----------------------------------------------------------

  perform private.report_audit(
    r.id,
    'REPORT_COMPLETED',
    old_status,
    'completed'
  );


  -- ----------------------------------------------------------
  -- Return Report + values.
  -- ----------------------------------------------------------

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
-- 4. Function privileges
-- ============================================================

-- Internal normalization helper must remain private.

revoke all
on function private.normalized_report_snapshot_fields(uuid,jsonb)
from public, anon, authenticated;


-- Reassert lifecycle RPC browser privileges.

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
-- 5. Migration ledger
-- ============================================================

insert into private.widgetflow_schema_migrations (
  id,
  description
)
values (
  '031_report_snapshot_shape_compatibility',
  'Runtime normalization for canonical and legacy immutable Template-version Report snapshots, including safe historical IDs and required-field compatibility'
);


commit;