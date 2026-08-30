# User Roles, Permissions, Navigation, Dashboards, and Journeys

## 1. Identity and role model

The authoritative role constraint is `users.role CHECK(role IN ('Employee','Manager','Director','Admin'))`; employment status is Active, Inactive, Resigned, or Terminated. The normal UI hydrates its user/role list from `/api/users`, while the backend resolves `X-Demo-User-Id` against SQLite and denies non-Active accounts. Role changes therefore affect the next API/UI authorization decision without changing historical rows. This remains demo authorization, not production authentication.

Sources: `server/db/schema.sql`, `server/middleware/demoUser.ts`, `src/data/initialData.ts`, `src/components/layout/RoleSwitcher.tsx`.

## 2. Role profiles

### Employee — Ahmed Hassan

- **Purpose:** frontline author of reusable templates and completed operational reports.
- **Navigation:** Dashboard, Report Templates, My Requests, Reports, Notifications; no Template Approvals item. Categories and Create Template remain visible.
- **Dashboard:** all five common metrics; pending approvals card is effectively zero because approvals are assigned upward; attention areas for returned reports and notifications; no Review Approvals quick action.
- **Templates:** create/save/edit own rows in UI; submit routes to first Manager; use Approved firm-wide templates. Backend lacks ownership guard on non-approved template saves.
- **Approval:** cannot see Approval nav or assigned template requests in seeded hierarchy. Raw API approval still fails unless exact assigned approver ID.
- **Reports:** create/edit/complete own; Send modal permits Active Manager choices from static users; receives no normal downward workflow but raw backend can assign an Employee.
- **Review/sign:** if assigned by API, classic recipient checks allow return/reject/sign regardless of role; normal journey signs only as sender and Manager reviews.
- **Packs/content:** consume Standard Packs, built-in Content Packs, and enabled Content Library items; create/edit/delete own My Packs.
- **Notifications/audit:** receives template decision, report return/reject/sign, and comments; report/template detail modals display audit data where hydrated.
- **Prohibited by UI:** Admin shell, Template Approvals, Standard Pack management, organization Content management, user/category/config management.

### Manager — Sarah Mohamed

- **Purpose:** team-level creator, template approver for Employees, and report reviewer/signatory.
- **Navigation:** all normal items including Template Approvals with assigned-count badge.
- **Dashboard:** common cards plus Review Approvals quick action; attention cards for assigned reports/templates.
- **Templates:** create/save; submit routes to first Director; approve/reject only requests explicitly assigned to Sarah. Employee routing uses first Manager, not `manager_user_id`.
- **Reports:** create own and UI-send to Directors; receives Employee reports; can comment, return, reject, or receiver-sign when exact recipient and state/policy allow.
- **Signature:** may sign own reports as sender; cannot receiver-sign their own report. Required sender signatures must precede receiver signature.
- **Packs/content:** same creator consumption and My Pack ownership as Employee.
- **Audit/notifications:** sees their own relevant report/template records and generated notifications.
- **Prohibited:** Admin configuration; approval of Manager-created template unless explicitly assigned (normal hierarchy assigns Director).

### Director — Omar Ali

- **Purpose:** executive template approver/publisher and upper-level report reviewer.
- **Navigation:** same as Manager.
- **Dashboard:** same normal dashboard logic, not a separate component; values differ based on user-filtered collections.
- **Templates:** submit publishes directly when governance is enabled; assigned Manager template requests can be approved/rejected. With governance disabled all roles publish directly.
- **Reports:** default backend list exposes every report to a Director. Frontend report tabs still filter by author/recipient for several tabs, while Signed/Rejected include Director-wide visibility. Send modal has no explicit Director branch and therefore yields no role-filtered recipients.
- **Review/sign:** normal actions require Omar to be actual `sentToId`; broad list visibility alone does not allow classic return/reject. Direct report detail is unguarded.
- **Packs/content:** same normal creator access and My Packs.
- **Prohibited:** Admin shell/configuration.

### Admin — Lina Nasser

