# WidgetFlow Master Specification

**Code baseline inspected:** 28 August 2026 workspace state  
**Authority:** implemented source code and the initialized SQLite database, not marketing copy  
**Status vocabulary:** **Fully Functional**, **Partially Implemented**, **UI Only / Not Fully Functional**, **Backend Only**, **Deprecated**, and **Not Implemented**

This is the entry point to the definitive WidgetFlow specification. It summarizes the complete product and links to evidence-heavy domain documents:

- [Product and feature inventory](PRODUCT_AND_FEATURES.md)
- [Roles, permissions, navigation, dashboards, and journeys](USER_ROLES_AND_PERMISSIONS.md)
- [Workflows, business rules, transactions, and state machines](WORKFLOWS_AND_STATE_MACHINES.md)
- [Template Studio and the 23-element registry](TEMPLATE_STUDIO.md)
- [Packs and Content Library](PACKS_AND_CONTENT_LIBRARY.md)
- [Admin Control Center and configuration](ADMIN_CONTROL_CENTER.md)
- [Frontend architecture and 79-page/component catalog](FRONTEND_ARCHITECTURE.md)
- [Backend architecture and file catalog](BACKEND_ARCHITECTURE.md)
- [Complete 31-table SQLite dictionary](DATABASE_SPECIFICATION.md)
- [Complete 75-endpoint API reference](API_REFERENCE.md)
- [Notifications and all three audit systems](NOTIFICATIONS_AND_AUDIT.md)
- [Seed data, demo identity, reset, and demo presentation](DEMO_AND_SEED_DATA.md)
- [Known issues, security notes, deprecated artifacts, and technical debt](KNOWN_ISSUES_AND_TECHNICAL_DEBT.md)

## 1. Executive project description

WidgetFlow is a demo business-report authoring, governance, completion, review, and signing system. It solves the problem of teams creating inconsistent operational documents in disconnected tools. It lets an organization configure reusable report templates; lets employees, managers, and directors build governed templates; turns approved templates into version-bound report instances; routes those instances for review; records comments, returns, rejections, and signatures; and gives a separate Admin identity control over the creator experience and organization-wide policy.

The product has four implemented identities:

- **Employee** authors templates and reports, submits templates to a Manager, and sends reports to a Manager.
- **Manager** has the same authoring capabilities, approves Employee template requests, submits their own template requests to a Director, reviews Employee reports, and can return, reject, or sign them.
- **Director** authors and directly publishes templates, approves Manager template requests, can see every report in list queries, and reviews reports sent to them. Director visibility is broader than ownership but individual detail endpoints do not enforce that distinction.
- **Admin** enters a separate Control Center. Admin configures Studio modules, element availability, standard Packs, organization Content Library items, users, categories, and workflow policies. The Admin UI does not participate in ordinary template/report workflow. The backend does not categorically forbid an Admin from calling ordinary endpoints, but the UI keeps Admin separate.

### Core object distinctions

| Concept | Meaning | Persistence | Effect of later source changes |
|---|---|---|---|
| Report Template | Reusable schema: metadata, sections, components, rules, calculations, theme, status, and version | `report_templates` plus sections, fields, tags, versions | Approved templates are immutable through normal save; a new version is a new draft/template row |
| Report Instance | A filled business record created from one approved template version | `reports`, `report_field_values`, report audit/signature tables | Holds `template_version_id` and hydrates an immutable JSON snapshot where available |
| Standard Pack | Admin-defined reusable set of fields/elements/content | `template_packs`, `template_pack_items` | Insertion copies item configuration into a template; no live link remains |
| My Pack / user Content Pack | User-owned snapshot of one or more sections/components | `content_packs` with `source_type='user'` | Insertion deep-copies sections/components; later pack edits do not update existing templates |
| Built-in Content Pack | Organization/system reusable multi-section pack seeded from source data | `content_packs` with `source_type='system'` | Read-only to users; insertion is a snapshot |
| Content Library item | Admin-managed single organization-standard heading/text/disclaimer/instruction/label/section intro | `content_library_items` | Insertion creates a new component snapshot; disabling the source does not remove inserted copies |

The repository contains two distinct concepts historically labeled “content”: `content_packs` is the multi-component system/My Packs model used by the Studio Content Library panel, while `content_library_items` is the Admin-managed single-snippet library and `template_packs` is the separate Admin Standard Packs model. The UI also has a dedicated Packs rail. These are not interchangeable tables or APIs.

