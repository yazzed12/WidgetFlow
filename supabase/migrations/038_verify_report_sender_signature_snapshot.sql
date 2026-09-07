-- ============================================================
-- WidgetFlow Migration 038 Verification
-- Run manually in Supabase SQL Editor
-- ============================================================

-- 1. Migration ledger exists
select exists (
  select 1
  from private.widgetflow_schema_migrations
  where id = '038_report_sender_signature_snapshot'
) as migration_038_exists;


-- 2. Verify send_report function exists with expected signature
select exists (
  select 1
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'send_report'
    and pg_get_function_identity_arguments(p.oid) = 'p_report_id uuid, p_recipient_user_ids uuid[], p_note text'
) as send_report_signature_exists;


-- 3. SECURITY DEFINER must remain enabled
select
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'send_report'
  and pg_get_function_identity_arguments(p.oid) =
      'p_report_id uuid, p_recipient_user_ids uuid[], p_note text';


-- 4. search_path must remain empty
select
  p.proconfig
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'send_report'
  and pg_get_function_identity_arguments(p.oid) =
      'p_report_id uuid, p_recipient_user_ids uuid[], p_note text';


-- Expected:
-- {"search_path=\"\""}


-- 5. authenticated EXECUTE privilege
select has_function_privilege(
  'authenticated',
  'public.send_report(uuid,uuid[],text)',
  'EXECUTE'
) as authenticated_execute_granted;


-- 6. anon must NOT have execute
select not has_function_privilege(
  'anon',
  'public.send_report(uuid,uuid[],text)',
  'EXECUTE'
) as anon_execute_denied;


-- 7. public must NOT have execute
select not has_function_privilege(
  'public',
  'public.send_report(uuid,uuid[],text)',
  'EXECUTE'
) as public_execute_denied;


-- 8. Function body checks
with fn as (
  select pg_get_functiondef(p.oid) as body
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'send_report'
    and pg_get_function_identity_arguments(p.oid) =
        'p_report_id uuid, p_recipient_user_ids uuid[], p_note text'
)
select
  body ilike '%public.signature_profiles%'
    as reads_signature_profiles,

  body ilike '%public.report_values%'
    as writes_report_values,

  body ilike '%public.template_versions%'
    as reads_template_versions,

  body ilike '%schema_snapshot%'
    as reads_schema_snapshot,

  body ilike '%SENDER_SIGNATURE_REQUIRED%'
    as has_sender_signature_required,

  body ilike '%INVALID_SENDER_SIGNATURE_FIELD%'
    as has_invalid_sender_signature_guard,

  body ilike '%signatureConfig%'
    as structured_signature_detection,

  body ilike '%signatureRole%'
    as structured_signature_role_detection,

  body ilike '%field_key%'
    as uses_business_field_key,

  body ilike '%template_field_id = null%'
    as avoids_component_id_template_field_fk

from fn;


-- 9. Ensure recipient signing function still exists
select exists (
  select 1
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'sign_report'
) as sign_report_still_exists;


-- 10. Ensure return function still exists
select exists (
  select 1
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'return_report'
) as return_report_still_exists;


-- 11. Confirm migrations 037 and 038 both exist
select
  id,
  description
from private.widgetflow_schema_migrations
where id in (
  '037_report_historical_template_version_read',
  '038_report_sender_signature_snapshot'
)
order by id;