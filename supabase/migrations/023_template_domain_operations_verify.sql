-- ============================================================
-- WidgetFlow
-- Migration 023 Verification
-- Template Domain Operations
--
-- READ ONLY
-- ============================================================


-- ============================================================
-- 1. Migration ledger
-- ============================================================

select
  id,
  description,
  applied_at
from private.widgetflow_schema_migrations
where id = '023_template_domain_operations';


-- ============================================================
-- 2. Public Template lifecycle RPCs
--
-- Expected:
--   security_definer = true
--   fixed_search_path = true
-- ============================================================

select
  n.nspname as schema_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,

  coalesce(
    exists (
      select 1
      from unnest(
        coalesce(p.proconfig, array[]::text[])
      ) as config
      where config = 'search_path=""'
    ),
    false
  ) as fixed_search_path

from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace

where
  n.nspname = 'public'
  and p.proname in (
    'save_template_draft',
    'submit_template_for_approval',
    'claim_template_review',
    'approve_template',
    'reject_template',
    'create_template_revision',
    'add_template_comment'
  )

order by p.proname;


-- ============================================================
-- 3. RPC execute privileges
--
-- Expected:
-- authenticated_execute = true
-- anon_execute          = false
-- service_role_execute  = false
-- ============================================================

select
  n.nspname as schema_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments,

  has_function_privilege(
    'authenticated',
    p.oid,
    'EXECUTE'
  ) as authenticated_execute,

  has_function_privilege(
    'anon',
    p.oid,
    'EXECUTE'
  ) as anon_execute,

  has_function_privilege(
    'service_role',
    p.oid,
    'EXECUTE'
  ) as service_role_execute

from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace

where
  n.nspname = 'public'
  and p.proname in (
    'save_template_draft',
    'submit_template_for_approval',
    'claim_template_review',
    'approve_template',
    'reject_template',
    'create_template_revision',
    'add_template_comment'
  )

order by p.proname;


-- ============================================================
-- 4. Exact public RPC count
--
-- Expected:
-- rpc_count = 7
-- ============================================================

select
  count(*) as rpc_count
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where
  n.nspname = 'public'
  and p.proname in (
    'save_template_draft',
    'submit_template_for_approval',
    'claim_template_review',
    'approve_template',
    'reject_template',
    'create_template_revision',
    'add_template_comment'
  );


-- ============================================================
-- 5. RLS enabled on all Template-domain tables
--
-- Expected:
-- relrowsecurity = true for every row
-- ============================================================

select
  c.relname,
  c.relrowsecurity
from pg_class c
join pg_namespace n
  on n.oid = c.relnamespace

where
  n.nspname = 'public'
  and c.relname in (
    'templates',
    'template_sections',
    'template_fields',
    'template_tags',
    'template_versions',
    'template_comments',
    'template_audit_events'
  )

order by c.relname;


-- ============================================================
-- 6. Authenticated direct Template table writes
--
-- Expected:
-- insert/update/delete = false everywhere
-- ============================================================

select
  table_name,

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
  ) as authenticated_delete

from (
  values
    ('templates'),
    ('template_sections'),
    ('template_fields'),
    ('template_tags'),
    ('template_versions'),
    ('template_comments'),
    ('template_audit_events')
) as t(table_name)

order by table_name;


-- ============================================================
-- 7. Anon direct access
--
-- Expected:
-- all false
-- ============================================================

select
  table_name,

  has_table_privilege(
    'anon',
    format('public.%I', table_name),
    'SELECT'
  ) as anon_select,

  has_table_privilege(
    'anon',
    format('public.%I', table_name),
    'INSERT'
  ) as anon_insert,

  has_table_privilege(
    'anon',
    format('public.%I', table_name),
    'UPDATE'
  ) as anon_update,

  has_table_privilege(
    'anon',
    format('public.%I', table_name),
    'DELETE'
  ) as anon_delete

from (
  values
    ('templates'),
    ('template_sections'),
    ('template_fields'),
    ('template_tags'),
    ('template_versions'),
    ('template_comments'),
    ('template_audit_events')
) as t(table_name)

order by table_name;


-- ============================================================
-- 8. Template-domain RLS policies
-- ============================================================

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check

from pg_policies

where
  schemaname = 'public'
  and tablename in (
    'templates',
    'template_sections',
    'template_fields',
    'template_tags',
    'template_versions',
    'template_comments',
    'template_audit_events'
  )

order by
  tablename,
  policyname;


