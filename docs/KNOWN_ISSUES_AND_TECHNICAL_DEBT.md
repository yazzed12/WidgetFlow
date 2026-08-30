# WidgetFlow Known Issues, Technical Debt, and Implementation Status

This ledger is based only on observed repository behavior. It does not prescribe a redesign and no application code was changed. Severity reflects the risk if the demo were mistaken for a production system; several Critical items are deliberate demo shortcuts.

## 1. Ranked issue ledger

### Critical

1. **Demo header is not authentication.** Any caller can select any known user by setting `X-Demo-User-Id`; an absent or invalid value becomes Ahmed. There is no login, session, token verification, or credential boundary. Sources: `server/middleware/demoUser.ts`, `src/services/apiService.ts`.

2. **Backend restart destroys mutable core data.** `server/index.ts` calls `seedDatabase()` unconditionally. Users, templates, reports, settings and other seeded domains are restored to baseline each time the process starts. Sources: `server/index.ts`, `server/db/seed.ts`.

3. **Several resource reads lack participant/ownership authorization.** A known demo identity can request templates, reports, report comments, template comments, and some workflow details by ID even when not the creator, approver, sender, recipient, or Admin. Sources: `server/routes/templateRoutes.ts`, `server/routes/reportRoutes.ts`, `server/controllers/templateController.ts`, `server/controllers/reportController.ts`.

4. **Receiver signature authorization has a gap.** The classic sign service determines sender versus receiver but does not positively require a non-author signer to equal the report's assigned `sent_to_id` in every path. A third known user may be able to sign as receiver if other guards pass. Source: `server/services/workflowService.ts`.

5. **Inactive status is not an authentication guard.** Acting-user middleware loads users without rejecting `Inactive`; approval lookup and the normal user list can still use inactive accounts. Deactivation therefore does not reliably revoke application action capability. Sources: `server/middleware/demoUser.ts`, `server/services/workflowService.ts`, `server/repositories/dbRepository.ts`, `src/data/initialData.ts`.

6. **Demo Reset is incomplete and can leave orphaned workflow/user data.** It retains workflow instances/tasks/history, user My Packs, asset rows and disk files while deleting/recreating related definitions and users with FKs temporarily disabled. Sources: `server/db/seed.ts`, `server/db/schema.sql`.

### Medium

7. **Dynamic workflows are not end-to-end connected.** The engine, tables, definition routes and task query exist, but there is no generic task-action API, no frontend workflow API methods, and the Studio editor keeps `workflowDefinition` in local builder state instead of saving it to `workflow_definitions`. Sources: `server/services/dynamicWorkflowService.ts`, `server/routes/workflowRoutes.ts`, `src/components/template-builder/TemplateBuilder.tsx`, `src/services/apiService.ts`.

8. **Dynamic workflow actions lack classic side-effect parity.** Return/reject/action execution does not consistently create the classic report audit rows and notifications. Source: `server/services/dynamicWorkflowService.ts`.

9. **Signature plus dynamic workflow advancement is not atomic.** The signature transaction commits before the workflow action is invoked; a later workflow error can leave a signature without matching task advancement. Source: `server/services/workflowService.ts`.

10. **Disabling template governance can bypass schema validation.** The direct-approval branch occurs before the validation block in submit behavior, allowing governance-off publication of a schema that the governed path would reject. Source: `server/services/workflowService.ts`.

11. **Template update ignores the path ID.** `PUT /api/templates/:id` passes the request body to save logic and does not bind/verify `req.params.id`. A mismatched/missing body ID can update a different template or create a new one. Sources: `server/controllers/templateController.ts`, `server/services/workflowService.ts`.

12. **Template edits have no creator ownership guard.** Save blocks Approved templates but does not require the acting user to own the Draft, Pending, Rejected, Archived, or Superseded row. Source: `server/services/workflowService.ts`.

13. **Raw report updates allow states the UI treats as non-editable.** The service checks author and blocks Signed, but can update Sent or Rejected reports; a Rejected report remains Rejected after editing. Sources: `server/services/workflowService.ts`, `src/components/reports/ReportViewModal.tsx`.