### Normal user journey

```text
Choose/create template
  -> save Draft
  -> submit (Employee -> Manager; Manager -> Director; Director -> Approved)
  -> approver approves or rejects
  -> Approved template version snapshot published
  -> user creates Draft report instance
  -> fills/saves/completes report
  -> sends to permitted reviewer (UI hierarchy)
  -> reviewer comments, returns, rejects, or signs
  -> signature records hash + verification ID and locks final Signed report
```

When `template_governance=false`, submission skips the pending approver and sets the template to Approved directly. When return, rejection, or digital signature policies are disabled, the relevant report UI controls disappear and classic backend endpoints return `403 POLICY_DISABLED`. Existing historical records remain unchanged.

Sources: `src/App.tsx`, `src/context/AppContext.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/reports/SendReportModal.tsx`, `server/services/workflowService.ts`, `server/services/adminService.ts`, `server/repositories/dbRepository.ts`, `server/db/schema.sql`.

## 2. System scope and architecture

```text
React 19 + TypeScript + Tailwind 4 UI
  -> AppContext (business/UI state) + SystemConfigContext (feature/policy state)
  -> apiService (JSON envelope + X-Demo-User-Id)
  -> Vite /api proxy to localhost:3001
  -> Express 5
  -> demoUserMiddleware
  -> API router / controllers
  -> workflowService | dynamicWorkflowService | adminService | import service
  -> dbRepository / direct prepared SQL / better-sqlite3
  -> server/data/widgetflow.db (WAL, foreign_keys enabled outside seed)
```

The frontend uses view-state routing rather than React Router. Admin navigation and normal navigation are separate state machines. Global modals/drawers are mounted by `App.tsx`. The server starts by applying idempotent schema plus compatibility migrations and then **unconditionally reseeds** the database on every process start.

Sources: `package.json`, `vite.config.ts`, `src/main.tsx`, `src/App.tsx`, `src/services/apiService.ts`, `server/index.ts`, `server/db/database.ts`, `server/db/seed.ts`.

## 3. Current roles and authorization summary

| Action | Employee | Manager | Director | Admin UI |
|---|---:|---:|---:|---:|
| Create/edit own non-approved template | Yes | Yes | Yes | No normal UI |
| Submit template | To Manager | To Director | Direct publish | No normal UI |
| Approve/reject template | No | Assigned Employee request | Assigned Manager request | No |
| Create report from Approved template | Yes | Yes | Yes | No normal UI |
| Send report (frontend recipient choices) | Manager | Director | No role option | No |
| Edit report | Own, except Signed | Own, except Signed | Own, except Signed | Backend would allow own |
| Review a Sent report | If assigned by raw API | If assigned | If assigned | Backend would allow if assigned |
| Return/reject/sign | Assigned recipient; policy/state guards | Same | Same | No normal UI |
| See report list | Own/received | Own/received | All | Admin UI does not expose |
| Manage Studio/config/users/categories | No | No | No | Yes |
| Create Standard Pack / Content Library item | No | No | No | Yes |
| Create My Pack | Yes | Yes | Yes | Studio unavailable in Admin UI |

The backend enforces exact assigned approver IDs for template decisions, author ownership for report editing/sending, assigned recipient for classic return/reject, Admin role for `/api/admin/*`, and Active status for access/new assignments. It does not fully enforce normal report recipient hierarchy or participant authorization on every report/template detail and comment read. See the full matrix in [USER_ROLES_AND_PERMISSIONS.md](USER_ROLES_AND_PERMISSIONS.md).

## 4. Lifecycle summary

### Template lifecycle

```text
new -> Draft
Draft/Rejected/Pending Approval --save--> Draft
Draft --submit Employee/Manager with governance--> Pending Approval
Pending Approval --assigned approve--> Approved
Pending Approval --assigned reject(reason)--> Rejected
Draft --submit Director OR governance disabled--> Approved
Approved --create version--> new Draft at v<major>.<minor+1>
older same-name+category Approved --new replacement approved--> Archived
```

The database also allows `Superseded`, but active services never set it. Frontend `TemplateStatus` omits both `Archived` and `Superseded`, an identified typing gap.

### Classic report lifecycle

