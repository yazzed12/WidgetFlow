# Complete API Reference

## 1. Conventions

Base path is `/api`. Every operation, including Health and Admin, passes demo middleware and accepts `X-Demo-User-Id`; missing/unknown values silently become Ahmed Employee. This is not real authentication.

Typical success:

```json
{"success":true,"data":{"id":"..."}}
```

List success uses an array. Health uses `{"success":true,"status":"ok","timestamp":"..."}`. Delete/reset may use `message`. Failure:

```json
{"success":false,"error":{"code":"FORBIDDEN","message":"..."}}
```

Common statuses: 200 for every successful create/update (no 201/204); 400 validation/state; 401 only when middleware user is unexpectedly absent in profile/Content Pack handlers; 403 role/ownership/policy; 404 missing; 500 uncaught/plain service/SQL; streamed asset 200 binary. Examples below omit repeated JSON headers but include the demo identity.

## 2. Health, users, categories, profile, demo (9)

| # | Method/path | Purpose/roles | Query/body | Response/effects/errors |
|---:|---|---|---|---|
| 1 | GET `/api/health` | process health; any demo identity | none | status/timestamp; does not verify DB separately |
| 2 | GET `/api/users` | normal directory; any | none | users without status/manager; reads `users` |
| 3 | GET `/api/users/:id` | one user; any | path ID | user or 404 `NOT_FOUND`; no access guard |
| 4 | GET `/api/user/signature-profile` | acting profile | none | profile or `data:null`; nominal 401 if no user |
| 5 | POST `/api/user/signature-profile` | upsert acting profile | `{method:"uploaded|drawn|typed",assetReference?,drawingReference?,typedName?}` | profile; 400 `INVALID_METHOD`; writes `user_signature_profiles` |
| 6 | GET `/api/categories` | normal category list | none | ID/name/description/templateCount; omits status |
| 7 | POST `/api/demo/reset` | reseed demo; any | empty | `{success:true,message}`; broad DB reset, no role check |
| 8 | GET `/api/system/config` | effective feature/element/settings; any | none | three maps plus four workflow aliases |
| 9 | GET `/api/admin/config` | same effective config; Admin | none | 403 non-Admin |

Example:

```http
GET /api/users/user-manager
X-Demo-User-Id: user-employee
```

```json
{"success":true,"data":{"id":"user-manager","name":"Sarah Mohamed","role":"Manager","department":"Operations Management"}}
```

## 3. Templates and approvals (12 operations)

| # | Method/path | Purpose/allowed actor | Query/body | Response, validation, DB/audit/notification |
|---:|---|---|---|---|
| 10 | GET `/api/templates` | list; any | `status?`, `categoryId?`, `search?` | hydrated templates; search SQL name/description; no authorization |
| 11 | POST `/api/templates` | create/update Draft; any demo role | full template schema, optional `id` | Draft; transaction template/tags/sections/fields; Created audit; Approved existing -> 400 `LOCKED` |
| 12 | PUT `/api/templates/:id` | nominal update Draft | full schema | same controller as POST; **path `:id` is ignored**, body must contain ID or a new row is created |
| 13 | GET `/api/templates/approvals` | pending assigned to acting ID | none | same list as alias below |
| 14 | GET `/api/template-approvals` | compatibility alias | none | router rewrites to `/approvals`; assigned Pending list |
| 15 | GET `/api/templates/:id` | detail; any | path | hydrated template or 404; no owner/public guard |
| 16 | POST `/api/templates/:id/submit` | creator intended; backend any | optional schema/body | saves Draft then governance/validation; Pending/Approved; audit, optional snapshot/notification |
| 17 | POST `/api/templates/:id/approve` | exact assigned approver | empty | Approved + snapshot/archive/audit/author notification; 404, 400 `INVALID_STATUS`, 403 |
| 18 | POST `/api/templates/:id/reject` | exact assigned approver | `{reason}` | Rejected/reason/audit/notification; `REASON_REQUIRED` |
| 19 | GET `/api/templates/:id/comments` | intended participants; backend any | none | chronological comments; no template existence/access check in read repository |
| 20 | POST `/api/templates/:id/comments` | intended participants; backend any | `{message}` | comment list; transaction + optional notification; `MESSAGE_REQUIRED`, 404 |
| 21 | POST `/api/templates/:id/version` | creator intended; backend any | empty | new Draft template at minor+1; 404; no ownership check |

