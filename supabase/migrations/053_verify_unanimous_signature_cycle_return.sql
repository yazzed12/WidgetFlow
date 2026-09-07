select
  exists (select 1 from private.widgetflow_schema_migrations where id = '047_report_signature_typed_font_snapshot') as migration_047_exists,
  exists (select 1 from private.widgetflow_schema_migrations where id = '053_unanimous_signature_cycle_return') as migration_053_exists,
  has_function_privilege('authenticated', 'public.return_report(uuid,uuid,text)', 'EXECUTE') as authenticated_can_execute,
  not has_function_privilege('anon', 'public.return_report(uuid,uuid,text)', 'EXECUTE') as anon_cannot_execute,
  pg_get_functiondef('public.return_report(uuid,uuid,text)'::regprocedure) like '%for update%' as locks_rows,
  pg_get_functiondef('public.return_report(uuid,uuid,text)'::regprocedure) not like '%REPORT_ALREADY_PARTIALLY_SIGNED%' as partial_sign_block_removed,
  pg_get_functiondef('public.return_report(uuid,uuid,text)'::regprocedure) like '%status = ''returned''%' as closes_cycle,
  pg_get_functiondef('public.return_report(uuid,uuid,text)'::regprocedure) like '%current_send_cycle_id = null%' as clears_current_cycle,
  pg_get_functiondef('public.return_report(uuid,uuid,text)'::regprocedure) like '%send_cycle_invalidated%' as records_invalidation;
