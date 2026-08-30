# Frontend Architecture and Page/Component Catalog

## 1. Technology and entry point

- React 19 with React DOM `createRoot` in `src/main.tsx`.
- TypeScript 6; Vite 8 build/dev; `/api` proxy configured in `vite.config.ts`.
- Tailwind CSS 4 through `@tailwindcss/vite`; global CSS in `src/index.css` and `App.css`.
- Lucide React icons; DnD Kit for builder drag/drop.
- No React Router. `AppContext.activeView` is a string switch in `App.tsx`.
- `SystemConfigProvider` wraps `AppProvider`; AppShell selects Admin or normal shell by role.
- `TemplateBuilder` is lazy-loaded; other pages/modals are eagerly imported.

## 2. State architecture

### AppContext

Owns acting user, template/report/category/notification collections, local approval/comment arrays, view/search/sidebar/toast, every global modal selection, and business action methods. Startup:

1. `getInitialState()` loads `widgetflow_demo_state_v1` or static seed data.
2. It selects static demo user.
3. `syncFromApi` replaces templates/reports/notifications from SQLite for that identity.
4. Every collection change is mirrored back to localStorage.

`users` is always static `DEMO_USERS`; it never uses `/api/users`. Categories initialize static and refresh after selected mutations. API mutation failures generally show warning toast and do not perform business-local fallback, except notification read/read-all.

### SystemConfigContext

Loads `/api/system/config`, offers `isFeatureEnabled`, `isElementEnabled`, `isSettingEnabled`, and Admin mutation helpers. Unknown keys default true. Failed load silently retains permissive `DEFAULT_CONFIG`. Default features omit `studio.packs`, although the server seed provides it; until API succeeds Packs may be treated enabled because unknown defaults true.

### Local component state

Pages own filters/tabs/modal-local state. TemplateBuilder owns a large draft reducer-like collection of individual `useState` values. Admin pages fetch their own data rather than using a unified query cache.

## 3. API/error architecture

`apiService.request` adds JSON content type and `X-Demo-User-Id`; parses response JSON; expects `{success:true,data}`; throws `ApiError(message,code,statusCode)` for HTTP/business errors. Network/parse failures become `NETWORK_ERROR` status 503 with “Unable to connect…” message.

There is no special 502 branch, retry library, cancellation, deduplication, or response schema validation. Callers use loaders, empty states, toast/alert or console error. Asset GET is streamed and not called through the JSON request helper. Multipart template import is not represented in apiService.

## 4. Navigation and modal architecture

- Normal `Sidebar` and `Navbar` mutate AppContext view/selection.
- Admin `AdminLayout` owns its own `activeTab` state and renders one Admin component.
- `GlobalModals` in App.tsx renders template/report/detail/profile/reset/chat surfaces based on nullable selected objects/booleans.
- Builder owns its internal modal stack. There is no portal manager; fixed z-index overlays render conditionally.
- Toast is one global message with success/info/warning and four-second timeout. Admin pages also create separate local toast/`alert()` patterns.
- `StatusBadge` maps template/report states to presentation, but TypeScript status types omit database Archived/Superseded.

## 5. Loading, empty, and error patterns

- App startup renders static/local data immediately, then API replaces it.
- Admin list pages usually have `loading`, `error`, retry and empty branches.
- Normal pages derive empty states from current arrays; backend connection error is not consistently surfaced.
- SystemConfig failure is silent and permissive.
- Mutations disable buttons in many modals, but duplicate protection varies; backend signature has replay guard while template submission does not.

## 6. Page catalog (7)

| File | Purpose/roles | Data/actions and related components |
|---|---|---|
| `src/pages/DashboardPage.tsx` | common normal dashboard | AppContext templates/reports/notifications/local audits; navigate, use template, view/sign report; StatusBadge |
| `src/pages/TemplatesPage.tsx` | Approved template library | search/category/tag/view filters; TemplateCard; open detail/fill/builder |
| `src/pages/MyRequestsPage.tsx` | creator template tracking | own templates, status/search; RequestDetailDrawer/edit/resubmit |
| `src/pages/ApprovalsPage.tsx` | Manager/Director assigned inbox | pending templates, local audit metrics; ApprovalDetailDrawer, Approve/Reject modals |
| `src/pages/ReportsPage.tsx` | report lists/review tabs | client filters/search; view/edit/send/sign/return/reject via ReportView |
| `src/pages/NotificationsPage.tsx` | notification inbox | filters/date groups/read/read-all/entity navigation |
| `src/pages/EngineProofPage.tsx` | workflow/component proof demonstrator | hardcoded proof cards/sample state; valid view key but no navigation; **UI Only / Not Fully Functional** |

## 7. Component catalog (72)

### Application layout and common (9)

