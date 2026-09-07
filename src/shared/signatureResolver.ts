import type {
  TemplateComponent,
  ReportSignatureRecord,
} from '../types/index.js';

export function resolveReportSignatureForComponent({
  component,
  activeSignatures = [],
  signatureHistory = [],
  activeSignature = null,
}: {
  component: TemplateComponent;
  activeSignatures?: ReportSignatureRecord[];
  signatureHistory?: ReportSignatureRecord[];
  activeSignature?: ReportSignatureRecord | null;
}): ReportSignatureRecord | null {
  if (activeSignature) return activeSignature;

  const rawRole =
    component.signatureConfig?.signatureRole ||
    (component as any).signatureRole ||
    'Sender';

  const canonicalRole = String(rawRole).toLowerCase();

  let match = activeSignatures.find(
    (s) =>
      s.isActive !== false &&
      (
        (Boolean(s.componentId) && s.componentId === component.id) ||
        (Boolean(s.componentKey) && s.componentKey === component.key)
      )
  );

  if (match) return match;

  match = activeSignatures.find(
    (s) =>
      s.isActive !== false &&
      String(s.signatureRole).toLowerCase() === canonicalRole
  );

  if (match) return match;

  match = signatureHistory.find(
    (s) =>
      s.isActive !== false &&
      (
        (Boolean(s.componentId) && s.componentId === component.id) ||
        (Boolean(s.componentKey) && s.componentKey === component.key) ||
        String(s.signatureRole).toLowerCase() === canonicalRole
      )
  );

  return match || null;
}

/**
 * Report persistence identity:
 * business key only.
 * NEVER component.id.
 */
export function getReportBusinessFieldKey(component: any): string | null {
  const candidates = [
    component?.key,
    component?.field_key,
    component?.fieldKey,
  ];

  for (const candidate of candidates) {
    if (
      typeof candidate === 'string' &&
      candidate.trim()
    ) {
      return candidate.trim();
    }
  }

  return null;
}

function normalizeSnapshotField(field: any): any {
  if (!field || typeof field !== 'object') {
    return field;
  }

  const normalized: any = {
    ...field,
  };

  if (
    !normalized.key &&
    typeof field.field_key === 'string'
  ) {
    normalized.key = field.field_key;
  }

  if (
    !normalized.key &&
    typeof field.fieldKey === 'string'
  ) {
    normalized.key = field.fieldKey;
  }

  if (
    !normalized.type &&
    typeof field.field_type === 'string'
  ) {
    normalized.type = field.field_type;
  }

  if (
    !normalized.type &&
    typeof field.component_type === 'string'
  ) {
    normalized.type = field.component_type;
  }

  if (
    normalized.required === undefined &&
    field.is_required !== undefined
  ) {
    normalized.required = field.is_required;
  }

  if (
    normalized.defaultValue === undefined &&
    field.default_value !== undefined
  ) {
    normalized.defaultValue = field.default_value;
  }

  if (
    normalized.signatureConfig === undefined &&
    field.signature_config !== undefined
  ) {
    normalized.signatureConfig = field.signature_config;
  }

  if (
    normalized.configuration === undefined &&
    field.config !== undefined
  ) {
    normalized.configuration = field.config;
  }

  // Template snapshots persist the original component JSON inside the
  // template_fields.configuration column. Promote image presentation data
  // from that historical wrapper so the shared renderer can consume the
  // canonical component shape without mutating the snapshot.
  const configuration = normalized.configuration;
  if (
    normalized.imageConfig === undefined &&
    configuration &&
    typeof configuration === 'object' &&
    configuration.imageConfig &&
    typeof configuration.imageConfig === 'object'
  ) {
    normalized.imageConfig = configuration.imageConfig;
  }

  if (
    normalized.assetUrl === undefined &&
    configuration &&
    typeof configuration === 'object' &&
    typeof configuration.assetUrl === 'string'
  ) {
    normalized.assetUrl = configuration.assetUrl;
  }

  if (
    normalized.assetId === undefined &&
    configuration &&
    typeof configuration === 'object' &&
    typeof configuration.assetId === 'string'
  ) {
    normalized.assetId = configuration.assetId;
  }

  return normalized;
}

function isRenderableTemplateNode(node: any): boolean {
  if (!node || typeof node !== 'object') {
    return false;
  }

  const type = String(
    node.type ??
    node.field_type ??
    node.component_type ??
    ''
  ).toLowerCase();

  const hasIdentity =
    typeof node.key === 'string' ||
    typeof node.field_key === 'string' ||
    typeof node.fieldKey === 'string' ||
    typeof node.id === 'string';

  const hasPresentation =
    typeof node.label === 'string' ||
    typeof node.title === 'string' ||
    type.length > 0;

  return hasIdentity && hasPresentation;
}

