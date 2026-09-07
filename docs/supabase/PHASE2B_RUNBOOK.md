# WidgetFlow Phase 2B Auth Frontend Cutover

Phase 2B replaces the browser's Express authentication dependency with Supabase Auth plus `public.current_principal()`. It does not migrate business repositories, create SQL, deploy functions, or implement `profile_code`.

## Browser environment

Create a local `.env.local` from `.env.example` and set only browser-safe values:

```text
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Never place a Supabase secret key or service-role key in a Vite variable. Vite variables are bundled into browser code.

## Runtime flow

1. One lazy browser client initializes Supabase Auth with supported session persistence and token refresh.
2. `AuthProvider` subscribes to `onAuthStateChange` and waits for `INITIAL_SESSION`; the application does not render during this check.
3. Login calls `signInWithPassword` through the Auth service. Email is normalized; password bytes are preserved.
4. Every new/restored/meaningfully changed session calls `current_principal()`.
5. Missing profile, non-Active profile, or inactive role blocks application entry and signs out.
6. An Active principal enters WidgetFlow. Protected Admin is detected from live status plus protected System Admin role attributes, even with zero ordinary permissions.
7. Logout clears React principal/session state immediately and calls Supabase Auth `signOut`.

No role, status, governance level, or permission is read from Auth metadata, email, localStorage, demo data, or route names.

## Expected temporary business boundary

Business repositories still call the old `/api` Express routes. Phase 2B deliberately sends no demo identity header and no Express Auth session. Until those repositories move to Supabase, successful Auth login may be followed by empty/error states in:

- Operational Dashboard, Templates, My Requests, Approvals, Reports, Notifications, search, comments, signatures, and recipient/directory data.
- Admin Overview, Features, Studio Configuration, Packs, Elements, Content Library, Users, Roles, Categories, System Settings, and Audit screens.

The authenticated header, account identity, protected Admin routing, logout, and top-level Auth gate are independent of that temporary failure. Do not restore demo impersonation to make these screens appear populated.

## Remaining legacy reference classification

- **Removed:** Express login/me/logout frontend methods, forgot/reset/invitation pages, Auth role switcher, demo Auth mode, localStorage identity persistence, and demo identity headers.
- **Legacy non-runtime:** `server/auth`, old Express Auth routes, and backend Auth checks remain until final server removal. They are not imported by the browser Auth path.
- **Deferred business migration:** `src/data/initialData.ts` and hard-coded workflow/template examples retain old mock IDs/names as business fixtures. They no longer establish login identity.
- **Requires follow-up:** every `apiService` business operation must migrate to Supabase with domain RLS in later phases.

## User-owned manual QA

Codex has not performed browser QA. The user should:

1. Set the two Vite variables above and start the Vite application.
2. Open WidgetFlow with no Supabase session; confirm only Login appears with no Register, Forgot Password, role selector, or demo credentials.
3. Sign in with the existing real protected Admin account; enter the password only in the browser.
4. Confirm the loading screen remains until `current_principal()` resolves, then confirm the Admin shell opens and shows full name, email, and role without displaying the UUID.
5. Confirm the Admin is recognized despite having zero effective ordinary permissions.
6. Refresh; confirm the Supabase session persists and the principal is fetched again without a second login.
7. Sign out; confirm Login appears and browser back navigation cannot reveal the Admin shell.
8. Enter a wrong password; confirm the safe invalid-credentials message and no application entry.
9. Later, test an Auth user without a profile; confirm it is signed out and shown the account-not-configured message.
10. Later, test each non-Active status; confirm it is signed out and shown the inactive-account message.
11. Record expected business-screen failures separately; do not treat missing legacy business data as Auth failure.

Phase 2 remains incomplete until the user records this QA and later business repository phases are finished.
