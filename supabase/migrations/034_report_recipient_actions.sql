begin;

do $guard$
begin
  if not exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '033_report_send_runtime_hotfix'
  ) then
    raise exception
      'WidgetFlow migration 033_report_send_runtime_hotfix must be applied first';
  end if;

  if exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '034_report_recipient_actions'
  ) then
    raise exception
      'WidgetFlow migration 034_report_recipient_actions has already been applied';
  end if;
end
$guard$;


-- ============================================================
-- RETURN REPORT
-- ============================================================

create or replace function public.return_report(
  p_report_id uuid,
  p_assignment_id uuid,
  p_reason text
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
  old_status text;
begin

  -- ----------------------------------------------------------
  -- Actor validation
  -- ----------------------------------------------------------

  if not private.current_user_is_active() then
    raise exception 'FORBIDDEN';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'RETURN_REASON_REQUIRED';
  end if;

  select *
  into actor
  from private.report_actor();

  if not found then
    raise exception 'ACCOUNT_INACTIVE';
  end if;


  -- ----------------------------------------------------------
  -- Lock report first.
  --
  -- This serializes Return / Sign operations for the same report
  -- and prevents concurrent recipient actions from racing.
  -- ----------------------------------------------------------

  select *
  into report_row
  from public.reports
  where id = p_report_id
  for update;

  if not found then
    raise exception 'REPORT_NOT_FOUND';
  end if;


  -- Sender cannot use recipient Return workflow.
  if report_row.created_by_user_id = actor.user_id then
    raise exception 'SELF_RECIPIENT_ACTION_NOT_ALLOWED';
  end if;


  -- Report must currently be in an active sent lifecycle.
  if report_row.status <> 'sent'
     or report_row.locked_at is not null
     or report_row.current_send_cycle_id is null
  then
    raise exception 'REPORT_NOT_ACTIONABLE';
  end if;


  -- ----------------------------------------------------------
  -- Load and lock recipient assignment
  -- ----------------------------------------------------------

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


  if assignment_row.assignment_status <> 'pending' then
    raise exception 'REPORT_NOT_ACTIONABLE';
  end if;


  -- ----------------------------------------------------------
  -- Do not invalidate already-recorded recipient signatures.
  --
  -- If ANY assignment in this current cycle has already signed,
  -- Return is no longer permitted.
  -- ----------------------------------------------------------

  if exists (
    select 1
    from public.report_assignments existing_assignment
    where existing_assignment.send_cycle_id = assignment_row.send_cycle_id
      and existing_assignment.assignment_status = 'signed'
  ) then
    raise exception 'REPORT_ALREADY_PARTIALLY_SIGNED';
  end if;


  -- ----------------------------------------------------------
  -- Lock send cycle
  -- ----------------------------------------------------------

  select *
  into cycle_row
  from public.report_send_cycles
  where id = assignment_row.send_cycle_id
    and report_id = report_row.id
  for update;

  if not found then
    raise exception 'SEND_CYCLE_NOT_FOUND';
  end if;


  if cycle_row.status <> 'active' then
    raise exception 'REPORT_NOT_ACTIONABLE';
  end if;


  old_status := report_row.status;


  -- ----------------------------------------------------------
  -- Mark requesting recipient assignment as returned
  -- ----------------------------------------------------------

  update public.report_assignments
  set
    assignment_status = 'returned',
    return_reason = btrim(p_reason),
    returned_at = statement_timestamp(),
    closed_at = statement_timestamp(),
    updated_at = statement_timestamp()
  where id = assignment_row.id;


  -- ----------------------------------------------------------
  -- Close remaining actionable assignments in this send cycle.
  --
  -- Once one recipient returns the report, the whole send cycle
  -- is closed and the report goes back to the sender.
  --
  -- Historical assignment rows are preserved.
  -- They are NOT deleted.
  -- ----------------------------------------------------------

  update public.report_assignments
  set
    assignment_status = 'cancelled',
    closed_at = statement_timestamp(),
    updated_at = statement_timestamp()
  where send_cycle_id = assignment_row.send_cycle_id
    and id <> assignment_row.id
    and assignment_status = 'pending';


  -- ----------------------------------------------------------
  -- Close current send cycle
  -- ----------------------------------------------------------

  update public.report_send_cycles
  set
    status = 'returned',
    closed_at = statement_timestamp()
  where id = cycle_row.id;


  -- ----------------------------------------------------------
  -- Return report to sender-editable Draft state
  --
  -- Preserve historical cycle + assignments.
  -- Only the active-cycle pointer is cleared.
  -- ----------------------------------------------------------

  update public.reports
  set
    status = 'draft',
    current_send_cycle_id = null,
    sent_at = null,
    returned_at = statement_timestamp(),
    return_reason = btrim(p_reason),
    updated_at = statement_timestamp()
  where id = report_row.id;


  -- ----------------------------------------------------------
  -- Sender notification
  -- ----------------------------------------------------------

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
    'REPORT_RETURNED',
    'Report returned',
    report_row.title,
    report_row.id,
    assignment_row.send_cycle_id,
    assignment_row.id
  );


  -- ----------------------------------------------------------
  -- Audit
  -- ----------------------------------------------------------

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
    'REPORT_RETURNED',
    actor.user_id,
    actor.full_name,
    actor.email,
    actor.role_id,
    actor.role_key,
    actor.role_name,
    actor.governance_level,
    report_row.title,
    old_status,
    'draft',
    btrim(p_reason),
    jsonb_build_object(
      'assignment_id', assignment_row.id,
      'send_cycle_id', assignment_row.send_cycle_id,
      'remaining_pending_assignments_cancelled', true
    ),
    assignment_row.send_cycle_id,
    assignment_row.id
  );


  return jsonb_build_object(
    'report',
      (
        select to_jsonb(updated_report)
        from public.reports updated_report
        where updated_report.id = report_row.id
      ),
    'assignment',
      (
        select to_jsonb(updated_assignment)
        from public.report_assignments updated_assignment
        where updated_assignment.id = assignment_row.id
      ),
    'send_cycle',
      (
        select to_jsonb(updated_cycle)
        from public.report_send_cycles updated_cycle
        where updated_cycle.id = assignment_row.send_cycle_id
      ),
    'assignments',
      (
        select coalesce(
          jsonb_agg(
            to_jsonb(all_assignment)
            order by all_assignment.assignment_sequence
          ),
          '[]'::jsonb
        )
        from public.report_assignments all_assignment
        where all_assignment.send_cycle_id = assignment_row.send_cycle_id
      )
  );

