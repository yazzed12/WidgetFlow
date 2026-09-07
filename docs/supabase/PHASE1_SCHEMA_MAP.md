# WidgetFlow Phase 1 Supabase Schema Map

This document describes the PostgreSQL foundation generated in `supabase/migrations/001` through `009`. It is a design and manual-execution package; it does not mean the migrations have been applied.

## Conventions

- Application data lives in `public`; the migration ledger and shared trigger helper live in `private`.
- Primary keys are UUIDs generated with `gen_random_uuid()`, except stable catalog keys and the private migration ID.
- Business statuses use `CHECK` constraints rather than PostgreSQL enums so future lifecycle additions remain reviewable without enum surgery.
- Mutable roots use database `created_at`/`updated_at` timestamps. Event/version rows use database-generated event timestamps and do not have an ordinary update lifecycle.
- Application status literals for templates, reports, packs, and workflows are normalized to lower snake case. Existing UI labels such as `Pending Approval` will later be mapped at repository boundaries to `pending_approval`.
- Supabase Auth remains the login identity. `profiles.email` is a directory/display copy, protected by normalized uniqueness; it must later be synchronized by the trusted account lifecycle and must never become a second password identity.
- Historical events use nullable live actor/role references plus required actor/role/name snapshots. Deactivation or later role changes therefore do not rewrite history.
- Phase 1 creates no business RPCs, no Auth Admin functions, no Storage buckets, and no Data API access policies.

## Foundation and identity

| Table | Purpose, key and relationships | Constraints/indexes | History, deletion and future security |
|---|---|---|---|
| `private.widgetflow_schema_migrations` | Text migration ID PK, description, applied time | One ledger row per migration | Private schema; every later migration fails if its ID already exists |
| `roles` | UUID PK; System or Custom organizational role; optional creator profile | Normalized unique key/name; active/governance index; governance and role-type checks | Referenced roles are restricted from deletion; Admin is protected reference data; future Admin RPC owner |
| `permissions` | Stable text capability key PK with group and label | Nonblank checks | Product capability catalog; direct mutation should be Admin-only later |
| `role_permissions` | Composite PK mapping roles to permission keys | Reverse permission index; role composition cascades when a disposable custom role is deliberately removed | Database authorization source; future Admin RPC, not arbitrary client writes |
| `profiles` | UUID PK/FK to `auth.users`; directory identity, required `role_id`, department, manager and employment status | Normalized unique email; role/status, manager and status indexes; manager cannot be self | `auth.users` deletion is restricted while a profile exists. Production uses deactivation. Future RLS begins with `auth.uid() = id` plus active role/permission checks |
| `user_role_history` | Append-oriented UUID event PK; user, previous/new role, changer and snapshots | User/time and actor/time indexes | User/new role deletion restricted; nullable old-role/actor links plus snapshots preserve readability; future insert only through trusted role-change flow |

The authoritative runtime chain is:

```text
auth.uid() → profiles.id → profiles.role_id → roles → role_permissions → permissions
```

No custom-role authorization is derived from a compatibility role name or Auth user metadata.

## Configuration and governance

| Table | Purpose, key and relationships | Constraints/indexes | History, deletion and future security |
|---|---|---|---|
| `categories` | UUID category PK; optional creator | Normalized unique name; active/status index | Template references restrict deletion; deactivate instead; Admin write and active authenticated read later |
| `feature_settings` | Stable feature key PK and enabled state | Category/enabled index | No feature rows seeded because repository entries may mix product and demo configuration; Admin write later |
| `element_settings` | Stable builder-element key PK and enabled state | Category/enabled index | No rows seeded pending catalog review; Admin write later |
| `system_settings` | Typed single-row platform settings keyed by `default` | Single-row ID check and nonblank value checks | No row is seeded; Admin configuration will establish production values |
| `governance_routes` | UUID PK; one active route per creator governance level; optional target role/specific user | Partial unique active-level index; target role/user indexes; strategy-shape check | No Sarah/Omar or other user route is seeded. Admin RPC must validate role permissions and active user membership before writing |

Governance shape:

- `DIRECT_PUBLISH`: no target role or user.
- `ROLE_QUEUE`: target role required; specific user absent.
- `SPECIFIC_USER`: target role and specific user required.
- Employee, Manager, and Director routes are independent configuration rows, not a mandatory sequential chain.

