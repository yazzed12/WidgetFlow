# Workflows, State Machines, Business Rules, and Transactions

## 1. Template state machine

Actual database states: `Draft`, `Pending Approval`, `Approved`, `Rejected`, `Archived`, `Superseded`.

```text
                       governance disabled
                    +-------------------------> Approved
                    |
new -> Draft --submit+-- Employee ------------> Pending Approval --approve--> Approved
                    |                              |       |
                    |-- Manager ------------------+       +--reject(reason)--> Rejected
                    |
                    +-- Director ----------------> Approved

Rejected --save/edit--> Draft
Pending Approval --save/edit--> Draft   (service permits this)
Approved --new version--> NEW Draft (minor version increment)
older Approved with same category+normalized name --replacement approval--> Archived
Superseded: allowed by DB, no active transition sets it
```

| State | Meaning | Creator actions | Reviewer actions | Next states | Terminal? |
|---|---|---|---|---|---|
| Draft | editable template definition | save, edit, submit | none | Draft, Pending Approval, Approved | No |
| Pending Approval | assigned governance request | UI tracks/comments; backend save can reset Draft | assigned approve/reject/comment | Approved, Rejected, Draft | No |
| Approved | published firm-wide and usable | view/use/create new version | none | Archived via replacement | Immutable but usable |
| Rejected | decision with reason; revision expected | edit/save -> Draft, resubmit | comment | Draft | No |
| Archived | older same-identity Approved template | historical read; frontend typing incomplete | none | none | Yes |
| Superseded | legacy/anticipated state | no implemented action | none | none | Database-only |

Important rules:

- Save always writes Draft but approved rows are locked.
- Schema validation is performed after save during normal governed submission.
- Governance-off branch approves before the later validation block, allowing an invalid Draft to publish.
- Approvers are the first matching role row, not the creator’s `manager_user_id`, and inactive status is ignored.
- Approval and rejection require exact assigned user ID, not merely role.
- New approval archives same normalized name/category, not an explicit parent version relationship.

Sources: `server/services/workflowService.ts`, `server/services/componentRegistry.ts`, `src/shared/templateUtils.ts`, `server/db/schema.sql`.

## 2. Template approval transaction flows

### Save Draft

```text
Builder state -> POST/PUT template -> demo identity
 -> resolve category/fallback Finance
 -> BEGIN better-sqlite3 transaction
 -> insert/update template
 -> replace tags
 -> replace sections and flattened component rows
 -> Created audit only for new template
 -> COMMIT -> hydrated template
```

Any thrown SQL/AppError rolls back the transaction. Existing Approved check occurs inside it.

### Submit

```text
POST /templates/:id/submit
 -> saveTemplateDraft transaction commits
 -> policy + hierarchy + schema validation
 -> second transaction updates status/approver
 -> optional immutable version + replacement archiving
 -> audit
 -> optional notification
```

This is not a single transaction across save and submit; invalid submission may leave a newly saved Draft behind. Governance-off direct approval uses standalone SQL statements, not one explicit transaction, and skips later validation.

### Approve / Reject

Both validate before their transaction. Approval transaction updates status, inserts/replaces snapshot, archives matching older Approved templates, writes audit and notification. Rejection transaction updates reason/status, writes audit and notification. Replacement asset cleanup is best-effort and silently catches schema mismatch errors.

## 3. Classic report state machine

Actual states: `Draft`, `Completed`, `Sent`, `Returned`, `Signed`, `Rejected`.

```text
Approved template -> Draft
Draft --save--> Draft
Draft --complete/author sender-sign--> Completed
Draft|Completed|Returned|Sent --send--> Sent
Sent --assigned return(reason)--> Returned
Returned --author update--> Completed --send--> Sent
Sent --assigned reject(reason)--> Rejected
Sent --receiver sign--> Signed
```

