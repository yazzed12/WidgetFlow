begin;

do $guard$
begin
  if not exists (select 1 from private.widgetflow_schema_migrations where id = '042_notifications_personal_access') then raise exception 'WidgetFlow migration 042_notifications_personal_access must be applied first'; end if;
  if exists (select 1 from private.widgetflow_schema_migrations where id = '043_report_sign_historical_signature_shape_hotfix') then raise exception 'WidgetFlow migration 043_report_sign_historical_signature_shape_hotfix has already been applied'; end if;
end
$guard$;

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
      and signature_row.drawing_data is not null
      and signature_row.drawing_data <> 'null'::jsonb
      and signature_row.drawing_data <> '{}'::jsonb
      and signature_row.drawing_data <> '[]'::jsonb
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


revoke all on function public.sign_report(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sign_report(uuid, uuid, jsonb) to authenticated;
insert into private.widgetflow_schema_migrations (id, description) values ('043_report_sign_historical_signature_shape_hotfix', 'Historical signature snapshot shape resolution for mapped recipient signing');
commit;