- **Purpose:** platform administrator for organization-wide creator capability and policy, not a normal workflow participant.
- **Navigation:** App switches entirely to Admin Control Center: Overview, Feature Management, Template Studio Configuration, Pack Management, Element Management, Content Library Management, Users & Access, Categories, System Settings, Audit Log.
- **Dashboard:** separate AdminOverview with API-backed configuration counts and static health claims.
- **Templates/reports:** no normal UI, no Template Studio, no report review. The backend ordinary endpoints do not globally reject Admin, so crafted calls may create/publish templates or reports; that is an implementation gap, not intended UI behavior.
- **Packs:** full Standard Pack management and single-item Content Library management. No Admin UI for user-owned `content_packs`.
- **Users/categories:** create non-Admin users, activate/deactivate, category create/edit/status.
- **Configuration:** toggle Studio feature and element rows and workflow policies; view Admin audit.
- **Restrictions:** Admin route middleware and user/Pack services require exact Admin role. Admin UI/service do not allow creating another Admin or editing any Admin account, including self-deactivation or self-demotion.

### Employment status and historical safety

- Only Active users are returned to normal assignment/role-switcher consumers.
- Inactive, Resigned, and Terminated identities are rejected by request middleware and cannot receive new classic or dynamic workflow assignments.
- Role/status edits update only the live `users` identity. Reports, approvals, signatures, workflow/template audits and stored Template/version snapshots retain the names and roles captured when those events occurred.

## 3. Complete authorization matrix

Legend: **Yes**, **No**, **Conditional**, **Read Only**, **Admin Only**. “Conditional” means ownership, assignment, state, policy, or frontend hierarchy.

| Action | Employee | Manager | Director | Admin |
|---|---:|---:|---:|---:|
| Enter normal shell | Yes | Yes | Yes | No |
| Enter Admin Control Center | No | No | No | Yes |
| Browse Approved templates | Yes | Yes | Yes | No UI |
| Read any template by known ID | Yes (API) | Yes (API) | Yes (API) | Yes (API) |
| Create Template | Yes | Yes | Yes | No UI / API possible |
| Edit own Draft/Rejected/Pending template | Yes | Yes | Yes | No UI |
| Edit another user’s non-Approved template | No UI / API gap | No UI / API gap | No UI / API gap | API gap |
| Edit Approved template | No | No | No | No (`LOCKED`) |
| Submit Template | Manager review | Director review | Direct publish | API direct publish gap |
| Approve Employee Template | No | Conditional exact assignment | Conditional only if assigned | No UI |
| Approve Manager Template | No | Conditional only if assigned | Conditional exact assignment | No UI |
| Reject Template | No | Conditional exact assignment | Conditional exact assignment | No UI |
| Comment on Template | API allows any identity | Same | Same | Same |
| Create new Template version | Yes (no ownership guard) | Yes | Yes | API possible |
| Create Report | Yes | Yes | Yes | No UI / API possible |
| Edit Report | Conditional own + not Signed | Conditional | Conditional | API own only |
| Complete Report | Conditional own | Conditional | Conditional | API own only |
| Send Report | Conditional own; UI -> Active Manager | Conditional own; UI -> Active Director | UI has no targets; API Active non-self only | No UI |
| Receive Report | Conditional assignment | Conditional assignment | Conditional assignment | API assignment possible |
| Return Report | Conditional assigned Sent + policy | Same | Same | API if assigned |
| Reject Report | Conditional assigned Sent + policy | Same | Same | API if assigned |
| Sender-sign Report | Conditional author + policy | Same | Same | API author only |
| Receiver-sign Report | Conditional; normal workflow unlikely | Conditional | Conditional | API authorization gap possible |
| Edit Signed Report | No | No | No | No |
| Read default Report list | Own/received | Own/received | All | Own/received if API called |
| Read known Report ID/comments | API gap | API gap | API gap | API gap |
| View Report Audit | Conditional through hydrated detail | Same | Broad read possible | No UI |
| Consume Standard Packs | Yes | Yes | Yes | No Studio UI |
| Create/edit/delete My Pack | Own only | Own only | Own only | No Studio UI |
| Manage Standard Packs | No | No | No | Admin Only |
| Consume enabled Content items | Yes | Yes | Yes | No Studio UI |
| Manage Content Library items | No | No | No | Admin Only |
| Toggle Studio feature/element | No | No | No | Admin Only |
| Manage users/categories/settings | No | No | No | Admin Only |
| Reset demo | Yes (normal modal/API) | Yes | Yes | Yes |
| View Admin audit | No | No | No | Admin Only |
| Save signature profile | Own | Own | Own | Own via API |
| Read private signature asset | Conditional owner/participant/Director | Conditional | Conditional Director-wide | Conditional |

Sources: `src/App.tsx`, `Sidebar.tsx`, `AdminSidebar.tsx`, `SendReportModal.tsx`, `ReportViewModal.tsx`, `server/routes/adminRoutes.ts`, `workflowService.ts`, `dynamicWorkflowService.ts`, `dbRepository.ts`.