14. **Report send hierarchy differs between frontend and backend.** The UI chooses a hierarchy-based Active recipient, while the endpoint accepts any Active existing non-self user. It can also resend a Sent report, repeating downstream effects. Sources: `src/components/reports/SendReportModal.tsx`, `server/services/workflowService.ts`.

16. **Inactive categories remain available outside Admin.** The ordinary categories endpoint does not filter or expose status, and template save does not prohibit an inactive category. Sources: `server/routes/apiRouter.ts`, `server/services/workflowService.ts`, `src/services/apiService.ts`.

18. **Migration rebuilds can drop newer columns.** The legacy template-status rebuild omits `theme_json`, and the reports status rebuild omits `template_version_id`; old databases can emerge with variant schemas. Source: `server/db/database.ts`.

19. **User migration weakens schema integrity.** The conditional users-table rebuild loses the formal self-referencing manager foreign key. Source: `server/db/database.ts`.

20. **Asset replacement cleanup queries nonexistent columns.** Cleanup refers to `template_assets.file_path` and `template_id`, while the actual schema uses other names; the exception is silently swallowed, potentially retaining old files/rows. Sources: `server/routes/assetRoutes.ts`, `server/db/schema.sql`.

21. **Migration errors are broadly swallowed and have no ledger.** Duplicate/failed `ALTER` operations are ignored, there is no schema-version table, and initialization is not one encompassing transaction. Source: `server/db/database.ts`.

22. **Import capabilities are disconnected and inconsistent.** The visible modal imports pasted JSON locally and labels document imports “coming soon”; the backend can analyze JSON, DOCX, XLS, and XLSX but has no frontend API method. PDF is rejected. Sources: `src/components/template-builder/ImportTemplateModal.tsx`, `server/routes/intakeRoutes.ts`, `server/services/templateImportService.ts`, `src/services/apiService.ts`.

### Low

23. **System feature enforcement is primarily frontend filtering.** Disabled Studio flags/elements/content are hidden from current UI, but backend template persistence does not comprehensively reject disabled items already known to a caller. Sources: `src/context/SystemConfigContext.tsx`, `src/components/template-builder/StudioRail.tsx`, `server/services/workflowService.ts`.

24. **Admin Studio Configuration omits the Packs flag.** Nine flags are seeded and used, but the Admin Studio Configuration list exposes only eight; `studio.packs` is absent there. Sources: `src/components/admin/AdminStudioConfig.tsx`, `src/components/template-builder/StudioRail.tsx`, `server/db/seed.ts`.

25. **Template status types lag the database.** Frontend domain types cover Draft/Pending Approval/Approved/Rejected but omit the real Archived and Superseded database states, leading to casts and incomplete UI assumptions. Sources: `src/types/index.ts`, `server/db/schema.sql`, `server/services/workflowService.ts`.

26. **Client cache has two historical key names and two sources of truth.** `AppContext` stores a broad demo snapshot while API synchronization replaces templates/reports/notifications; comments/audits may remain client-derived. `apiService` and the context reference different state-key names. Sources: `src/context/AppContext.tsx`, `src/services/apiService.ts`.

27. **Admin Overview mixes live and hardcoded information.** Entity counts are loaded, while “Operational,” “100% Online,” and the role distribution sentence are fixed presentation text. Source: `src/components/admin/AdminOverview.tsx`.

28. **Generated identifiers are demo-grade.** Several IDs/signature verification strings use timestamps/random fragments and a hardcoded `2026` prefix rather than durable collision-controlled generation. Sources: `server/services/workflowService.ts`, `server/services/adminService.ts`, `server/routes/apiRouter.ts`.

29. **Legacy/unused artifacts remain.** `AddTemplateModal.tsx` overlaps the newer Studio path; the `digital_signatures` table coexists with `user_signature_profiles` and `report_signature_audit`; removed Logic navigation leaves help/test/engine artifacts. Sources: `src/components/templates/AddTemplateModal.tsx`, `server/db/schema.sql`, `src/shared/component-help/index.ts`, `src/shared/template-rules/index.ts`.

