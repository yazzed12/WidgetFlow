# WidgetFlow Demo, Seed Data, and Reset Specification

This document describes the deterministic demo dataset defined by `server/db/seed.ts`, the identity simulation used by the UI and API, and the actual reset boundary. It distinguishes the intended seed baseline from whatever mutable rows may happen to be present in the checked-in SQLite file.

## 1. Demo identity model

WidgetFlow has no login, password, session, token, or production identity provider. `src/components/layout/RoleSwitcher.tsx` lets a presenter choose one of four demo users. `src/services/apiService.ts` sends that selection as `X-Demo-User-Id`; `server/middleware/demoUser.ts` loads the matching user and exposes it as `req.user`.

If the header is absent or unknown, the middleware silently falls back to Ahmed (`user-employee`). A caller can therefore impersonate any known ID merely by setting a header. This is **demo identity simulation, not production authentication**.

The selected identity is saved under `widgetflow_demo_user_id`. The broader `AppContext` demo cache uses `widgetflow_demo_state_v1`; `apiService` also knows an older/different `widgetflow_app_state_v1` key. The direct identity key normally masks that mismatch.

Sources: `src/components/layout/RoleSwitcher.tsx`, `src/services/apiService.ts`, `src/context/AppContext.tsx`, `server/middleware/demoUser.ts`.

## 2. Seeded users

| ID | Name | Role | Department | Manager | Status |
|---|---|---|---|---|---|
| `user-employee` | Ahmed Hassan | Employee | Operations | Sarah (`user-manager`) | Active |
| `user-manager` | Sarah Mohamed | Manager | Operations Management | Omar (`user-director`) | Active |
| `user-director` | Omar Ali | Director | Executive Management | None | Active |
| `user-admin` | Lina Nasser | Admin | Platform Administration | None | Active |

`DEMO_USERS` remains the startup fallback, but the normal frontend refreshes users and roles from `/api/users`. Only Active database users join role-switching and recipient selection; role/status edits are therefore consumed without rewriting historical domain rows.

## 3. Seeded categories

Four active categories are recreated:

1. Finance
2. HR & Operations
3. Analytics & BI
4. Technology

Sources: `server/db/seed.ts`, `src/data/initialData.ts`.

## 4. Seeded templates

The seed creates 15 templates. Thirteen are approved catalog templates and two are pending approval requests.

| ID | Template | Category | Creator | Version | Status / approval |
|---|---|---|---|---|---|
| `tpl-bi-1` | Executive KPI Dashboard | Analytics & BI | Omar | 3.0 | Approved |
| `tpl-bi-2` | Campaign Performance Report | Analytics & BI | Sarah | 1.0 | Approved |
| `tpl-bi-3` | Regional Performance Analysis | Analytics & BI | Ahmed | 1.0 | Approved |
| `tpl-dev-1` | System Health Dashboard | Technology | Ahmed | 1.0 | Approved |
| `tpl-dev-2` | Incident Report | Technology | Sarah | 1.0 | Approved |
| `tpl-dev-3` | Deployment Readiness Checklist | Technology | Ahmed | 1.0 | Approved |
| `tpl-fin-1` | Monthly Revenue Report | Finance | Ahmed | 1.2 | Approved |
| `tpl-fin-2` | Budget Variance Analysis | Finance | Sarah | 1.0 | Approved |
| `tpl-fin-3` | Expense Analysis Report | Finance | Omar | 2.0 | Approved |
| `tpl-hr-1` | Weekly Operations Report | HR & Operations | Ahmed | 1.1 | Approved |
| `tpl-hr-2` | Employee Performance Review | HR & Operations | Sarah | 1.0 | Approved |
| `tpl-hr-3` | Resource Capacity Plan | HR & Operations | Ahmed | 1.0 | Approved |
| `tpl-pur-1` | Purchase Request | Finance | Ahmed | 1.0 | Approved |
| `tpl-req-1` | Weekly Operations Pulse | HR & Operations | Ahmed | 1.0 | Pending Approval; Sarah is approver |
| `tpl-req-2` | Executive Delivery Health | Analytics & BI | Sarah | 1.0 | Pending Approval; Omar is approver |