## 4. Normal navigation map

The app has no URL router. `activeView` in AppContext selects a component.

| Label | Icon | View key | Visible roles | Badge / behavior | Component |
|---|---|---|---|---|---|
| Dashboard | LayoutDashboard | `dashboard` | Employee, Manager, Director | none | `DashboardPage` |
| Report Templates | Library | `templates` | all normal | category click also sets selected category | `TemplatesPage` |
| My Requests | FileText | `my-requests` | all normal | none | `MyRequestsPage` |
| Template Approvals | CheckSquare | `approvals` | Manager, Director | count of Pending templates assigned to current ID | `ApprovalsPage` |
| Reports | FileSpreadsheet | `reports` | all normal | count of Sent reports assigned to current ID | `ReportsPage` |
| Notifications | Bell | `notifications` | all normal | unread current-user count | `NotificationsPage` |
| Categories | category-specific icons | not separate | all normal | count Approved; expands Approved template names; click opens Templates filtered | Sidebar category tree |
| Create Template | Plus | modal | all normal | opens full-screen TemplateBuilder | `TemplateBuilder` |

`engine-proof` is a valid `App.tsx` switch key and renders `EngineProofPage`, but no normal sidebar/nav item sets it. `admin` is present in the `ViewType` union but Admin shell selection is role-driven, not `activeView`.

## 5. Admin navigation map

| Label | Icon | State key | Page | Conditions |
|---|---|---|---|---|
| Overview | LayoutDashboard | `overview` | `AdminOverview` | Admin shell only |
| Feature Management | Sliders | `features` | `AdminFeatureManagement` | Admin only |
| Template Studio Configuration | LayoutTemplate | `studio-config` | `AdminStudioConfig` | Admin only |
| Pack Management | Package | `packs` | `AdminPackManagement` | Admin only |
| Element Management | Shapes | `elements` | `AdminElementManagement` | Admin only |
| Content Library Management | BookOpen | `content-library` | `AdminContentLibraryManagement` | Admin only |
| Users & Access | Users | `users` | `AdminUsersAccess` | Admin only |
| Categories | FolderKanban | `categories` | `AdminCategories` | Admin only |
| System Settings | Settings | `settings` | `AdminSystemSettings` | Admin only |
| Audit Log | History | `audit` | `AdminAuditLog` | Admin only |

## 6. Template Studio navigation

| Rail label | Icon | Tab | Feature key | Main component |
|---|---|---|---|---|
| Templates | LayoutTemplate | `templates` | `studio.templates` | StudioPanels template browser |
| Elements | Shapes | `elements` | `studio.elements` | StudioPanels toolbox |
| Content Library | BookOpen | `content-library` | `studio.content_library` | `ContentLibraryPanel` (`content_packs`) |
| Packs | Package | `packs` | `studio.packs` | `PacksPanel` (Standard/My tabs) |
| Text | Type | `text` | `studio.text` | heading/paragraph insertion |
| Sections | Layers | `sections` | `studio.sections` | section insertion |
| Data Fields | Database | `data-fields` | `studio.data_fields` | curated field library |
| Themes | Palette | `tools` | `studio.themes` | `StudioThemePanel` |
| Workflow | GitMerge | `workflow` | `studio.workflow` | `StudioWorkflowPanel` |

Disabled items disappear. If the active tab becomes disabled, TemplateBuilder selects the first remaining visible rail item and closes/changes the drawer as needed. No dedicated Logic item exists; stale help keys remain.

## 7. Dashboard specification

There is one normal Dashboard component for Employee/Manager/Director; “role dashboards” are data/conditional variants, not separate pages.

| Card/widget | Calculation/source | Role behavior/click | Empty/static notes |
|---|---|---|---|
| Approved Templates | `templates.status==='Approved'` from API | all normal | real |
| My Reports | authored reports in API-loaded accessible list | all normal | real |
| Template Requests | templates created by current ID | all normal | label says submitted but includes all statuses | real calculation, misleading subtitle |
| Awaiting My Review | Sent + `sentToId=current` | all normal; highlights nonzero | real |
| Pending Approvals | Pending + assigned current ID | meaningful Manager/Director; Employee subtitle differs | real |
| Quick Actions | navigation/modal callbacks | Review Approvals hidden for Employee | real actions |
| Attention Required | awaiting review, pending approvals, returned authored reports, unread notifications | context-specific links | real |
| Recent Generated Reports | current user author/recipient, sort updated desc, first five | row opens view; assigned Sent has Sign shortcut | real |
| Popular/Recent Templates | latest Approved, first four | Use opens Fill modal | “popular” is not usage analytics; it is recent |
| Recent Activity/approval summary | local `approvalRecords` in portions | can become stale vs SQLite | partial/local |

