# Admin Control Center and Configuration

## 1. Admin platform model

The seeded Admin is Lina Nasser. When selected, `AppShell` renders `AdminLayout` instead of the normal WidgetFlow shell. Every `/api/admin/*` request passes `requireAdminRole`; the public effective config is `/api/system/config`. Admin mutations write `admin_audit_log` through `adminService.logAudit` unless explicitly noted.

The Admin is intended to manage platform capability, not template/report business workflow. Ordinary endpoints lack a global Admin exclusion, so this is an enforced UI separation rather than a complete backend domain prohibition.

## 2. Overview

- **Purpose/UI:** executive configuration/activity dashboard with metrics, configuration summary, latest five audits, and navigation shortcuts.
- **Frontend:** `AdminOverview.tsx`.
- **APIs:** audit, users, categories, Packs, Content Library; feature/element/general values from SystemConfigContext.
- **Database:** all three system config tables, Admin audit, users, categories, Standard Packs, Content items.
- **Real calculations:** Active users excludes Inactive; Published Pack count; enabled Content count; enabled/total feature and element; number of audit rows returned.
- **Static:** Operational status, 100% Online, fixed one-per-role sentence. These do not call `/health`.
- **Loading/error:** optimistic fallback counts (users/categories initially 4); failed calls only log to console and retain fallback/zero.
- **Status:** **Partially Implemented** due static health and silent errors.

## 3. Feature Management

- **Purpose:** enable/disable nine Template Studio modules organization-wide.
- **Frontend/API:** `AdminFeatureManagement.tsx`; GET features, PATCH feature key.
- **Validation:** route requires `enabled` defined, then Boolean coercion; unknown key becomes plain service Error -> centralized 500.
- **Database/audit:** update `system_feature_settings` with actor/time; audit Enabled/Disabled Studio Feature, previous/new.
- **Normal-user effect:** SystemConfig refresh; actual Studio rail filters module. Active tab is recalculated by TemplateBuilder.
- **Backend effect:** none on content/template endpoints; crafted requests remain possible.
- **Loading/error:** explicit spinner, retry error, local toggle update, alert on mutation error.
- **Status:** **Functional UI configuration; Partially enforced policy.**

## 4. Template Studio Configuration

- **Purpose:** read-only visual summary/preview of effective Studio rail.
- **Frontend:** `AdminStudioConfig.tsx`; no direct API beyond SystemConfigContext.
- **Actions:** open/close preview only. Actual toggles live in Feature Management.
- **Issue:** `STUDIO_MODULES` lists eight and omits `studio.packs`, while actual rail has nine.
- **Audit/database:** none from this page.
- **Status:** **UI Only / read-only summary**, with omission.

## 5. Pack Management

- **Purpose:** create and curate organization Standard Packs.
- **Frontend:** `AdminPackManagement.tsx`.
- **APIs:** GET all Packs, POST create, PUT update, POST publish, PATCH status; also GET Admin Content Library.
- **Tables:** `template_packs`, `template_pack_items`, categories/users join, Admin audit.
- **UI:** status tabs All/Enabled/Disabled, search, cards and preview. Create/Edit opens the shared canvas in the isolated `mode="admin-pack"`, with Pack-only header/actions and Elements, Content Library, Text, Sections, and Data Fields authoring surfaces.
- **Persistence:** `template_packs.structure_json` stores complete ordered sections and component configuration. `template_pack_items` remains populated for compatibility/discovery. Legacy flat Packs without `structure_json` are converted to a single editable canvas section.
- **Validation:** UI and backend require a name and at least one component; backend enforces Admin role, case-insensitive uniqueness and Pack status allowlist.
- **Element/content dependency:** new insertion surfaces filter disabled elements and disabled Content items. Existing Pack structure is not stripped automatically.
- **Normal effect:** only Published Packs are returned from `/api/packs`; insertion deep-copies sections/components and regenerates IDs/keys, so later Pack edits never alter an existing Template.
- **Audit:** create/update/publish/disable/draft.
- **Loading/error:** loader, empty state, inline modal error for save, browser alerts for status errors.
- **Status:** **Fully Functional**, no delete/version endpoint.

