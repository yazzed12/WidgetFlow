# Notifications, Comments, and Audit Systems

## 1. Notification architecture

Notifications are rows in SQLite and always scoped by `recipient_user_id` in list/read mutations. `AppContext` refreshes the current user’s collection after most workflow mutations. Navbar dropdown and Notifications page use the same collection.

Database fields: ID, recipient, unconstrained type string, title, message, optional related template/report FKs (`SET NULL`), read integer, created time. Index `(recipient_user_id,is_read)` supports inbox queries.

## 2. Complete notification type inventory (8)

### `approval_required`

- **Trigger:** governed Employee/Manager template submission to Pending Approval.
- **Recipient:** selected first Manager/Director.
- **Title:** `New Template Submitted for Approval`.
- **Message:** `<creator> submitted "<template>" report template for your approval.`
- **Entity/click:** related template; if acting user is assigned, Notifications page navigates Approvals.
- **Status:** Fully Functional. Seed baseline contains one for Sarah.

### `template_approved`

- **Trigger:** assigned approver approves.
- **Recipient:** template creator.
- **Title:** `Report Template Approved!`.
- **Message:** `<approver> approved your report template "<name>". It is now available firm-wide.`
- **Click:** Approved template detail.
- **Status:** Fully Functional.

### `template_rejected`

- **Trigger:** assigned approver rejects with reason.
- **Recipient:** creator.
- **Title:** `Report Template Revision Requested`.
- **Message:** `<approver> requested changes on your template "<name>". Reason: <reason>`.
- **Click:** My Requests for non-approved own row.
- **Status:** Fully Functional.

### `report_received`

- **Trigger:** classic send transaction, including send that also starts dynamic workflow.
- **Recipient:** chosen send recipient, even if dynamic workflow immediately changes `sent_to_user_id` to a role/unassigned task.
- **Title:** `Report Awaiting Your Review`.
- **Message:** `<author> sent report "<title>" for your review & digital sign-off.`
- **Click:** report modal if it remains in loaded accessible list; otherwise Reports.
- **Status:** Fully Functional, potentially inconsistent with dynamic task assignee.

### `report_returned`

- **Trigger:** classic Return for Changes.
- **Recipient:** report author.
- **Title:** `Report Returned for Changes`.
- **Message:** `<reviewer> requested changes on report "<title>". Reason: <reason>`.
- **Click:** report modal.
- **Dynamic gap:** workflow task Return does not create this notification.
- **Status:** Fully Functional classic / missing dynamic parity.

### `report_rejected`

- **Trigger:** classic report rejection.
- **Recipient:** author.
- **Title:** `Report rejected`.
- **Message:** `<reviewer> rejected "<title>". Review the rejection reason.`
- **Dynamic gap:** workflow Reject does not notify.
- **Status:** Fully Functional classic / missing dynamic parity.

### `report_signed`

- **Trigger:** receiver component signature when signer differs from author.
- **Recipient:** author.
- **Title:** `Report Digitally Signed!`.
- **Message:** `<signer> signed report "<title>". Verification ID: <id>`.
- **Legacy:** seeded legacy `digital_signatures` record has no matching seeded notification.
- **Status:** Fully Functional current model.

### `comment_added`

- **Trigger:** template or report comment.
- **Recipient:** template other party (creator vs requested approver), or report other party (author vs sent recipient).
- **Template title/message:** `New Template Request Comment`; `<user> commented on template "<name>": "<message>"`.
- **Report title/message:** `New Report Discussion Comment`; analogous report message.
- **Click:** template or report based on which related FK is present.
- **Status:** Fully Functional with comment authorization gaps.

## 3. Read/unread and navigation

- `GET /api/notifications` returns only acting user, newest first.
- `PATCH /api/notifications/:id/read` updates only matching recipient; nonexistent/other ID silently leaves data unchanged and still returns 200 collection.
- `POST /api/notifications/read-all` scopes to acting recipient.
- Navbar badge/dropdown and Sidebar badge count unread current-user rows.
- Notifications page filters All, Unread, Templates, Reports, Comments and groups Today/Yesterday/Earlier.
- Clicking first initiates a nonawaited read mutation, then resolves related entity from current AppContext. Missing entity falls back to page navigation.
- When API read calls fail, AppContext locally marks notification(s) read and persists to localStorage, so UI may diverge from SQLite until next sync.

## 4. Template discussions

`template_comments` stores template/user FKs plus denormalized user name/role/avatar initials, message and timestamp. API list is chronological. Add requires nonempty message and existing template, writes comment and optional `comment_added` in one transaction.

Scope is intended to be request creator and assigned approver. Actual API has no status or participant authorization. Any demo identity can list/post by known template ID. If a third party comments, recipient calculation sends to creator because they are not creator, but requester/approver confidentiality is not enforced.

Display surfaces: `RequestCommentThread`, `RequestChatDrawer`, Approval/Request detail drawers. AppContext’s `requestComments` array originates from local demo state and is not globally refreshed from the comment API; dedicated thread components may fetch, creating inconsistent state sources.

