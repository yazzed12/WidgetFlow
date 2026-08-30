# Template Studio and Element System

## 1. Studio purpose and shell

Template Studio is a lazy-loaded, full-screen authoring modal opened from Create Template or version/edit actions. `TemplateBuilder.tsx` owns the template draft, sections, selected component, DnD state, Studio drawer, preview/import/Pack/workflow/theme modals, dirty state, validation, and persistence actions.

Layout:

```text
BuilderHeader: name, category, version/status, import/preview/save/submit/close
StudioRail: feature-flagged tool modules
Studio drawer: active StudioPanels / dedicated theme/workflow panels
BuilderCanvas: sortable sections and components
PropertiesPanel: selected template/section/component configuration
Global builder modals: preview, import, pack, tables, workflow, guide/welcome
```

Sources: `src/components/template-builder/TemplateBuilder.tsx`, `BuilderHeader.tsx`, `BuilderCanvas.tsx`, `PropertiesPanel.tsx`.

## 2. Studio areas

| Area | Purpose and UI | State/data source | Disable behavior | Dependencies/status |
|---|---|---|---|---|
| Templates | Browse approved templates, search, All/Firm/Favorites, preview/clone start | AppContext templates; favorites client state | rail hidden; active tab moves to first enabled | **Fully Functional** |
| Elements | Toolbox grouped Basic, Content/Structure, Business | static `TOOLBOX_ITEMS`, filtered by element config | module hidden; individual elements filtered | **Fully Functional** |
| Content Library | System/My multi-section Content Packs, category/search/preview/insert/create | `/api/content-packs`; `content_packs` | rail hidden only | **Fully Functional** |
| Packs | Standard Packs and My Packs tabs, search/category/preview/insert | `/api/packs` + current user packs | `studio.packs` hides rail | **Fully Functional** |
| Text | quick Heading and Paragraph insertion | local component defaults | rail hidden | **Fully Functional** |
| Sections | add named section presets/new section | local builder | rail hidden; existing sections persist | **Fully Functional** |
| Data Fields | curated business field library | `src/data/dataFieldsLibrary.ts` | rail hidden | **Fully Functional** |
| Themes (`tools`) | typography, colors, spacing/density tokens with live card | local theme -> `theme_json` | rail hidden; stored theme still renders | **Fully Functional** |
| Workflow | step editor, transitions/actions, simulator and validation indicator | local `workflowDefinition`; workflow APIs are not called from frontend | rail hidden | **Partially Implemented** backend execution integration |

AdminStudioConfig previews only eight items and omits Packs, while the actual rail and Feature Management support nine.

## 3. Template state owned by the builder

- Metadata: ID, name, description, category, version, status, creator, timestamps, tags.
- Structure: `dynamicSections[]`, each with ID/title/description/order/components.
- Components: ID, machine key, label/type, section, required, placeholder, description, default, options, layout width/order and type-specific configuration.
- Behavior: `rules`, `calculations`, `workflowDefinition`.
- Appearance: `theme`.
- UI-only working state: selected section/component, drawer/tab, dirty flag, validation issues, favorite templates, modal visibility.

On save, sections become `report_template_sections`; all components flatten into `report_template_fields`; the type-specific properties are placed in `validation_rules_json`. The database field table intentionally has no type CHECK after migration so all 23 registry types persist.

## 4. Element registry summary

There are exactly **23** registered element types in `server/services/componentRegistry.ts`, mirrored by `TemplateComponentType`, `TOOLBOX_ITEMS`, seed element settings, properties, and renderer switches.

All elements can be placed in template sections. Standard Pack eligibility depends on Admin Pack picker: it exposes a curated subset of fields/elements and enabled Content items; My/built-in packs can snapshot any component schema. Admin disabling filters new insertion but does not remove/render-block existing components or block backend submission.

### Basic Inputs

#### Text Input

- **Key/type/category:** `elements.text` / `text` / Basic Inputs.
- **Render/value:** single-line string input; report value stored as text.
- **Configuration:** label, key, required, placeholder, description, default, width; string validation min/max length and regex.
- **Pack/persistence:** Standard Pack field eligible; full config in field columns/JSON. **Fully Functional.**

#### Text Area

- **Key/type/category:** `elements.textarea` / `textarea` / Basic Inputs.
- **Render/value:** multiline string.
- **Configuration:** text basics plus length/pattern; full/partial width.
- **Status:** **Fully Functional.**

#### Number Input

- **Key/type/category:** `elements.number` / `number` / Basic Inputs.
- **Render/value:** numeric input; numeric values use `value_number`.
- **Configuration:** min/max, required/default/placeholder/width.
- **Status:** **Fully Functional.**

#### Date

- **Key/type/category:** `elements.date` / `date` / Basic Inputs.
- **Render/value:** date picker/string.
- **Configuration:** minDate/maxDate and common field settings.
- **Status:** **Fully Functional.**

#### Date & Time

- **Key/type/category:** `elements.datetime` / `datetime` / Basic Inputs.
- **Render/value:** datetime-local style string.
- **Configuration:** date bounds/common settings.
- **Status:** **Fully Functional.**