-- ============================================================
-- 9. Broad TRUE policy detection
--
-- Expected:
-- passed = true
--
-- Detects obvious:
-- USING (true)
-- WITH CHECK (true)
-- ============================================================

select
  'no_broad_true_template_policies' as check_name,

  not exists (
    select 1
    from pg_policies
    where
      schemaname = 'public'
      and tablename in (
        'templates',
        'template_sections',
        'template_fields',
        'template_tags',
        'template_versions',
        'template_comments',
        'template_audit_events'
      )
      and (
        lower(
          regexp_replace(
            coalesce(qual, ''),
            '\s+',
            '',
            'g'
          )
        ) in (
          'true',
          '(true)'
        )

        or

        lower(
          regexp_replace(
            coalesce(with_check, ''),
            '\s+',
            '',
            'g'
          )
        ) in (
          'true',
          '(true)'
        )
      )
  ) as passed;


-- ============================================================
-- 10. Immutability triggers
--
-- Expected:
-- templates_immutable_guard
-- template_versions_immutable_guard
-- ============================================================

select
  t.tgname,
  c.relname as tgrelid,
  t.tgenabled

from pg_trigger t
join pg_class c
  on c.oid = t.tgrelid
join pg_namespace n
  on n.oid = c.relnamespace

where
  not t.tgisinternal
  and n.nspname = 'public'
  and t.tgname in (
    'templates_immutable_guard',
    'template_versions_immutable_guard'
  )

order by t.tgname;


-- ============================================================
-- 11. Required Template indexes
-- ============================================================

select
  indexname
from pg_indexes

where
  schemaname = 'public'
  and tablename = 'templates'

order by indexname;


-- ============================================================
-- 12. Important expected Template indexes
--
-- Expected:
-- passed = true
-- ============================================================

select
  'required_template_indexes_exist' as check_name,

  (
    select count(*)
    from pg_indexes
    where
      schemaname = 'public'
      and tablename = 'templates'
      and indexname in (
        'templates_pkey',
        'templates_creator_status_idx',
        'templates_status_category_idx',
        'templates_target_role_queue_idx',
        'templates_unclaimed_role_queue_idx',
        'templates_reviewer_pending_idx',
        'templates_supersedes_idx'
      )
  ) = 7 as passed;


-- ============================================================
-- 13. Template version snapshot table structure
-- ============================================================

select
  column_name,
  data_type,
  is_nullable

from information_schema.columns

where
  table_schema = 'public'
  and table_name = 'template_versions'

order by ordinal_position;


-- ============================================================
-- 14. Template lifecycle statuses
--
-- Informational schema check
-- ============================================================

select
  pg_get_constraintdef(c.oid) as constraint_definition

from pg_constraint c
join pg_class t
  on t.oid = c.conrelid
join pg_namespace n
  on n.oid = t.relnamespace

where
  n.nspname = 'public'
  and t.relname = 'templates'
  and c.conname in (
    'templates_routing_shape',
    'templates_submission_shape',
    'templates_rejection_shape',
    'templates_not_self_superseding'
  )

order by c.conname;


-- ============================================================
-- 15. Template version uniqueness
--
-- Expected:
-- unique(template_id, version_label)
-- ============================================================

select
  c.conname,
  pg_get_constraintdef(c.oid) as definition

from pg_constraint c
join pg_class t
  on t.oid = c.conrelid
join pg_namespace n
  on n.oid = t.relnamespace

where
  n.nspname = 'public'
  and t.relname = 'template_versions'
  and c.contype = 'u'

order by c.conname;


-- ============================================================
-- 16. No hard-delete Template RPC
--
-- Expected:
-- passed = true
-- ============================================================

select
  'no_template_delete_rpc' as check_name,

  not exists (
    select 1
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace

    where
      n.nspname = 'public'
      and (
        lower(p.proname) like '%delete%template%'
        or lower(p.proname) like '%template%delete%'
      )
  ) as passed;


-- ============================================================
-- 17. Required lifecycle RPCs all SECURITY DEFINER
--
-- Expected:
-- passed = true
-- ============================================================

select
  'all_template_rpcs_security_definer' as check_name,

  (
    select count(*)
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace

    where
      n.nspname = 'public'
      and p.prosecdef = true
      and p.proname in (
        'save_template_draft',
        'submit_template_for_approval',
        'claim_template_review',
        'approve_template',
        'reject_template',
        'create_template_revision',
        'add_template_comment'
      )
  ) = 7 as passed;


-- ============================================================
-- 18. Required lifecycle RPCs all use empty search_path
--
-- THIS IS THE FIXED CHECK.
--
-- Expected:
-- passed = true
-- ============================================================

