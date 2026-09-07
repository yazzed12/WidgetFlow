select
  to_regprocedure('public.return_report(uuid,uuid,text)') is not null as return_rpc_exists,
  to_regprocedure('public.reject_report(uuid,uuid,text)') is not null as reject_rpc_exists,
  pg_get_functiondef('public.return_report(uuid,uuid,text)'::regprocedure) like '%report_signature_assignments%' as return_requires_mapping,
  pg_get_functiondef('public.reject_report(uuid,uuid,text)'::regprocedure) like '%report_signature_assignments%' as reject_requires_mapping,
  pg_get_functiondef('public.return_report(uuid,uuid,text)'::regprocedure) like '%status=''draft''%' as return_preserved,
  pg_get_functiondef('public.reject_report(uuid,uuid,text)'::regprocedure) like '%status=''rejected''%' as reject_terminal,
  pg_get_functiondef('public.return_report(uuid,uuid,text)'::regprocedure) like '%for update%' as return_locks,
  pg_get_functiondef('public.reject_report(uuid,uuid,text)'::regprocedure) like '%for update%' as reject_locks;
