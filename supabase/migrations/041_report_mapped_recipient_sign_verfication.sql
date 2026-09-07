-- ============================================================
-- MIGRATION 041 VERIFICATION
-- ============================================================

-- 1. Ledger
select
  id,
  description
from private.widgetflow_schema_migrations
where id in (
  '040_report_signature_mapping_send',
  '041_report_mapped_recipient_sign'
)
order by id;


-- 2. sign_report identity + security
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.prosecdef as security_definer,
  p.proconfig
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'sign_report';


-- 3. Execution privileges
select
  has_function_privilege(
    'authenticated',
    'public.sign_report(uuid,uuid,jsonb)',
    'EXECUTE'
  ) as authenticated_can_execute_sign,

  has_function_privilege(
    'anon',
    'public.sign_report(uuid,uuid,jsonb)',
    'EXECUTE'
  ) as anon_can_execute_sign;


-- 4. Verify effective function contains the new architecture
select
  position(
    'report_signature_assignments'
    in pg_get_functiondef(
      'public.sign_report(uuid,uuid,jsonb)'::regprocedure
    )
  ) > 0 as uses_signature_mapping,

  position(
    'signature_profiles'
    in pg_get_functiondef(
      'public.sign_report(uuid,uuid,jsonb)'::regprocedure
    )
  ) > 0 as uses_active_signature_profile,

  position(
    'report_values'
    in pg_get_functiondef(
      'public.sign_report(uuid,uuid,jsonb)'::regprocedure
    )
  ) > 0 as snapshots_report_value,

  position(
    'SIGNATURE_ASSIGNMENT_REQUIRED'
    in pg_get_functiondef(
      'public.sign_report(uuid,uuid,jsonb)'::regprocedure
    )
  ) > 0 as blocks_unmapped_recipient,

  position(
    'RECIPIENT_SIGNATURE_REQUIRED'
    in pg_get_functiondef(
      'public.sign_report(uuid,uuid,jsonb)'::regprocedure
    )
  ) > 0 as requires_signature_profile,

  position(
    'REPORT_FULLY_SIGNED'
    in pg_get_functiondef(
      'public.sign_report(uuid,uuid,jsonb)'::regprocedure
    )
  ) > 0 as preserves_full_sign_flow;