### Choice Inputs

#### Dropdown Select

- **Key/type/category:** `elements.select` / `select` / Choice Inputs.
- **Render/value:** one option string.
- **Configuration:** nonempty options, label/key/required/default/width.
- **Validation:** registry requires at least one option.
- **Status:** **Fully Functional.**

#### Checkbox

- **Key/type/category:** `elements.checkbox` / `checkbox` / Choice Inputs.
- **Render/value:** boolean toggle; codec stores JSON/text representation rather than numeric SQLite boolean in common paths.
- **Configuration:** label/description/default/required/width.
- **Status:** **Fully Functional.**

#### Radio Group

- **Key/type/category:** `elements.radio` / `radio` / Choice Inputs.
- **Render/value:** single radio option string.
- **Configuration/validation:** option editor; at least one option.
- **Status:** **Fully Functional.**

#### Rating Scale

- **Key/type/category:** `elements.rating` / `rating` / Choice Inputs.
- **Render/value:** numbers, stars, or buttons; numeric value.
- **Configuration:** min/max/step, low/high labels, show value, display style.
- **Validation:** min strictly less than max.
- **Renderer:** `RatingInputControl.tsx`. **Fully Functional.**

#### Acknowledgement

- **Key/type/category:** `elements.acknowledgement` / `acknowledgement` / Choice Inputs.
- **Render/value:** confirmation checkbox plus statement and optional captured timestamp object.
- **Configuration:** statement, checkbox label, captureTimestamp, required.
- **Renderer:** `AcknowledgementControl.tsx`. **Fully Functional.**

### Financial

#### Currency Input

- **Key/type/category:** `elements.currency` / `currency` / Financial.
- **Render/value:** numeric input with currency semantics.
- **Configuration:** min/max/common number settings; display uses currency formatting in tables/KPI where configured.
- **Status:** **Fully Functional.**

#### Percentage Input

- **Key/type/category:** `elements.percentage` / `percentage` / Financial.
- **Render/value:** numeric percentage.
- **Configuration:** min/max and common settings.
- **Status:** **Fully Functional.**

### Layout / static display

#### Section Heading

- **Key/type/category:** `elements.heading` / `heading` / Layout; registry data kind `none`, static.
- **Render:** H1/H2/H3 title/subtitle.
- **Configuration:** heading level, size/weight/family/color, italic/underline, alignment, spacing.
- **Validation:** heading level allowlist. No report value required.
- **Status:** **Fully Functional.**

#### Paragraph Text

- **Key/type/category:** `elements.paragraph` / `paragraph` / Layout; static.
- **Render:** sanitized rich HTML/body text.
- **Configuration:** rich editor, alignment, size/family/weight/color, line height, paragraph spacing.
- **Security:** schema validator rejects script/javascript/iframe; renderer sanitizer also normalizes output.
- **Status:** **Fully Functional.**

#### Section Divider

- **Key/type/category:** `elements.divider` / `divider` / Layout; static.
- **Render:** horizontal rule with optional label.
- **Configuration:** solid/dashed/dotted, thickness, width/alignment, spacing, color, label typography.
- **Status:** **Fully Functional.**

#### Layout Spacer

- **Key/type/category:** `elements.spacer` / `spacer` / Layout; static.
- **Render:** vertical whitespace.
- **Configuration:** preset or custom 4–200 px.
- **Status:** **Fully Functional.**

#### Image Asset

- **Key/type/category:** `elements.image` / `image` / Layout; static.
- **Render:** stored `/api/assets/:id` or safe URL with alt/caption.
- **Configuration:** asset ID/URL, alt, width, alignment, fit, caption typography.
- **Validation:** local filesystem URLs rejected; generic upload endpoint handles supported image binary but does not magic-check ordinary uploads.
- **Status:** **Fully Functional.**

#### Info / Callout Box

- **Key/type/category:** `elements.info_box` / `info_box` / Layout; static.
- **Render:** themed callout with optional icon/title/body.
- **Configuration:** info/success/warning/important/neutral preset, alignment and typography.
- **Status:** **Fully Functional.**

### Advanced

#### File Attachment

- **Key/type/category:** `elements.file` / `file` / Advanced; value kind object.
- **Render:** `FileAttachmentControl.tsx`, upload/list/remove according to config.
- **Configuration:** allowed extensions, per-file MB limit, multiple/max files, required.
- **Backend:** generic asset allowlist and 10 MB absolute endpoint cap; component-specific declared limits are primarily frontend validation.
- **Persistence:** attachment value JSON points to asset; asset metadata/file stored separately. **Fully Functional with enforcement split.**

#### Document Signature

- **Key/type/category:** `elements.signature` / `signature` / Advanced; value kind object.
- **Render:** `SignatureRenderer`; Sender/Receiver role and current records.
- **Configuration:** explicit signature role, required, optional signature type typed_name/checkbox_confirmation/drawn.
- **Workflow:** sender fields trigger sign-and-send; receiver fields require prior sender signature when configured.
- **Persistence:** template config plus separate profile/signature audit records. **Fully Functional.**

#### Data Table V2

