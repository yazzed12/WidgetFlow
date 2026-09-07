select id, description from private.widgetflow_schema_migrations where id in ('033_report_send_runtime_hotfix','034_report_recipient_actions');
select routine_name, security_type, routine_definition from information_schema.routines where routine_schema='public' and routine_name in ('return_report','sign_report');
select routine_name, privilege_type, grantee from information_schema.routine_privileges where routine_schema='public' and routine_name in ('return_report','sign_report');
select id, report_id, send_cycle_id, recipient_user_id, assignment_status, signed_at, returned_at, closed_at from public.report_assignments order by created_at desc;
select id, report_id, report_assignment_id, event_type, signer_user_id, verification_id, occurred_at from public.report_signature_events order by occurred_at desc;
select id, notification_type, recipient_user_id, related_report_id, report_assignment_id, created_at from public.notifications where notification_type in ('REPORT_RETURNED','REPORT_SIGNED','REPORT_FULLY_SIGNED') order by created_at desc;
select id, report_id, event_type, from_status, to_status, report_assignment_id, occurred_at from public.report_audit_events where event_type in ('REPORT_RETURNED','REPORT_SIGNED','REPORT_FULLY_SIGNED') order by occurred_at desc;
select id, status, signed_at, locked_at, current_send_cycle_id from public.reports order by updated_at desc;