30. **Core UI components are very large and weakly typed in places.** `PropertiesPanel.tsx` and `TemplateBuilder.tsx` concentrate many responsibilities; broad `any`/casts appear around serialized schema, imports and workflow data. Sources: `src/components/template-builder/PropertiesPanel.tsx`, `src/components/template-builder/TemplateBuilder.tsx`, `src/types/index.ts`.

31. **Automated test coverage is not part of the normal package workflow.** `package.json` exposes development/build/lint/demo commands but no standard unit/integration test script; existing verification scripts are primarily manual/demo checks. Sources: `package.json`, `scripts/`.

32. **List APIs and Admin tables have no pagination contract.** Current dataset sizes are small, but templates, reports, users, audit logs, notifications, Packs and content are generally loaded as whole arrays and filtered client-side or with simple query predicates. Sources: route/controller files under `server/`, Admin page components under `src/components/admin/`.

## 2. Current implementation status matrix

Status labels are deliberately strict:

- **Fully Functional**: visible flow is backed by API/database behavior within demo constraints.
- **Partially Functional**: meaningful implementation exists, but the end-to-end contract is incomplete or inconsistent.
- **UI Only / Not Fully Functional**: visible control does not reach equivalent backend behavior.
- **Backend Only**: backend capability exists without a connected visible client flow.
- **Deprecated**: artifact remains but is not the active product path.
- **Not Implemented**: explicitly surfaced or expected by adjacent UI but absent.

| Major feature | Status | Evidence / limitation |
|---|---|---|
| Role-specific normal navigation | Fully Functional | `App.tsx`, `Sidebar.tsx`; view-state navigation and role filters work |
| Demo role switching | Fully Functional (Demo Only) | Persists identity and drives the header; not authentication |
| Employee/Manager/Director dashboards | Fully Functional | Derived from context collections; some presentation values are static |
| Admin Overview | Partially Functional | Live counts plus hardcoded health/distribution presentation |
| Template catalog/search/filter | Fully Functional | API-backed catalog and client filtering |
| Template Studio section/field editing | Fully Functional | Builder persists serialized schema through template API |
| Drag/drop element composition | Fully Functional | DnD registry and schema persistence are connected |
| Template rules/calculations | Partially Functional | Runtime utilities/persistence exist; dedicated Logic navigation was removed |
| Template theme editing | Fully Functional | Theme JSON is stored and rendered; legacy migration can omit column |
| Template preview | Fully Functional | Current builder schema is rendered in preview UI |
| Template JSON import | Fully Functional | Visible modal parses local JSON into builder state |
| DOCX/XLS/XLSX import | Backend Only | Analyzer endpoint exists; no visible API call from import modal |
| PDF import | Not Implemented | UI says coming soon; backend rejects it |
| Template save/edit | Partially Functional | API-backed, but path ID/ownership guards are weak |
| Classic template submit/approve/reject | Fully Functional | Transactions, audit, comments and notifications are connected |
| Template version creation | Fully Functional | Separate Draft/version snapshot is created; ownership guard is weak |
| Dynamic workflow designer | UI Only / Not Fully Functional | Local editor state is not persisted to workflow APIs |
| Dynamic workflow engine | Partially Functional | Definitions, instances, tasks and service exist; action API/client integration is incomplete |
| Approved-template report creation | Fully Functional | Snapshot-bound report and field rows are persisted |
| Report editing/completion | Fully Functional | Required/visible/calculation checks exist; raw update states are broader than UI |
| Hierarchical recipient selection | Partially Functional | Enforced by UI convention, not backend authorization |
| Report send | Fully Functional | Persists recipient/state/audit/notification; duplicate send is possible |
| Report comments | Fully Functional | API/database/UI connected; resource authorization is permissive |
| Return for Changes | Fully Functional | Policy, recipient, reason, transaction, audit and notification are connected |
| Report rejection | Fully Functional | Policy, recipient, state, reason, audit and notification are connected |
| Digital signatures | Partially Functional | Profiles, audit, verification and lock exist; receiver authorization/workflow atomicity gaps remain |
| Report/template audit views | Partially Functional | Report UI is connected; authoritative template audit is not fully hydrated into normal client state |
| Notifications/read/read-all | Fully Functional | API/database/UI connected; client fallback can update only local state |
| Standard Packs | Fully Functional | Admin lifecycle and published-user consumption are persisted snapshots |
| My Packs | Fully Functional | Owner CRUD and insertion work; reset intentionally/inadvertently retains them |
| Built-in system Packs | Fully Functional | Read-only seeded system Packs are available for insertion |
| Content Library | Fully Functional | Admin CRUD/status and user insertion are connected |
| Feature Management | Partially Functional | Persistence/audit/UI filtering work; backend enforcement is incomplete |
| Element Management | Partially Functional | Admin toggle filters Studio; persisted/forged disabled elements are not comprehensively rejected |
| System workflow policies | Fully Functional | Rejection/return/signature/governance switches reach relevant UI and service checks |
| Users & Access | Partially Functional | Admin CRUD/status persists; inactive enforcement and normal-app integration are incomplete |
| Category Management | Partially Functional | Admin CRUD/status persists; ordinary endpoint ignores inactive status |
| Admin Audit Log | Fully Functional | Admin mutations write/query persistent audit rows |
| Demo Reset | Partially Functional | Re-seeds core domains but leaves workflows/user Packs/assets/files |
| Production authentication/authorization | Not Implemented | Explicit demo-user header model only |
| Logic Studio navigation | Deprecated | Rail item removed; supporting engine/help/test artifacts remain |
| Legacy Add Template modal | Deprecated | Newer Template Studio is active creation path |
| Asset upload/serving | Partially Functional | API and storage exist; replacement cleanup and broad read access have gaps |

