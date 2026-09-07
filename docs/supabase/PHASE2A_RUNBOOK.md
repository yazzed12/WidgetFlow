# WidgetFlow Phase 2A Runbook

Phase 2A is a locally generated authorization and Admin-account-management package. Nothing in this package has been applied to a Supabase project, and the React application has not been cut over to Supabase Auth.

## Security blocker

**SECURITY REQUIREMENT BLOCKER:**  
**ADMIN-ONLY PASSWORD CHANGE/RECOVERY CANNOT BE FULLY ENFORCED**  
**WITH THE CURRENT SUPABASE AUTH MODEL**

A signed-in user can call `supabase.auth.updateUser({ password })`, and the public recovery flow can be initiated with `resetPasswordForEmail`. Supabase currently documents neither a project setting nor an Auth hook that rejects every user-initiated password update/recovery while preserving email/password login. Hiding controls in WidgetFlow would not disable those Auth endpoints.

Relevant official documentation:

- [Update a user](https://supabase.com/docs/reference/javascript/auth-updateuser)
- [Send a password reset request](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)
- [Auth hooks](https://supabase.com/docs/guides/auth/auth-hooks)
- [Auth general configuration](https://supabase.com/docs/guides/auth/general-configuration)
- [Admin update user](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid)
- [Admin create user](https://supabase.com/docs/reference/javascript/auth-admin-createuser)

This blocker does not weaken the generated database authorization, status enforcement, role-change protection, or Admin server operations. It prevents claiming that the complete admin-only password policy is enforceable with this Auth model.

## Review and execution order

The user, not Codex, owns all remote steps. Review and manually run these files in this order:

1. `supabase/migrations/010_authz_principal_rls.sql`
2. `supabase/migrations/011_admin_domain_security.sql`
3. `supabase/migrations/012_auth_audit_security.sql`
4. `supabase/verification/phase2a_verify.sql`
5. Configure Supabase Auth manually as described below.
6. Create exactly one first Auth user in the Dashboard.
7. Replace the placeholders in a private working copy of `supabase/manual/bootstrap_first_admin_TEMPLATE.sql` and manually run it.
8. Run `supabase/verification/phase2a_verify.sql` again.
9. Review and deploy the five Edge Functions manually only after database verification.

Do not edit or rerun migrations 001–009. The new migrations use the private migration ledger and stop loudly if applied out of order or twice.

## Supabase Auth Dashboard settings

In the target project, manually review Authentication settings (the Dashboard wording may place these under Providers and/or general sign-in configuration):

- Enable the Email/password provider for login.
- Disable public user signup.
- Disable anonymous sign-ins.
- Decide the internal-account email-confirmation policy. The generated Admin create functions use `email_confirm: true`, because accounts are created by an already-authorized protected Admin and no public sign-up flow exists. The first account is created manually in the Dashboard; confirm it there according to the same internal policy.
- Review redirect URLs and site URL before enabling any email recovery workflow.

These settings do not solve the password blocker above. In particular, UI hiding, disabling public signup, or suppressing a recovery email is not equivalent to disabling authenticated password changes.

Never copy a secret/service credential into React, Vite variables, SQL files, browser storage, logs, or support messages.

## First protected Admin bootstrap

Before running the template:

1. Confirm migrations 010–012 passed verification.
2. Confirm public signup and anonymous sign-in are disabled.
3. In Supabase Authentication, manually create one email/password Auth user and apply the approved internal email-confirmation state.
4. Copy that Auth user's UUID and exact normalized email.
5. Make a private working copy of `supabase/manual/bootstrap_first_admin_TEMPLATE.sql`.
6. Replace `<AUTH_USER_UUID>`, `<ADMIN_FULL_NAME>`, and `<ADMIN_EMAIL>` in that copy.
7. Run the copy manually in the SQL editor.
8. Delete or securely store the edited copy; do not commit real identity data.
9. Run the verification SQL and call `current_principal()` through an authenticated session during user-owned QA.

The template does not create `auth.users` and contains no password. It aborts if a placeholder remains, the UUID or email does not match Auth, a profile already exists, an active protected Admin already exists, or the canonical protected Admin role is invalid. Profile creation and both initial audit events occur in one transaction.

## Edge Function environment and deployment

The function source is generated but has not been deployed. Configure these server-side environment values before manual deployment:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` (legacy fallback in source: `SUPABASE_ANON_KEY`)
- `SUPABASE_SECRET_KEY` (legacy fallback in source: `SUPABASE_SERVICE_ROLE_KEY`)
- `WIDGETFLOW_ALLOWED_ORIGINS`, a comma-separated allowlist such as the local Vite origin plus the actual production Vercel origin

The local development origins default to `http://localhost:5173` and `http://127.0.0.1:5173`. No production hostname is guessed. Set the exact deployed origin before production use. Privileged functions never return, log, or pass the secret key to a browser.

Functions to review and deploy manually:

- `admin-create-user`
- `admin-create-admin`
- `admin-reset-password`
- `admin-set-user-status`
- `admin-change-user-role`

Each function accepts POST only, uses explicit origin handling, validates the Bearer JWT against Supabase Auth, resolves `current_principal()` live, requires an Active protected System Admin, and only then uses the server-side secret client.

## Operation contracts

### Create ordinary user

`admin-create-user` accepts `fullName`, `email`, `initialPassword`, `roleId`, optional `department`, and optional `managerUserId`. It rejects inactive, missing, protected, and Admin roles. Managers must have an Active profile and active role. Auth creation uses an already-confirmed internal account. If the profile transaction fails, the function attempts to remove the newly created Auth identity and explicitly reports whether compensation succeeded. Password material is never returned or audited.

### Create another Admin

`admin-create-admin` is separate. Only an existing Active protected System Admin may invoke it. It resolves the canonical protected Admin role rather than accepting a role ID from the caller, then creates Auth, profile, and audit records. It uses the same compensation behavior as ordinary account creation.

### Reset a password

`admin-reset-password` allows an Active protected Admin to reset a non-Admin target through the server-side Auth Admin API. Self and other protected Admin targets are rejected because their password lifecycle policy is intentionally not guessed. The new password is never stored in public tables, logs, responses, or audit JSON. If Auth succeeds but the audit write fails, the response explicitly states that the password changed and audit recording failed.

### Change status

`admin-set-user-status` supports exactly `Active`, `Inactive`, `Resigned`, and `Terminated`. The live profile status is authoritative. A non-Active change immediately removes application permissions and causes database authorization to fail even while an old JWT exists. The operation rejects self-disable and every protected-Admin lifecycle change.

Auth ban/unban is not used in this generated code. The available Admin API documents banning with `ban_duration`, but this package does not guess at a reversible unban contract for the deployed version. Consequently, a disabled user may still authenticate at the Auth layer but receives no WidgetFlow application authority. Confirmed ban/unban hardening is deferred.

### Change role

`admin-change-user-role` accepts a target UUID, active non-protected role UUID, and optional reason. The database writes the profile role, immutable old/new role snapshots, and Admin audit event transactionally. Custom roles remain database rows; authorization never hardcodes a custom role name. The normal operation cannot assign or demote protected Admin.

### Account removal

There is no lifecycle delete endpoint. Normal removal means setting a profile to `Inactive`; `Resigned` and `Terminated` are also available for their business meanings. A database trigger rejects profile hard deletion so ownership, approvals, role snapshots, signatures, and audit history remain intact. The only Auth deletion in the package is immediate compensation for a just-created identity whose profile transaction failed.

## Password policy

Phase 2A deliberately preserves the existing WidgetFlow policy:

- Minimum: 12 characters
- Maximum: 128 characters
- No composition requirement
- Whitespace is preserved exactly; an all-whitespace value is rejected

Passwords exist only in the incoming protected function request and the server-side Auth Admin call. They are not written to SQL, profile data, audit data, logs, or responses.

## Rate limiting and observability

Phase 2A does not implement a fake per-instance in-memory limiter. Before production rollout, configure and validate rate limits/observability for account creation, Admin creation, password resets, repeated status changes, and repeated role changes. Monitor safe event codes and outcomes, never request bodies or Authorization headers. Production abuse hardening is not complete in Phase 2A.

## Local static check

Run without a Supabase connection:

```sh
node supabase/tests/phase2a_static_check.mjs
```

The check pins the exact Phase 1 migration hashes, audits Phase 2A function hardening and grants, scans for credential-shaped values and forbidden local identities, verifies create-user compensation, and confirms the browser source does not reference a server-only Supabase key.

## User-owned manual QA checklist

Codex has not performed this QA. After manual migration, configuration, bootstrap, and deployment, the user should verify:

- Auth settings match the target configuration.
- The first Admin resolves to an Active protected System Admin with zero ordinary permissions.
- A non-Admin is denied every Admin function.
- Ordinary Employee, Manager, Director, and Custom Role profiles can be created with the intended roles.
- A second protected Admin can be created only through the dedicated operation.
- A non-Admin password can be reset without password material appearing in data or logs.
- Inactive, Resigned, and Terminated profiles immediately lose application authority with an existing JWT.
- Reactivation restores only the current database role's authority.
- Role changes take effect and append immutable old/new snapshots.
- Protected Admin self-disable, ordinary demotion, ordinary assignment, and last-Admin changes are denied.
- Account creation compensation removes a just-created Auth identity when profile insertion fails, and compensation failure is visible.
- Admin and application Auth audit rows are created and cannot be changed or deleted.

Phase 2B must not begin until the user completes and records this verification.