## Templates

| Table | Purpose, key and relationships | Constraints/indexes | History, deletion and future security |
|---|---|---|---|
| `templates` | Mutable template root with UUID PK, category, creator and approval assignment snapshots | Creator/status, status/category, pending reviewer, target-role queue, unclaimed queue and supersession indexes; lifecycle/routing checks | Category, creator, target role and active reviewer references restrict deletion. Future submit/claim/approve/reject/publish RPC owner |
| `template_sections` | Compositional ordered sections | Unique template/order and template-order index | Cascades only with its live template root; no independent historical authority |
| `template_fields` | Compositional fields/components with relational identity and JSON configuration | Unique template/key and template/order; section/order index | Cascades with live template; historical reports retain field snapshots even if a live field is rebuilt |
| `template_tags` | Compositional tags | Normalized unique tag per template | Cascades with live template |
| `template_versions` | Immutable approved template schema snapshots | Unique template/version; template/published index | Template deletion restricted. No ordinary update/delete path; reports reference exact version |
| `template_comments` | Discussion with author snapshots | Template/time and author/time indexes | Template deletion restricted; author can become null while snapshot survives |
| `template_audit_events` | Append-only-ready template lifecycle events with complete actor snapshots | Template/time, actor/time and event/time indexes | Template deletion restricted; future RPC/trigger insert only, no user update/delete |

The live template stores routing state needed for an atomic future queue claim. Version snapshots remain independent of later edits, role changes, or category changes.

## Reports and signatures

| Table | Purpose, key and relationships | Constraints/indexes | History, deletion and future security |
|---|---|---|---|
| `reports` | UUID report root bound to exact template and template version; creator/recipient snapshots and lifecycle timestamps | Creator/status, recipient/status, status/time, template-version and category/status indexes; no-self-recipient and lifecycle-shape checks | Template/version/category/creator/recipient references restrict deletion. Future transition RPC owner. Signed and Rejected rows will receive no update policy |
| `report_values` | One JSONB value per report/field key with field label/type snapshot | Unique report/field key; optional live-field index | Composition cascades only if a report is deliberately removed; live template-field deletion sets its optional FK null without losing the value snapshot |
| `report_comments` | Participant discussion and author snapshots | Report/time and author/time indexes | Report deletion restricted; author link can null without losing authorship display |
| `report_audit_events` | Append-only-ready lifecycle events | Report/time, actor/time and event/time indexes | Report deletion restricted; trusted transitions will insert events atomically |
| `signature_profiles` | Current personal signature selection; one per profile | Unique user; active-user and later asset indexes; method-specific shape check | Profile and referenced asset deletion are restricted. It is mutable preference data, unlike signature history |
| `report_signature_events` | One consolidated append-only event stream for signed, superseded, and revoked events | Unique verification ID; report/time, signer/time, supersession, component and asset indexes; event-shape check | Replaces both legacy signature models. Report deletion and referenced signed asset deletion are restricted. Supersession/revocation is represented by a new event, not mutation of the signed event |

The schema supports the target lifecycle:

```text
draft → completed → sent → signed
                         ├→ returned → completed → sent
                         └→ rejected
```

Transition legality and concurrency will be enforced by later RPCs. Phase 1 checks ensure terminal rows have locking/timestamp data but intentionally does not create transition functions.

## Reusable content

| Table | Purpose, key and relationships | Constraints/indexes | History, deletion and future security |
|---|---|---|---|
| `content_library_items` | Admin reusable content with type, value and configuration | Enabled/category and creator indexes | Creator may null while snapshot survives; Admin lifecycle owner |
| `standard_packs` | Admin-governed pack root | Status/category index | Category and creator may null while snapshots preserve context; archive/disable rather than delete |
| `standard_pack_versions` | Immutable pack structure snapshot | Unique pack/version; pack/status index | Pack deletion restricted; later publish RPC owns version creation |
| `standard_pack_items` | Ordered composition of a pack version, optionally linked to content library | Unique version/order; source content index | Cascades only with its containing version; configuration is snapshotted so later library changes do not rewrite a version |
| `user_packs` | User-owned personal reusable schema snapshot | Partial unique owner/normalized-name; owner/time index | Profile deletion restricted while pack exists; owner CRUD later through RLS, with archive status available |

