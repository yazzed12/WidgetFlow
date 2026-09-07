-- ============================================================
-- MIGRATIONS 035 + 036
-- ============================================================

select
  id,
  description
from private.widgetflow_schema_migrations
where id in (
  '035_report_recipient_actions_hotfix',
  '036_report_sign_runtime_hotfix'
)
order by id;


-- ============================================================
-- SIGN_REPORT DEFINITION / SECURITY
-- ============================================================

select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  coalesce(array_to_string(p.proconfig, ','), '') as config,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'sign_report';


-- ============================================================
-- SIGN_REPORT PRIVILEGES
--
-- Expected:
-- authenticated = EXECUTE
-- anon = NO ROW
-- ============================================================

select
  routine_name,
  privilege_type,
  grantee
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'sign_report'
order by grantee;


-- ============================================================
-- SIGNATURE EVENTS
-- ============================================================

select
  id,
  report_id,
  report_assignment_id,
  send_cycle_id,
  event_type,
  signer_user_id,
  verification_id,
  signed_content_hash,
  occurred_at
from public.report_signature_events
order by occurred_at desc;


-- ============================================================
-- VERIFY SIGNATURE IS BOUND TO SEND-CYCLE CONTENT
--
-- After successful signing:
-- signature_hash_matches_cycle MUST = true
-- ============================================================

select
  se.id as signature_event_id,
  se.report_id,
  se.report_assignment_id,
  se.verification_id,
  se.signed_content_hash,
  sc.content_hash as send_cycle_content_hash,

  (
    se.signed_content_hash = sc.content_hash
  ) as signature_hash_matches_cycle

from public.report_signature_events se
join public.report_send_cycles sc
  on sc.id = se.send_cycle_id

order by se.occurred_at desc;


-- ============================================================
-- ASSIGNMENTS
--
-- IMPORTANT:
-- report_assignments has NO updated_at.
-- ============================================================

select
  id,
  report_id,
  send_cycle_id,
  recipient_user_id,
  recipient_name_snapshot,
  assignment_status,
  signed_at,
  returned_at,
  closed_at,
  created_at
from public.report_assignments
order by created_at desc;


-- ============================================================
-- SEND CYCLES
-- ============================================================

select
  id,
  report_id,
  status,
  content_hash,
  closed_at,
  created_at
from public.report_send_cycles
order by created_at desc;


-- ============================================================
-- REPORTS
-- ============================================================

select
  id,
  title,
  status,
  locked_at,
  signed_at,
  current_send_cycle_id,
  updated_at
from public.reports
order by updated_at desc;


-- ============================================================
-- ASSIGNMENT COUNTS PER CYCLE
-- ============================================================

select
  send_cycle_id,

  count(*) as total_assignments,

  count(*) filter (
    where assignment_status = 'pending'
  ) as pending_assignments,

  count(*) filter (
    where assignment_status = 'signed'
  ) as signed_assignments,

  count(*) filter (
    where assignment_status = 'returned'
  ) as returned_assignments,

  count(*) filter (
    where assignment_status = 'cancelled'
  ) as cancelled_assignments

from public.report_assignments
group by send_cycle_id
order by send_cycle_id;


-- ============================================================
-- INVALID FINALIZATION CHECK
--
-- Expected = ZERO ROWS
-- Any row here means a finalized cycle has an assignment
-- that is NOT signed.
-- ============================================================

select
  c.id as send_cycle_id,
  c.report_id,
  c.status as cycle_status,
  a.id as assignment_id,
  a.recipient_user_id,
  a.assignment_status

from public.report_send_cycles c
join public.report_assignments a
  on a.send_cycle_id = c.id

where c.status = 'finalized'
  and a.assignment_status <> 'signed';


-- ============================================================
-- SIGNED REPORT WITHOUT LOCK CHECK
--
-- Expected = ZERO ROWS
-- ============================================================

select
  id,
  title,
  status,
  signed_at,
  locked_at
from public.reports
where status = 'signed'
  and locked_at is null;


-- ============================================================
-- STALE PENDING ASSIGNMENTS IN CLOSED CYCLES
--
-- Expected = ZERO ROWS
-- ============================================================

select
  a.id as assignment_id,
  a.report_id,
  a.send_cycle_id,
  a.recipient_user_id,
  a.assignment_status,
  c.status as cycle_status,
  c.closed_at

from public.report_assignments a
join public.report_send_cycles c
  on c.id = a.send_cycle_id

where a.assignment_status = 'pending'
  and c.status in (
    'returned',
    'finalized'
  );