| State | Meaning | Author actions | Reviewer actions | Next | Terminal? |
|---|---|---|---|---|---|
| Draft | incomplete/in-progress instance | save, complete, send, sender-sign | none | Draft, Completed, Sent | No |
| Completed | validated/ready; not necessarily reviewed | edit, send, sender-sign | none | Completed, Sent | No |
| Sent | assigned for review/sign | service permits resend/edit by author; UI usually views | comment, return, reject, sign | Sent, Returned, Rejected, Signed | No |
| Returned | revision requested | edit (becomes Completed), resend | comment | Completed, Sent | No |
| Signed | digitally finalized | view only | view only | none | Yes/locked |
| Rejected | final refusal | view reason | view | none in service | Yes |

Implementation discrepancies:

- Error message says “Only draft or completed reports” but send also permits Returned and Sent.
- Update only blocks Signed, so an author can edit Sent or Rejected through raw API. Rejected update preserves Rejected; it cannot then send, but its data can change after terminal decision.
- Report status `Completed` can also mean a dynamic workflow ended without signature.

## 4. Report creation/update transactions

### Create

Prevalidation: template exists/Approved; version snapshot row is looked up and, if absent, inserted before the report transaction. Transaction writes report, Created audit, and mapped initial values. Unknown keys are ignored. Rollback covers report/audit/values but not a snapshot inserted immediately before the transaction.

### Update/complete

Prevalidation: report exists, author, not Signed; shared rules/calculations evaluate; complete validates visible required components. Transaction changes title/status, canonicalizes aliases, upserts/deletes values, and writes Draft Saved/Completed audit. Conflicting aliases abort and roll back.

## 5. Report send/review/sign transactions

### Send

Prevalidation covers author/self/status/recipient. Transaction optionally creates one sender signature record per sender-signature component, audit, report Sent update, recipient notification, then calls dynamic workflow start. The dynamic workflow start opens its own nested transaction-like call through the same synchronous connection. Any thrown error propagates and rolls back the outer transaction, including signature/report/notification writes.

Recipient rules differ:

- Frontend Employee -> Manager, Manager -> Director, Admin excluded, static Inactive filter.
- Frontend Director has no matching branch and sees no valid recipients.
- Backend accepts any existing non-self user, including Admin or inactive rows.

### Return

Classic: prevalidate policy/reason/report/recipient/Sent; transaction deactivates active component signatures, writes Returned state/reason/time, Report audit, author notification. Dynamic: deactivates signatures before calling workflow action; workflow transaction changes task/instance/report only—no classic notification/report-audit.

### Reject

Classic: policy/reason/recipient/non-author/Sent; transaction writes terminal state, audit, author notification. Dynamic: task action changes workflow and report only.

### Sign

Prevalidates policy/report/lock/role. Existing active signature returns current report (double-click/replay guard). Transaction adds signature audit, changes report state, writes report audit, and optionally author notification. For a workflow receiver signature, this commits first, then calls workflow task action outside that transaction; failure can therefore leave the signature/report state written even when the workflow task does not advance.

## 6. Digital signature specification

### Models

1. **Current component-aware model:** `user_signature_profiles` and `report_signature_audit`. Supports uploaded, drawn, typed profiles; sender/receiver role; component ID/key; attestation/confirmation; hash; active/superseded history.
2. **Legacy model:** `digital_signatures`, exactly one row per report. Seeded signed report uses this model; hydration exposes it as `report.signature`.

### Signing rules

- General signing requires `digital_signature` and alias policy true.
- Sender signature requires report author.
- Receiver branch rejects the author if they are not sent recipient, but does not positively require every receiver signer to equal `sentToId`; a third party can call the raw endpoint with `signatureRole:'receiver'`.
- If template snapshot has sender signature component, an active sender record is required before receiver signing.
- One active signature per report+signature role is effectively enforced in service by lookup, not a DB unique constraint.
- Return supersedes every active component signature record (`is_active=0`); history remains.
- Signed status blocks edit and subsequent sign.
- Verification IDs are unique in DB, format `SIG-WF-2026-<5 digits>-<4 random base36>` for current model; seeded legacy example differs.
- Content hash is SHA-256 over canonical JSON. Send-time sender hash additionally includes signer identity/role; direct sign hash omits those fields, so the canonical formats differ.
- Policy disable hides buttons and blocks new sign calls; it does not alter existing signatures or Signed reports.