Submit example:

```http
POST /api/templates/tpl-123/submit
X-Demo-User-Id: user-employee
Content-Type: application/json

{}
```

```json
{"success":true,"data":{"id":"tpl-123","status":"Pending Approval","requestedApprovalFromUserId":"user-manager","requestedApprovalFromName":"Sarah Mohamed"}}
```

Possible schema errors include `INVALID_TEMPLATE_SCHEMA`, `LOCKED`, generic `BAD_REQUEST`; schema validator messages are concatenated.

## 4. Reports and comments (11)

| # | Method/path | Purpose/actor | Query/body | Response/effects/errors |
|---:|---|---|---|---|
| 22 | GET `/api/reports` | accessible list | `mine=true?`, `received=true?`, `status?` | own/received; Director all on default; hydrated values/snapshot/signatures/audit |
| 23 | POST `/api/reports` | create from Approved template; any | `{templateId,data?,title?}` | Draft report + version reference/values/Created audit; `NOT_FOUND`, `NOT_APPROVED` |
| 24 | GET `/api/reports/:id` | detail; backend any | path | hydrated report or 404; **no resource guard** |
| 25 | PUT `/api/reports/:id` | author | `{data,title?}` | update/values/Draft Saved audit; Signed `LOCKED`, nonauthor 403, duplicate alias 400 |
| 26 | POST `/api/reports/:id/complete` | author | `{data,title?}` | Completed + values/audit; required-visible validation |
| 27 | POST `/api/reports/:id/send` | author | `{recipientUserId,senderNote?,signaturePayload?}` | Sent, optional sender signature, audit, recipient notification, optional workflow start |
| 28 | POST `/api/reports/:id/return` | assigned task/reviewer | `{reason}` | Returned; signature supersession; classic audit/notification; policy/reason/state/recipient guards |
| 29 | POST `/api/reports/:id/reject` | assigned task/reviewer | `{reason}` | Rejected; classic audit/notification; policy/reason/state/recipient/non-author guards |
| 30 | POST `/api/reports/:id/sign` | sender author or receiver | signature payload | component signature/hash/verification, state/audit/notification; policy/lock/prerequisite/replay |
| 31 | GET `/api/reports/:id/comments` | intended participants; backend any | none | chronological comments; no resource guard |
| 32 | POST `/api/reports/:id/comments` | intended participants; backend any | `{message}` | comments + opposite-party notification; no participant/status guard |

Create/send examples:

```http
POST /api/reports
X-Demo-User-Id: user-employee

{"templateId":"tpl-hr-1","title":"Week 35","data":{"reporting_period":"2026-08-28"}}
```

```json
{"success":true,"data":{"id":"rep-...","templateId":"tpl-hr-1","status":"Draft","title":"Week 35"}}
```

```http
POST /api/reports/rep-123/send
X-Demo-User-Id: user-employee

{"recipientUserId":"user-manager","senderNote":"Please review"}
```

Common report codes: `NOT_FOUND`, `NOT_APPROVED`, `FORBIDDEN`, `LOCKED`, `REQUIRED_FIELDS_MISSING`, `DUPLICATE_FIELD_VALUE`, `SELF_SEND_FORBIDDEN`, `INVALID_STATUS`, `POLICY_DISABLED`, `REASON_REQUIRED`, `SELF_SIGN_FORBIDDEN`, `SENDER_SIGNATURE_REQUIRED`, `SIGNATURE_PROFILE_REQUIRED`.

## 5. Notifications (3)

| # | Method/path | Purpose | Input | Result |
|---:|---|---|---|---|
| 33 | GET `/api/notifications` | current inbox | none | current recipient rows newest first |
| 34 | PATCH `/api/notifications/:id/read` | mark own notification | path | scoped update, returns full inbox; unknown/other ID still 200 |
| 35 | POST `/api/notifications/read-all` | mark all own read | empty | scoped bulk update, returns inbox |

Example result:

```json
{"success":true,"data":[{"id":"notif-1","userId":"user-manager","type":"approval_required","read":false,"timestamp":"..."}]}
```

## 6. Assets and template intake (4)