### Admin dashboard

| Metric | Source | Reality |
|---|---|---|
| Active Users | `/api/admin/users`, excludes Inactive | real; fallback initial 4 on error |
| Published Packs | `/api/admin/packs`, Published count | real |
| Content Items | enabled Admin Content Library count | real |
| Studio Features | effective config enabled/total | real; fallback denominator 9 |
| Enabled Elements | effective config enabled/total | real; fallback denominator 23 |
| Config Changes | number of latest audit rows returned (max 200) | real count of window, not all-time |
| System Status: Operational | hardcoded text | **UI Only** |
| 100% Online | hardcoded text | **UI Only** |
| Role composition sentence | fixed “1 each” string | can become wrong after user creation/status changes |

## 8. Complete user journeys

### Ahmed creates a governed template and report

1. Ahmed clicks Create Template; TemplateBuilder initializes a Draft with an active category.
2. He adds sections/components, optionally inserts detached Pack/content snapshots, configures properties/theme/workflow, and previews.
3. Save Draft writes template metadata/tags/sections/fields and a Created audit for a new row.
4. Submit saves again, backend validates schema, selects the first Manager (Sarah), sets Pending Approval, records Submitted, and notifies Sarah.
5. Sarah switches identity, sees badge/inbox, reviews/comments, then approves. SQLite writes Approved, version snapshot, audit, and notification to Ahmed.
6. Ahmed opens the Approved template and Use Template. A Draft report plus version reference/audit is created.
7. He fills and completes it; required fields/rules/calculations validate.
8. Send modal permits Sarah. If sender signature fields exist, it captures his profile and writes component signature audit before setting Sent and notifying Sarah.
9. Sarah opens the report, comments, and signs as Receiver. Report becomes Signed and locks; audit/hash/verification ID and Ahmed notification persist.

### Sarah returns a report, then signs resubmission

1. Sarah receives Ahmed’s Sent report.
2. Return for Changes requires policy enabled and nonempty feedback.
3. Backend supersedes active signatures, sets Returned, audits/notifies Ahmed.
4. Ahmed edits; any update automatically changes Returned to Completed, then sends again.
5. Sender signature is recreated if prior signatures were superseded; Sarah signs final version.

### Sarah rejects a report

1. Sarah selects Reject on a Sent report assigned to her.
2. Modal requires a reason; backend also enforces reason, recipient, non-author, Sent, and policy.
3. Report becomes Rejected with timestamp/reason; audit and notification are written.
4. Ahmed can view reason/history, but edit/send service rejects Rejected status, so rejection is terminal.

### Sarah creates a template; Omar approves

1. Sarah creates/submits Draft.
2. Backend selects first Director (Omar), not Sarah’s manager relationship.
3. Omar approves or rejects exact assignment.
4. Approval publishes a snapshot; replacement matching same normalized name/category archives older Approved row.

### Omar publishes directly

1. Omar creates and submits a valid Draft.
2. With governance on, Director branch chooses Approved directly, adds Published audit and version snapshot; there is no approval notification.
3. With governance off, the direct-publish policy branch applies to every role.

### Lina configures creator experience

1. Lina switches into Admin shell.
2. She disables Rating. PATCH updates `system_element_settings` and adds Admin audit.
3. Effective config refreshes; normal Studio Elements and Admin Pack picker filter Rating.
4. Existing Rating components still render and crafted API templates can still contain Rating.
5. She disables Return for Changes. Normal Report View hides Return; backend return endpoint rejects `403 POLICY_DISABLED`; historical Returned reports remain.

## 9. Prohibited and edge actions

- Creator cannot overwrite Approved template (`LOCKED`), but can create a new version.
- Non-assigned approver cannot decide a template.
- Report non-author cannot edit/send.
- Author cannot send to self.
- Assigned reviewer cannot return/reject unless classic status is Sent.
- Author cannot receiver-sign own report; Signed reports cannot be edited/signed again.
- User cannot edit/delete system Content Pack or another user’s pack.
- Non-Admin cannot call `/api/admin/*`.
- These do **not** cover known gaps: inactive principals, arbitrary known-ID reads/comments, template draft ownership, report send hierarchy, and receiver-sign recipient verification.
