# Backend Architecture and File Catalog

## 1. Runtime architecture

The backend is Node.js/TypeScript executed by `tsx`, using Express 5.2, better-sqlite3 13, CORS, dotenv, Multer, Mammoth, and XLSX. It is synchronous for database work and mostly synchronous service methods.

Startup in `server/index.ts`:

1. load environment;
2. configure CORS and JSON body limit 10 MB;
3. `initDatabase()` opens/updates schema;
4. `seedDatabase()` resets core demo data on every server start;
5. mount demo identity middleware on `/api`;
6. mount API router;
7. centralized error handler;
8. listen on `PORT` or 3001.

There is no graceful shutdown, request logging, rate limiting, security-header middleware, production auth, dependency injection, async job queue, or formal migration framework.

## 2. Layering

```text
Routes
 -> Controllers (templates/reports/notifications) OR inline route handlers
 -> workflowService / dynamicWorkflowService / adminService / templateImportService
 -> dbRepository and direct SQL
 -> better-sqlite3
```

Layer boundaries are pragmatic rather than strict: services call repositories and direct `db.prepare`; repositories call `adminService` for Pack/content convenience; routes directly query DB for assets and inline APIs. Controllers are thin envelope/parameter adapters.

## 3. Authentication and middleware

`demoUserMiddleware` reads `X-Demo-User-Id` or defaults to `user-employee`, selects a user, and attaches `req.user`. Unknown IDs get a hardcoded Ahmed object instead of 401. It does not select/inspect `status`.

`requireAdminRole` is local to `adminRoutes.ts`, applied to `/admin`, and returns explicit 403 envelope. `GET /system/config` is before that guard.

`errorHandler` converts `AppError` fields or defaults plain exceptions to `500 INTERNAL_ERROR`, logs full error, and returns failure envelope. Express async import errors pass through `next`.

## 4. Data access and transactions

- better-sqlite3 prepared statements and `.transaction` provide synchronous atomic operations.
- `dbRepository` hydrates snake_case relational rows to frontend camelCase domain objects.
- Flexible component/Pack/workflow data uses JSON text.
- Most domain IDs use timestamp/random strings rather than UUIDs.
- Transactions are declared inside services; Admin CRUD is mostly multiple standalone statements, so Pack parent/item/audit changes are not one transaction.
- Foreign keys and WAL are enabled at open. Seed temporarily disables foreign keys.

Transaction catalog:

| Workflow | Explicit transaction | Includes |
|---|---:|---|
| Template save | Yes | template, tags, sections, fields, new audit |
| Template submit | Yes after separate save | status/approver, optional snapshot/archive, audit, notification |
| Governance-off publish | No | update + snapshot standalone |
| Template approve/reject | Yes | state, snapshot/archive or reason, audit, notification |
| Report create | Yes after possible standalone version insert | report, audit, values |
| Report update/complete | Yes | report, values, audit |
| Report send | Yes | signatures/audit, report, notification, workflow start call |
| Report return/reject | Yes | state, audit, notification; signature supersession for return |
| Report sign | Yes, then possible workflow action separately | signature, state, report audit, notification |
| Template/report comment | Yes | comment + notification |
| Workflow publish/start/action | Yes | version/definition or instance/task/history/report |
| Admin Pack create/update | No | parent, items, audit can partially apply on later error |
| Other Admin mutations | No | update/insert then audit |
| Seed/reset | Yes with FK off | broad deletes/reinserts |

## 5. Backend file catalog (26 TypeScript files)

### Entry, types, middleware (4)

| File | Responsibility / exports | Dependencies/consumers |
|---|---|---|
| `server/index.ts` | Express construction/startup | database, seed, middleware, apiRouter |
| `server/types/index.ts` | `ServerUser`, `AuthenticatedRequest` | middleware/controllers/routes/services |
| `server/middleware/demoUser.ts` | `demoUserMiddleware` | SQLite users; server mount |
| `server/middleware/errorHandler.ts` | `AppError`, `errorHandler` | all services/routes; final middleware |

### Database/repository (3)

| File | Responsibility / exports | Dependencies |
|---|---|---|
| `server/db/database.ts` | opens DB, PRAGMAs, schema application, compatibility migrations, workflow/config table creation | filesystem, better-sqlite3; all SQL modules |
| `server/db/seed.ts` | `seedDatabase`; resets/inserts demo/config/templates/reports/workflow/Packs | frontend initialData and builtInContentPacks |
| `server/repositories/dbRepository.ts` | read/hydration, signature profiles/audits, comments/notifs, workflow list, Content Pack owner CRUD, user-facing Pack/content access | db, adminService, table normalizer; controllers/services/routes |

`server/db/schema.sql` is the base 16-table schema plus indexes; 15 more tables are created in `database.ts`.

### Controllers (3)