end
$$;


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
  content_hash text;

  old_status text;

  total_assignments integer;
  signed_assignments integer;
begin

  -- ----------------------------------------------------------
  -- Actor validation
  -- ----------------------------------------------------------

  if not private.current_user_is_active() then
    raise exception 'FORBIDDEN';
  end if;


  select *
  into actor
  from private.report_actor();

  if not found then
    raise exception 'ACCOUNT_INACTIVE';
  end if;


  -- ----------------------------------------------------------
  -- Lock report first.
  --
  -- All recipient actions for one report serialize through this
  -- lock, preventing simultaneous signatures from incorrectly
  -- finalizing the report.
  -- ----------------------------------------------------------

  select *
  into report_row
  from public.reports
  where id = p_report_id
  for update;

  if not found then
    raise exception 'REPORT_NOT_FOUND';
  end if;


  -- Sender cannot sign their own report through recipient path.
  if report_row.created_by_user_id = actor.user_id then
    raise exception 'SELF_SIGN_NOT_ALLOWED';
  end if;


  if report_row.status <> 'sent'
     or report_row.locked_at is not null
     or report_row.current_send_cycle_id is null
  then
    raise exception 'REPORT_NOT_ACTIONABLE';
  end if;


  -- ----------------------------------------------------------
  -- Assignment
  -- ----------------------------------------------------------

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
    raise exception 'REPORT_NOT_ACTIONABLE';
  end if;


  -- ----------------------------------------------------------
  -- Lock and verify active cycle
  -- ----------------------------------------------------------

  select *
  into cycle_row
  from public.report_send_cycles
  where id = assignment_row.send_cycle_id
    and report_id = report_row.id
  for update;

  if not found then
    raise exception 'SEND_CYCLE_NOT_FOUND';
  end if;


  if cycle_row.status <> 'active' then
    raise exception 'REPORT_NOT_ACTIONABLE';
  end if;


  old_status := report_row.status;


  -- ----------------------------------------------------------
  -- Generate verification identity
  -- ----------------------------------------------------------

  verification_id :=
    'WF-' ||
    upper(
      substr(
        encode(gen_random_bytes(12), 'hex'),
        1,
        20
      )
    );


  content_hash :=
    encode(
      sha256(
        convert_to(
          report_row.id::text
          || ':'
          || assignment_row.id::text
          || ':'
          || assignment_row.send_cycle_id::text
          || ':'
          || verification_id,
          'utf8'
        )
      ),
      'hex'
    );


  -- ----------------------------------------------------------
  -- Persistent signature event
  -- ----------------------------------------------------------

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
    content_hash
  )
  returning id into sig_id;


  -- ----------------------------------------------------------
  -- Close this recipient assignment as signed
  -- ----------------------------------------------------------

  update public.report_assignments
  set
    assignment_status = 'signed',
    signed_at = statement_timestamp(),
    closed_at = statement_timestamp(),
    updated_at = statement_timestamp()
  where id = assignment_row.id;


  -- ----------------------------------------------------------
  -- Determine finalization safely.
  --
  -- IMPORTANT:
  -- Do NOT finalize merely because there are no pending rows.
  --
  -- The report finalizes only when EVERY assignment in the
  -- current send cycle is actually SIGNED.
  -- ----------------------------------------------------------

  select
    count(*),
    count(*) filter (where assignment_status = 'signed')
  into
    total_assignments,
    signed_assignments
  from public.report_assignments
  where send_cycle_id = assignment_row.send_cycle_id;


  if total_assignments = 0 then
    raise exception 'REPORT_ASSIGNMENTS_MISSING';
  end if;


  -- ----------------------------------------------------------
  -- Per-recipient signed notification
  -- ----------------------------------------------------------

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


  -- ----------------------------------------------------------
  -- Per-recipient audit event
  -- ----------------------------------------------------------

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
      when signed_assignments = total_assignments then 'signed'
      else 'sent'
    end,
    verification_id,
    jsonb_build_object(
      'assignment_id', assignment_row.id,
      'verification_id', verification_id,
      'signed_assignments', signed_assignments,
      'total_assignments', total_assignments
    ),
    assignment_row.send_cycle_id,
    assignment_row.id
  );


  -- ----------------------------------------------------------
  -- Full finalization
  -- ----------------------------------------------------------

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
        'final_signature_verification_id', verification_id,
        'signed_assignments', signed_assignments,
        'total_assignments', total_assignments
      ),
      assignment_row.send_cycle_id,
      assignment_row.id
    );

  end if;


  return jsonb_build_object(
    'report',
      (
        select to_jsonb(updated_report)
        from public.reports updated_report
        where updated_report.id = report_row.id
      ),
    'assignment',
      (
        select to_jsonb(updated_assignment)
        from public.report_assignments updated_assignment
        where updated_assignment.id = assignment_row.id
      ),
    'signature',
      (
        select to_jsonb(signature_row)
        from public.report_signature_events signature_row
        where signature_row.id = sig_id
      ),
    'send_cycle',
      (
        select to_jsonb(updated_cycle)
        from public.report_send_cycles updated_cycle
        where updated_cycle.id = assignment_row.send_cycle_id
      ),
    'signed_assignments', signed_assignments,
    'total_assignments', total_assignments,
    'fully_signed', signed_assignments = total_assignments
  );

end
$$;


-- ============================================================
-- PRIVILEGES
-- ============================================================

revoke all
on function public.return_report(uuid, uuid, text)
from public, anon, authenticated;

revoke all
on function public.sign_report(uuid, uuid, jsonb)
from public, anon, authenticated;


grant execute
on function public.return_report(uuid, uuid, text)
to authenticated;

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
  '034_report_recipient_actions',
  'Assignment-level Supabase report return and recipient signature lifecycle with deterministic multi-recipient finalization'
);


commit;