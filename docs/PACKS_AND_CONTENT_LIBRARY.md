# Packs and Content Library

## 1. Three reusable-content models

WidgetFlow contains three database-backed reuse systems:

| Product term | Tables/API | Granularity | Owner/manager | Normal user surface |
|---|---|---|---|---|
| Standard Pack | `template_packs.structure_json`, `template_pack_items`; `/api/admin/packs`, `/api/packs` | complete canvas sections/components, with flat-item compatibility | Admin | Studio Packs > Standard Packs |
| Built-in/My Content Pack | `content_packs`; `/api/content-packs` | complete sections with component arrays in JSON | system seed or individual user | Studio Content Library and Packs > My Packs |
| Admin Content Library item | `content_library_items`; `/api/admin/content-library`, `/api/content-library` | one text/content snippet | Admin | Studio content insertion/Pack picker |

The term “Content Library” is overloaded. The Studio rail’s `ContentLibraryPanel` reads **Content Packs**, while Admin Content Library manages **single items**. Standard Packs are separate again. Code comments still call `content_packs` “Content Library.” No active UI label “Shared Content” was found; Admin descriptions sometimes say “shared content library blocks.”

## 2. Pack is not Template

A Template is a governed, versioned report schema that can create report instances. A Pack has no approval lifecycle, version snapshot, report creation, recipient, values, or report state. It is only an authoring accelerator whose content is copied into a Template draft.

```text
Pack source -> user selects Insert -> builder creates copied section/components
 -> template save persists ordinary section/field rows
 -> no pack ID/reference stored on template
```

Changing/disabling the source Pack therefore cannot alter an existing Template or Report.

## 3. Standard Packs

### Data model

`template_packs`: ID, name, description, optional category FK, status Draft/Published/Disabled, Admin creator, full `structure_json`, timestamps. `template_pack_items` remains an ordered compatibility projection for legacy consumers and seeded Packs.

### Admin creation/editing

`AdminPackManagement.tsx` opens `TemplateBuilder` with `mode="admin-pack"`. This mode reuses the canvas, sections, drag/drop, component properties, preview, Elements, enabled Content Library items, Text, Sections and Data Fields, while removing Template governance/category/version/My Pack controls. Normal `mode="template"` behavior is unchanged.

Admin names the Pack and authors complete ordered sections/components. Create defaults to Published. Edit replaces the stored canvas snapshot and compatibility items. Legacy flat Packs are converted to one canvas section when opened. There is no delete API; disable is the retirement path.

Backend validation:

- trimmed name required;
- case-insensitive trimmed uniqueness across Standard Packs;
- at least one component on create and when canvas structure is replaced;
- service-level Admin authorization in addition to route middleware;
- route status allowlist Draft/Published/Disabled;
- DB source type/status CHECK and FKs.

Errors from create/update are caught in the route and returned `400 BAD_REQUEST`. Publish/status routes allow service errors to central handler (`500` for missing Pack because plain `Error` is used).

Every create/update/status operation inserts Admin audit. Create action text is “Created and Published Pack” even when payload status is Draft/Disabled.

### Normal user consumption

`GET /api/packs` returns only Published Packs and hydrated item configuration. `PacksPanel.tsx` supports:

- Standard Packs/My Packs tabs;
- Standard Pack category filter and name/description/category search;
- loading/error/empty states;
- preview/details and insert callback.

Insertion deep-copies Pack sections and components and regenerates section IDs, component IDs and stable keys. Legacy flat items use the compatibility converter. No Pack reference is stored on the Template, so later Pack edits/status changes cannot mutate prior insertions. A content item embedded in a Standard Pack is a snapshot, not a runtime lookup.

### Seeded Standard Packs

| ID | Name | Category | Items | Status |
|---|---|---|---:|---|
| `pack-exec-kpi` | Executive KPI Pack | Analytics & BI | 7 fields | Published |
| `pack-fin-summary` | Financial Summary Pack | Finance | 7 fields | Published |
| `pack-ops` | Operations Pack | HR & Operations | 7 fields | Published |
| `pack-proj-status` | Project Status Pack | Technology | 9 fields | Published |
| `pack-mgmt-review` | Management Review Pack | Analytics & BI | 4 fields + content + signature | Published |

Status: **Fully Functional** with backward-compatible flat Packs, complete canvas persistence and snapshot-safe insertion; no delete/version-history endpoint.

## 4. Built-in Content Packs

### Data and visibility

Built-ins are TypeScript definitions in `src/data/builtInContentPacks.ts`, seeded into `content_packs` with `source_type='system'`, null owner, icon/category/description, and `schema_json` containing complete sections/components.

`GET /api/content-packs` returns all system packs plus only the acting user’s owned rows. System packs cannot be updated, deleted, or receive added components through owner APIs.

### Seeded built-ins (20)

| Category | Packs |
|---|---|
| General | Contact Information; Request Details; Notes & Comments; Attachments; Report Signatures |
| People / HR | Employee Information; Leave Request Details; Performance Review Details |
| Finance | Cost / Item Breakdown; Budget Summary; Vendor Information |
| Operations | Incident Details; Witness / Participant Details; Operational Review |
| Project Management | Project Information; Milestones |
| Technology | System / Application Information; Deployment Details |
| Compliance / Risk | Risk Assessment; Review & Sign-off |

The definitions use real component types and nested configuration and are organization-standard read-only content.

## 5. My Packs

### Creation