| File | Exports/responsibility | Routes/services |
|---|---|---|
| `controllers/templateController.ts` | list/detail/save/submit/approve/reject/comments/version envelope handlers | templateRoutes; repository/workflowService |
| `controllers/reportController.ts` | list/detail/create/update/complete/send/return/reject/sign/comments | reportRoutes; repository/workflowService |
| `controllers/notificationController.ts` | notification list/read/read-all; Demo Reset | apiRouter; db/repository/seed |

### Routes (7)

| File | Mounted responsibility | Main dependencies |
|---|---|---|
| `routes/apiRouter.ts` | health, users, profiles, categories, notification, Content Pack, user Pack/content, reset; mounts all routers | repository/controllers |
| `routes/adminRoutes.ts` | public config + Admin-protected configuration CRUD | adminService |
| `routes/templateRoutes.ts` | 11 template endpoints | templateController |
| `routes/reportRoutes.ts` | 11 report endpoints | reportController |
| `routes/assetRoutes.ts` | signature/general upload and streamed retrieval | DB, fs, AppError |
| `routes/intakeRoutes.ts` | multipart template analyzer | Multer, import service |
| `routes/workflowRoutes.ts` | workflow definition/publish/read/task queries | dynamicWorkflowService/repository |

### Services (6)

| File | Main exported functions/responsibility | Consumers |
|---|---|---|
| `services/workflowService.ts` | template/report lifecycle, comments, signatures, version replacement | controllers |
| `services/dynamicWorkflowService.ts` | save/publish/get workflow, start instance, execute action, tasks/detail | workflow routes and workflowService |
| `services/adminService.ts` | effective config, all Admin CRUD/audit, Standard Packs, Content items | admin routes, repository, workflow policy checks |
| `services/componentRegistry.ts` | 23 metadata entries, dynamic template schema validation | workflow submit/import/tests |
| `services/templateImportService.ts` | DOCX/XLSX/JSON analysis proposals | intake route |
| `services/valueCodec.ts` | encode/decode/validate component values by registry data kind | currently little/no production service integration; full-system checks |

### Scripts (3)

| File | Purpose | Status |
|---|---|---|
| `server/scripts/preflight.ts` | demo readiness checks | invoked by `npm run demo:check` |
| `server/scripts/smokeTest.ts` | lightweight endpoint/workflow smoke behavior | manual script |
| `server/scripts/fullSystemCheck.ts` | extensive assertions across components/security/workflow/versioning | manual, large internal verification suite |

## 6. Services in detail

### workflowService

Central classic domain service. It owns template flattening/hydration-compatible writes; governance and replacement; report version binding and canonical values; shared rule/calculation evaluation; sender/receiver signatures; policy guards; domain audit/notifications. It imports frontend shared code, so server compilation depends on `src/shared` and `src/types`.

### dynamicWorkflowService

Definition JSON and immutable version snapshots; per-report instance/task/history; action authorization by assigned user or role; transition resolution; report status bridging. It is incomplete at route/UI layer but its SQL behavior is real.

### adminService

Reads effective config and creates dual aliases; CRUD with Admin audit; Standard Pack hydration/item replacement; enabled-only user-facing content. Methods generally throw plain `Error`, causing 500 unless route catches.

### dbRepository

Read model mapper and miscellaneous persistence gateway. Notable behavior: Director all-report list; no guard on detail methods; template field ID/key/suffix aliases; immutable snapshot hydration; legacy and current signature models; Content Pack ownership.

## 7. API envelope

Normal success: `{ "success": true, "data": <payload> }`. Some mutations return `{success:true,message}` and Health returns success/status/timestamp without `data`. Failure: `{ "success": false, "error": { "code": string, "message": string } }`. Asset retrieval streams binary, not an envelope.

Frontend assumes successful JSON has `data`; `resetDemo()` ignores the mismatch because it only awaits. Health is not used by the frontend. Plain service errors often become 500 even for missing resource/unique constraint.

## 8. Startup, migration, and compatibility

`database.ts` resolves DB relative to server source: `server/data/widgetflow.db`; root-level `widgetflow.db` and `widgetflow-demo-backup.db` are not opened by the application. It creates data directory, opens DB, enables FK/WAL, executes schema, tries `ALTER TABLE` additions while swallowing duplicate errors, rebuilds legacy role/template/report/field tables based on SQL text, and creates system/workflow/signature tables.

There is no migrations ledger/version. Compatibility is heuristic and several rebuild paths can omit newer columns. Details are in `DATABASE_SPECIFICATION.md` and known issues.

## 9. Backend security controls and gaps

Implemented: prepared SQL, role guard for Admin, exact template approver, report ownership/recipient mutation guards, Pack ownership, signature binary validation/access logic, upload allowlists/limits, template schema safety, immutable Approved templates, signature hash/replay checks.

Gaps: trusted header, inactive ignored, ordinary detail/comment/workflow reads unguarded, draft template ownership absent, send hierarchy absent, receiver positive-recipient check absent, CORS unrestricted, no rate/CSRF/session/tenant model, generic assets readable by ID, import temp destination/asset files not lifecycle-scanned.

Sources: all files under `server/`, `package.json`, `vite.config.ts`.
