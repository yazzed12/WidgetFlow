# WidgetFlow Phase 3B runbook

Phase 3B is generated locally only. The project owner performs every database and browser action. Never place a `service_role` key in Vite or any `VITE_*` variable.

## Database order

1. Confirm the already-applied migration `017_edge_function_service_reads` matches `supabase/migrations/017_edge_function_service_reads.sql`. It grants `service_role` read-only access to `public.roles` and `public.profiles`; do not rerun it if its ledger row already exists.
2. Review `supabase/migrations/018_configuration_read_access.sql`.
3. Run migration 018 manually in the Supabase SQL Editor, then inspect its ledger row and policies.
4. Review `supabase/migrations/019_admin_configuration_domain_operations.sql`.
5. Run migration 019 manually, then inspect its RPC ownership, execute grants, and audit behavior.
6. Review `supabase/migrations/020_configuration_operational_access.sql`.
7. Run migration 020 manually, then inspect operational Content Library and Standard Pack policies.
8. Run the read-only `supabase/verification/phase3b_configuration_verify.sql` as the protected Admin caller where caller checks are required. Every reported boolean should be true; investigate unexpected grants or policies before browser testing.
9. Restart Vite so the new frontend bundle is loaded.

No Edge Function redeploy is required: Phase 3B does not change the five deployed Admin Edge Functions.

## Browser QA (project owner)

1. Login/Admin shell: sign in as the real protected Admin, refresh, confirm the session persists and `profile_code` is shown instead of UUID.
2. Startup console/network: confirm AppContext/SystemConfigContext cause no startup requests to `/api/users`, `/api/categories`, `/api/system/config`, `/api/templates`, `/api/reports`, or `/api/notifications`.
3. Admin Overview: confirm Phase 3A summary still loads.
4. Users & Access: confirm the page still loads and Create User still completes through the deployed Edge Function and generates a profile code.
5. Feature Management: load real rows, toggle one, refresh, confirm persistence and its audit event.
6. Element Management: toggle one, refresh, confirm persistence and its audit event.
7. Admin Content Library: verify a legitimate empty state or existing rows; create and edit an item; refresh; disable it; confirm Admin still sees it as Disabled.
8. Studio Content Library: as an Active operational user with `studio.content.use`, confirm enabled content is visible and the disabled item is absent.
9. Standard Packs Studio: as an Active user with `studio.standard_packs.use`, confirm published packs are visible and Draft/Disabled packs are absent; confirm no `/api/packs` request.
10. Governance Routing: test each independent creator-level route. Confirm Specific User only lists eligible reviewers with profile codes, Role Queue shows eligible availability, Direct Publish saves where the current product permits, and refresh retains values.
11. Governance dependency safety: using disposable safe test data, confirm an inactive/wrong-role Specific User and a queue with zero eligible reviewers are rejected.
12. System config: refresh after feature/element changes and confirm effective UI behavior reflects the database.
13. Audit: confirm Feature, Element, System Settings, Content Library, and Governance events are append-only.
14. Deferred domains: intentionally opened Template, Report, or Notification pages may still use Express and should be recorded as deferred. They must not run from global startup.

## Expected remaining work

Template, Report, Notification, workflow runtime, personal/user Pack mutation, and Storage/Asset cutovers remain separate phases. Personal Pack mutation controls intentionally return an unavailable message and do not call `/api/content-packs`.