Sections, fields, tags, version snapshots, rules, calculations, theme JSON, comments and audit history are inserted by `server/db/seed.ts`, using frontend seed shapes from `src/data/initialData.ts` where imported.

## 5. Seeded reports

Five report instances exercise the primary lifecycle states:

| ID | Template | Creator | Recipient | Status | Demonstrates |
|---|---|---|---|---|---|
| `report-1` | Weekly Operations Report | Ahmed | Sarah | Sent | Awaiting manager review |
| `report-2` | Budget Variance Analysis | Sarah | Omar | Sent | Awaiting director review |
| `report-3` | Monthly Revenue Report | Ahmed | Sarah | Signed | Completed legacy two-party signature flow |
| `report-4` | Weekly Operations Report | Ahmed | Sarah | Returned | Editable correction/resubmission path |
| `report-5` | System Health Dashboard | Ahmed | None | Draft | In-progress authoring |

The seed also inserts report field values, comments where defined, one legacy `digital_signatures` row, 13 report-audit rows, and typed signature profiles for all four users.

## 6. Feature, element, and system configuration baseline

All nine feature flags are enabled:

- `studio.templates`
- `studio.elements`
- `studio.content_library`
- `studio.text`
- `studio.sections`
- `studio.data_fields`
- `studio.themes`
- `studio.workflow`
- `studio.packs`

All 23 registered elements are enabled. Their keys and categories are cataloged in `TEMPLATE_STUDIO.md`.

Eight rows are stored in `system_general_settings`: `org_name`, `platform_name`, `default_template_version`, `allow_rejection`, `allow_return`, `digital_signature`, `template_governance`, and `demo_mode`. The API additionally publishes four effective workflow aliases (`workflow.report_rejection`, `workflow.return_for_changes`, `workflow.digital_signature`, and `workflow.template_governance`).

Sources: `server/db/seed.ts`, `src/data/initialData.ts`, `server/routes/apiRouter.ts`, `server/services/adminService.ts`.

## 7. Seeded Packs and Content Library

### 7.1 Standard Packs

Five organization Standard Packs are created in `template_packs`, with 36 total snapshot items in `template_pack_items`. The baseline includes a mix of Draft, Published, and Disabled lifecycle examples. The authoritative pack names, descriptions, status, owner, and item payloads come from `server/db/seed.ts`.

### 7.2 Built-in system Packs

Twenty built-in `content_packs` are seeded from `src/data/builtInContentPacks.ts`. These are system-owned, read-only Pack recipes consumed in Template Studio. Their sections and components are stored as JSON snapshots.

### 7.3 Content Library

Seven organization-managed `content_library_items` are seeded. These are individual reusable snippets rather than multi-item Standard Packs or personal My Packs. The six allowed content types are enforced by the database: `Heading`, `Text Block`, `Disclaimer`, `Instruction`, `Label`, and `Section Intro`.

Sources: `server/db/seed.ts`, `src/data/initialData.ts`, `src/data/builtInContentPacks.ts`, `server/db/schema.sql`.

## 8. Workflow seed

One active-capable workflow definition/version is seeded for `tpl-req-1`. It demonstrates conditional routing, including a condition expressed against `total > 50000`. That field name does not clearly match the template's persisted schema, so the conditional path may not execute as a presenter expects. The Template Studio workflow editor does not persist its local definition through the workflow API, making the seeded workflow the most concrete demonstration of the backend engine.

Sources: `server/db/seed.ts`, `server/services/workflowService.ts`, `src/components/template-builder/TemplateBuilder.tsx`.

## 9. Notification and audit baseline

The seed inserts:

- one unread `approval_required` notification for Sarah, linked to `tpl-req-1`;
- one template `Submitted` audit record for that request;
- 13 report audit events spanning creation, completion, sending, signing, return and editing;
- a baseline Admin audit event describing system initialization.

The checked-in database may contain additional audit rows created during earlier demo sessions. Those are mutable runtime data, not part of the canonical seed contract.

## 10. Demo reset flow

Endpoint: `POST /api/demo/reset`.