| # | Method/path | Purpose/roles | Body | Response/validation/effects |
|---:|---|---|---|---|
| 36 | POST `/api/assets/signature-upload` | private signature image; any acting user | `{filename?,mimeType?,base64Data,attestationAccepted:true}` | `{id,url,mimeType}`; 5 MB, magic byte, PNG dimensions, SVG/script rejection; file + `template_assets` |
| 37 | POST `/api/assets/upload` | generic template/report asset | `{filename?,mimeType?,base64Data}` | `{id,url}`; MIME allowlist, 10 MB; writes file/metadata |
| 38 | GET `/api/assets/:id` | stream asset | path | binary with content type; 404; signature owner/participant/Director check; generic no resource check |
| 39 | POST `/api/template-import/analyze` | analyze DOCX/XLS/XLSX/JSON; any | multipart `file` | ImportProposal; 10 MB; invalid type/file missing/schema errors; temp file deleted |

Signature example:

```json
{"filename":"signature.png","mimeType":"image/png","base64Data":"data:image/png;base64,...","attestationAccepted":true}
```

The frontend `apiService` does not implement the multipart analyze call.

## 7. User Content Packs and user-facing standard content (9)

| # | Method/path | Purpose/actor | Body/query | Result/effects/errors |
|---:|---|---|---|---|
| 40 | GET `/api/content-packs` | system + own My Packs | none | hydrated JSON sections |
| 41 | POST `/api/content-packs` | create own Pack | `{name,category?,description?,iconName?,sections?}` | forces owner/current and source user; name required; 200 created |
| 42 | PUT `/api/content-packs/:id` | owner edit | any name/category/description/sections | 404 or 403; system/other denied |
| 43 | DELETE `/api/content-packs/:id` | owner delete | none | message; 403 system/not owner/not found |
| 44 | POST `/api/content-packs/:packId/components` | owner add component | `{sectionId?,newSectionName?,componentDef}` | updated Pack; 400 component/mutation, 403 ownership |
| 45 | GET `/api/packs` | Published Standard Packs | none | hydrated Published list |
| 46 | GET `/api/packs/:id` | Published Standard Pack detail | path | Pack or 404 unavailable |
| 47 | GET `/api/content-library` | enabled single items | none | enabled content list |
| 48 | GET `/api/admin/packs/:id` | Admin Standard Pack detail | path | included again under Admin protection; counted here by domain but mounted once |

To avoid double counting, operation #48 is the same mounted operation later referenced in Admin Packs; the **canonical mounted total remains 75**, and the numbered master list below treats every route once. In the remaining sections numbering follows the canonical route inventory rather than this domain cross-reference.

## 8. Admin configuration/users/categories/audit/settings (14 canonical operations)

All require `user-admin`; otherwise 403.

