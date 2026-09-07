begin;

-- ============================================================
-- WIDGETFLOW MIGRATION 036
-- REPORT SIGN RUNTIME HOTFIX
--
-- Fixes:
-- 1. search-path-safe verification UUID generation
-- 2. removes invalid report_assignments.updated_at reference
-- 3. binds signature to immutable send-cycle content_hash
-- 4. finalizes ONLY when every assignment is signed
-- ============================================================


-- ============================================================
-- GUARD
-- ============================================================

do $guard$
begin

  if not exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '035_report_recipient_actions_hotfix'
  ) then
    raise exception
      'WidgetFlow migration 035_report_recipient_actions_hotfix must be applied first';
  end if;


  if exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '036_report_sign_runtime_hotfix'
  ) then
    raise exception
      'WidgetFlow migration 036_report_sign_runtime_hotfix has already been applied';
  end if;

end
$guard$;


-- ============================================================
-- SIGN REPORT
-- ============================================================

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

  sig_id uuid;
  verification_id text;

  total_assignments integer;
  signed_assignments integer;

  old_status text;

begin

  -- ==========================================================
  -- ACTOR
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
  -- REPORT LOCK
  -- ==========================================================

  select *
  into report_row
  from public.reports
  where id = p_report_id
  for update;


  if not found then
    raise exception 'REPORT_NOT_FOUND';
  end if;


  -- Sender cannot sign own sent report as recipient.
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
  -- ASSIGNMENT LOCK
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
  -- SEND CYCLE LOCK
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


  -- Every signature must bind to the immutable content
  -- captured when this send cycle was created.
  if nullif(btrim(cycle_row.content_hash), '') is null then
    raise exception 'SEND_CYCLE_CONTENT_HASH_MISSING';
  end if;


  old_status := report_row.status;


  -- ==========================================================
  -- VERIFICATION ID
  -- ==========================================================

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


  -- ==========================================================
  -- SIGNATURE EVENT
  -- ==========================================================

  insert into public.report_signature_events(
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
  values(
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

    coalesce(
      nullif(p_payload ->> 'signatureMethod', ''),
      'typed'
    ),

    coalesce(
      nullif(p_payload ->> 'typedName', ''),
      actor.full_name
    ),

    p_payload ->> 'confirmationStatement',

    verification_id,

    -- IMPORTANT:
    -- Signature is bound to the exact content sent in this cycle.
    cycle_row.content_hash
  )
  returning id
  into sig_id;


  -- ==========================================================
  -- CLOSE THIS ASSIGNMENT
  --
  -- report_assignments DOES NOT have updated_at.
  -- ==========================================================

  update public.report_assignments
  set
    assignment_status = 'signed',
    signed_at = statement_timestamp(),
    closed_at = statement_timestamp()
  where id = assignment_row.id;


  -- ==========================================================
  -- COUNT ACTUAL SIGNATURE COMPLETION
  -- ==========================================================

  select
    count(*),
    count(*) filter (
      where assignment_status = 'signed'
    )
  into
    total_assignments,
    signed_assignments
  from public.report_assignments
  where send_cycle_id = assignment_row.send_cycle_id;


  if total_assignments = 0 then
    raise exception 'REPORT_ASSIGNMENTS_MISSING';
  end if;


  -- ==========================================================
  -- SIGNED NOTIFICATION
  -- ==========================================================

  insert into public.notifications(
    recipient_user_id,
    notification_type,
    title,
    message,
    related_report_id,
    send_cycle_id,
    report_assignment_id
  )
  values(
    report_row.created_by_user_id,
    'REPORT_SIGNED',
    'Report signed',
    report_row.title,
    report_row.id,
    assignment_row.send_cycle_id,
    assignment_row.id
  );


  -- ==========================================================
  -- SIGNED AUDIT EVENT
  -- ==========================================================

  insert into public.report_audit_events(
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
  values(
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
      when signed_assignments = total_assignments
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
      signed_assignments,

      'total_assignments',
      total_assignments
    ),

    assignment_row.send_cycle_id,
    assignment_row.id
  );


  -- ==========================================================
  -- FINALIZATION
  --
  -- Critical rule:
  -- finalize ONLY if every assignment is actually SIGNED.
  --
  -- cancelled / returned / rejected do NOT count as signed.
  -- ==========================================================

  if signed_assignments = total_assignments then

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


    -- ========================================================
    -- FULLY SIGNED NOTIFICATION
    -- ========================================================

    insert into public.notifications(
      recipient_user_id,
      notification_type,
      title,
      message,
      related_report_id,
      send_cycle_id
    )
    values(
      report_row.created_by_user_id,
      'REPORT_FULLY_SIGNED',
      'Report fully signed',
      report_row.title,
      report_row.id,
      assignment_row.send_cycle_id
    );


    -- ========================================================
    -- FULLY SIGNED AUDIT
    -- ========================================================

    insert into public.report_audit_events(
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
    values(
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
        signed_assignments,

        'total_assignments',
        total_assignments
      ),

      assignment_row.send_cycle_id,
      assignment_row.id
    );

  end if;


  -- ==========================================================
  -- RESULT
  -- ==========================================================

  return jsonb_build_object(

    'report',
    (
      select to_jsonb(r)
      from public.reports r
      where r.id = report_row.id
    ),

    'assignment',
    (
      select to_jsonb(a)
      from public.report_assignments a
      where a.id = assignment_row.id
    ),

    'signature',
    (
      select to_jsonb(s)
      from public.report_signature_events s
      where s.id = sig_id
    ),

    'send_cycle',
    (
      select to_jsonb(c)
      from public.report_send_cycles c
      where c.id = assignment_row.send_cycle_id
    ),

    'signed_assignments',
    signed_assignments,

    'total_assignments',
    total_assignments,

    'fully_signed',
    signed_assignments = total_assignments
  );

end
$$;


-- ============================================================
-- PRIVILEGES
-- ============================================================

revoke all
on function public.sign_report(uuid, uuid, jsonb)
from public, anon, authenticated;


grant execute
on function public.sign_report(uuid, uuid, jsonb)
to authenticated;


-- ============================================================
-- MIGRATION LEDGER
-- ============================================================

insert into private.widgetflow_schema_migrations(
  id,
  description
)
values(
  '036_report_sign_runtime_hotfix',
  'Fix recipient signing runtime, bind signatures to send-cycle content hash, and require all assignments signed before finalization'
);


commit;