## 6. Element Management

- **Purpose:** control 23 creator component types.
- **Frontend/API:** `AdminElementManagement.tsx`; GET/PATCH elements.
- **UI:** category tabs All, Basic Inputs, Choice Inputs, Financial, Layout, Advanced; card toggle and toast.
- **Database/audit:** `system_element_settings`; Enabled/Disabled Element audit.
- **Normal effect:** Elements panel and Admin Pack picker filter. Existing templates/renderers and backend schema validator still accept registered disabled type.
- **Loading/error:** loader, retry, mutation alert.
- **Status:** **Partially enforced.**

## 7. Content Library Management

- **Purpose:** organization-standard single content snippets.
- **Frontend/API:** `AdminContentLibraryManagement.tsx`; full list/create/update/status.
- **Tables:** `content_library_items`, users join, Admin audit.
- **UI:** status/category/type filters, text search, cards, create/edit modal, enable toggle.
- **Validation:** client name/value; backend create name/value/category/type; database six-type CHECK. Update lacks equivalent nonblank validation.
- **Normal effect:** enabled-only endpoint; copied insertion; Standard Pack picker consumes enabled items.
- **Audit:** add/update/enable/disable.
- **Loading/error:** explicit loader/error/empty and alerts.
- **Status:** **Fully Functional with update-validation gap.**

## 8. Users & Access

- **Purpose:** maintain user directory, business role, department, status.
- **Frontend/API:** `AdminUsersAccess.tsx`; GET/POST users; PATCH complete operational-user details, role and status.
- **Tables:** `users`, Admin audit.
- **UI/actions:** edit name/email/department, promote among Employee/Manager/Director, and set Active/Inactive/Resigned/Terminated. Resigned/Terminated require a high-impact confirmation. Admin rows are system protected and role choices exclude Admin.
- **Validation/enforcement:** service-level Admin authorization, role/status allowlists, Admin self-protection, DB email uniqueness, active-only normal user endpoint, inactive-account middleware rejection, and active recipient/approver checks.
- **Normal effect:** `AppContext` consumes users/roles from `/api/users`; only Active users appear in new-recipient choices. Resigned/Terminated users cannot receive new classic or dynamic workflow assignments.
- **Historical records:** user changes update only `users`. Denormalized report owners, approval/audit roles, signatures and existing Template/version snapshots remain unchanged.
- **Audit:** Created User plus `USER_ROLE_CHANGED`, `USER_STATUS_CHANGED`, and `USER_DETAILS_CHANGED`.
- **Status:** **Fully Functional for demo identity governance.**

## 9. Categories

- **Purpose:** classify templates and Packs.
- **Frontend/API:** `AdminCategories.tsx`; GET/POST/PATCH categories.
- **Tables:** categories; template-count query; Admin audit.
- **UI:** create form/modal, rename/description edit, Active/Inactive toggle, template counts.
- **Validation:** create name; unique DB name. Update trims but permits blank; route status body is not allowlisted before service, though TS type suggests Active/Inactive.
- **Normal effect intended:** inactive category unavailable for new templates while historical templates remain.
- **Actual:** BuilderHeader filters when status exists and preserves current selection. Normal `/api/categories` does not return status, so normal Context cannot reliably hide inactive categories; template save does not reject inactive category.
- **Audit:** Created Category; Updated Category Details/Status.
- **Status:** **Partially Implemented.**

## 10. System Settings

- **Purpose:** organization labels/default version and report/template workflow policies.
- **Frontend/API:** `AdminSystemSettings.tsx`; PATCH settings; also Demo Reset.
- **Tables:** `system_general_settings`, Admin audit; reset affects broad domain tables.
- **UI fields:** organization name, platform name, default template version; toggles Report Rejection, Return for Changes, Digital Signature, Template Governance; reset confirmation modal.
- **Validation:** generic backend accepts arbitrary keys/types and upserts them. UI limits fields. No organization-name length/version format validation.
- **Audit:** one generic settings audit with placeholder previous/new, not per-key diffs. Demo reset itself is not audited after seed; it resets audit to baseline.
- **Status:** policy switches functional; labels/version/demo flag **Partially wired**.