```text
Reset button
  -> apiService.resetDemo()
  -> POST /api/demo/reset
  -> seedDatabase()
  -> frontend clears its cached demo state
  -> selected identity becomes Ahmed
  -> AppContext reloads API-backed templates, reports and notifications
```

The backend calls the same `seedDatabase()` function used during server startup. The frontend then removes the context cache and identity selection and reloads the application state.

Sources: `server/routes/apiRouter.ts`, `server/db/seed.ts`, `src/context/AppContext.tsx`, `src/services/apiService.ts`.

## 11. What reset actually resets

The reset recreates the seeded users, categories, templates and their nested records, reports and their field/comment/audit/signature data, notifications, configuration tables, Admin audit baseline, Standard Packs/items, Content Library items, signature profiles, workflow definitions/versions, and system-owned Content Packs.

It does **not** fully clear:

- `workflow_instances`, `workflow_tasks`, or `workflow_history`;
- user-owned `content_packs` (My Packs);
- `template_assets` rows;
- uploaded asset files under the server upload directory;
- import temporary files if an interrupted process left them behind.

Because foreign keys are temporarily disabled while seed deletion occurs, retained workflow executions or user Packs can refer to definitions/users that were deleted and recreated, or to non-seeded users that no longer exist. This is an implementation defect, not an intended product guarantee.

## 12. Startup behavior

`server/index.ts` initializes the database and then calls `seedDatabase()` unconditionally. Every backend process restart therefore behaves like a partial demo reset and discards mutable core application data. WidgetFlow, in its current repository form, is a resettable demo rather than a persistent deployment.

## 13. Suggested presentation flow

### Main demonstration

1. Start as Ahmed and show his role-specific Dashboard.
2. Open the approved Template catalog and create a report from a template.
3. Complete required fields, send it to Sarah, and observe the audit/notification effects.
4. Switch to Sarah, open the received report, comment, then demonstrate Return for Changes.
5. Switch back to Ahmed, edit and resend.
6. Demonstrate sender/receiver signatures on a report with signature components and show the locked Signed result.

### Template-governance demonstration

1. As Ahmed, create a Draft in Template Studio and submit it.
2. Switch to Sarah, open Template Approvals, comment, and approve or reject.
3. Explain that Sarah-created templates route to Omar and Omar-created templates approve directly.

### Admin configuration demonstration

1. Switch to Lina and enter Admin Control Center.
2. Disable an element or Studio feature and show the Admin audit entry.
3. Return to the normal UI and show the configuration-driven filtering after refresh.
4. Toggle return/rejection/signature policy and demonstrate that both UI and relevant endpoints enforce the workflow policies.

### Pack demonstration

1. Publish a Standard Pack as Lina.
2. Consume its snapshot in Template Studio.
3. Create a personal My Pack as a normal user and insert it into another template.
4. Explain that later edits to the source Pack do not mutate already inserted template content.

### Short fallback demonstration

Use the five seeded reports: show Draft, Sent, Returned, and Signed states; open one approval request; then visit Admin configuration and the audit log. This avoids depending on freshly created data.

## 14. Demo caveats for presenters

- Do not present the role switcher as authentication.
- A server restart resets much of the demonstration state.
- Admin-created users are not fully integrated into normal-app identity and recipient lists.
- Dynamic workflow design is partially implemented; use the classic approval/report paths for a reliable live demo.
- PDF import is not implemented. The visible import dialog only performs local JSON import; backend DOCX/XLS/XLSX analysis has no connected visible caller.
- My Packs and uploaded files can survive Demo Reset, so a reset is not a complete clean-room reset.

## 15. Source map

- Seed orchestration: `server/db/seed.ts`
- Seed object definitions: `server/db/seed.ts`, `src/data/initialData.ts`
- Built-in system Packs: `src/data/builtInContentPacks.ts`
- Schema/constraints: `server/db/schema.sql`
- Startup reset behavior: `server/index.ts`
- Demo identity middleware: `server/middleware/demoUser.ts`
- Reset endpoint: `server/routes/apiRouter.ts`
- UI identity switcher: `src/components/layout/RoleSwitcher.tsx`
- Client persistence and reset: `src/context/AppContext.tsx`
- API identity header: `src/services/apiService.ts`