Users can save selected/current builder sections through `SaveContentPackModal` or related TemplateBuilder actions. `POST /api/content-packs` forces `ownerUserId` to acting user and `sourceType='user'`, regardless of body. Name is required; category is discovery metadata. There is no minimum section/component check and no unique-name constraint.

### Ownership and CRUD

- list: system + acting owner;
- update: owner and user source only;
- delete: owner and user source only;
- add component: owner and user source only.

`PUT` supports name/category/description/sections. Adding a component selects existing section, creates a named section, falls back to first, or creates Main Content. It generates a unique key within the pack (including nested keys), default table columns, and default signature role config.

### Preview/insertion

`ContentLibraryPanel` has System Library/My Library tabs, category and search filters, Pack counts, empty state and preview/insertion actions. Pack sections are deep-copied into builder state with new IDs/keys so subsequent source edits are detached.

### Reset behavior

`seedDatabase()` deletes only `content_packs WHERE source_type='system'` and reinserts built-ins. User packs survive process startup and Demo Reset. If an Admin-created nonseed user owns one, seed deletes that user with FKs disabled, potentially leaving an orphaned owner ID. This conflicts with a user expectation that reset restores all Pack data.

Status: **Fully Functional owner model**, **Partially resettable**.

## 6. Admin Content Library

### Purpose and content types

Organization-standard reusable single snippets. Database CHECK allows exactly:

- Heading
- Text Block
- Disclaimer
- Instruction
- Label
- Section Intro

Each row has name, optional description, category string, type, value, enabled, Admin creator, timestamps.

### Admin experience

`AdminContentLibraryManagement.tsx` supports:

- initial API load and retry/error/loading states;
- All/Enabled/Disabled status filter;
- category/type/search filters;
- create/edit modal with name/value client validation;
- enable/disable action;
- creator/source metadata cards.

Backend create validates name, nonempty value, category, type presence; DB enforces allowed type. Update does not re-run the create validations, so a blank name/value can be written through raw API, while invalid type fails DB and becomes a 500 because routes do not catch plain SQL errors. Each mutation adds Admin audit.

### Normal user experience

`GET /api/content-library` returns enabled rows only. Studio maps content type to a static component (typically heading/paragraph/info-style content), copies name/value/config into builder state, and later saves an ordinary template field. Users cannot edit organization items; they can only consume.

### Pack integration

Enabled Content items appear in Admin Standard Pack picker. The Pack item stores source key and a JSON snapshot of content type/value. Standard Pack hydration does not rejoin the source row, so changes/disables do not propagate.

### Seeded items

| ID | Name | Category | Type |
|---|---|---|---|
| `cli-1` | Executive Summary Heading | Analytics & BI | Heading |
| `cli-2` | Confidentiality Notice | HR & Operations | Disclaimer |
| `cli-3` | Management Commentary | Finance | Text Block |
| `cli-4` | Risk Statement | Finance | Disclaimer |
| `cli-5` | Prepared By Block | HR & Operations | Instruction |
| `cli-6` | Approval Statement | Analytics & BI | Disclaimer |
| `cli-7` | Standard Disclaimer | Technology | Disclaimer |

All are enabled and created by `user-admin`.

## 7. API and permissions table

| Method/path | Purpose | Permission |
|---|---|---|
| GET `/api/packs` | Published Standard Packs | any demo principal |
| GET `/api/packs/:id` | Published Standard Pack detail | any; 404 if unavailable |
| GET `/api/admin/packs[/:id]` | all Standard Packs/detail | Admin |
| POST/PUT `/api/admin/packs` | create/update Standard Pack | Admin |
| POST `/api/admin/packs/:id/publish` | publish | Admin |
| PATCH `/api/admin/packs/:id/status` | Draft/Published/Disabled | Admin |
| GET `/api/content-packs` | system + own My Packs | any demo principal |
| POST `/api/content-packs` | create own My Pack | acting principal |
| PUT/DELETE `/api/content-packs/:id` | update/delete own My Pack | owner only |
| POST `/api/content-packs/:packId/components` | add snapshot component | owner only |
| GET `/api/content-library` | enabled organization snippets | any demo principal |
| GET/POST/PUT/PATCH `/api/admin/content-library...` | manage all snippets/status | Admin |

## 8. State and data-flow summary

```text
Admin Standard Pack: Draft <-> Published <-> Disabled
System Content Pack: seeded/read-only
My Pack: create -> edit/add -> delete
Content item: Enabled <-> Disabled

source selection -> deep copy -> builder state -> template persistence
source update/disable/delete -X-> existing template copy
```

## 9. Edge cases

- Empty Standard Pack is blocked; empty My Pack is not.
- Duplicate Standard Pack name is blocked; duplicate My Pack names are allowed.
- Disabled Standard Pack is unavailable through normal API; direct Admin detail remains.
- System Pack modification returns 403 in owner routes.
- Standard Pack has no delete endpoint and no historical versions.
- Disabling an element does not purge it from already-created Pack items.
- Content category is a free string for Content Packs/items, not necessarily category FK.
- All user-pack JSON is parsed without a recovery guard in repository hydration; corrupt `schema_json` would throw.

Sources: `server/routes/apiRouter.ts`, `adminRoutes.ts`, `server/services/adminService.ts`, `server/repositories/dbRepository.ts`, `server/db/seed.ts`, `src/data/builtInContentPacks.ts`, `src/components/template-builder/PacksPanel.tsx`, `ContentLibraryPanel.tsx`, and Admin Pack/Content pages.