```text
Approved Template -> Draft
Draft --save--> Draft
Draft --complete--> Completed
Draft|Completed|Returned|Sent --send--> Sent
Returned --author edit--> Completed --send--> Sent
Sent --assigned reviewer return(reason)--> Returned
Sent --assigned reviewer reject(reason)--> Rejected [terminal in service]
Sent --receiver sign--> Signed [locked]
Draft --sender sign--> Completed
```

`sendReport` currently permits a report already in `Sent` to be sent again, which creates another audit/notification and may attempt another workflow instance. Dynamic workflows add instance/task states and may finish a report as `Completed` rather than `Signed` when the last action does not require a signature.

## 5. Configuration model

There are **9 feature flags**, all enabled in the seed:

`studio.templates`, `studio.elements`, `studio.content_library`, `studio.packs`, `studio.text`, `studio.sections`, `studio.data_fields`, `studio.themes`, `studio.workflow`.

They hide Studio rail entries. The current backend does not enforce these module flags against template payloads or Pack/content endpoints. `AdminStudioConfig` accidentally omits `studio.packs` from its eight-module preview even though Feature Management and the actual rail include it.

There are **23 element settings**, one for each registered element type. They filter the Studio Elements toolbox and the Admin Pack picker. They do not invalidate existing templates, strip existing components, or block a crafted template submission on the backend.

There are **8 stored general settings**: `org_name`, `platform_name`, `default_template_version`, `allow_rejection`, `allow_return`, `digital_signature`, `template_governance`, and `demo_mode`. Four computed aliases—`workflow.report_rejection`, `workflow.return_for_changes`, `workflow.digital_signature`, `workflow.template_governance`—are added to the effective response but are not additional rows.

`org_name`, `platform_name`, `default_template_version`, and `demo_mode` are largely configuration/display values; the report/template services hardcode `v1.0` in several paths and demo identity remains active regardless of the `demo_mode` value.

## 6. Feature and implementation status summary

| Major capability | Status | Evidence summary |
|---|---|---|
| Template browse/search/category/tag filters | Fully Functional | API-backed templates; client filtering and responsive views |
| Template Studio authoring | Fully Functional with gaps | Drag/drop, sections, properties, preview, theme, rules/calculations persistence; some config only client-enforced |
| Template governance | Fully Functional | Transactional submit/approve/reject, assigned approver, audit, notifications, policy bypass |
| Template immutable versions | Partially Implemented | Snapshots bind reports; “new version” is a new template row; legacy statuses/type mismatch |
| Classic report workflow | Fully Functional with issues | Create, save, complete, send, return, reject, sign, audit, notifications |
| Dynamic workflow engine | Partially Implemented | Real tables/services/APIs and automatic start, but no public action endpoint and limited UI integration |
| Digital signatures | Fully Functional with two models | New component audit/profile model plus legacy `digital_signatures`; asset controls and hashing implemented |
| Standard Packs | Fully Functional | Admin CRUD/status, user discovery, snapshot insertion |
| My Packs / built-in Content Packs | Fully Functional | Owner-protected CRUD and component addition; deep-copy insertion |
| Admin single-item Content Library | Fully Functional | CRUD/status/audit and user snapshot insertion |
| Feature and element management | Partially Implemented | Real configuration and UI filtering; no comprehensive backend enforcement |
| User management | Fully Functional (demo identity) | Admin role/status/details, self-protection, active-only assignment/access, audit, database-backed consumption |
| Category management | Partially Implemented | Admin CRUD/status; normal categories API omits status and inactive filtering |
| Notifications | Fully Functional | Eight real types, per-user read/read-all, entity navigation |
| Template/report comments | Partially Implemented | Persisted and notified; context display state and authorization gaps |
| DOCX/XLSX/JSON import | Backend Only for document upload; JSON UI functional | Backend analyzer exists; visible modal marks Word/Excel coming soon and does not call it |
| PDF import | UI Only / Not Fully Functional | Presented as coming soon; backend rejects PDF |
| Admin overview health | UI Only / Not Fully Functional | Counts are API-backed, but “Operational” and “100% Online” are hardcoded |
| Engine Proof page | UI Only / Not Fully Functional | Renderable view key, no sidebar navigation, demonstrator data/cards |

## 7. Data ownership/source-of-truth map

