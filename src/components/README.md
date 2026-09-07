# Component reuse convention

WidgetFlow currently keeps feature components in their existing domain folders to avoid presentation regressions.

- `components/ui/` is reserved for future presentation-neutral primitives such as Dialog, FormField, and AsyncState.
- `components/shared/` is reserved for cross-feature WidgetFlow components.
- `components/admin/shared/` is reserved for reusable Admin-only components.
- `components/template-builder/` remains the domain-specific Template Studio component library.

Existing shared components include `StatusBadge`, `DynamicTemplateRenderer`, `TemplateComponentRenderer`, `RequestCommentThread`, approval confirmation/rejection modals, report/signature modals, `Toast`, `TableV2Renderer`, and Admin `AdminInfoTooltip`. Do not move them solely to satisfy the convention; move only as part of a separately tested consumer change.