function sectionTitle(
  section: any,
  index: number
): string {
  if (typeof section === 'string') {
    return section;
  }

  return String(
    section?.title ||
    section?.name ||
    section?.label ||
    section?.sectionTitle ||
    section?.section_name ||
    section?.id ||
    `Section ${index + 1}`
  );
}

function getSectionChildren(section: any): any[] {
  if (!section || typeof section !== 'object') {
    return [];
  }

  const candidates = [
    section.components,
    section.fields,
    section.children,
    section.items,
  ];

  for (const candidate of candidates) {
    if (
      Array.isArray(candidate) &&
      candidate.length > 0
    ) {
      return candidate;
    }
  }

  return [];
}

/**
 * Convert any historical report template snapshot into one stable
 * frontend shape.
 *
 * Important:
 * - historical snapshots are not mutated
 * - structured section order is preserved
 * - sections[].components and sections[].fields are both supported
 * - older nested/wrapped snapshot shapes are supported
 * - component.id is never promoted to a business field key
 */
export function normalizeReportTemplateSnapshot(snapshot: any): any {
  if (
    !snapshot ||
    typeof snapshot !== 'object'
  ) {
    return snapshot;
  }

  const discovered: any[] = [];
  const structuredSections: any[] = [];

  const seenObjects = new WeakSet<object>();

  const visit = (
    node: any,
    inheritedSection?: string
  ) => {
    if (!node) return;

    if (Array.isArray(node)) {
      node.forEach((item) =>
        visit(item, inheritedSection)
      );
      return;
    }

    if (typeof node !== 'object') {
      return;
    }

    if (seenObjects.has(node)) {
      return;
    }

    seenObjects.add(node);

    const sectionArrays = [
      node.sections,
      node.dynamicSections,
    ];

    for (const sections of sectionArrays) {
      if (!Array.isArray(sections)) {
        continue;
      }

      sections.forEach(
        (rawSection: any, index: number) => {
          if (
            !rawSection ||
            typeof rawSection !== 'object'
          ) {
            return;
          }

          const title = sectionTitle(
            rawSection,
            index
          );

          const children =
            getSectionChildren(rawSection);

          if (children.length > 0) {
            const normalizedChildren =
              children
                .map((child: any) => {
                  const normalized =
                    normalizeSnapshotField(child);

                  return {
                    ...normalized,
                    section:
                      normalized.section ||
                      title,
                  };
                });

            structuredSections.push({
              ...rawSection,
              title,
              name:
                rawSection.name || title,
              components:
                normalizedChildren,
            });
          }
        }
      );
    }

    if (isRenderableTemplateNode(node)) {
      const normalized =
        normalizeSnapshotField(node);

      discovered.push({
        ...normalized,
        ...(inheritedSection &&
          !normalized.section
          ? {
            section:
              inheritedSection,
          }
          : {}),
      });
    }

    /*
     * Walk every property instead of only a hardcoded list.
     * Historical schema snapshots may be wrapped in:
     * schema / template / content / definition / layout / etc.
     */
    Object.entries(node).forEach(
      ([key, child]) => {
        if (
          key === 'sections' ||
          key === 'dynamicSections'
        ) {
          if (Array.isArray(child)) {
            child.forEach(
              (
                section: any,
                index: number
              ) => {
                const title =
                  sectionTitle(
                    section,
                    index
                  );

                visit(
                  section,
                  title
                );
              }
            );
          }

          return;
        }

        visit(
          child,
          inheritedSection
        );
      }
    );
  };

  visit(snapshot);

  const directComponents =
    Array.isArray(snapshot.components)
      ? snapshot.components.map(
        normalizeSnapshotField
      )
      : [];

  const directFields =
    Array.isArray(snapshot.fields)
      ? snapshot.fields.map(
        normalizeSnapshotField
      )
      : [];

  const flattenedStructured =
    structuredSections.flatMap(
      (section: any) =>
        Array.isArray(section.components)
          ? section.components
          : []
    );

  const source =
    directComponents.length > 0
      ? directComponents
      : directFields.length > 0
        ? directFields
        : flattenedStructured.length > 0
          ? flattenedStructured
          : discovered;

  const deduped: any[] = [];
  const seen = new Set<string>();

  source.forEach(
    (rawField: any, index: number) => {
      const field =
        normalizeSnapshotField(
          rawField
        );

      const businessKey =
        getReportBusinessFieldKey(
          field
        );

      /*
       * Layout-only components can legitimately have no
       * business key, so retain them using component id.
       */
      const identity =
        businessKey ||
        (
          typeof field.id === 'string'
            ? `id:${field.id}`
            : `index:${index}`
        );

      if (seen.has(identity)) {
        return;
      }

      seen.add(identity);
      deduped.push(field);
    }
  );

  let finalSections = structuredSections;

  /*
   * If no structured sections were discovered,
   * build them from each component's persisted section.
   */
  if (
    finalSections.length === 0 &&
    deduped.length > 0
  ) {
    const grouped =
      new Map<string, any[]>();

    deduped.forEach((field: any) => {
      const title = String(
        field.section ||
        field.sectionTitle ||
        field.section_name ||
        'General Information'
      );

      if (!grouped.has(title)) {
        grouped.set(title, []);
      }

      grouped
        .get(title)!
        .push(field);
    });

    finalSections = Array.from(
      grouped.entries()
    ).map(
      ([title, components]) => ({
        title,
        name: title,
        components,
      })
    );
  }

  return {
    ...snapshot,

    /*
     * Stable compatibility shape consumed by
     * View and Edit.
     */
    components: deduped,
    fields: deduped,

    sections: finalSections,

    dynamicSections:
      finalSections,
  };
}