- **Key/type/category:** `elements.table` / `table` / Advanced; value kind array.
- **Render:** `TableV2Renderer.tsx`.
- **Configuration:** columns (text, textarea, number, currency, percentage, date, datetime, select, checkbox, calculated), widths/options/defaults; min/max rows; add/delete/reorder/row numbers/footer; formulas and aggregates SUM/AVG/MIN/MAX/COUNT.
- **Validation:** unique keys, formula references, circular calculation detection, numeric aggregate compatibility, row limits.
- **Persistence:** table schema in component JSON; report rows JSON in field value. **Fully Functional.**

#### Repeating Group

- **Key/type/category:** `elements.repeating_group` / `repeating_group` / Advanced; array.
- **Render:** `RepeatingGroupRenderer.tsx`.
- **Configuration:** item label, min/max, add/delete/reorder and nested child components.
- **Validation:** min<=max, unique child keys, no repeating group inside repeating group.
- **Status:** **Fully Functional.**

#### KPI Metric Block

- **Key/type/category:** `elements.kpi` / `kpi` / Advanced; registry treats value as string though configuration permits numeric formats.
- **Render:** metric card with label/value/format, target/trend/status presentation according to `kpiConfig`.
- **Configuration:** number/currency/percentage/text type and display metadata.
- **Validation:** value type allowlist.
- **Status:** **Fully Functional with broad/weak value typing.**

## 5. Data Fields library

`src/data/dataFieldsLibrary.ts` is a static enterprise catalog, distinct from the 23 type registry. Each entry supplies a ready-made field label/key/type/category/description/config; inserting it creates a normal component. It has no database table, Admin CRUD, or live reference. Studio search/favorites/filter are client state. Admin can disable the underlying element type, which filters that type from appropriate insertion lists when the panel applies `isElementEnabled`.

## 6. Theme system

`StudioThemePanel` edits tokens resolved by `themeResolver.ts`: typography families/sizes/weights/colors; palette and surface/border/accent colors; density, spacing, radii and component styling. The panel has live preview. Template save serializes `theme_json`; template snapshot and dynamic renderer apply it. Feature disable removes the editor but does not discard or stop rendering stored theme.

## 7. Rules and calculations

The shared rule engine supports condition groups and calculated values and is invoked server-side during report update. `report_templates.rules_json` and `calculations_json` persist definitions. The dedicated Logic rail was removed. Remaining evidence includes properties/state, evaluation code, validation comments, and help entries `logic_rules`/`logic_calculations`. Classify this as **Partially Implemented active engine with Deprecated dedicated navigation**.

## 8. Workflow Studio

The panel supports step list/edit/delete/reorder-like state, step types, assignee strategy, actions, conditional transitions, requiresSignature, and `WorkflowSimulatorModal`. Builder validation surfaces workflow configuration issues. However TemplateBuilder persistence stores `workflowDefinition` in the in-memory template object but `saveTemplateDraft` does not write it into `workflow_definitions`; the frontend never calls workflow APIs. The seeded definition and backend APIs are separately real. Therefore authoring-to-execution linkage is **Partially Implemented**.

## 9. Preview, welcome, guide, import, and modal catalog

- `StudioWelcomeModal`: onboarding/blank/template/import choices; UI guidance.
- `QuickGuideOverlay`: contextual component help sourced from `shared/component-help`.
- `TemplatePreviewModal`: rendered template preview.
- `ImportTemplateModal`: JSON-only local import; Word/Excel/PDF coming-soon UI.
- `SaveContentPackModal`: names/category/description and saves selected sections as My Pack.
- `AddToPackModal`: adds component to owned My Pack/new section.
- `ContentPackPreviewModal`: previews multi-section system/user pack.
- `TableColumnModal`, `TableAggregateModal`: typed table configuration.
- `WorkflowStepModal`, `WorkflowSimulatorModal`: workflow design/test.

## 10. Disable and historical behavior

| Admin action | Immediate creator effect | Backend enforcement | Historical behavior |
|---|---|---|---|
| Disable Studio module | rail entry disappears | none | stored data and existing canvas remain |
| Disable element | removed from Elements toolbox and Pack picker | none on save/submit/render | existing components persist/render |
| Disable Standard Pack | omitted from `/api/packs` | status query enforced | inserted snapshots remain |
| Disable Content item | omitted from normal endpoint/picker | enabled-only query | inserted copy remains |
| Inactivate category | builder tries to omit from selection | save still accepts/normal API omits status | historical templates retain FK/category |

## 11. Removed/deprecated Studio artifacts

- Dedicated **Logic** rail/module is absent from `StudioRail` and seed feature keys.
- `component-help` retains `logic_rules` and `logic_calculations` guides.
- `builderValidation` comment still says it checks logic, although rules are not comprehensively validated there.
- `fullSystemCheck.ts` still asserts system help keys including Logic.
- The active rule/calculation backend engine means Logic is not wholly dead; only the dedicated discoverable feature is removed.

Sources: `src/components/template-builder/*`, `src/components/dynamic-template/*`, `src/types/index.ts`, `server/services/componentRegistry.ts`, `server/services/workflowService.ts`, `server/db/seed.ts`.