### Signature assets

Signature upload requires explicit attestation, verifies magic bytes (PNG/JPEG/WebP), rejects SVG/XML/HTML/script content, max 5 MB, PNG dimensions 100x30–3000x1500. It writes disk file and `template_assets`. Retrieval tries to restrict signature assets to creator/system/report participant or any Director.

## 7. Dynamic workflow state machines

### Definition lifecycle

```text
Draft --publish--> Active
Archived is schema/type supported but no archive endpoint
save may directly persist any payload.status
```

### Instance lifecycle

```text
send report with Active definition
 -> In Progress + Pending task
Pending task --Return for Changes--> Returned instance/task + Returned report
Pending task --Reject--> Rejected instance/task + Rejected report
Pending task --Approve/Acknowledge/Sign--> Completed task
 -> next Pending task / In Progress
 -> or Completed instance + Completed|Signed report
```

### Task states

`Pending`, `Completed`, `Returned`, `Rejected`, `Cancelled`; Cancelled is never set by current service.

### Assignment

- `specific_user`: exact configured ID.
- `role`: any user with matching role can act; active status ignored.
- `selected_by_sender`: first task uses send recipient; later transition receives no recipient from classic return/sign calls and may be unassigned.
- `creators_manager`: first task reads sender’s manager ID; later task simply selects first Manager rather than report creator’s actual manager.

### Conditional transition

Transitions are evaluated in array order against report data with shared rule engine. First satisfied condition or unconditional transition wins. Otherwise next numeric order then End is used. The seeded capital-expenditure workflow condition checks field `total > 50000`, but is attached to template `tpl-req-1` whose seeded fields may not provide `total`, so the unconditional end route normally wins.

### Integration status

Real: workflow Studio UI, definitions/versions/instances/tasks/history tables, six read/save/publish APIs, automatic send start, return/reject/sign delegation. Missing: API for generic task Approve/Acknowledge/Comment, notifications on task assignment/progression, report audit parity, frontend API methods and a production task inbox. Therefore **Partially Implemented**.

## 8. Pack/content/user/category state machines

### Standard Pack

```text
create -> Draft|Published|Disabled (default Published)
Draft <-> Published <-> Disabled
```

Only Published is returned to normal user Pack API. No delete endpoint exists. Status and updates are Admin-audited.

### Built-in/My Content Pack

```text
system: seeded -> read-only (no enabled/status lifecycle)
user: create -> editable -> deleted
```

No status flag. Visibility is system OR owner. Demo reset reseeds system records but preserves user records.

### Content Library item

```text
create(enabled) <-> disabled
```

Disabled source is omitted from normal endpoint; inserted template copies remain.

### User and category

```text
Active <-> Inactive
```

Rows are never deleted by API. Historical foreign-key references remain. Inactivity is administrative metadata rather than an enforced access control in the current middleware.

## 9. Data-flow diagrams

### Admin disables Rating

```text
AdminElementManagement
 -> PATCH /api/admin/elements/elements.rating
 -> requireAdminRole
 -> system_element_settings update
 -> admin_audit_log insert
 -> SystemConfigContext refresh
 -> StudioPanels isElementEnabled filter
 -> Rating disappears from new-element list
Existing template/render + crafted backend payload remain unaffected
```

### Create and approve template

