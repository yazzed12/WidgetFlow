# Product and Complete Feature Inventory

This catalog records implemented product surfaces. “Database” names are authoritative tables; “side effects” calls out notifications/audits. Common errors use `{success:false,error:{code,message}}`.

## 1. Template discovery and governance

### Feature: Approved Template Library

- **Purpose / actors:** all normal roles browse Approved templates and create reports.
- **UI:** Report Templates page; global search; sidebar category tree; Template detail modal.
- **Frontend:** `src/pages/TemplatesPage.tsx`, `src/components/templates/TemplateCard.tsx`, `TemplateDetailModal.tsx`, `src/components/layout/Navbar.tsx`.
- **Backend/API:** `GET /api/templates` with `status`, `categoryId`, `search`; `GET /api/templates/:id`.
- **Database:** `report_templates`, tags, sections, fields, categories.
- **Logic/actions:** page filters to Approved; search covers name/description/tags client-side; category and tag chips; grid/list mode; Preview/Use Template.
- **Permissions:** list endpoint is open to every demo principal. Detail has no resource guard.
- **Dependencies/status:** category/template hydration. **Fully Functional.** Archived/Superseded rows are not shown because the page selects Approved.
- **Errors/empty:** client empty state; connectivity error is held in `AppContext.apiError` but not consistently rendered on every page.
- **Side effects:** none until “Use Template.”

### Feature: Create and Save Template Draft

- **Purpose / actors:** Employee, Manager, Director create reusable schemas; Admin has no normal authoring UI.
- **UI/frontend:** sidebar Create Template; `TemplateBuilder.tsx`, `BuilderHeader`, `BuilderCanvas`, `BuilderSection`, `BuilderComponent`, `PropertiesPanel`.
- **API/database:** `POST /api/templates`, `PUT /api/templates/:id`; writes template, tags, sections, fields; creates `template_audit_history` action `Created` for a new row.
- **Logic:** category resolves by ID or name, otherwise silently falls back to `cat-finance`; status is forced to Draft; fields are flattened and configuration is stored in `validation_rules_json`; rules/calculations/theme use JSON columns. The whole save is a SQL transaction.
- **Permissions:** backend accepts any demo role. Existing ownership is **not checked**; any caller knowing a non-Approved template ID can overwrite it. Approved rows return `400 LOCKED`.
- **Validation/errors:** builder checks name, section, input component, unique keys, options, table/rating/signature/workflow rules. Backend schema validation occurs on submit, not ordinary save. **Fully Functional with authorization gap.**

### Feature: Template Preview

- **Purpose:** render current builder schema before persistence/use.
- **Frontend:** `TemplatePreviewModal.tsx`, `DynamicTemplateRenderer.tsx`, `TemplateComponentRenderer.tsx`, theme/display helpers.
- **Backend/database:** none; preview is local builder state.
- **Actions/dependencies:** renders all component types, theme and sections; no data is written. **Fully Functional (client-only by design).**

### Feature: Submit Template / Governance Routing

- **Purpose:** move a valid Draft through hierarchy or publish under policy.
- **Frontend/API:** Builder Submit; `AppContext.submitTemplateForApproval`; `POST /api/templates/:id/submit`.
- **Database:** template plus `template_audit_history`, `notifications`, and on direct approval `report_template_versions`.
- **Rules:** submit first saves/forces Draft; validates registered components and component-specific rules. With governance enabled: Employee -> first Manager; Manager -> first Director; Director -> Approved. Other roles, including Admin through raw API, also follow direct-publish `else`. Approver selection uses `LIMIT 1`, ignores manager relationship and active status. With governance disabled, any submitter is directly Approved before backend schema validation branch is reached.
- **Side effects:** `Submitted` + `approval_required`, or `Published` + immutable snapshot. **Fully Functional with governance-bypass validation issue.**

### Feature: Template Approval

- **Actors/UI:** exact assigned Manager/Director; Approvals page, drawer, confirmation modal.
- **API/tables:** `POST /api/templates/:id/approve`; template status, versions, template audit, notification.
- **Guards:** Pending Approval and exact `requestedApprovalFromUserId`. SQL transaction publishes snapshot, archives older Approved same normalized name/category, emits `Approved` audit and `template_approved` notification.
- **Errors:** `404 NOT_FOUND`, `400 INVALID_STATUS`, `403 FORBIDDEN`. **Fully Functional.**

