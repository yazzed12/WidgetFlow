-- ============================================================
-- WidgetFlow
-- Migration 028 — Post-Apply Verification
-- READ ONLY
-- ============================================================


-- 1. Migration ledger
select
  id,
  description
from private.widgetflow_schema_migrations
where id = '028_report_multi_recipient_foundation';


-- 2. New tables exist
select
  to_regclass('public.report_send_cycles') as report_send_cycles,
  to_regclass('public.report_assignments') as report_assignments;


-- 3. New Report current-cycle column exists
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'reports'
  and column_name = 'current_send_cycle_id';


-- 4. Critical relational-integrity constraints
select
  conrelid::regclass as table_name,
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conname in (
  'report_send_cycles_report_cycle_unique',
  'report_send_cycles_report_id_id_unique',
  'report_assignments_cycle_same_report_fk',
  'report_assignments_cycle_recipient_unique',
  'report_assignments_cycle_sequence_unique',
  'report_assignments_report_cycle_id_unique',
  'reports_current_cycle_same_report_fk',
  'report_signature_events_cycle_same_report_fk',
  'report_signature_events_assignment_same_context_fk',
  'report_comments_cycle_same_report_fk',
  'report_comments_assignment_same_context_fk',
  'report_audit_events_cycle_same_report_fk',
  'report_audit_events_assignment_same_context_fk',
  'notifications_cycle_same_report_fk',
  'notifications_assignment_same_context_fk'
)
order by conrelid::regclass::text, conname;

-- 5. Status / shape constraints
select
  conrelid::regclass as table_name,
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conname in (
  'report_send_cycles_close_shape',
  'report_send_cycles_time_shape',
  'report_assignments_outcome_shape',
  'report_assignments_time_shape',
  'reports_sent_shape'
)
order by conrelid::regclass::text, conname;

-- 6. Only one ACTIVE send cycle per Report
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and indexname = 'report_send_cycles_one_active_per_report_uidx';


-- 7. Signature / comment / audit / notification linkage columns
select
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'report_signature_events',
    'report_comments',
    'report_audit_events',
    'notifications'
  )
  and column_name in (
    'send_cycle_id',
    'report_assignment_id'
  )
order by table_name, column_name;


-- 8. RLS enabled
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'reports',
    'report_values',
    'report_send_cycles',
    'report_assignments',
    'report_comments',
    'report_audit_events',
    'report_signature_events'
  )
order by c.relname;


-- 9. Report RLS policies
select
  tablename,
  policyname,
  cmd,
  roles,
  qual
from pg_policies
where schemaname = 'public'
  and tablename in (
    'reports',
    'report_values',
    'report_send_cycles',
    'report_assignments',
    'report_comments',
    'report_audit_events',
    'report_signature_events'
  )
order by tablename, policyname;


-- 10. Report-access helper security
select
  p.proname,
  p.prosecdef as security_definer,
  p.proconfig as function_config,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private'
  and p.proname = 'current_user_can_read_report';


-- 11. Browser privileges — should be SELECT only for authenticated
select
  table_name,
  has_table_privilege(
    'authenticated',
    format('public.%I', table_name),
    'SELECT'
  ) as authenticated_select,
  has_table_privilege(
    'authenticated',
    format('public.%I', table_name),
    'INSERT'
  ) as authenticated_insert,
  has_table_privilege(
    'authenticated',
    format('public.%I', table_name),
    'UPDATE'
  ) as authenticated_update,
  has_table_privilege(
    'authenticated',
    format('public.%I', table_name),
    'DELETE'
  ) as authenticated_delete,
  has_table_privilege(
    'anon',
    format('public.%I', table_name),
    'SELECT'
  ) as anon_select
from (
  values
    ('reports'),
    ('report_values'),
    ('report_send_cycles'),
    ('report_assignments'),
    ('report_comments'),
    ('report_audit_events'),
    ('report_signature_events')
) v(table_name)
order by table_name;


-- 12. Legacy compatibility columns still exist
select
  column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'reports'
  and column_name in (
    'recipient_user_id',
    'recipient_name_snapshot',
    'current_send_cycle_id'
  )
order by column_name;


-- 13. No operational data was accidentally seeded
select
  (select count(*) from public.report_send_cycles) as send_cycles,
  (select count(*) from public.report_assignments) as assignments;
  