```text
TemplateBuilder -> apiService -> POST /api/templates
 -> workflowService.saveTemplateDraft transaction -> SQLite
 -> POST /submit -> validation + hierarchy
 -> Pending Approval + audit + notification
ApprovalsPage -> POST /approve
 -> exact assignee guard -> Approved + version snapshot
 -> replacement archive + audit + author notification
```

### Create/send/return

```text
Approved template -> POST /reports -> report + snapshot reference + values + audit
Fill modal -> PUT/complete -> validation/calculations + values + audit
Send modal -> POST /send -> optional sender signature -> Sent + notification
Reviewer -> POST /return -> signatures inactive + Returned + audit + author notification
Author edit -> Completed -> send again
```

### Sign

```text
ReportSignatureModal -> profile/payload -> POST /reports/:id/sign
 -> policy + actor + prerequisite checks
 -> canonical SHA-256 + verification ID
 -> report_signature_audit
 -> report Signed (receiver) / Completed (sender Draft)
 -> report audit -> author notification
 -> optional dynamic workflow task advancement
```

### Insert Standard Pack / Content item / My Pack

```text
Published Standard Pack API / enabled Content API / visible Content Pack API
 -> preview/select in Studio
 -> deep copy/config conversion + new component/section IDs
 -> builder local state
 -> normal template save flattens copy into sections/fields JSON
No foreign key from template to source Pack/content item
```

## 10. Validation inventory

### Template frontend/backend

- name required; at least one section/component (backend allows either; frontend requires section and input component);
- registered type; unique interactive field keys;
- select/radio options;
- table columns/unique keys/formulas/references/cycle detection/row bounds/aggregate compatibility;
- rating min < max;
- signature Sender/Receiver role and optional signature type;
- heading level, paragraph unsafe markup, divider preset, spacer bounds, no local image path, info-box preset;
- repeating-group min/max, unique child keys, no nested repeating group;
- KPI value type; regex compilation;
- frontend workflow step assigned-role shape check.

### Report

- Approved template only; author; not Signed;
- completion required-visible fields; calculations merged;
- canonical value alias conflict detection;
- send recipient exists/non-self/state;
- return/reject reason and exact assignment/state/policy;
- signing actor/role/prerequisite/policy/replay.

### Admin/Packs/content/users

- Standard Pack name, unique case-insensitive name, at least one item;
- My Pack name at route level; no duplicate constraint/minimum component validation;
- Content item name/value/category/type on create; DB content-type CHECK;
- user required fields, no extra Admin through service, DB unique email/role CHECK;
- category create name, DB unique name; update lacks nonblank validation;
- explicit status allowlists in routes.

### Upload/import

- generic MIME allowlist/10 MB; signature binary/attestation/5 MB/dimensions;
- import route DOCX/XLS/XLSX/JSON only, 10 MB; JSON schema validator; temp cleanup.

## 11. Major error/edge behavior

- Backend unavailable: `ApiError NETWORK_ERROR` 503; core startup keeps cached local data; config silently keeps defaults.
- Inactive user: still authenticates and acts; normal static directory may still offer them.
- Disabled category: historical templates remain; normal API omits status; builder attempts to filter but may not know status.
- Disabled Pack/content/element: source removed from some insertion UI, snapshots persist.
- Signed edit: backend `LOCKED`.
- Rejected resend: `INVALID_STATUS`; raw update still changes values.
- Duplicate submit: first may move Pending; second save resets it Draft and resubmits, producing repeated events.
- Missing approval role: code falls back to hardcoded demo IDs/names, even if no matching row was returned.
- No available Studio module: rail can be empty; builder drawer selection has limited graceful fallback.
- No available Pack/content: explicit empty states.
- Unauthorized Admin: `403 FORBIDDEN` JSON.

Sources: `server/services/workflowService.ts`, `dynamicWorkflowService.ts`, `componentRegistry.ts`, `adminService.ts`, `assetRoutes.ts`, `src/utils/builderValidation.ts`, `src/shared/workflow`, `src/shared/template-rules`.