### Feature: Template Rejection

- **Purpose:** return a template request to author with a recorded decision (the code labels it Rejected, while notification says revision requested).
- **Frontend:** `RejectModal.tsx`, Approval drawer/page.
- **API/tables:** `POST /api/templates/:id/reject`; sets status/reason; audit `Rejected`; notification `template_rejected`.
- **Rules/errors:** nonblank reason, Pending Approval, exact assigned approver. A rejected row can be reopened/saved because save forces it back to Draft. **Fully Functional.**

### Feature: Template Request Tracking

- **Purpose:** creator sees all their template rows and state history.
- **Frontend:** `MyRequestsPage.tsx`, `RequestDetailDrawer.tsx`, `RequestChatDrawer.tsx`.
- **Data:** templates from API; approval records and some request comment state come from local demo storage; comment thread can call API.
- **Search/filter:** All, Draft, Pending Approval, Approved, Rejected; name/description search.
- **Status:** **Partially Implemented** because displayed approval-history metrics use local `approvalRecords`, not `template_audit_history` API data.

### Feature: Template Versioning and Replacement

- **Purpose:** keep Approved definitions immutable and bind reports to snapshots.
- **Frontend/API:** Edit/New Version action; `POST /api/templates/:id/version`.
- **Database:** creates a new `report_templates` Draft at next minor version and later snapshot in `report_template_versions`.
- **Rules:** parses `vM.m`, increments minor; no ownership guard; same name/category replacement approval archives prior Approved rows. Existing reports keep old snapshot.
- **States:** Archived is actively used; Superseded is database-only. **Partially Implemented** because versions are new template identities, the frontend type omits Archived/Superseded, and there is no version-history UI/API.

### Feature: Template Discussions

- **Actors/UI/API:** creator/approver chat UI; `GET/POST /api/templates/:id/comments`.
- **Database/side effects:** `template_comments`; `comment_added` notification to the opposite creator/approver.
- **Rules:** only nonempty message and existing template. Participant access is not enforced. **Partially Implemented.**

## 2. Report instances and review

### Feature: Create Report Instance (“Use Template”)

- **Purpose/actors:** normal users create a filled record from Approved template.
- **Frontend:** Template card/detail -> `FillReportModal.tsx`.
- **API/tables:** `POST /api/reports`; writes report, template version if missing, initial values, `report_audit_history` action `Created`.
- **Rules:** template must exist and be Approved; a snapshot ID is bound; unknown initial-data keys are ignored; object values serialize to JSON.
- **Status:** Draft. **Fully Functional.**

### Feature: Fill, Save, and Complete Report

- **Frontend:** `FillReportModal`, dynamic renderers and `validationHelper.ts`.
- **API:** `PUT /api/reports/:id`; `POST /api/reports/:id/complete`.
- **Database:** reports, field values, audit.
- **Rules:** only author; Signed locked. Rules/calculations evaluate server-side. Complete checks conditionally visible required fields. Returned edit becomes Completed even without `markAsCompleted`. Duplicate aliases with conflicting values return `DUPLICATE_FIELD_VALUE`; empty submitted values delete rows.
- **Audit:** `Draft Saved` or `Completed`. **Fully Functional.** Static types heading/paragraph/divider/spacer are exempt from required checks; image/info box are not explicitly exempt in this particular completion filter.

### Feature: Send Report

