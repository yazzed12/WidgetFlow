import type { TemplateSection, TemplateComponent } from '../types/index.js';
import { generateUniqueKey } from '../components/template-builder/keyGenerator.js';

/**
 * Deeply clones a Content Pack's section structure, regenerating all Section IDs,
 * Component IDs, and Component Keys to ensure complete independence and prevent collisions.
 */
export function cloneContentPackSections(
  packSections: Array<{ title: string; description?: string; components: TemplateComponent[] }>,
  existingSections: TemplateSection[] = []
): TemplateSection[] {
  // Collect all existing component keys across the target template
  const existingKeys = new Set<string>();
  existingSections.forEach((sec: any) => {
    (sec.components || []).forEach((comp: any) => {
      if (comp.key) existingKeys.add(comp.key);
      if (Array.isArray(comp.nestedComponents)) {
        comp.nestedComponents.forEach((nc: any) => {
          if (nc.key) existingKeys.add(nc.key);
        });
      }
    });
  });

  const clonedSections: TemplateSection[] = [];
  const idMap = new Map<string, string>();
  const keyMap = new Map<string, string>();

  // Pass 1: Clone sections and components, generating new IDs and unique keys
  packSections.forEach((sec, sIdx) => {
    const newSectionId = `sec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${sIdx}`;

    const clonedComponents: TemplateComponent[] = (sec.components || []).map((comp, cIdx) => {
      const newCompId = `fld-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${sIdx}-${cIdx}`;
      const proposedKey = comp.key || `field_${cIdx + 1}`;
      const newKey = generateUniqueKey(proposedKey, existingKeys);
      existingKeys.add(newKey);

      idMap.set(comp.id, newCompId);
      if (comp.key) keyMap.set(comp.key, newKey);

      // Clone component base
      const clonedComp: TemplateComponent = {
        ...JSON.parse(JSON.stringify(comp)),
        id: newCompId,
        key: newKey,
      };

      // Handle nested components (e.g. Repeating Group child components)
      if (Array.isArray(comp.nestedComponents)) {
        clonedComp.nestedComponents = comp.nestedComponents.map((nc: any, ncIdx: number) => {
          const newNcId = `fld-nested-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${ncIdx}`;
          const proposedNcKey = nc.key || `nested_field_${ncIdx + 1}`;
          const newNcKey = generateUniqueKey(proposedNcKey, existingKeys);
          existingKeys.add(newNcKey);

          idMap.set(nc.id, newNcId);
          if (nc.key) keyMap.set(nc.key, newNcKey);

          return {
            ...JSON.parse(JSON.stringify(nc)),
            id: newNcId,
            key: newNcKey,
          };
        });
      }

      return clonedComp;
    });

    clonedSections.push({
      id: newSectionId,
      title: sec.title || 'Inserted Content Pack Section',
      description: sec.description || '',
      order: existingSections.length + sIdx + 1,
      components: clonedComponents,
    });
  });

  // Pass 2: Remap internal references (e.g. Table V2 columns, calculations, aggregates)
  clonedSections.forEach((sec) => {
    sec.components.forEach((comp: any) => {
      // Remap Table V2 column keys if needed
      if (comp.type === 'table' && comp.tableConfig) {
        const colKeyMap = new Map<string, string>();
        if (Array.isArray(comp.tableConfig.columns)) {
          comp.tableConfig.columns.forEach((col: any) => {
            if (col.key) {
              const newColKey = `col_${Math.random().toString(36).substring(2, 7)}`;
              colKeyMap.set(col.key, newColKey);
              col.key = newColKey;
            }
          });

          // Remap Table calculations left/right columnKeys
          comp.tableConfig.columns.forEach((col: any) => {
            if (col.calculation) {
              if (col.calculation.left?.columnKey && colKeyMap.has(col.calculation.left.columnKey)) {
                col.calculation.left.columnKey = colKeyMap.get(col.calculation.left.columnKey);
              }
              if (col.calculation.right?.columnKey && colKeyMap.has(col.calculation.right.columnKey)) {
                col.calculation.right.columnKey = colKeyMap.get(col.calculation.right.columnKey);
              }
            }
          });
        }

        // Remap Table aggregates targetColumnKey
        if (Array.isArray(comp.tableConfig.aggregates)) {
          comp.tableConfig.aggregates.forEach((agg: any) => {
            const target = agg.targetColumnKey || agg.columnKey;
            if (target && colKeyMap.has(target)) {
              agg.targetColumnKey = colKeyMap.get(target);
              agg.columnKey = colKeyMap.get(target);
            }
          });
        }
      }
    });
  });

  return clonedSections;
}

/**
 * Inspects a list of components to determine if any calculations or rules
 * reference fields outside the pack scope.
 */
export function checkPackExternalReferences(
  components: TemplateComponent[],
  templateRules: any[] = [],
  templateCalculations: any[] = []
): { hasExternalRefs: boolean; externalKeys: string[] } {
  const packKeys = new Set<string>();

  const extractKeys = (comps: TemplateComponent[]) => {
    comps.forEach((c) => {
      if (c.key) packKeys.add(c.key);
      if (Array.isArray(c.nestedComponents)) extractKeys(c.nestedComponents);
    });
  };
  extractKeys(components);

  const externalKeys: string[] = [];

  // Check rules
  templateRules.forEach((rule) => {
    if (rule.targetFieldKey && packKeys.has(rule.targetFieldKey)) {
      // Check if condition uses external key
      if (Array.isArray(rule.conditions)) {
        rule.conditions.forEach((cond: any) => {
          if (cond.fieldKey && !packKeys.has(cond.fieldKey)) {
            externalKeys.push(cond.fieldKey);
          }
        });
      }
    }
  });

  // Check calculations
  templateCalculations.forEach((calc) => {
    if (calc.targetFieldKey && packKeys.has(calc.targetFieldKey)) {
      if (calc.expression) {
        const matches = String(calc.expression).match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
        matches.forEach((m) => {
          if (!packKeys.has(m) && !['SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'abs', 'round', 'floor', 'ceil'].includes(m)) {
            externalKeys.push(m);
          }
        });
      }
    }
  });

  const uniqueExternal = Array.from(new Set(externalKeys));
  return {
    hasExternalRefs: uniqueExternal.length > 0,
    externalKeys: uniqueExternal,
  };
}