| Domain | Authoritative store | Client/cache behavior |
|---|---|---|
| Users for backend decisions | SQLite `users` | Normal UI exposes static `DEMO_USERS`, not the admin-created directory |
| Selected demo identity | `widgetflow_demo_user_id` and `widgetflow_demo_state_v1` localStorage | Sent as `X-Demo-User-Id`; invalid IDs silently fall back to Ahmed |
| Templates/reports/notifications | SQLite | Startup first loads local demo snapshot, then API replaces it; localStorage mirrors API state afterward |
| Approval records/request comments/report comments arrays | localStorage/static initial data in `AppContext` | Modal components often fetch directly, but dashboard approval metrics can remain stale/local |
| Categories | SQLite after API refresh | initial static categories appear before sync; normal API omits inactive status |
| Feature/element/general config | SQLite system tables | `SystemConfigContext` falls back to permissive defaults on error |
| Standard Packs | SQLite `template_packs*` | Copied into builder state on insertion |
| Built-in/My Packs | SQLite `content_packs` JSON | Copied into builder state; user packs owner-scoped |
| Content Library items | SQLite `content_library_items` | Copied into builder components |
| Signatures | SQLite profile/audit tables and files under `server/uploads` | signature modal resolves active profile and report audit records |

Contrary to an ideal “no business localStorage” architecture, the current application stores templates, reports, notifications, comments, and approval records in `widgetflow_demo_state_v1`. API-backed collections overwrite those three core collections after successful sync, but the local copy remains a startup/offline display fallback. Most business mutations do not fall back to local state; notification read operations do.

## 8. Database and API totals

- **SQLite tables:** 31 application tables.
- **Indexes:** nine named performance indexes from `schema.sql`, plus SQLite automatic primary/unique indexes.
- **Mounted API operations:** 75 (including both `/api/template-approvals` and `/api/templates/approvals` aliases).
- **Route modules:** seven (`apiRouter`, admin, asset, intake, report, template, workflow).
- **Roles:** four.
- **Feature flags:** nine.
- **Stored system settings:** eight; four response aliases.
- **Element types:** 23.
- **Notification types:** eight.

See [DATABASE_SPECIFICATION.md](DATABASE_SPECIFICATION.md) and [API_REFERENCE.md](API_REFERENCE.md).

## 9. Security and demo model

This is **demo identity simulation, not production authentication**. Every `/api` request passes through `demoUserMiddleware`, which trusts `X-Demo-User-Id`; there are no passwords, sessions, signed tokens, expiry, CSRF controls, or tenant boundary. Missing or unknown IDs become the Employee fallback. Admin protection is meaningful only within the demo: setting the header to `user-admin` grants Admin endpoints.

Positive backend controls include exact Admin guards, template assigned-approver checks, report author/recipient checks on workflow mutations, signature asset binary validation, file size/MIME allowlists, ownership checks for My Packs, immutable approved-template save protection, prepared SQL, and signature hashing. Production deployment would need a real identity provider, server-issued principal, active-user enforcement, tenant scoping, comprehensive resource guards, rate limits, upload scanning, and removal of demo fallback.

## 10. Demo presentation flow

1. Start as Ahmed; show the data-driven dashboard and approved template library.
2. Open Template Studio; add sections/elements, demonstrate preview/theme, insert a Standard Pack and a Content Library/My Pack snapshot, then save Draft.
3. Submit as Ahmed; switch to Sarah; open Template Approvals, discuss/comment, approve.
4. Switch back to Ahmed; use the approved template, fill required fields, complete, sign-and-send to Sarah.
5. Switch to Sarah; show review comments and contrast Return (revisable) with Reject (terminal), then sign a fresh Sent report and show verification/audit history.
6. Switch to Lina; demonstrate Feature Management, Element Management, Pack and Content Library management, Users/Categories, policy toggles, and Admin Audit.
7. Disable Rating or Return; switch to a normal identity and demonstrate UI disappearance plus backend policy behavior. Re-enable afterward.

Short backup: Ahmed opens a seeded Sent report; Sarah signs it; Lina shows the resulting configuration/audit surfaces. Avoid Word/Excel/PDF import and Engine Proof in the main demo because their user-facing integration is incomplete.

## 11. Most important business rules

