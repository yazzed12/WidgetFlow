begin;

do $guard$
begin
  if not exists (select 1 from private.widgetflow_schema_migrations where id = '046_signature_self_service_profile_identity_hotfix') then raise exception 'WidgetFlow migration 046_signature_self_service_profile_identity_hotfix must be applied first'; end if;
  if exists (select 1 from private.widgetflow_schema_migrations where id = '047_report_signature_typed_font_snapshot') then raise exception 'WidgetFlow migration 047_report_signature_typed_font_snapshot has already been applied'; end if;
end
$guard$;

create or replace function private.send_report_038_legacy(
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

          'typedFontKey',
          signature_row.typed_font_key,

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

create or replace function public.send_report(
  p_report_id uuid,
  p_recipient_user_ids uuid[],
  p_note text default null,
  p_signature_mappings jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor record;
  report_row public.reports%rowtype;
  version_row public.template_versions%rowtype;

  mapping_row jsonb;
  assignment_row public.report_assignments%rowtype;

  result jsonb;
  current_cycle_id uuid;

  recipient_count integer;
  mapping_count integer;

  all_field_keys text[] := '{}'::text[];
  receiver_field_keys text[] := '{}'::text[];
  required_receiver_field_keys text[] := '{}'::text[];

  mapped_recipient_id uuid;
  mapped_field_key text;
begin

  -- ==========================================================
  -- 1. AUTHORIZATION
  -- Preserve Migration 038 authorization contract.
  -- ==========================================================

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


  -- ==========================================================
  -- 2. RECIPIENT LIST VALIDATION
  -- ==========================================================

  if p_recipient_user_ids is null
     or cardinality(p_recipient_user_ids) = 0
  then
    raise exception 'RECIPIENTS_REQUIRED';
  end if;

  select count(*)
  into recipient_count
  from unnest(p_recipient_user_ids);

  if recipient_count <> (
    select count(distinct recipient_id)
    from unnest(p_recipient_user_ids)
      as input_ids(recipient_id)
  ) then
    raise exception 'DUPLICATE_RECIPIENT';
  end if;


  -- ==========================================================
  -- 3. LOCK + VALIDATE REPORT
  -- ==========================================================

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


  -- ==========================================================
  -- 4. SELF RECIPIENT GUARD
  -- ==========================================================

  if exists (
    select 1
    from unnest(p_recipient_user_ids)
      as input_ids(recipient_id)
    where input_ids.recipient_id = auth.uid()
  ) then
    raise exception 'SELF_RECIPIENT_NOT_ALLOWED';
  end if;


  -- ==========================================================
  -- 5. RECIPIENT ELIGIBILITY
  -- Preserve Migration 038 behavior.
  -- ==========================================================

  if exists (
    select 1
    from unnest(p_recipient_user_ids)
      as input_ids(recipient_id)
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


  -- ==========================================================
  -- 6. IMMUTABLE HISTORICAL TEMPLATE SNAPSHOT
  -- ==========================================================

  select *
  into version_row
  from public.template_versions
  where id = report_row.template_version_id;

  if not found
     or version_row.schema_snapshot is null
  then
    raise exception 'TEMPLATE_VERSION_INVALID';
  end if;


  -- ==========================================================
  -- 7. MAPPING INPUT SHAPE
  --
  -- IMPORTANT:
  -- Empty mappings ARE allowed when the historical template has
  -- no required Receiver Signature field.
  -- ==========================================================

  if p_signature_mappings is null
     or jsonb_typeof(p_signature_mappings) <> 'array'
  then
    raise exception 'SIGNATURE_MAPPING_INVALID_FORMAT';
  end if;

  select count(*)
  into mapping_count
  from jsonb_array_elements(p_signature_mappings);


  -- ==========================================================
  -- 8. DISCOVER TEMPLATE FIELDS
  --
  -- No labels.
  -- No ordering.
  -- No component.id.
  --
  -- Canonical identity:
  -- field_key
  -- fallback key
  -- ==========================================================

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
  ),
  discovered_fields as (
    select distinct
      coalesce(
        nullif(btrim(value ->> 'field_key'), ''),
        nullif(btrim(value ->> 'key'), '')
      ) as field_key,

      lower(
        coalesce(
          value ->> 'type',
          value ->> 'field_type',
          ''
        )
      ) as field_type,

      lower(
        coalesce(
          value #>> '{signatureConfig,signatureRole}',
          value ->> 'signatureRole',
          ''
        )
      ) as signature_role,

      (
        lower(
          coalesce(
            value ->> 'required',
            value ->> 'is_required',
            'false'
          )
        ) = 'true'
      ) as is_required

    from snapshot_nodes
    where jsonb_typeof(value) = 'object'
      and coalesce(
        nullif(btrim(value ->> 'field_key'), ''),
        nullif(btrim(value ->> 'key'), '')
      ) is not null
  )
  select
    coalesce(
      array_agg(distinct field_key)
        filter (where field_key is not null),
      '{}'::text[]
    ),

    coalesce(
      array_agg(distinct field_key)
        filter (
          where field_type = 'signature'
            and signature_role = 'receiver'
        ),
      '{}'::text[]
    ),

    coalesce(
      array_agg(distinct field_key)
        filter (
          where field_type = 'signature'
            and signature_role = 'receiver'
            and is_required
        ),
      '{}'::text[]
    )

  into
    all_field_keys,
    receiver_field_keys,
    required_receiver_field_keys

  from discovered_fields;


  -- ==========================================================
  -- 9. VALIDATE EACH EXPLICIT MAPPING
  --
  -- Recipient != Signer.
  --
  -- A recipient MAY have no mapping.
  -- A mapping means that recipient IS a signer.
  -- ==========================================================

  for mapping_row in
    select value
    from jsonb_array_elements(p_signature_mappings)
  loop

    -- --------------------------------------------------------
    -- Mapping must be an object with both required properties.
    -- --------------------------------------------------------

    if jsonb_typeof(mapping_row) <> 'object'
       or nullif(
         btrim(mapping_row ->> 'recipientUserId'),
         ''
       ) is null
       or nullif(
         btrim(mapping_row ->> 'signatureFieldKey'),
         ''
       ) is null
    then
      raise exception 'SIGNATURE_MAPPING_INVALID_FORMAT';
    end if;


    -- --------------------------------------------------------
    -- Validate UUID text before casting.
    --
    -- We intentionally do not restrict UUID version.
    -- --------------------------------------------------------

    if btrim(mapping_row ->> 'recipientUserId')
       !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then
      raise exception 'SIGNATURE_MAPPING_RECIPIENT_INVALID';
    end if;

    mapped_recipient_id :=
      btrim(mapping_row ->> 'recipientUserId')::uuid;

    mapped_field_key :=
      btrim(mapping_row ->> 'signatureFieldKey');


    -- --------------------------------------------------------
    -- The signer must already be a selected report recipient.
    -- --------------------------------------------------------

    if not exists (
      select 1
      from unnest(p_recipient_user_ids)
        as input_ids(recipient_id)
      where input_ids.recipient_id = mapped_recipient_id
    ) then
      raise exception 'SIGNATURE_MAPPING_RECIPIENT_INVALID';
    end if;


    -- --------------------------------------------------------
    -- One recipient can own at most one signature field in V1.
    -- Compare as UUID, not raw JSON text.
    -- --------------------------------------------------------

    if (
      select count(*)
      from jsonb_array_elements(p_signature_mappings)
        as candidate(value)
      where
        nullif(
          btrim(candidate.value ->> 'recipientUserId'),
          ''
        ) is not null

        and btrim(candidate.value ->> 'recipientUserId')
            ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

        and (
          btrim(candidate.value ->> 'recipientUserId')::uuid
          = mapped_recipient_id
        )
    ) <> 1
    then
      raise exception 'SIGNATURE_MAPPING_RECIPIENT_DUPLICATE';
    end if;


    -- --------------------------------------------------------
    -- One signature field can belong to only one signer
    -- in this send cycle.
    -- --------------------------------------------------------

    if (
      select count(*)
      from jsonb_array_elements(p_signature_mappings)
        as candidate(value)
      where btrim(
        candidate.value ->> 'signatureFieldKey'
      ) = mapped_field_key
    ) <> 1
    then
      raise exception 'SIGNATURE_MAPPING_FIELD_DUPLICATE';
    end if;


    -- --------------------------------------------------------
    -- First distinguish:
    -- field does not exist
    -- vs
    -- field exists but is not Receiver Signature.
    -- --------------------------------------------------------

    if not (
      mapped_field_key = any(all_field_keys)
    ) then
      raise exception 'SIGNATURE_MAPPING_FIELD_NOT_FOUND';
    end if;


    -- --------------------------------------------------------
    -- Sender Signature, normal fields, etc. are not assignable.
    -- Only structured Receiver Signature fields are valid.
    -- --------------------------------------------------------

    if not (
      mapped_field_key = any(receiver_field_keys)
    ) then
      raise exception 'SIGNATURE_MAPPING_FIELD_NOT_RECEIVER';
    end if;

  end loop;


  -- ==========================================================
  -- 10. REQUIRED RECEIVER SIGNATURE COVERAGE
  --
  -- Required Receiver fields MUST have a signer.
  --
  -- Optional Receiver fields may remain unassigned.
  --
  -- Recipients without mappings are valid non-signing
  -- recipients.
  -- ==========================================================

  if cardinality(required_receiver_field_keys) > 0 then

    if mapping_count = 0 then
      raise exception 'SIGNATURE_MAPPINGS_REQUIRED';
    end if;

    if exists (
      select 1
      from unnest(required_receiver_field_keys)
        as required_fields(field_key)
      where not exists (
        select 1
        from jsonb_array_elements(p_signature_mappings)
          as mapping(value)
        where btrim(
          mapping.value ->> 'signatureFieldKey'
        ) = required_fields.field_key
      )
    ) then
      raise exception 'SIGNATURE_MAPPING_FIELD_REQUIRED';
    end if;

  end if;


  -- ==========================================================
  -- 11. EXECUTE PRESERVED MIGRATION 038 SEND
  --
  -- This performs:
  --
  -- Sender Signature snapshot
  -- Sender profile validation
  -- SENDER_SIGNATURE_REQUIRED
  -- send cycle creation
  -- recipient assignments
  -- report Sent transition
  -- recipient notifications
  -- REPORT_SENT audit
  --
  -- This call runs in the SAME transaction.
  -- ==========================================================

  select private.send_report_038_legacy(
    p_report_id,
    p_recipient_user_ids,
    p_note
  )
  into result;


  -- ==========================================================
  -- 12. RESOLVE CURRENT SEND CYCLE
  -- ==========================================================

  select current_send_cycle_id
  into current_cycle_id
  from public.reports
  where id = p_report_id;

  if current_cycle_id is null then
    raise exception 'SEND_CYCLE_NOT_CREATED';
  end if;


  -- ==========================================================
  -- 13. PERSIST SIGNER → SIGNATURE FIELD MAPPINGS
  --
  -- Only explicitly mapped recipients receive rows here.
  --
  -- Unmapped recipients remain normal report recipients.
  -- ==========================================================

  for mapping_row in
    select value
    from jsonb_array_elements(p_signature_mappings)
  loop

    mapped_recipient_id :=
      btrim(mapping_row ->> 'recipientUserId')::uuid;

    mapped_field_key :=
      btrim(mapping_row ->> 'signatureFieldKey');


    select *
    into assignment_row
    from public.report_assignments
    where report_id = p_report_id
      and send_cycle_id = current_cycle_id
      and recipient_user_id = mapped_recipient_id;

    if not found then
      raise exception 'SIGNATURE_MAPPING_RECIPIENT_INVALID';
    end if;


    insert into public.report_signature_assignments (
      report_id,
      send_cycle_id,
      report_assignment_id,
      recipient_user_id,
      signature_field_key,
      signature_field_label_snapshot
    )
    values (
      p_report_id,
      current_cycle_id,
      assignment_row.id,
      assignment_row.recipient_user_id,
      mapped_field_key,

      (
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
        select coalesce(
          nullif(btrim(value ->> 'label'), ''),
          'Receiver Signature'
        )
        from snapshot_nodes
        where jsonb_typeof(value) = 'object'

          and coalesce(
            nullif(btrim(value ->> 'field_key'), ''),
            nullif(btrim(value ->> 'key'), '')
          ) = mapped_field_key

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
          ) = 'receiver'

        limit 1
      )
    );

  end loop;


  -- ==========================================================
  -- IMPORTANT:
  --
  -- We preserve Migration 038's original return shape:
  --
  -- report
  -- send_cycle
  -- assignments
  --
  -- Signature mappings are authoritative in
  -- public.report_signature_assignments and can be fetched
  -- separately.
  -- ==========================================================

  return result;

end
$$;

create or replace function public.sign_report(
  p_report_id uuid,
  p_assignment_id uuid,
  p_payload jsonb default '{}'::jsonb
)
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
  mapping_row public.report_signature_assignments%rowtype;
  signature_row public.signature_profiles%rowtype;
  template_version_row public.template_versions%rowtype;

  mapped_field record;

  sig_id uuid;
  verification_id text;

  total_mapped_signers integer;
  signed_mapped_signers integer;

  old_status text;
begin

  -- ==========================================================
  -- 1. AUTHENTICATION
  -- ==========================================================

  if not private.current_user_is_active() then
    raise exception 'FORBIDDEN';
  end if;

  select *
  into actor
  from private.report_actor();

  if not found then
    raise exception 'ACCOUNT_INACTIVE';
  end if;


  -- ==========================================================
  -- 2. LOCK + VALIDATE REPORT
  -- ==========================================================

  select *
  into report_row
  from public.reports
  where id = p_report_id
  for update;

  if not found then
    raise exception 'REPORT_NOT_FOUND';
  end if;

  if report_row.created_by_user_id = actor.user_id then
    raise exception 'SELF_SIGN_NOT_ALLOWED';
  end if;

  if report_row.status <> 'sent' then
    raise exception 'REPORT_STATUS_NOT_SENT';
  end if;

  if report_row.locked_at is not null then
    raise exception 'REPORT_LOCKED';
  end if;

  if report_row.current_send_cycle_id is null then
    raise exception 'REPORT_HAS_NO_CURRENT_SEND_CYCLE';
  end if;


  -- ==========================================================
  -- 3. LOCK + VALIDATE CURRENT ASSIGNMENT
  -- ==========================================================

  select *
  into assignment_row
  from public.report_assignments
  where id = p_assignment_id
    and report_id = report_row.id
    and send_cycle_id = report_row.current_send_cycle_id
  for update;

  if not found then
    raise exception 'ASSIGNMENT_NOT_FOUND';
  end if;

  if assignment_row.recipient_user_id <> actor.user_id then
    raise exception 'ASSIGNMENT_NOT_OWNED';
  end if;

  if assignment_row.assignment_status = 'signed' then
    raise exception 'ALREADY_SIGNED';
  end if;

  if assignment_row.assignment_status <> 'pending' then
    raise exception 'ASSIGNMENT_NOT_ACTIONABLE';
  end if;


  -- ==========================================================
  -- 4. LOCK + VALIDATE CURRENT SEND CYCLE
  -- ==========================================================

  select *
  into cycle_row
  from public.report_send_cycles
  where id = assignment_row.send_cycle_id
    and report_id = report_row.id
  for update;

  if not found then
    raise exception 'SEND_CYCLE_NOT_FOUND';
  end if;

  if cycle_row.id <> report_row.current_send_cycle_id then
    raise exception 'SEND_CYCLE_NOT_CURRENT';
  end if;

  if cycle_row.status <> 'active' then
    raise exception 'SEND_CYCLE_NOT_ACTIONABLE';
  end if;

  if nullif(btrim(cycle_row.content_hash), '') is null then
    raise exception 'SEND_CYCLE_CONTENT_HASH_MISSING';
  end if;


  -- ==========================================================
  -- 5. RESOLVE EXACT SIGNATURE MAPPING
  --
  -- report_signature_assignments is the server-side
  -- source of truth.
  --
  -- Recipient without mapping = non-signer.
  -- ==========================================================

  select *
  into mapping_row
  from public.report_signature_assignments
  where report_id = report_row.id
    and send_cycle_id = report_row.current_send_cycle_id
    and report_assignment_id = assignment_row.id
    and recipient_user_id = actor.user_id
  for update;

  if not found
     or mapping_row.report_id <> report_row.id
     or mapping_row.send_cycle_id <> report_row.current_send_cycle_id
     or mapping_row.report_assignment_id <> assignment_row.id
     or mapping_row.recipient_user_id <> actor.user_id
     or nullif(btrim(mapping_row.signature_field_key), '') is null
  then
    raise exception 'SIGNATURE_ASSIGNMENT_REQUIRED';
  end if;


  -- ==========================================================
  -- 6. LOAD IMMUTABLE HISTORICAL TEMPLATE SNAPSHOT
  -- ==========================================================

  select *
  into template_version_row
  from public.template_versions
  where id = report_row.template_version_id;

  if not found
     or template_version_row.schema_snapshot is null
  then
    raise exception 'SIGNATURE_MAPPING_INVALID';
  end if;


  -- ==========================================================
  -- 7. REVALIDATE MAPPED FIELD AGAINST HISTORICAL SNAPSHOT
  --
  -- Canonical field identity:
  -- field_key
  -- fallback key
  --
  -- No component.id.
  -- No labels as identity.
  -- ==========================================================

  select *
  into mapped_field
  from (
    with recursive snapshot_nodes(value) as (
      select template_version_row.schema_snapshot
      union all
      select child.value
      from snapshot_nodes node
      cross join lateral (
        select array_node.value from jsonb_array_elements(case when jsonb_typeof(node.value) = 'array' then node.value else '[]'::jsonb end) array_node(value)
        union all
        select object_node.value from jsonb_each(case when jsonb_typeof(node.value) = 'object' then node.value else '{}'::jsonb end) object_node(key, value)
      ) child
    ), discovered as (
      select value as field,
        coalesce(nullif(btrim(value ->> 'field_key'), ''), nullif(btrim(value ->> 'key'), ''), nullif(btrim(value #>> '{configuration,field_key}'), ''), nullif(btrim(value #>> '{configuration,key}'), '')) as field_key,
        coalesce(nullif(btrim(value ->> 'label'), ''), nullif(btrim(value #>> '{configuration,label}'), ''), 'Receiver Signature') as field_label,
        lower(coalesce(value ->> 'field_type', value ->> 'type', value #>> '{configuration,field_type}', value #>> '{configuration,type}', '')) as field_type,
        lower(coalesce(value #>> '{signatureConfig,signatureRole}', value ->> 'signatureRole', value #>> '{configuration,signatureConfig,signatureRole}', value #>> '{configuration,signatureRole}', '')) as signature_role
      from snapshot_nodes where jsonb_typeof(value) = 'object'
    ) select * from discovered where field_key = mapping_row.signature_field_key and field_type = 'signature' and signature_role = 'receiver'
  ) matched;

  if not found
     or mapped_field.field_type <> 'signature'
     or mapped_field.signature_role <> 'receiver'
  then
    raise exception 'SIGNATURE_MAPPING_INVALID';
  end if;


  -- ==========================================================
  -- 8. LOAD ACTIVE RECIPIENT SIGNATURE PROFILE
  -- ==========================================================

  select *
  into signature_row
  from public.signature_profiles
  where user_id = actor.user_id
    and is_active = true
  order by updated_at desc
  limit 1;


  -- ==========================================================
  -- 9. VALIDATE SIGNATURE PROFILE
  --
  -- typed:
  --   typed_name must be nonblank
  --
  -- drawn:
  --   drawing_data must be nonblank
  --
  -- uploaded:
  --   signature_asset_id must exist
  -- ==========================================================

  if not found or not (

    (
      lower(btrim(signature_row.signature_method)) = 'typed'
      and nullif(
        btrim(signature_row.typed_name),
        ''
      ) is not null
    )

    or

    (
      lower(btrim(signature_row.signature_method)) = 'drawn'
      and nullif(
        btrim(signature_row.drawing_data),
        ''
      ) is not null
    )

    or

    (
      lower(btrim(signature_row.signature_method)) = 'uploaded'
      and signature_row.signature_asset_id is not null
    )

  ) then
    raise exception 'RECIPIENT_SIGNATURE_REQUIRED';
  end if;


  -- ==========================================================
  -- 10. SNAPSHOT SIGNATURE INTO EXACT MAPPED REPORT FIELD
  --
  -- NEVER use component.id.
  -- template_field_id remains NULL for snapshot-driven
  -- signature fields.
  -- ==========================================================

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
    null,
    mapping_row.signature_field_key,
    mapped_field.field_label,
    'signature',

    jsonb_build_object(
      'signatureMethod',
        lower(btrim(signature_row.signature_method)),

      'typedName',
        signature_row.typed_name,

      'drawingData',
        signature_row.drawing_data,

      'typedFontKey',
        signature_row.typed_font_key,

      'signatureAssetId',
        signature_row.signature_asset_id
    )
  )

  on conflict (report_id, field_key)

  do update set
    template_field_id = null,
    field_label_snapshot = excluded.field_label_snapshot,
    field_type_snapshot = excluded.field_type_snapshot,
    value = excluded.value,
    updated_at = statement_timestamp();


  -- ==========================================================
  -- 11. CREATE DIGITAL SIGNATURE EVENT
  -- ==========================================================

  old_status := report_row.status;

  verification_id :=
    'WF-' ||
    upper(
      substr(
        replace(
          pg_catalog.gen_random_uuid()::text,
          '-',
          ''
        ),
        1,
        20
      )
    );


  insert into public.report_signature_events (
    report_id,
    send_cycle_id,
    report_assignment_id,
    event_type,

    signer_user_id,
    signer_name,
    signer_email,

    signer_role_id,
    signer_role_key,
    signer_role_name,
    signer_governance_level,

    signature_role,
    signature_method,
    typed_name_snapshot,
    confirmation_statement,

    verification_id,
    signed_content_hash
  )
  values (
    report_row.id,
    assignment_row.send_cycle_id,
    assignment_row.id,
    'signed',

    actor.user_id,
    actor.full_name,
    actor.email,

    actor.role_id,
    actor.role_key,
    actor.role_name,
    actor.governance_level,

    'receiver',

    lower(btrim(signature_row.signature_method)),

    signature_row.typed_name,

    p_payload ->> 'confirmationStatement',

    verification_id,

    cycle_row.content_hash
  )

  returning id
  into sig_id;


  -- ==========================================================
  -- 12. MARK ONLY THIS MAPPED SIGNER'S ASSIGNMENT SIGNED
  -- ==========================================================

  update public.report_assignments
  set
    assignment_status = 'signed',
    signed_at = statement_timestamp(),
    closed_at = statement_timestamp()
  where id = assignment_row.id;


  -- ==========================================================
  -- 13. COUNT ONLY MAPPED SIGNERS
  --
  -- Unmapped recipients are not signers and do not block
  -- finalization.
  -- ==========================================================

  select
    count(*),
    count(*) filter (
      where assignment_check.assignment_status = 'signed'
    )

  into
    total_mapped_signers,
    signed_mapped_signers

  from public.report_signature_assignments mapping_check

  join public.report_assignments assignment_check
    on assignment_check.id = mapping_check.report_assignment_id

  where mapping_check.report_id = report_row.id
    and mapping_check.send_cycle_id = assignment_row.send_cycle_id;


  -- ==========================================================
  -- 14. REPORT_SIGNED NOTIFICATION
  -- ==========================================================

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
    report_row.created_by_user_id,
    'REPORT_SIGNED',
    'Report signed',
    report_row.title,
    report_row.id,
    assignment_row.send_cycle_id,
    assignment_row.id
  );


  -- ==========================================================
  -- 15. REPORT_SIGNED AUDIT
  -- ==========================================================

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

    comment,
    event_data,

    send_cycle_id,
    report_assignment_id
  )
  values (
    report_row.id,
    'REPORT_SIGNED',

    actor.user_id,
    actor.full_name,
    actor.email,

    actor.role_id,
    actor.role_key,
    actor.role_name,
    actor.governance_level,

    report_row.title,

    old_status,

    case
      when total_mapped_signers > 0
       and signed_mapped_signers = total_mapped_signers
      then 'signed'
      else 'sent'
    end,

    verification_id,

    jsonb_build_object(
      'assignment_id',
        assignment_row.id,

      'verification_id',
        verification_id,

      'signed_content_hash',
        cycle_row.content_hash,

      'signed_assignments',
        signed_mapped_signers,

      'total_assignments',
        total_mapped_signers
    ),

    assignment_row.send_cycle_id,
    assignment_row.id
  );


  -- ==========================================================
  -- 16. FINALIZE ONLY WHEN ALL MAPPED SIGNERS SIGNED
  --
  -- Example:
  --
  -- Recipients:
  -- Ahmed
  -- Yazzed
  -- Omar
  --
  -- Mapping:
  -- Yazzed -> receiver_signature
  --
  -- total_mapped_signers = 1
  -- signed_mapped_signers = 1
  --
  -- Report finalizes.
  --
  -- Ahmed/Omar do not block.
  -- ==========================================================

  if total_mapped_signers > 0
     and signed_mapped_signers = total_mapped_signers
  then

    update public.report_send_cycles
    set
      status = 'finalized',
      closed_at = statement_timestamp()
    where id = assignment_row.send_cycle_id;


    update public.reports
    set
      status = 'signed',
      signed_at = statement_timestamp(),
      locked_at = statement_timestamp(),
      updated_at = statement_timestamp()
    where id = report_row.id;


    insert into public.notifications (
      recipient_user_id,
      notification_type,
      title,
      message,
      related_report_id,
      send_cycle_id
    )
    values (
      report_row.created_by_user_id,
      'REPORT_FULLY_SIGNED',
      'Report fully signed',
      report_row.title,
      report_row.id,
      assignment_row.send_cycle_id
    );


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

      comment,
      event_data,

      send_cycle_id,
      report_assignment_id
    )
    values (
      report_row.id,
      'REPORT_FULLY_SIGNED',

      actor.user_id,
      actor.full_name,
      actor.email,

      actor.role_id,
      actor.role_key,
      actor.role_name,
      actor.governance_level,

      report_row.title,

      'sent',
      'signed',

      null,

      jsonb_build_object(
        'final_signature_verification_id',
          verification_id,

        'signed_content_hash',
          cycle_row.content_hash,

        'signed_assignments',
          signed_mapped_signers,

        'total_assignments',
          total_mapped_signers
      ),

      assignment_row.send_cycle_id,
      assignment_row.id
    );

  end if;


  -- ==========================================================
  -- 17. RETURN
  -- ==========================================================

  return jsonb_build_object(

    'report',
    (
      select to_jsonb(report_result)
      from public.reports report_result
      where report_result.id = report_row.id
    ),

    'assignment',
    (
      select to_jsonb(assignment_result)
      from public.report_assignments assignment_result
      where assignment_result.id = assignment_row.id
    ),

    'signature',
    (
      select to_jsonb(signature_result)
      from public.report_signature_events signature_result
      where signature_result.id = sig_id
    ),

    'send_cycle',
    (
      select to_jsonb(cycle_result)
      from public.report_send_cycles cycle_result
      where cycle_result.id = assignment_row.send_cycle_id
    ),

    'signed_assignments',
      signed_mapped_signers,

    'total_assignments',
      total_mapped_signers,

    'fully_signed',
      (
        total_mapped_signers > 0
        and signed_mapped_signers = total_mapped_signers
      )
  );

end
$$;

revoke all on function private.send_report_038_legacy(uuid, uuid[], text) from public, anon, authenticated;
revoke all on function public.send_report(uuid, uuid[], text, jsonb) from public, anon, authenticated;
revoke all on function public.sign_report(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.send_report(uuid, uuid[], text, jsonb) to authenticated;
grant execute on function public.sign_report(uuid, uuid, jsonb) to authenticated;

insert into private.widgetflow_schema_migrations (id, description)
values ('047_report_signature_typed_font_snapshot', 'Persist typed signature font key in immutable sender and recipient report snapshots');

commit;