| Canonical # | Method/path | Body | Response/effects/errors |
|---:|---|---|---|
| 49 | GET `/api/admin/features` | none | all feature rows |
| 50 | PATCH `/api/admin/features/:featureKey` | `{enabled}` | updated + audit; missing 400; unknown likely 500 |
| 51 | GET `/api/admin/elements` | none | all 23 rows |
| 52 | PATCH `/api/admin/elements/:elementKey` | `{enabled}` | updated + audit |
| 53 | GET `/api/admin/users` | none | users with status/time |
| 54 | POST `/api/admin/users` | `{name,email,role,department}` | created user + audit; required; Admin role rejected; duplicate email can 500 |
| 55 | PATCH `/api/admin/users/:id/status` | `{status:"Active|Inactive|Resigned|Terminated"}` | updated + status audit; Admin self-protection |
| 55a | PATCH `/api/admin/users/:id` | `{name?,email?,department?,role?,status?}` | updated + detail/role/status audits; operational roles/status allowlisted; Admin accounts protected |
| 56 | GET `/api/admin/categories` | none | categories with status/template count |
| 57 | POST `/api/admin/categories` | `{name,description}` | created + audit; name required; duplicate can 500 |
| 58 | PATCH `/api/admin/categories/:id` | `{name?,description?,status?}` | updated + audit; route does not allowlist status |
| 59 | GET `/api/admin/audit` | none | newest 200 Admin audits |
| 60 | PATCH `/api/admin/settings` | arbitrary key/value map | upserts typed strings + generic audit |
| 61 | GET `/api/admin/config` | none | effective config (also listed #9) |
| 62 | GET `/api/system/config` | none | public config (also listed #8) |

Again #61/#62 are cross-references already counted in the first section. The next canonical inventory provides the unambiguous 75-route sequence.

## 9. Admin Standard Packs (6 remaining unique operations)

| Route | Body/result |
|---|---|
| GET `/api/admin/packs` | all statuses, hydrated items |
| GET `/api/admin/packs/:id` | one or 404 |
| POST `/api/admin/packs` | `{name,description?,categoryId?,status?,items}`; unique name/min one; audit |
| PUT `/api/admin/packs/:id` | partial fields/items; rewrites children; audit |
| POST `/api/admin/packs/:id/publish` | status Published; audit |
| PATCH `/api/admin/packs/:id/status` | `{status:"Draft|Published|Disabled"}`; audit |

Example item:

```json
{"sourceType":"field","sourceKey":"reporting_period","label":"Reporting Period","configuration":{"type":"date","required":true}}
```

## 10. Admin Content Library (4)

| Route | Body/result |
|---|---|
| GET `/api/admin/content-library` | all enabled/disabled items |
| POST `/api/admin/content-library` | `{name,description?,category,contentType,contentValue}`; created enabled + audit |
| PUT `/api/admin/content-library/:id` | partial fields + `enabled?`; update + audit |
| PATCH `/api/admin/content-library/:id/status` | `{enabled}`; status + audit |

Content type must satisfy database allowlist; route checks only presence on create.

## 11. Dynamic workflows (6)

| Route | Purpose/actor | Body/result/errors |
|---|---|---|
| GET `/api/workflows` | list; any | all definition JSON, no access guard |
| POST `/api/workflows` | save/update; any | `{id?,name,description?,templateId?,steps?,version?,status?}`; no role/ownership/schema validation |
| POST `/api/workflows/:id/publish` | snapshot/activate; any | definition or 404; transaction |
| GET `/api/workflows/template/:templateId` | active definition; any | definition or `data:null` |
| GET `/api/workflows/reports/:reportId` | execution snapshot/tasks/history; any | object or null; no participant guard |
| GET `/api/workflows/tasks/my` | current assigned tasks | user ID or role match; pending only |

There is no route for `executeWorkflowTaskAction`; Approve/Acknowledge/Comment cannot be driven generically over the public API.

## 12. Canonical mounted-route inventory and count

To remove the domain cross-reference duplication above, the exact unique sequence derived from the router source is:

```text
 1 GET health                         39 PATCH admin packs status
 2 GET users                          40 GET admin content library
 3 GET user by id                     41 POST admin content library
 4 GET signature profile              42 PUT admin content item
 5 POST signature profile             43 PATCH admin content status
 6 GET categories                     44 POST signature upload
 7 GET template-approvals alias        45 POST general asset upload
 8 GET notifications                  46 GET asset
 9 PATCH notification read             47 POST template import analyze
10 POST notifications read-all         48 GET reports
11 GET content-packs                   49 POST reports
12 POST content-packs                  50 GET report by id
13 PUT content-pack                    51 PUT report
14 DELETE content-pack                 52 POST report complete
15 POST add component to pack          53 POST report send
16 GET published packs                 54 POST report return
17 GET published pack                  55 POST report reject
18 GET enabled content                 56 POST report sign
19 POST demo reset                     57 GET report comments
20 GET system config                   58 POST report comments
21 GET admin config                    59 GET templates
22 GET admin features                  60 POST templates
23 PATCH admin feature                 61 PUT template
24 GET admin elements                  62 GET templates/approvals
25 PATCH admin element                 63 GET template by id
26 GET admin users                     64 POST template submit
27 POST admin user                     65 POST template approve
28 PATCH admin user status             66 POST template reject
29 GET admin categories                67 GET template comments
30 POST admin category                 68 POST template comments
31 PATCH admin category                69 POST template version
32 GET admin audit                     70 GET workflows
33 PATCH admin settings                71 POST workflows
34 GET admin packs                     72 POST workflow publish
35 GET admin pack                      73 GET workflow for template
36 POST admin pack                     74 GET workflow report execution
37 PUT admin pack                      75 GET my workflow tasks
38 POST admin pack publish
```

**Total: 75 mounted API operations.**

## 13. Frontend `ApiError` handling

The client ignores error response bodies that are not JSON because JSON parse falls into Network Error. It retains `code` and `statusCode`, but callers typically display only `message`. There is no business-localStorage mutation fallback except notification read state. `SystemConfigContext` silently uses defaults; Admin lists show retry; normal mutations show toast; some Admin mutations use browser alerts.

Sources: `server/routes/*.ts`, controllers/services/repository, `src/services/apiService.ts`.