| File | Responsibility | Data/actions |
|---|---|---|
| `src/components/layout/RoleSwitcher.tsx` | demo identity banner/switch | database-refreshed active AppContext users, AppContext.switchUser |
| `src/components/layout/Navbar.tsx` | global search, notification/comment badges, profile/reset | AppContext templates/reports/notifs; opens modals/dropdowns |
| `src/components/layout/Sidebar.tsx` | normal nav/category tree/Create Template | AppContext views/counts/categories |
| `src/components/layout/NotificationDropdown.tsx` | compact current-user inbox | read/navigate callbacks |
| `src/components/common/Toast.tsx` | global transient toast | AppContext.toast |
| `src/components/common/StatusBadge.tsx` | status presentation | template/report status mapping |
| `src/components/common/ResetDemoModal.tsx` | reset confirmation | AppContext.resetDemoData |
| `src/components/profile/ProfileModal.tsx` | acting user profile and signature entry | currentUser; opens signature settings |
| `src/components/user/UserSignatureSettingsModal.tsx` | uploaded/drawn/typed profile editor | signature profile and upload APIs |

### Templates, requests, approvals, chat (9)

| File | Responsibility | Data/actions |
|---|---|---|
| `templates/TemplateCard.tsx` | library template card | preview/use callbacks, category/status metadata |
| `templates/TemplateDetailModal.tsx` | schema/metadata detail | sections/fields; Use Template |
| `templates/AddTemplateModal.tsx` | legacy/simple template creator | local fields/metadata; AppContext save/submit; not primary Studio |
| `requests/RequestDetailDrawer.tsx` | creator request details/history/actions | local approvalRecords; edit/view discussion |
| `approvals/ApprovalDetailDrawer.tsx` | assigned review details | approve/reject/discussion/history |
| `approvals/ApproveConfirmModal.tsx` | approval confirmation | confirm callback |
| `approvals/RejectModal.tsx` | mandatory template rejection reason | confirm callback/client required validation |
| `approvals/RequestCommentThread.tsx` | template comment thread | local AppContext requestComments/add |
| `chat/RequestChatDrawer.tsx` | global request chat | selected request; overlaps comment thread |

### Reports and signatures (8)

| File | Responsibility | APIs/context |
|---|---|---|
| `reports/FillReportModal.tsx` | create/edit filled report | create/update report API, DynamicTemplateRenderer |
| `reports/ReportViewModal.tsx` | report detail, values, audit, comments, review actions | config policies, open send/edit/return/reject/sign |
| `reports/SendReportModal.tsx` | select hierarchical recipient/note/sender signature | static users, profile, send API |
| `reports/ReturnReportModal.tsx` | revision feedback | return API via context |
| `reports/RejectReportModal.tsx` | terminal rejection reason | reject API via context |
| `reports/ReportCommentThread.tsx` | report discussion | AppContext comments/add |
| `reports/SignReportModal.tsx` | lightweight sign wrapper/legacy surface | AppContext.signReport |
| `report/ReportSignatureModal.tsx` | signature method/attestation/confirm | current signature services |

### Dynamic report rendering (8)

| File | Responsibility |
|---|---|
| `dynamic-template/DynamicTemplateRenderer.tsx` | section/component report form orchestration and rule states |
| `dynamic-template/TemplateComponentRenderer.tsx` | type switch for all 23 elements |
| `dynamic-template/TableV2Renderer.tsx` | editable/calculated/aggregate tables |
| `dynamic-template/RepeatingGroupRenderer.tsx` | repeatable nested records |
| `dynamic-template/RatingInputControl.tsx` | rating variants |
| `dynamic-template/AcknowledgementControl.tsx` | statement/check/timestamp |
| `dynamic-template/FileAttachmentControl.tsx` | upload/attachment list |
| `dynamic-template/SignatureRenderer.tsx` | sender/receiver signature display/action |

### Template Builder (25)

| File | Responsibility | Data/dependencies |
|---|---|---|
| `template-builder/TemplateBuilder.tsx` | Studio orchestrator | App/System config, API, DnD, all builder state |
| `BuilderHeader.tsx` | metadata/actions/status/validation | categories, save/submit/import/preview |
| `StudioRail.tsx` | nine feature-flagged modules | SystemConfig |
| `StudioPanels.tsx` | Templates/Elements/Text/Sections/Data Fields dispatch | catalogs/config/context |
| `BuilderCanvas.tsx` | sortable canvas/empty state | DnD |
| `BuilderSection.tsx` | sortable section and component grid | section actions |
| `BuilderComponent.tsx` | sortable selected component shell | help/delete/duplicate/select |
| `BuilderToolbox.tsx` | 23 default toolbox definitions/list | DnD/add/help |
| `PropertiesPanel.tsx` | template/section/all type-specific properties | largest component, validation/config editing |
| `TemplatePreviewModal.tsx` | rendered preview | DynamicTemplateRenderer |
| `ImportTemplateModal.tsx` | pasted JSON import; coming-soon doc tabs | local JSON only |
| `PacksPanel.tsx` | Standard/My Pack tabs | Pack APIs/current user packs |
| `ContentLibraryPanel.tsx` | system/user Content Pack browser | content_packs APIs |
| `ContentPackPreviewModal.tsx` | Pack preview/insertion | pack sections |
| `SaveContentPackModal.tsx` | save selected content as My Pack | create API |
| `AddToPackModal.tsx` | add component to owned Pack | add-component API |
| `StudioThemePanel.tsx` | theme editor/live preview | theme resolver |
| `StudioWorkflowPanel.tsx` | workflow step editor | local workflow state |
| `WorkflowStepModal.tsx` | step/assignee/action/transitions | workflow types |
| `WorkflowSimulatorModal.tsx` | sample-value path simulation | shared workflow resolver |
| `TableColumnModal.tsx` | column/type/formula/options editor | table-v2 helpers |
| `TableAggregateModal.tsx` | summary operation editor | table config |
| `RichParagraphEditor.tsx` | edit/preview safe paragraph HTML | sanitizer |
| `QuickGuideOverlay.tsx` | contextual help | component-help catalog |
| `StudioWelcomeModal.tsx` | onboarding/start options | blank/clone/import actions |

