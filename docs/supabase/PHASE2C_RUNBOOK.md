# Phase 2C — Business-facing profile codes

Phase 2C is generated locally and has not been applied to any Supabase project.

## Design

`public.profiles.id` remains the Supabase Auth UUID, primary key, foreign-key identity, and authorization identity. `profile_code` is an immutable display/reference value only. It grants no permission and must never replace `auth.uid()`, RLS, ownership checks, permission checks, or trusted domain boundaries.

Codes use `[PREFIX]-[SEQUENCE]-[MMYY]`. System roles map to `AD`, `EM`, `MG`, and `DR`; every Custom role maps to `CU`. A missing or inactive role, unsupported role type, or unknown System role fails closed. Sequence counters are independent per prefix and UTC creation month, use a minimum width of three digits without a 999 limit, and increment atomically with `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING`.

The date component comes from `profiles.created_at AT TIME ZONE 'UTC'`. Existing profiles have no creation-role snapshot, so migration 013 deterministically backfills them in `created_at, id` order using their role at migration time. Future role and status changes never alter the code.

`private.profile_code_counters` and all profile-code helpers deny direct browser and service-role access. A `BEFORE INSERT` trigger generates the code, rejects supplied values, and an update trigger raises `PROFILE_CODE_IMMUTABLE` on any attempted change.

## User execution order

1. Review `supabase/migrations/013_profile_codes.sql` in full.
2. Apply that file once using the normal trusted SQL migration process.
3. Run `supabase/verification/phase2c_profile_codes_verify.sql`; it is read-only.
4. Optionally review and run `supabase/manual/phase2c_profile_code_manual_qa.sql`; every test is transaction-wrapped and ends in `ROLLBACK`.
5. Perform the user-owned browser QA from the Phase 2C specification.

Given the verified current state—one protected Admin created in September 2026 and no earlier profiles—the deterministic expected code is `AD-001-0926`. This result is not hard-coded to any UUID, email, or name.

The Admin creation Edge Functions require no request-contract change: they continue to insert through the existing domain functions, and PostgreSQL generates `profile_code`. The first-Admin bootstrap template also remains compatible because it does not supply a code.