select
  'all_template_rpcs_fixed_empty_search_path' as check_name,

  (
    select count(*)

    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace

    where
      n.nspname = 'public'

      and p.proname in (
        'save_template_draft',
        'submit_template_for_approval',
        'claim_template_review',
        'approve_template',
        'reject_template',
        'create_template_revision',
        'add_template_comment'
      )

      and exists (
        select 1
        from unnest(
          coalesce(p.proconfig, array[]::text[])
        ) as config
        where config = 'search_path=""'
      )

  ) = 7 as passed;


-- ============================================================
-- 19. Authenticated may execute all seven lifecycle RPCs
--
-- Expected:
-- passed = true
-- ============================================================

select
  'authenticated_template_rpc_execute' as check_name,

  (
    select count(*)

    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace

    where
      n.nspname = 'public'
      and p.proname in (
        'save_template_draft',
        'submit_template_for_approval',
        'claim_template_review',
        'approve_template',
        'reject_template',
        'create_template_revision',
        'add_template_comment'
      )
      and has_function_privilege(
        'authenticated',
        p.oid,
        'EXECUTE'
      )

  ) = 7 as passed;


-- ============================================================
-- 20. Anon cannot execute lifecycle RPCs
--
-- Expected:
-- passed = true
-- ============================================================

select
  'anon_template_rpc_execute_denied' as check_name,

  not exists (
    select 1

    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace

    where
      n.nspname = 'public'
      and p.proname in (
        'save_template_draft',
        'submit_template_for_approval',
        'claim_template_review',
        'approve_template',
        'reject_template',
        'create_template_revision',
        'add_template_comment'
      )
      and has_function_privilege(
        'anon',
        p.oid,
        'EXECUTE'
      )
  ) as passed;


-- ============================================================
-- 21. Service role does not have explicitly exposed lifecycle RPC
-- execution in the public browser contract.
--
-- Expected:
-- passed = true
-- ============================================================

select
  'service_role_template_rpc_execute_denied' as check_name,

  not exists (
    select 1

    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace

    where
      n.nspname = 'public'
      and p.proname in (
        'save_template_draft',
        'submit_template_for_approval',
        'claim_template_review',
        'approve_template',
        'reject_template',
        'create_template_revision',
        'add_template_comment'
      )
      and has_function_privilege(
        'service_role',
        p.oid,
        'EXECUTE'
      )
  ) as passed;


-- ============================================================
-- 22. Authenticated direct writes denied
--
-- Expected:
-- passed = true
-- ============================================================

select
  'authenticated_template_writes_denied' as check_name,

  not exists (
    select 1

    from (
      values
        ('templates'),
        ('template_sections'),
        ('template_fields'),
        ('template_tags'),
        ('template_versions'),
        ('template_comments'),
        ('template_audit_events')
    ) as t(table_name)

    where
      has_table_privilege(
        'authenticated',
        format('public.%I', t.table_name),
        'INSERT'
      )

      or

      has_table_privilege(
        'authenticated',
        format('public.%I', t.table_name),
        'UPDATE'
      )

      or

      has_table_privilege(
        'authenticated',
        format('public.%I', t.table_name),
        'DELETE'
      )
  ) as passed;


-- ============================================================
-- 23. RLS enabled everywhere
--
-- Expected:
-- passed = true
-- ============================================================

select
  'template_rls_enabled_everywhere' as check_name,

  (
    select count(*)

    from pg_class c
    join pg_namespace n
      on n.oid = c.relnamespace

    where
      n.nspname = 'public'
      and c.relrowsecurity = true
      and c.relname in (
        'templates',
        'template_sections',
        'template_fields',
        'template_tags',
        'template_versions',
        'template_comments',
        'template_audit_events'
      )

  ) = 7 as passed;


-- ============================================================
-- 24. Required immutability triggers present
--
-- Expected:
-- passed = true
-- ============================================================

select
  'template_immutability_triggers_present' as check_name,

  (
    select count(*)

    from pg_trigger t
    join pg_class c
      on c.oid = t.tgrelid
    join pg_namespace n
      on n.oid = c.relnamespace

    where
      not t.tgisinternal
      and n.nspname = 'public'
      and t.tgenabled <> 'D'
      and t.tgname in (
        'templates_immutable_guard',
        'template_versions_immutable_guard'
      )

  ) = 2 as passed;


-- ============================================================
-- 25. Final migration confirmation
-- ============================================================

select
  '023_template_domain_operations_applied' as check_name,

  exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '023_template_domain_operations'
  ) as passed;