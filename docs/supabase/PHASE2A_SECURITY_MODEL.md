# WidgetFlow Phase 2A Security Model

## Authority chain

Supabase Auth proves login identity only. WidgetFlow application authority is resolved live through this chain:

`auth.uid()` → `public.profiles` → profile status → `role_id` → `public.roles` → role state and governance level → `public.role_permissions` → `public.permissions`

The JWT does not determine WidgetFlow role or status. There are no role claims that can remain stale after a role/status change, and no custom role name is encoded in authorization logic. An Active profile with an active role receives that role's mapped permission keys. Inactive, Resigned, Terminated, missing-profile, and inactive-role principals receive no effective permissions.

The Admin role is a deliberate exception to ordinary permission-based behavior. A protected Admin requires all of these live properties:

- Profile status is `Active`.
- Role type is `System`.
- Normalized role key is `admin`.
- Role is active.
- Role is protected.

The canonical Admin role has no ordinary operational permissions. Admin endpoints check its protected identity rather than a permission name.

## Current principal

`public.current_principal()` is the Phase 2B-facing identity RPC. It accepts no user ID and resolves only `auth.uid()`. It returns safe profile/role fields and sorted effective permission keys. Its `SECURITY DEFINER` status is limited to bypassing otherwise recursive identity RLS; it has an empty search path, schema-qualified references, no dynamic SQL, and browser execution is granted only to `authenticated`.

The helper functions `current_role_id`, `current_user_is_active`, `current_user_is_protected_admin`, and `current_user_has_permission` use the same constraints. None accepts an arbitrary principal ID. This means the functions can answer only questions about the authenticated caller and cannot be used as a directory oracle.

## Identity RLS

Browser roles have no identity-table write privilege.

| Table | Authenticated read rule | Browser writes |
| --- | --- | --- |
| `profiles` | Own row even if disabled; all rows for Active protected Admin | None |
| `roles` | Active caller's own role; all rows for Active protected Admin | None |
| `permissions` | Active protected Admin only | None |
| `role_permissions` | Active protected Admin only; ordinary callers use `current_principal()` | None |
| `user_role_history` | Active protected Admin only | None |
| `admin_audit_events` | Active protected Admin only | None |
| `application_auth_events` | Active protected Admin only | None |

There are no anonymous policies and no `USING (true)` policies. `authenticated` receives `SELECT` only on these tables. `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, and `TRIGGER` remain revoked.

## Trusted mutation boundary

Publicly exposed Admin domain RPCs are callable only by `service_role`. Browser roles have execution revoked. Edge Functions cryptographically validate a Bearer token with `auth.getUser(token)`, call the user-scoped `current_principal()` RPC, verify the live Active protected Admin record, and only then invoke a server-side Auth Admin API or service-only domain RPC.

The domain RPCs also receive the already-verified actor UUID and independently re-check that actor against the live protected Admin model. This is defense in depth against an Edge authorization regression. The internal arbitrary-user helper is not executable by browser or service roles directly.

## Protected Admin invariants

Database triggers preserve the canonical Admin role's type, normalized key, name, governance level, active state, and protected state, and reject its deletion. Ordinary user creation and role change reject both protected roles and the canonical Admin identity. Additional Admin creation resolves the protected role internally through a dedicated operation.

Normal status and role operations reject protected Admin targets. The acting Admin cannot disable themselves. The database counts active protected Admins and emits `LAST_ACTIVE_ADMIN` when the final protected Admin is threatened; the stronger normal-flow policy rejects protected Admin lifecycle changes even when more than one exists. There is no profile hard-delete path.

## Historical safety and audit

Role changes update only the current profile role. `user_role_history` captures previous/new role IDs plus immutable role key/name and actor snapshots. Admin audit rows snapshot actor role/name and before/after values. Application Auth events snapshot the affected identity and actor where relevant.

Triggers reject update and delete on all three history/event tables. Existing report ownership, approvals, reviewer context, signatures, template history, and other historical domain rows are never rewritten by role or status operations.

## Cross-service consistency

Supabase Auth and Postgres cannot share one transaction. Account creation therefore follows a saga-like boundary:

1. Validate live protected Admin and domain inputs.
2. Create the Auth identity.
3. Call one transactional domain RPC to create the profile and audit events.
4. If step 3 fails, immediately attempt Auth identity deletion as compensation.
5. Record a safe failure audit best-effort and return `compensationSucceeded` explicitly.

The compensation delete applies only to the brand-new orphan Auth identity. It is not an account lifecycle or historical-data deletion feature.

Password reset has a smaller unavoidable cross-service boundary: Auth password update occurs before audit insertion. If audit insertion then fails, the response explicitly reports `passwordChanged: true`; the implementation does not falsely claim rollback.

## Status and session behavior

Profile status is the authoritative application access state. Every principal and authorization helper reads it live, so setting `Inactive`, `Resigned`, or `Terminated` removes database authority even if an issued JWT remains cryptographically valid. React session handling is Phase 2B; database enforcement does not wait for that UI cutover.

Auth ban/unban is not implemented because a reliable reversible unban contract was not established for the eventual deployed SDK/project combination. This is documented rather than guessed. The application boundary remains secure, although a disabled user may still authenticate to Supabase Auth and then be denied WidgetFlow authority.

## Secret and response model

The publishable and secret keys are read only inside the Supabase Edge Function runtime. The secret is never stored in Vite/React, SQL, repository values, logs, or responses. CORS reflects only an explicitly configured allowed origin; wildcard CORS is not used. Responses contain stable safe codes and messages, not Auth internals, database errors, stack traces, tokens, Authorization headers, or passwords.

Stable errors include `UNAUTHENTICATED`, `FORBIDDEN`, `ACCOUNT_INACTIVE`, `ADMIN_REQUIRED`, `TARGET_NOT_FOUND`, `ROLE_NOT_FOUND`, `ROLE_INACTIVE`, `PROTECTED_ADMIN`, `LAST_ACTIVE_ADMIN`, `EMAIL_ALREADY_EXISTS`, `INVALID_INPUT`, `ACCOUNT_CREATE_FAILED`, and `PASSWORD_RESET_FAILED`.

## Password capability blocker

**SECURITY REQUIREMENT BLOCKER:**  
**ADMIN-ONLY PASSWORD CHANGE/RECOVERY CANNOT BE FULLY ENFORCED**  
**WITH THE CURRENT SUPABASE AUTH MODEL**

Supabase's authenticated client supports user password updates, and the public recovery endpoint can initiate password reset. The currently documented Auth hooks do not include a general before-user-password-change veto. Dashboard signup/anonymous/email settings and a Send Email Hook do not close the authenticated update endpoint. The generated Admin reset operation is secure for its own use, but cannot establish exclusivity over every Supabase Auth password path.

The accepted production architecture therefore requires either a verified future Supabase control/hook that blocks both paths, a different authentication policy/provider, or a revised product requirement. Phase 2A must remain blocker-qualified until one of those is chosen and verified.