## 3. Frontend/backend contract discrepancies

| Domain | Frontend behavior | Backend/database behavior |
|---|---|---|
| Recipients | Hierarchy-based Manager/Director choices | Any existing non-self user accepted; status not checked |
| Inactive users | Admin UI suggests access is revoked | Acting middleware and approval logic do not consistently enforce status |
| Inactive categories | Admin can deactivate them | Ordinary category API still exposes names; save accepts them |
| Template editing | UI guides owner through Draft lifecycle | Service does not enforce ownership for non-Approved templates |
| Report editing | UI restricts editing by lifecycle | Raw update blocks only non-author and Signed |
| Workflow designer | Appears as a Studio editor | Definition is local state and is not saved through workflow API |
| Document import | Visible UI says file formats are upcoming | DOCX/XLS/XLSX analyzer already exists as backend-only capability |
| Status model | Main TypeScript union has four template statuses | SQLite/service use six, including Archived and Superseded |
| Feature disablement | Navigation/items disappear after config refresh | Persistence APIs do not universally reject disabled capabilities |
| Reset | UI presents a demo reset | Backend performs a partial reset, leaving several domains/files |
| Template audit | Client keeps approval records/comments | SQLite has authoritative `template_audit_history` not fully exposed/hydrated |
| Admin users | Admin can create/deactivate users | Normal app continues to use static seeded `DEMO_USERS` |

## 4. Production-readiness boundary

WidgetFlow is a substantial, database-backed functional demo, not a production-ready multi-user system. A production assessment would have to start with the six Critical facts above: replace identity simulation, define complete resource authorization, enforce active status, stop unconditional reseeding, close receiver-signature authorization, and make reset/data lifecycle internally consistent. This statement describes the repository as found; it is not a claim that the intended product design requires these demo shortcuts.

## 5. Source coverage

Evidence was drawn from all route/controller/service/repository/middleware modules under `server/`, `server/db/schema.sql`, `server/db/database.ts`, `server/db/seed.ts`, frontend contexts and services, normal and Admin pages/components, the Studio registry/builder/utilities, `package.json`, and the checked-in SQLite schema. Detailed source-to-domain mappings appear in `WIDGETFLOW_MASTER_SPECIFICATION.md`, `FRONTEND_ARCHITECTURE.md`, `BACKEND_ARCHITECTURE.md`, `API_REFERENCE.md`, and `DATABASE_SPECIFICATION.md`.