### Admin (13)

| File | Responsibility | APIs |
|---|---|---|
| `admin/AdminLayout.tsx` | Admin shell/tab switch | all Admin pages |
| `admin/AdminHeader.tsx` | Admin brand/user/reset header | current user/config |
| `admin/AdminSidebar.tsx` | ten-item Admin navigation | local tab |
| `admin/AdminOverview.tsx` | metrics/activity/shortcuts | multiple Admin GETs |
| `admin/AdminFeatureManagement.tsx` | feature toggles | features GET/PATCH |
| `admin/AdminStudioConfig.tsx` | read-only rail preview | SystemConfig |
| `admin/AdminPackManagement.tsx` | Standard Pack CRUD/status | Pack and content APIs |
| `admin/AdminElementManagement.tsx` | element toggles/categories | elements GET/PATCH |
| `admin/AdminContentLibraryManagement.tsx` | content CRUD/status/filter | Admin content APIs |
| `admin/AdminUsersAccess.tsx` | directory/create/status | Admin user APIs |
| `admin/AdminCategories.tsx` | category CRUD/status | Admin category APIs |
| `admin/AdminSystemSettings.tsx` | policy/labels/reset | settings/reset APIs |
| `admin/AdminAuditLog.tsx` | audit search/table | Admin audit GET |

## 8. Non-component frontend module catalog (19 `.ts` files)

| Area/files | Responsibility |
|---|---|
| `src/services/apiService.ts` | all JSON client endpoints, identity header, ApiError |
| `src/types/index.ts` | domain/UI/component/workflow types |
| `src/data/initialData.ts` | demo users/categories/templates/reports/notifications/local audits |
| `src/data/builtInContentPacks.ts` | 20 built-in system Pack schemas |
| `src/data/dataFieldsLibrary.ts` | curated Studio fields |
| `src/utils/storage.ts` | local demo state cache/reset |
| `src/utils/builderValidation.ts` | builder validation issues |
| `src/shared/templateUtils.ts` | normalized template identity |
| `src/shared/contentPackUtils.ts` | Pack clone/key utilities |
| `src/shared/signatureResolver.ts` | signature display/profile resolution |
| `src/shared/themeResolver.ts` | default/merged theme tokens |
| `src/shared/template-rules/index.ts` | condition/calculation engine |
| `src/shared/workflow/index.ts` | workflow types/path resolver/simulator |
| `src/shared/table-v2/index.ts` | table normalize/formula/aggregate/cycle tools |
| `src/shared/component-help/index.ts` | contextual help registry incl. legacy Logic |
| `src/shared/display-tools/displayUtils.ts` | display style helpers |
| `src/shared/display-tools/paragraphSanitizer.ts` | safe paragraph markup |
| `src/components/dynamic-template/validationHelper.ts` | runtime form validation helper |
| `src/components/template-builder/keyGenerator.ts` | collision-safe machine keys |

## 9. Count clarification

Repository inventory contains **7 page TSX files** and **72 TSX files under `src/components`**, for **79 frontend pages/components documented**. `App.tsx`, the two context TSX files, and `main.tsx` are architecture files but are not included in that requested page/component count. Some catalog tables above describe multiple responsibilities for one file; totals are unique filesystem paths.

## 10. Frontend/backend behavior differences

- Normal user directory and recipient status use static users; Admin-created/inactivated users do not propagate.
- UI enforces report hierarchy; backend does not.
- UI hides policy actions; backend also enforces only return/reject/sign/governance.
- UI filters disabled elements/modules; backend accepts them.
- UI Word/Excel import says coming soon; backend parser exists but is uncalled.
- UI approval/report comment collections partly remain local while SQLite endpoints are real.
- Frontend status types do not include Archived/Superseded.
- Admin Studio preview omits Packs.

Sources: every file under `src/`, with page/component counts derived from the repository tree.