## 11. Audit Log

- **Purpose:** configuration accountability.
- **Frontend/API:** `AdminAuditLog.tsx`; GET audit.
- **Table:** `admin_audit_log`.
- **UI:** search actor/action/target, table with previous/new values/timestamp, loading and empty states.
- **Server:** newest 200 by timestamp. No pagination/query filtering/export.
- **Permission:** Admin only.
- **Status:** **Fully Functional** for captured actions.

## 12. Complete feature flag dictionary

All seed defaults are enabled. Consumer is `StudioRail`/`TemplateBuilder`; Admin summary has noted mismatch.

| Key | Meaning | What disappears | Backend enforcement |
|---|---|---|---|
| `studio.templates` | approved template starter browser | Templates rail/drawer | none |
| `studio.elements` | component toolbox | Elements rail/drawer | none |
| `studio.content_library` | multi-section system/My Content Packs | Content Library rail | none |
| `studio.packs` | Standard/My Packs panel | Packs rail | Published Pack API still available |
| `studio.text` | quick text primitives | Text rail | element APIs/types remain |
| `studio.sections` | section insertion panel | Sections rail | template sections accepted |
| `studio.data_fields` | curated data field library | Data Fields rail | no server concept |
| `studio.themes` | theme editor | Themes rail | `theme_json` accepted/rendered |
| `studio.workflow` | workflow editor/simulator | Workflow rail | workflow APIs/execution remain |

## 13. Complete element setting dictionary

All seed defaults enabled. Each controls the matching `elements.<type>` entry: text, textarea, number, date, datetime, select, checkbox, radio, rating, acknowledgement, currency, percentage, heading, paragraph, divider, spacer, image, info_box, file, signature, table, repeating_group, kpi. The full functional definitions are in `TEMPLATE_STUDIO.md`.

## 14. Complete general setting dictionary

| Stored key | Type/default | Business meaning | Frontend behavior | Backend behavior/history |
|---|---|---|---|---|
| `org_name` | string / WidgetFlow Demo Company | organization label | Admin field/config only; much UI remains hardcoded | no workflow effect |
| `platform_name` | string / WidgetFlow | product label | Admin field/config only; brand text hardcoded in normal shell | no workflow effect |
| `default_template_version` | string / 1.0 | intended default version | Admin field | services still hardcode v1.0 in several paths |
| `allow_rejection` | boolean / true | allow final report rejection | hides Reject | reject endpoint `POLICY_DISABLED`; old rows unchanged |
| `allow_return` | boolean / true | allow revision loop | hides Return | return endpoint blocked; old Returned unchanged |
| `digital_signature` | boolean / true | allow new signatures | hides Sign | sign endpoint blocked; old signatures/Signed unchanged |
| `template_governance` | boolean / true | require Employee/Manager approval | influences submit result/toast | false directly approves all roles |
| `demo_mode` | boolean / true | denotes demo behavior | no meaningful switch | middleware remains header-demo regardless |

Effective aliases are generated in `adminService`: `workflow.report_rejection`, `workflow.return_for_changes`, `workflow.digital_signature`, `workflow.template_governance`. UI tests both original and alias for report controls.

## 15. Admin audit action inventory

Possible service actions:

- System Initialization (seed)
- Enabled/Disabled Studio Feature
- Enabled/Disabled Element
- Created User
- Activated/Deactivated User
- Created Category
- Updated Category Details
- Updated Category Status to Active/Inactive
- Updated System Settings
- Created and Published Pack
- Updated Pack
- Published Pack / Disabled Pack / Saved Pack as Draft
- Added Content Library Item
- Updated Content Library Item
- Enabled/Disabled Content Library Item

No Admin audit is created for reads, Preview Studio UX, health status, My Pack operations, ordinary domain workflow, asset upload, workflow-definition APIs, or direct Demo Reset (beyond baseline replacement).

Sources: `src/components/admin/*`, `server/routes/adminRoutes.ts`, `server/services/adminService.ts`, `server/db/seed.ts`, `src/context/SystemConfigContext.tsx`.