1. Only an Approved template can create a report.
2. Approved templates cannot be overwritten; versioning creates a new Draft.
3. With governance enabled, Employee templates route to the first Manager and Manager templates to the first Director; Director publishes directly.
4. Only the exact assigned approver can approve/reject a Pending Approval template.
5. Only a report author may edit or send that report; Signed reports are locked.
6. Classic return/reject requires the exact assigned reviewer and status Sent; reasons are mandatory.
7. Rejection is terminal in the classic service; return is a revision loop.
8. Receiver signing cannot be performed by the author on their own report, and required sender signatures must exist first.
9. Returning a report supersedes active component signature audit records.
10. Admin flags hide creator capabilities but generally do not reject crafted payloads at the backend.
11. Pack and Content Library insertion is snapshot-copy behavior, never a live reference.
12. All identity/authorization statements must be read in the context of trusted demo headers.

## 12. Glossary

- **Admin:** separate platform configuration identity, seeded as Lina Nasser.
- **Approval Inbox:** Manager/Director view of templates whose `requested_approval_from_user_id` equals the acting user.
- **Audit History:** append-only-ish domain event rows for templates, reports, workflows, or Admin configuration; no edit/delete API.
- **Content Library:** ambiguous UI term. In the Studio it can mean multi-section `content_packs`; Admin Content Library means single `content_library_items` snippets.
- **Data Field:** curated client-side business field definition from `dataFieldsLibrary.ts`, inserted as a component snapshot.
- **Digital Signature:** either a component-level role-specific signature audit record or the legacy one-per-report signature row.
- **Element:** one of 23 registered template component types.
- **Feature flag:** a `system_feature_settings` row controlling a Studio navigation module.
- **My Pack:** user-owned `content_packs` record visible only to its owner plus all system packs.
- **Pack:** reusable snapshot source, not a template and not a report. Standard Packs use `template_packs`; Content Packs use `content_packs`.
- **Recipient/Reviewer:** user selected to receive a report; the UI restricts hierarchy, while backend classic send accepts any existing non-self user.
- **Report Instance:** mutable filled record bound to an approved template version until terminal signature/rejection.
- **Report Template:** reusable schema and governance object.
- **Return for Changes:** non-terminal reviewer decision that sends a report back for author revision.
- **Rejection:** terminal classic reviewer decision with mandatory reason.
- **Standard Pack:** Admin-authored Published `template_packs` record available organization-wide.
- **System Configuration:** effective union of feature, element, and general setting tables plus workflow aliases.
- **Template Request:** a creator-owned template in Draft, Pending Approval, Rejected, or historically Approved state as shown in My Requests.
- **Template Studio:** full-screen template authoring workspace with rail, drawer, canvas, properties, preview, validation, and save/submit actions.
- **Template Version:** immutable JSON snapshot in `report_template_versions`; reports reference it by ID.
- **Verification ID:** generated `SIG-WF-2026-*` identifier uniquely stored for component signatures.
- **Workflow Definition/Version/Instance/Task:** configurable routing schema, immutable snapshot, per-report execution, and assigned actionable step.

## 13. Final master summary

**PRODUCT:** governed business-report templates and report review/signature workflow.  
**USERS:** Employee, Manager, Director, Admin.  
**CORE OBJECTS:** templates, immutable template versions, report instances/values, signatures, comments, notifications, Packs, Content Library items, workflows, configuration, audits.  
**CORE WORKFLOWS:** template draft/submission/approval/rejection/publication/versioning and report draft/completion/send/return/reject/sign.  
**ADMIN MODEL:** separate role-gated Control Center; configuration affects normal users, mostly through frontend filtering plus selected backend policy guards.  
**TECH STACK:** React 19, TypeScript 6, Vite 8, Tailwind 4, Lucide, Express 5, better-sqlite3.  
**DATABASE:** SQLite in WAL mode at `server/data/widgetflow.db`, 31 tables, startup schema/migrations plus unconditional seed.  
**API:** 75 JSON/file operations under `/api`, standardized success/error envelopes except streamed assets.  
**SECURITY MODEL:** useful resource/role checks but header-trusted demo identity; not production authentication.  
**DEMO MODEL:** four fixed switchable identities; localStorage remembers identity and cached display state; `/api/demo/reset` reseeds most but not all persisted artifacts.  
**CURRENT STATUS:** strong interactive demo with real SQLite workflows; partial dynamic-workflow/UI integration and several authorization/configuration consistency gaps.  
**PRIMARY EVIDENCE:** `src/`, `server/`, `package.json`, `vite.config.ts`, and actual `server/data/widgetflow.db` schema.