- **Purpose:** route author record to reviewer.
- **UI:** `SendReportModal.tsx`; Employee recipient list=Managers, Manager=Directors, Director gets no valid role-specific results; filters static users and status.
- **Backend:** `POST /api/reports/:id/send`.
- **Rules:** author only, non-self, existing user, status Draft/Completed/Returned/**Sent**. Backend does not validate role hierarchy or inactive status. Sender signature components are auto-signed from profile/payload. Dynamic workflow starts when attached.
- **Side effects:** report -> Sent, recipient/note/time; `Sent` or `Signed & Sent` audit; `report_received` notification; optional signature records/workflow instance.
- **Status:** **Fully Functional with backend/UI mismatch and resend issue.**

### Feature: Report Comments

- **Frontend/API:** `ReportCommentThread.tsx`; `GET/POST /api/reports/:id/comments`.
- **Storage/notification:** `report_comments`; `comment_added` to author or sent recipient.
- **Rules:** nonempty message and existing report only; no participant guard. **Partially Implemented.**

### Feature: Return for Changes

- **Purpose:** non-terminal reviewer feedback loop.
- **Frontend:** Report view + `ReturnReportModal.tsx`; hidden if either return setting alias false.
- **Backend:** `POST /api/reports/:id/return`.
- **Rules:** policy enabled; reason mandatory; classic path exact recipient and Sent. Dynamic workflow delegates to task authorization. Active component signatures are marked inactive/superseded.
- **Effects:** status Returned, reason/time, audit, `report_returned` notification in classic path. Dynamic path changes workflow/task/report but creates no report audit/notification.
- **Status:** **Fully Functional classic; Partially Implemented dynamic side effects.**

### Feature: Report Rejection

- **Purpose:** terminal reviewer refusal, different from return because author cannot revise/resend under normal service states.
- **Frontend:** Report view + `RejectReportModal.tsx`; policy controlled.
- **Backend:** `POST /api/reports/:id/reject`.
- **Rules:** policy, mandatory reason, exact assigned recipient, author cannot reject own report, Sent only; dynamic task authorization if instance exists.
- **Effects:** Rejected/reason/time, audit, `report_rejected` notification in classic path. **Fully Functional classic; Partially Implemented dynamic notifications/audit.**

### Feature: Digital Signature and Locking

- **Frontend:** `SignReportModal.tsx` (thin legacy wrapper), `ReportSignatureModal.tsx`, `SignatureRenderer.tsx`, `UserSignatureSettingsModal.tsx`.
- **API/tables:** sign endpoint; signature profile GET/POST; signature upload; `report_signature_audit`, `user_signature_profiles`, `template_assets`; legacy `digital_signatures` read compatibility.
- **Rules:** policy; not already Signed; sender=author; receiver cannot be author and must be assigned in common UI, although backend receiver guard has a gap for a non-author/non-recipient; required sender signature precedes receiver. Replay protection reuses existing active role record. SHA-256 content hash and unique verification ID recorded.
- **Effects:** sender signing Draft -> Completed; receiver signing -> Signed; report audit; `report_signed` author notification; Signed edit/sign locks. Existing signed records survive policy disable.
- **Status:** **Fully Functional with receiver authorization gap and legacy dual model.**

### Feature: Report Lists, Tabs, Search, and Visibility

- **UI:** Reports page tabs My Reports, Received, Draft, Awaiting Signature, Signed, Rejected; search title/template/author/recipient.
- **API:** `GET /api/reports` filters `mine`, `received`, `status`.
- **Authorization:** default list is own/received; Director sees all. Page tabs then apply client filters. Direct `GET /:id` has no guard.
- **Status:** **Fully Functional list; partial resource security.**

### Feature: Dynamic Workflow Engine

- **Purpose:** multi-step conditional routing beyond single recipient.
- **Frontend:** Studio Workflow panel, step modal, simulator; `EngineProofPage` demonstrator.
- **API/tables:** six workflow endpoints; definitions, versions, instances, tasks, history.
- **Logic:** assignee strategies specific user, role, sender selected, creator manager; conditional transitions; task action service supports Approve/Return/Reject/Acknowledge/Sign.
- **Integration:** send auto-starts an active template workflow; return/reject/sign delegate to task action. There is no mounted API endpoint for generic Approve/Acknowledge/task action, and the frontend service has no workflow methods.
- **Status:** **Partially Implemented.**

## 3. Studio authoring capabilities

### Feature: Sections and Drag/Drop

- **Frontend:** DnD Kit in `TemplateBuilder`, `BuilderCanvas`, `BuilderSection`, `BuilderComponent`.
- **Actions:** add, rename, delete, reorder sections; add/move/reorder/copy components; width layout.
- **Persistence:** section and flattened field rows. Feature flag hides rail tool only; existing canvas remains. **Fully Functional.**

### Feature: 23-element Component System

- **Purpose:** inputs, static display blocks, and business widgets.
- **Frontend/backend:** toolbox, properties, component renderer, component registry and schema validator.
- **Persistence:** each component is one `report_template_fields` row with extended JSON configuration.
- **Admin:** per-element flags filter insertion surfaces, not stored/existing render or backend payloads. **Fully Functional with client-only disable enforcement.** Full catalog in `TEMPLATE_STUDIO.md`.

### Feature: Rules and Calculations

- **Purpose:** conditional visibility/required state and derived values.
- **Frontend/backend:** shared `template-rules` evaluator; Builder properties/validation artifacts; values applied during report update.
- **Persistence:** `rules_json`, `calculations_json`.
- **Navigation:** dedicated Logic rail was removed; help keys and comments remain. Rule/calculation data still exists and executes.
- **Status:** **Partially Implemented / removed dedicated UI navigation.**

### Feature: Themes

- **Frontend:** `StudioThemePanel.tsx`, `themeResolver.ts`; live preview and renderer consumption.
- **Persistence:** `report_templates.theme_json` and version snapshots.
- **Flag:** `studio.themes` hides rail. **Fully Functional.**

### Feature: Data Fields Library

- **Purpose:** curated client-defined business fields.
- **Source/frontend:** `src/data/dataFieldsLibrary.ts`, Studio panel; All/Firm/Favorites filters, search/category behavior.
- **Persistence:** insertion copies to template field rows. Favorites are client/local behavior. **Fully Functional client catalog.**

### Feature: Template Import

- **UI:** `ImportTemplateModal` only processes pasted JSON locally; identity is hardcoded to Ahmed in imported draft metadata. Word, Excel, PDF are marked coming soon.
- **Backend:** `/api/template-import/analyze` genuinely parses DOCX, XLS/XLSX, JSON, cleans temp file, and returns a proposal; no frontend method calls it.
- **Status:** JSON UI **Functional**; DOCX/XLSX **Backend Only**; PDF **Not Implemented**.

## 4. Packs and standardized content

### Feature: Admin Standard Packs

- **Admin UI/API:** Pack Management; CRUD, publish/status; `template_packs*`.
- **Rules:** unique normalized name case-insensitively; at least one canvas component; complete section/component structure persisted with legacy flat-item compatibility. Admin authorization and audit on create/update/status.
- **User UI:** Studio Packs panel only fetches Published; search/category/preview/insert.
- **Insertion:** deep-copy sections/components with regenerated IDs/keys; later Pack edits affect future insertions only.
- **Flag/element dependencies:** `studio.packs` hides the normal rail; disabled elements/content items are unavailable for new Admin canvas insertion while existing Pack snapshots remain intact.
- **Status:** **Fully Functional.**

### Feature: Built-in and My Content Packs

- **UI/API:** Studio Content Library system/user tabs; `content_packs`; create/update/delete/add component.
- **Rules:** system packs visible to everyone/read-only; user packs only owner-visible/editable; Pack name required but no database unique constraint or API duplicate-name check.
- **Insertion:** deep-copy sections/components and regenerate IDs/keys where builder utilities apply. **Fully Functional.**

### Feature: Admin Content Library Items

- **Admin:** CRUD/enable, filters/search, audits.
- **User:** enabled-only API and Studio insertion as matching heading/paragraph/info content component.
- **Types:** Heading, Text Block, Disclaimer, Instruction, Label, Section Intro.
- **Snapshot:** inserted component is detached from source. **Fully Functional.**

## 5. Administration and platform features

### Feature: Admin Role Switch / Separate Shell

- **Frontend:** `RoleSwitcher`, `AppShell`, `AdminLayout`; selecting Lina replaces normal shell.
- **Backend:** Admin guard on `/api/admin/*`; `GET /api/system/config` available to all demo identities.
- **Status:** **Fully Functional demo behavior.**

### Feature: Feature Management

- **UI/API/tables:** toggles nine flags; PATCH feature; system feature table; admin audit.
- **Effect:** actual Studio rail filters immediately after config refresh. No backend capability denial. **Partially Implemented as policy enforcement.**

### Feature: Element Management

- **UI/API/tables:** category-filtered 23 toggles; PATCH element; system element table; audit.
- **Effect:** new insertion toolbox and Pack picker. Existing templates and crafted API schemas unaffected. **Partially Implemented as policy enforcement.**

### Feature: Users & Access

- **UI/API:** list, create Employee/Manager/Director, edit details/role, and Active/Inactive/Resigned/Terminated status.
- **Rules:** required fields; additional Admin disallowed; Admin accounts/self protected in the service; database email/role constraints; high-impact status confirmation; role/status/detail audits.
- **Effect:** database-backed roles drive future UI/API permissions; only Active users can access or receive new assignments. Historical report/template/audit/signature snapshots are never rewritten. **Fully Functional for demo identity governance.**

### Feature: Categories

- **UI/API:** create, edit, activate/deactivate, template count.
- **Rules:** create requires name; unique DB constraint; update can set blank name; inactive category is hidden from builder selector except current selection.
- **Gaps:** normal categories API omits status, so inactive categories remain visible in library/sidebar and possible payloads; backend template save resolves inactive categories. **Partially Implemented.**

### Feature: System Settings / Policy Engine

- **UI/API:** organization fields and four workflow policy toggles; generic settings upsert.
- **Backend enforcement:** return/reject/sign/governance only. Platform/org/version/demo values do not comprehensively drive behavior.
- **Audit:** one generic `Updated System Settings` event without per-key previous/new values. **Partially Implemented.**

### Feature: Admin Audit Log

- **UI/API:** latest 200 events, search actor/action/target; `admin_audit_log`.
- **Coverage:** config, elements, users, categories, settings, Packs, Content Library. No audit for viewing or demo reset; seed baseline exists. **Fully Functional for covered mutations.**

### Feature: Admin Overview

- **Real metrics:** active users, Published Standard Packs, enabled Content items, enabled features/elements, count of returned audit events.
- **Static metrics/text:** System Status Operational; 100% Online; fixed role-composition sentence.
- **Status:** **Partially Implemented / static health indicators.**

## 6. Cross-cutting features

### Feature: Notifications

- **Types:** `approval_required`, `template_approved`, `template_rejected`, `report_received`, `report_returned`, `report_rejected`, `report_signed`, `comment_added`.
- **UI/API:** dropdown and page; read/read-all owner-scoped; entity click navigation.
- **Storage:** SQLite notifications. **Fully Functional.**

### Feature: Global Search

- **UI:** Navbar searches Approved templates and accessible client-loaded reports; results open detail modals.
- **Backend:** templates also support server name/description search; reports do not expose search query.
- **Status:** **Fully Functional client search.**

### Feature: Asset Upload and Retrieval

- **API/storage:** generic upload up to 10 MB with MIME allowlist; signature image up to 5 MB with magic-byte checks, PNG dimensions, attestation; metadata in `template_assets`, file on disk.
- **Read controls:** signature assets creator/system or report participant/Director; ordinary assets have no resource guard.
- **Frontend:** image/file/signature controls call generic/signature upload APIs.
- **Status:** **Fully Functional with access-control limitations.**

### Feature: Demo Reset

- **UI/API:** normal/Admin reset modal; `POST /api/demo/reset`; clears client demo storage and reselects Ahmed.
- **Server:** calls seed transaction. See exact omissions in `DEMO_AND_SEED_DATA.md`.
- **Status:** **Partially Implemented** because workflow execution rows, user-owned packs, asset metadata/files, and temp/upload files are not comprehensively reset.

### Feature: Profile and Signature Settings

- **UI:** Navbar profile modal and signature settings modal.
- **API:** server-owned current-user signature profile; uploaded/drawn/typed methods.
- **Status:** **Fully Functional in demo.**

### Feature: Toast, status badges, loading/error states

- **Frontend:** global Toast from AppContext, Admin page-specific toasts/alerts, `StatusBadge`, modal loading states.
- **Behavior:** global toast auto-dismisses at four seconds; API errors carry code/status but most callers show message only. System config silently uses defaults on error.
- **Status:** **Partially standardized.**

## 7. Search/filter/sort inventory

| Surface | Implemented controls |
|---|---|
| Global Navbar | Approved template and accessible report substring search |
| Templates | Global term, category, tag, grid/list; API supports status/category/name-description search |
| My Requests | status and name/description search |
| Approvals | assigned pending sorted by API update time; oldest metric derived from created time |
| Reports | six tabs plus title/template/author/recipient search |
| Notifications | All/Unread/Templates/Reports/Comments; date grouping |
| Studio Templates | All/Firm/Favorites and search |
| Studio Data Fields | search/filter modes/categories |
| Studio Standard Packs | Standard/My tabs, category and search |
| Studio Content Packs | System/My tabs, category and search |
| Admin Elements | category filter |
| Admin Packs | Enabled/Disabled/All, search, picker type/search |
| Admin Content | All/Enabled/Disabled, category/type/search |
| Admin Categories | client list and status actions |
| Admin Audit | actor/action/target search; server newest 200 |

Sources: all `src/pages/*`, `src/components/admin/*`, `src/components/template-builder/*`, `server/routes/*`, `server/services/*`, and `server/repositories/dbRepository.ts`.
