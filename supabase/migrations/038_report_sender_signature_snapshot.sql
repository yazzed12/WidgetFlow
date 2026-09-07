begin;

do $guard$
begin
  if not exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '037_report_historical_template_version_read'
  ) then
    raise exception
      'WidgetFlow migration 037_report_historical_template_version_read must be applied first';
  end if;

  if exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '038_report_sender_signature_snapshot'
  ) then
    raise exception
      'WidgetFlow migration 038_report_sender_signature_snapshot has already been applied';
  end if;
end
$guard$;


create or replace function public.send_report(
  p_report_id uuid,
  p_recipient_user_ids uuid[],
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor record;
  report_row public.reports%rowtype;
  cycle_row public.report_send_cycles%rowtype;
  recipient_row record;
  assignment_row record;
  version_row public.template_versions%rowtype;
  signature_row public.signature_profiles%rowtype;
  sender_field record;

  cycle_no integer;
  idx integer := 0;
  input_count integer;
  sender_field_count integer := 0;
begin

  /*
   * ------------------------------------------------------------
   * AUTH / PERMISSION
   * ------------------------------------------------------------
   */

  if not private.current_user_is_active()
     or not private.current_user_has_permission('reports.view_own')
     or not private.current_user_has_permission('reports.send')
  then
    raise exception 'FORBIDDEN';
  end if;

  select *
  into actor
  from private.report_actor();

  if not found then
    raise exception 'ACCOUNT_INACTIVE';
  end if;


  /*
   * ------------------------------------------------------------
   * RECIPIENT VALIDATION
   * ------------------------------------------------------------
   */

  if p_recipient_user_ids is null
     or cardinality(p_recipient_user_ids) = 0
  then
    raise exception 'RECIPIENTS_REQUIRED';
  end if;

  select count(*)
  into input_count
  from unnest(p_recipient_user_ids);

  if input_count <> (
    select count(distinct recipient_id)
    from unnest(p_recipient_user_ids) as input_ids(recipient_id)
  ) then
    raise exception 'DUPLICATE_RECIPIENT';
  end if;


  /*
   * ------------------------------------------------------------
   * LOCK + VALIDATE REPORT
   * ------------------------------------------------------------
   */

  select *
  into report_row
  from public.reports
  where id = p_report_id
  for update;

  if not found
     or report_row.created_by_user_id <> actor.user_id
     or report_row.status <> 'completed'
     or report_row.locked_at is not null
     or report_row.current_send_cycle_id is not null
     or report_row.sent_at is not null
  then
    raise exception 'REPORT_NOT_SENDABLE';
  end if;


  if exists (
    select 1
    from unnest(p_recipient_user_ids) as input_ids(recipient_id)
    where input_ids.recipient_id = auth.uid()
  ) then
    raise exception 'SELF_RECIPIENT_NOT_ALLOWED';
  end if;


  if exists (
    select 1
    from unnest(p_recipient_user_ids) as input_ids(recipient_id)
    where not exists (
      select 1
      from public.profiles profile_row
      join public.roles role_row
        on role_row.id = profile_row.role_id
      where profile_row.id = input_ids.recipient_id
        and profile_row.status = 'Active'
        and role_row.is_active
        and role_row.role_type in ('System', 'Custom')
        and not coalesce(role_row.is_protected, false)
    )
  ) then
    raise exception 'INVALID_RECIPIENT';
  end if;


  /*
   * ------------------------------------------------------------
   * LOAD IMMUTABLE HISTORICAL TEMPLATE VERSION
   * ------------------------------------------------------------
   */

  select *
  into version_row
  from public.template_versions
  where id = report_row.template_version_id;

  if not found
     or version_row.schema_snapshot is null
  then
    raise exception 'TEMPLATE_VERSION_INVALID';
  end if;


  /*
   * ------------------------------------------------------------
   * DISCOVER SENDER SIGNATURE FIELDS
   *
   * Structured rule:
   *
   * type / field_type = signature
   * signatureConfig.signatureRole / signatureRole = Sender
   *
   * Do NOT use display labels.
   * ------------------------------------------------------------
   */

  for sender_field in

    with recursive snapshot_nodes(value) as (

      select version_row.schema_snapshot

      union all

      select child.value
      from snapshot_nodes node
      cross join lateral (

        select array_node.value
        from jsonb_array_elements(
          case
            when jsonb_typeof(node.value) = 'array'
              then node.value
            else '[]'::jsonb
          end
        ) as array_node(value)

        union all

        select object_node.value
        from jsonb_each(
          case
            when jsonb_typeof(node.value) = 'object'
              then node.value
            else '{}'::jsonb
          end
        ) as object_node(key, value)

      ) child

    )

    select value as field
    from snapshot_nodes
    where jsonb_typeof(value) = 'object'

      and lower(
        coalesce(
          value ->> 'type',
          value ->> 'field_type',
          ''
        )
      ) = 'signature'

      and lower(
        coalesce(
          value #>> '{signatureConfig,signatureRole}',
          value ->> 'signatureRole',
          ''
        )
      ) = 'sender'

  loop

    sender_field_count := sender_field_count + 1;

    /*
     * Sender Signature MUST have a canonical business key.
     *
     * component.id is NEVER accepted as a report-value key.
     */

    if nullif(
      btrim(
        coalesce(
          sender_field.field ->> 'field_key',
          sender_field.field ->> 'key',
          ''
        )
      ),
      ''
    ) is null
    then
      raise exception 'INVALID_SENDER_SIGNATURE_FIELD';
    end if;

  end loop;


  /*
   * ------------------------------------------------------------
   * LOAD + SNAPSHOT AUTHENTICATED SENDER SIGNATURE
   * ------------------------------------------------------------
   */

  if sender_field_count > 0 then

    /*
     * Sender identity comes exclusively from report_actor().
     *
     * No sender/signature payload is accepted from the frontend.
     */

    select *
    into signature_row
    from public.signature_profiles
    where user_id = actor.user_id
      and is_active = true
    limit 1;


    /*
     * Validate that the active profile actually contains a usable
     * signature.
     */

    if not found
       or not (

         (
           lower(signature_row.signature_method) = 'typed'
           and nullif(btrim(signature_row.typed_name), '') is not null
         )

         or

         (
           lower(signature_row.signature_method) = 'drawn'
           and signature_row.drawing_data is not null
         )

         or

         (
           lower(signature_row.signature_method) = 'uploaded'
           and signature_row.signature_asset_id is not null
         )

       )
    then
      raise exception 'SENDER_SIGNATURE_REQUIRED';
    end if;


    /*
     * ----------------------------------------------------------
     * UPSERT SYSTEM-OWNED SENDER SIGNATURE REPORT VALUES
     * ----------------------------------------------------------
     *
     * IMPORTANT:
     *
     * template_field_id is intentionally NULL here.
     *
     * We do NOT treat component.id as public.template_fields.id.
     *
     * Canonical report identity is field_key.
     * ----------------------------------------------------------
     */

    for sender_field in

      with recursive snapshot_nodes(value) as (

        select version_row.schema_snapshot

        union all

        select child.value
        from snapshot_nodes node
        cross join lateral (

          select array_node.value
          from jsonb_array_elements(
            case
              when jsonb_typeof(node.value) = 'array'
                then node.value
              else '[]'::jsonb
            end
          ) as array_node(value)

          union all

          select object_node.value
          from jsonb_each(
            case
              when jsonb_typeof(node.value) = 'object'
                then node.value
              else '{}'::jsonb
            end
          ) as object_node(key, value)

        ) child

      )

      select value as field
      from snapshot_nodes
      where jsonb_typeof(value) = 'object'

        and lower(
          coalesce(
            value ->> 'type',
            value ->> 'field_type',
            ''
          )
        ) = 'signature'

        and lower(
          coalesce(
            value #>> '{signatureConfig,signatureRole}',
            value ->> 'signatureRole',
            ''
          )
        ) = 'sender'

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
        report_row.id,

        /*
         * DO NOT use component.id here.
         */
        null,

        coalesce(
          nullif(
            btrim(sender_field.field ->> 'field_key'),
            ''
          ),
          nullif(
            btrim(sender_field.field ->> 'key'),
            ''
          )
        ),

        coalesce(
          nullif(
            btrim(sender_field.field ->> 'label'),
            ''
          ),
          'Sender Signature'
        ),

        coalesce(
          nullif(
            btrim(sender_field.field ->> 'field_type'),
            ''
          ),
          nullif(
            btrim(sender_field.field ->> 'type'),
            ''
          ),
          'signature'
        ),

        jsonb_build_object(
          'signatureMethod',
          signature_row.signature_method,

          'typedName',
          signature_row.typed_name,

          'drawingData',
          signature_row.drawing_data,

          'signatureAssetId',
          signature_row.signature_asset_id
        )
      )

      on conflict (report_id, field_key)
      do update set

        /*
         * Keep this NULL rather than injecting component UUID.
         */
        template_field_id = null,

        field_label_snapshot = excluded.field_label_snapshot,

        field_type_snapshot = excluded.field_type_snapshot,

        /*
         * System-owned value is refreshed from authenticated
         * sender's active signature on each legitimate Send.
         */
        value = excluded.value,

        updated_at = statement_timestamp();

    end loop;

  end if;


  /*
   * ------------------------------------------------------------
   * EXISTING SEND LIFECYCLE
   *
   * Keep effective Migration 033 behavior.
   * ------------------------------------------------------------
   */

  select coalesce(max(existing_cycle.cycle_number), 0) + 1
  into cycle_no
  from public.report_send_cycles existing_cycle
  where existing_cycle.report_id = report_row.id;


  insert into public.report_send_cycles (
    report_id,
    cycle_number,
    sender_user_id,
    sender_name_snapshot,
    sender_email_snapshot,
    sender_role_id_snapshot,
    sender_role_key_snapshot,
    sender_role_name_snapshot,
    sender_governance_level_snapshot,
    sender_note,
    content_hash
  )
  values (
    report_row.id,
    cycle_no,
    actor.user_id,
    actor.full_name,
    actor.email,
    actor.role_id,
    actor.role_key,
    actor.role_name,
    actor.governance_level,
    nullif(btrim(p_note), ''),

    /*
     * Preserve the existing send_report hash contract from 033.
     *
     * Do NOT redesign recipient-signature semantics in Migration 038.
     */
    encode(
      sha256(
        convert_to(
          report_row.id::text
          || ':'
          || report_row.updated_at::text,
          'utf8'
        )
      ),
      'hex'
    )
  )
  returning *
  into cycle_row;


  /*
   * ------------------------------------------------------------
   * ASSIGNMENTS
   * ------------------------------------------------------------
   */

  for recipient_row in

    select
      profile_row.id,
      profile_row.full_name,
      profile_row.email,
      profile_row.role_id,
      role_row.key as role_key,
      role_row.name as role_name,
      role_row.governance_level

    from public.profiles profile_row

    join public.roles role_row
      on role_row.id = profile_row.role_id

    where profile_row.id = any(p_recipient_user_ids)

    order by
      profile_row.full_name,
      profile_row.id

  loop

    idx := idx + 1;

    insert into public.report_assignments (
      report_id,
      send_cycle_id,
      recipient_user_id,
      recipient_name_snapshot,
      recipient_email_snapshot,
      recipient_role_id_snapshot,
      recipient_role_key_snapshot,
      recipient_role_name_snapshot,
      recipient_governance_level_snapshot,
      assignment_sequence
    )
    values (
      report_row.id,
      cycle_row.id,
      recipient_row.id,
      recipient_row.full_name,
      recipient_row.email,
      recipient_row.role_id,
      recipient_row.role_key,
      recipient_row.role_name,
      recipient_row.governance_level,
      idx
    );

  end loop;


  /*
   * ------------------------------------------------------------
   * REPORT -> SENT
   * ------------------------------------------------------------
   */

  update public.reports
  set
    status = 'sent',
    current_send_cycle_id = cycle_row.id,
    sent_at = statement_timestamp(),
    sender_note = nullif(btrim(p_note), ''),
    updated_at = statement_timestamp()
  where id = report_row.id;


  /*
   * ------------------------------------------------------------
   * RECIPIENT NOTIFICATIONS
   * ------------------------------------------------------------
   */

  for assignment_row in

    select
      created_assignment.id,
      created_assignment.recipient_user_id

    from public.report_assignments created_assignment

    where created_assignment.send_cycle_id = cycle_row.id

  loop

    insert into public.notifications (
      recipient_user_id,
      notification_type,
      title,
      message,
      related_report_id,
      send_cycle_id,
      report_assignment_id
    )
    values (
      assignment_row.recipient_user_id,
      'REPORT_RECEIVED',
      'Report received',
      report_row.title,
      report_row.id,
      cycle_row.id,
      assignment_row.id
    );

  end loop;


  /*
   * ------------------------------------------------------------
   * AUDIT
   * ------------------------------------------------------------
   */

  perform private.report_audit(
    report_row.id,
    'REPORT_SENT',
    'completed',
    'sent',
    p_note
  );


  /*
   * ------------------------------------------------------------
   * RETURN
   * ------------------------------------------------------------
   */

  return jsonb_build_object(

    'report',
    (
      select to_jsonb(updated_report)
      from public.reports updated_report
      where updated_report.id = report_row.id
    ),

    'send_cycle',
    to_jsonb(cycle_row),

    'assignments',
    (
      select coalesce(
        jsonb_agg(
          to_jsonb(created_assignment)
          order by created_assignment.assignment_sequence
        ),
        '[]'::jsonb
      )
      from public.report_assignments created_assignment
      where created_assignment.send_cycle_id = cycle_row.id
    )

  );

end
$$;


revoke all
on function public.send_report(uuid, uuid[], text)
from public, anon, authenticated;

grant execute
on function public.send_report(uuid, uuid[], text)
to authenticated;


insert into private.widgetflow_schema_migrations (
  id,
  description
)
values (
  '038_report_sender_signature_snapshot',
  'Atomic sender signature snapshot into report values during Send'
);
