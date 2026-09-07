begin;

do $guard$
begin
  if not exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '039_report_signature_assignment_foundation'
  ) then
    raise exception
      'WidgetFlow migration 039_report_signature_assignment_foundation must be applied first';
  end if;

  if exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '040_report_signature_mapping_send'
  ) then
    raise exception
      'WidgetFlow migration 040_report_signature_mapping_send has already been applied';
  end if;
end
$guard$;


-- ============================================================
-- Preserve the effective Migration 038 Send implementation.
--
-- The old public three-argument RPC must not remain browser
-- accessible because it would bypass signature mapping rules.
--
-- We keep its exact implementation privately and call it only
-- from the new trusted four-argument wrapper below.
-- ============================================================

alter function public.send_report(uuid, uuid[], text)
  set schema private;

alter function private.send_report(uuid, uuid[], text)
  rename to send_report_038_legacy;

revoke all
on function private.send_report_038_legacy(uuid, uuid[], text)
from public, anon, authenticated;


-- ============================================================
-- Migration 040 Send RPC
-- ============================================================

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


-- ============================================================
-- RPC ACCESS
-- ============================================================

revoke all
on function public.send_report(
  uuid,
  uuid[],
  text,
  jsonb
)
from public, anon, authenticated;

grant execute
on function public.send_report(
  uuid,
  uuid[],
  text,
  jsonb
)
to authenticated;


-- ============================================================
-- MIGRATION LEDGER
-- ============================================================

insert into private.widgetflow_schema_migrations (
  id,
  description
)
values (
  '040_report_signature_mapping_send',
  'Explicit validated recipient-to-signature-field mapping during atomic Send'
);


commit;