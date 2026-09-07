import type { AdminPack, TemplateComponent, TemplateSection, User, WidgetTemplate } from '../../types/index.js';
import { generateStableFieldKey } from './keyGenerator.js';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

function legacyItemToComponent(item: AdminPack['items'][number], sectionTitle: string, index: number): TemplateComponent {
  const embedded = item.configuration?.component;
  if (embedded?.type) {
    return { ...clone(embedded), id: embedded.id || `pack-comp-${index}`, order: index, section: sectionTitle };
  }

  const configuredType = item.configuration?.type;
  const elementType = item.sourceKey?.startsWith('elements.') ? item.sourceKey.replace('elements.', '') : undefined;
  const contentType = item.configuration?.contentType;
  const type = item.sourceType === 'content'
    ? contentType === 'Heading' ? 'heading' : 'paragraph'
    : configuredType || elementType || 'text';

  const component: TemplateComponent = {
    id: `pack-comp-${index}`,
    key: item.sourceKey || `pack_field_${index + 1}`,
    label: item.label,
    type,
    section: sectionTitle,
    order: index,
    required: item.configuration?.required === true,
    placeholder: item.configuration?.placeholder,
    options: item.configuration?.options,
  } as TemplateComponent;

  if (item.sourceType === 'content') {
    (component as any).content = item.configuration?.value || item.label;
  }
  if (type === 'signature') component.signatureConfig = item.configuration?.signatureConfig || { signatureRole: 'Receiver', required: true };
  if (type === 'table') component.tableConfig = item.configuration?.tableConfig;
  return component;
}

export function adminPackToSections(pack: AdminPack): TemplateSection[] {
  if (Array.isArray(pack.structure) && pack.structure.length > 0) return clone(pack.structure);
  return [{
    id: `pack-section-${pack.id}`,
    title: pack.name,
    order: 0,
    components: pack.items.map((item, index) => legacyItemToComponent(item, pack.name, index)),
  }];
}

export function adminPackToBuilderTemplate(pack: AdminPack | null, currentUser: User): WidgetTemplate {
  const sections: TemplateSection[] = pack
    ? adminPackToSections(pack)
    : [{ id: `pack-section-${Date.now()}`, title: 'Pack Content', order: 0, components: [] }];
  const components = sections.flatMap((section) => section.components);
  const now = new Date().toISOString();
  return {
    id: pack?.id || `pack-draft-${Date.now()}`,
    name: pack?.name || '',
    description: pack?.description || '',
    categoryId: pack?.categoryId || '',
    version: 'v1.0',
    status: 'Draft',
    createdById: currentUser.id,
    createdByName: currentUser.name,
    createdByRole: currentUser.role,
    createdAt: pack?.createdAt || now,
    updatedAt: pack?.updatedAt || now,
    tags: [],
    sections: sections.map((section) => section.title),
    dynamicSections: sections,
    components,
    fields: components as any,
  };
}

export function builderTemplateToAdminPackPayload(template: WidgetTemplate) {
  const structure = clone(template.dynamicSections || []);
  const items = structure.flatMap((section) => section.components.map((component) => ({
    sourceType: 'element' as const,
    sourceKey: `elements.${component.type}`,
    label: component.label || component.type,
    configuration: {
      component: clone(component),
      sectionId: section.id,
      sectionTitle: section.title,
      sectionOrder: section.order,
    },
  })));
  return {
    name: template.name.trim(), description: template.description || '', categoryId: template.categoryId || null,
    structure, items,
  };
}

export function cloneAdminPackForTemplate(pack: AdminPack, existingSections: TemplateSection[]): TemplateSection[] {
  const sourceSections = adminPackToSections(pack);
  const knownComponents = existingSections.flatMap((section) => section.components).map(clone);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  return sourceSections.map((section, sectionIndex) => {
    const title = section.title || pack.name;
    const components = section.components.map((source, componentIndex) => {
      const component = clone(source);
      const key = generateStableFieldKey(component.label || component.key || component.type, knownComponents);
      const next = {
        ...component,
        id: `comp-${stamp}-${sectionIndex}-${componentIndex}`,
        key,
        order: componentIndex,
        section: title,
      };
      knownComponents.push(next);
      return next;
    });
    return {
      ...clone(section),
      id: `sec-${stamp}-${sectionIndex}`,
      title,
      order: existingSections.length + sectionIndex,
      components,
    };
  });
}