## 5. Report review comments

`report_comments` is analogous but uses `created_at` and hydrates the role property as `role` rather than `userRole`. Add transaction selects recipient: if author comments, current `sentToId`; otherwise author. No participant or report-status restriction exists. Any identity can read/post known report ID.

`ReportCommentThread` filters `AppContext.reportComments`, which is initialized from local empty/default storage and AppContext add does not set returned comments into it. Depending on component-level fetching, posted comments may not immediately appear. This is **Partially Implemented UI state integration** even though database/API persistence is real.

## 6. Template audit history

Table: `template_audit_history`.

Fields: ID, template FK, template name snapshot, person name, role, action, optional comment, timestamp. No API directly exposes audit rows. Some seed/local `approvalRecords` drive request/approval UI, while hydrated template objects do not include audit history.

Implemented actions:

- `Created` — new Draft.
- `Submitted` — governed request.
- `Published` — Director/direct publication.
- `Approved` — assigned approval.
- `Rejected` — assigned rejection.
- `Archived` — System replacement of older same-identity Approved template.

Who can view: intended Request/Approval detail, but those use local approval records rather than authoritative table. Therefore storage is Fully Functional; UI/API visibility is **Partially Implemented**.

## 7. Report audit history

Table: `report_audit_history`; hydrated into every report response and shown in Report View.

Implemented actions/comments:

- `Created` — report instantiated.
- `Draft Saved` — author update.
- `Completed` — required validation passed.
- `Sent` — sent without new sender signature.
- `Signed & Sent` — required sender signature created during send.
- `Signed (Sender)` / `Signed (Receiver)` — current component signing.
- Seed legacy actions: `Signed`, `Returned`.
- `Returned` — classic return.
- `Rejected` — classic rejection.

Fields contain denormalized actor name/role, action/comment/time; no actor user ID and no previous/new values. Dynamic workflow return/reject/advance writes `workflow_history`, not report audit, so Report View history lacks those task events unless sign service wrote its audit before task advance.

Who can view: anyone who can fetch report detail; detail endpoint has no resource guard.

## 8. Component signature audit

`report_signature_audit` is both cryptographic evidence and signature history. It stores signer ID/name/role, sender/receiver role, method, typed/image data, verification ID, confirmation, SHA-256, active flag and time. Return marks active rows inactive instead of deleting. Report hydration exposes `activeSignatures` and `signatureHistory`.

The legacy `digital_signatures` table is separate, one-per-report, and exposed as `report.signature`. It has no content hash, role (sender/receiver), method, active history or component mapping.

## 9. Dynamic workflow history

`workflow_history` records instance/step, actor ID/name/role, action, comment, optional signature verification ID and time. Start emits `Started`; task actions emit action before changing state. It is returned only through `GET /api/workflows/reports/:reportId`, which has no participant guard.

No dynamic workflow notification table/type mapping exists; assignment/progression is discoverable through pending-task API only.

## 10. Admin audit log

`admin_audit_log` stores actor ID/name/role, action, target, previous/new text, timestamp. Admin GET returns latest 200. It is append-only through public API, but Demo Reset deletes and recreates the baseline.

Coverage and action list are documented in `ADMIN_CONTROL_CENTER.md`. Unlike domain audits, it carries previous/new fields, though System Settings uses generic placeholders.

## 11. Audit system comparison

| System | Actor ID | Actor name/role | Entity link | Previous/new | UI/API visibility | Generated by |
|---|---:|---:|---:|---:|---|---|
| Template audit | No | Yes | template FK/name | comment only | local UI substitute; no direct API | template service |
| Report audit | No | Yes | report FK | comment only | hydrated report detail | report service |
| Signature audit | Yes | Yes | report/component | hash + active history | hydrated report detail | signature service |
| Workflow history | Yes | Yes | instance/step | action/comment | workflow detail API | dynamic workflow service |
| Admin audit | Yes | Yes | text target | Yes, strings | Admin audit page/API | admin service/seed |

## 12. Transaction and failure behavior

- Notification insertion is in the same classic transaction as status/audit, so a SQL failure rolls all back.
- Comment and corresponding notification share a transaction.
- Mark read/read-all are single SQL updates without explicit transactions.
- Dynamic workflow actions do not generate domain notification/audit parity.
- Timestamp/ID generation uses `Date.now()` plus random suffix in most flows; report comment notification uses only `notif-${Date.now()}`, making same-millisecond collision theoretically possible.
- Notification `type` has no DB CHECK, so new/unrecognized values render with default Bell and only All tab.

Sources: `server/services/workflowService.ts`, `dynamicWorkflowService.ts`, `adminService.ts`, `server/controllers/notificationController.ts`, `server/repositories/dbRepository.ts`, `src/pages/NotificationsPage.tsx`, `src/components/layout/NotificationDropdown.tsx`, comment components.