No Standard Packs, user Packs, or Content Library demo rows are seeded.

## Dynamic workflows

| Table | Purpose, key and relationships | Constraints/indexes | History, deletion and future security |
|---|---|---|---|
| `workflow_definitions` | Mutable draft/published/archived workflow root, optionally tied to a template | Template/status index | Template deletion restricted; creator snapshots survive; secure Studio rules later |
| `workflow_versions` | Immutable step snapshot | Unique definition/version; definition/time index | Definition deletion restricted; execution binds to an exact version |
| `workflow_instances` | One execution per report and workflow version | Unique report; status/time and version indexes | Report/version deletion restricted; future action RPC owner |
| `workflow_tasks` | Attempted step assignment using `assigned_user_id` or `assigned_role_id`, with optional role-queue claimant | User-pending, role-pending, claimant and instance/status indexes; assignment and claim checks; concurrency version | No legacy `assigned_role = 'Manager'` authority. Future claims/actions use conditional updates and role IDs |
| `workflow_events` | Append-only-ready execution history with actor and step snapshots | Instance/time, task/time and actor/time indexes | Instance/task deletion restricted; future workflow RPC insert only |

Dynamic workflow tables are preserved but have no Phase 1 Data API access and are not production authority until later RLS/RPC phases.

## Notifications, assets and cross-cutting audit

| Table | Purpose, key and relationships | Constraints/indexes | History, deletion and future security |
|---|---|---|---|
| `notifications` | Recipient notification and read state | Recipient/unread, recipient/time and related-object indexes; read timestamp consistency | Recipient deletion restricted; related business link may null; future recipient-only read-state policy |
| `asset_metadata` | Metadata for future private Storage objects | Unique bucket/path; owner/state, template, report and hash indexes; lifecycle/link/immutability checks | Does not create buckets. Signed-event asset references restrict deletion; future Storage and metadata policies must agree |
| `admin_audit_events` | Administrative mutation audit with actor/target snapshots and JSONB old/new state | Time, actor, target and event-type indexes | Append-only-ready; Admin/auditor read, trusted insert only |
| `application_auth_events` | WidgetFlow-level Auth/account-administration outcomes without passwords or tokens | User/time, actor/time and type/time indexes | Complements Supabase Auth logging; append-only-ready and never stores credential/session/token material |

## Important delete decisions

- `profiles → auth.users`: `RESTRICT`. Disabling is the production default and an identity cannot be casually deleted while business data remains.
- Business creator/recipient/assignee references generally use `RESTRICT` when the live identity remains necessary to an unresolved assignment.
- Historical actor references generally use `SET NULL` together with required snapshots.
- Role references used by active routing/tasks use `RESTRICT`; event snapshots survive later role renames or reassignment.
- Version, audit, signature, workflow execution, report and comment roots use `RESTRICT` to prevent accidental historical destruction.
- Only true composition children such as live template sections/fields/tags, report values, and pack-version items use `CASCADE`.
- Category links on historical/live business roots do not cascade business records.

## Reference data classification

Seeded as product reference data:

- Four System roles: Employee, Manager, Director, Admin.
- The 37 permission definitions from `src/shared/permissionCatalog.ts`.
- Exact default System-role permission mappings from that same catalog.

Not seeded because it is demo data or requires production review/configuration:

- Users or profiles.
- Governance routes or reviewer assignments.
- Categories.
- Feature and element rows.
- General settings row.
- Templates, reports, comments, notifications, audits or signatures.
- Standard Packs, user Packs, Content Library items or data fields.

## Phase 1 security posture

Migration `009_security_baseline.sql` enables RLS on all 37 public application tables and revokes all table privileges from `anon` and `authenticated`. It deliberately creates no policies. The Data API baseline is therefore deny-by-default until later migrations deliberately add grants and row-specific policies.

The only generated function is `private.set_updated_at()`. It is `SECURITY INVOKER`, has an empty search path, and has execute privileges revoked from `PUBLIC`, `anon`, and `authenticated`. There are no `SECURITY DEFINER` business functions.