/**
 * Convert persisted report values to canonical business-key state
 * before filling/editing.
 *
 * component.id is read only as a legacy compatibility fallback.
 * It is NEVER returned as a persistence key.
 */
export function normalizeReportDataForEditing(
  rawReportData: Record<string, any> = {},
  template?: any
): Record<string, any> {
  if (!rawReportData) {
    return {};
  }

  if (!template) {
    return {
      ...rawReportData,
    };
  }

  const normalizedTemplate =
    normalizeReportTemplateSnapshot(
      template
    );

  const comps: any[] = [];

  const add = (items: any) => {
    if (!Array.isArray(items)) {
      return;
    }

    items.forEach((item) => {
      if (item) comps.push(item);
    });
  };

  add(normalizedTemplate.components);
  add(normalizedTemplate.fields);

  if (
    Array.isArray(
      normalizedTemplate.sections
    )
  ) {
    normalizedTemplate.sections.forEach(
      (section: any) => {
        add(section.components);
        add(section.fields);
      }
    );
  }

  if (
    Array.isArray(
      normalizedTemplate.dynamicSections
    )
  ) {
    normalizedTemplate.dynamicSections.forEach(
      (section: any) => {
        add(section.components);
        add(section.fields);
      }
    );
  }

  /*
   * No known components:
   * preserve the existing persisted object instead of
   * accidentally clearing the report.
   */
  if (comps.length === 0) {
    return {
      ...rawReportData,
    };
  }

  const normalized:
    Record<string, any> = {};

  const seenKeys = new Set<string>();

  comps.forEach((comp) => {
    const canonicalKey =
      getReportBusinessFieldKey(
        comp
      );

    if (!canonicalKey) {
      return;
    }

    if (seenKeys.has(canonicalKey)) {
      return;
    }

    seenKeys.add(canonicalKey);

    const compId = comp.id;
    const compKey = comp.key;
    const fieldKey =
      comp.field_key;
    const camelFieldKey =
      comp.fieldKey;

    let resolvedVal:
      any = undefined;

    if (
      rawReportData[
      canonicalKey
      ] !== undefined
    ) {
      resolvedVal =
        rawReportData[
        canonicalKey
        ];
    } else if (
      compKey &&
      rawReportData[
      compKey
      ] !== undefined
    ) {
      resolvedVal =
        rawReportData[
        compKey
        ];
    } else if (
      fieldKey &&
      rawReportData[
      fieldKey
      ] !== undefined
    ) {
      resolvedVal =
        rawReportData[
        fieldKey
        ];
    } else if (
      camelFieldKey &&
      rawReportData[
      camelFieldKey
      ] !== undefined
    ) {
      resolvedVal =
        rawReportData[
        camelFieldKey
        ];
    } else if (
      compId &&
      rawReportData[
      compId
      ] !== undefined
    ) {
      /*
       * Legacy read compatibility only.
       * Write remains canonicalKey.
       */
      resolvedVal =
        rawReportData[
        compId
        ];
    }

    if (resolvedVal !== undefined) {
      normalized[
        canonicalKey
      ] = resolvedVal;
    }
  });

  return normalized;
}
