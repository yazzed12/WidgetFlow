# WidgetFlow Phase 3A — User-owned rollout runbook

Phase 3A is generated locally only. Codex has not connected to the Supabase project, run remote SQL, deployed Edge Functions, or changed Auth accounts.

## Rollout order

1. Review `supabase/migrations/014_admin_core_read_access.sql` in full.
2. Run migration 014 in the Supabase SQL Editor as the project owner.
3. Verify its ledger row, RLS policies, grants, and `admin_overview_summary()` before continuing.
4. Review and run `supabase/migrations/015_admin_core_domain_operations.sql`.
5. Verify that the four browser RPCs execute only for `authenticated`, table writes remain revoked, and protected Admin checks reject non-Admin callers.
6. Review and run `supabase/migrations/016_admin_governance_dependency_guards.sql`.
7. Run `supabase/verification/phase3a_admin_core_verify.sql`. Every boolean check should return `true`; inspect every policy, grant, function, and trigger row.
8. Manually deploy the five Admin Edge Functions: `admin-create-user`, `admin-create-admin`, `admin-reset-password`, `admin-set-user-status`, and `admin-change-user-role`. Include the shared modules they import.
9. Configure the Edge Function service credential only in Supabase server-side secrets. Configure `WIDGETFLOW_ALLOWED_ORIGINS` for the exact local and production origins. Never put the service-role credential in a Vite variable or browser bundle.
10. Restart Vite so it uses the intended `VITE_SUPABASE_URL` and publishable key.
11. Perform the browser QA below. Browser QA is user-owned and has not been claimed by Codex.

## Manual QA checklist

- Admin Overview: real Supabase counts load without the legacy authentication error; zero categories/packs render as zero.
- Users & Access: the current Admin displays `AD-001-0926`, Admin, Active; no UUID is visible.
- Roles: four System roles and 37 database permission definitions load; Admin is Protected.
- Categories: a real empty state is valid. Create, refresh, deactivate, and reactivate a category; confirm persistence and audit events.
- Audit: real snapshot-backed Admin audit rows load without a legacy API request.
- Packs: real empty/read-only state loads; no create/edit/publish mutation is available.
- Create Employee: create the first September 2026 Employee and expect `EM-001-0926`, correct Auth/profile/role, and an audit event.
- Create Manager: expect `MG-001-0926` under the same conditions.
- Change Employee to Manager: confirm the role changes while `EM-001-0926` remains unchanged.
- Disable and re-enable a normal user: confirm status and login gate behavior change while profile code and history remain unchanged.
- Password reset: old password fails, new password works, and no password value appears in audit or UI after submission.
- Create a second Admin through the separate confirmed flow; expect the next generated Admin profile code.
- Last Admin safety: use safe conditions only and confirm ordinary lifecycle controls cannot alter a protected Admin.
- Governance dependencies, once safe route test data exists: a Specific User reviewer cannot be invalidated, and a Role Queue cannot lose its final active reviewer with both approval permissions.

## Expected temporary limitations

Normal Templates, Reports, Approvals, Dashboard, Notifications, Workflows, Content Library, User Packs, signatures, files, and search remain deferred. Their remaining Express calls are not authorization compatibility defects and must not be fixed by restoring legacy identity behavior.
