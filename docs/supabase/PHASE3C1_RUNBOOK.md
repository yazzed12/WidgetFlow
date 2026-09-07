# WidgetFlow Phase 3C.1 runbook

This phase is local-only. Do not connect a Supabase service key to Vite, run `supabase db push`, deploy Edge Functions, or run reset/seed scripts.

1. Review [021_admin_standard_pack_domain_operations.sql](/Users/apple/Desktop/gsk-task-1/supabase/migrations/021_admin_standard_pack_domain_operations.sql). Confirm migrations 001–020 remain unchanged.
2. Run migration 021 manually in the Supabase SQL Editor.
3. Run the read-only [021_admin_standard_pack_domain_operations_verify.sql](/Users/apple/Desktop/gsk-task-1/supabase/migrations/021_admin_standard_pack_domain_operations_verify.sql). Confirm Pack RPCs, grants, RLS, metadata columns, and immutability triggers.
4. Optionally review and run [022_standard_pack_production_bootstrap.sql](/Users/apple/Desktop/gsk-task-1/supabase/migrations/022_standard_pack_production_bootstrap.sql) only if the six named Active categories exist and starter Packs are desired. It fails safely when a required category is missing.
5. If 022 is run, use [022_standard_pack_production_bootstrap_verify.sql](/Users/apple/Desktop/gsk-task-1/supabase/migrations/022_standard_pack_production_bootstrap_verify.sql).
6. Restart Vite and perform manual Admin Pack Management QA: New Pack, draft save, publish, new version, disable, enable, archive, and status filters.
7. Perform manual Admin Pack Builder QA in `mode="admin-pack"`, including metadata/category restoration and detached insertion behavior.
8. Perform manual operational Studio QA with an Active user having `studio.standard_packs.use`: published Packs appear; Draft, Disabled, and Archived Packs do not.

Browser QA remains user-owned and is not claimed by this implementation.
