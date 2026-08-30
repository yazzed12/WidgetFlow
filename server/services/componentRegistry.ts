import { AppError } from '../middleware/errorHandler.js';
import { normalizeTableColumnConfig, detectTableCalculationCycles, normalizeTableComponent } from '../../src/shared/table-v2/index.js';
import type { TableColumnConfig } from '../../src/types/index.js';

export interface ComponentMetadata {
  type: string;
  dataKind: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'none';
  supportsValidation: boolean;
  supportsOptions: boolean;
  isStatic: boolean;
}

export const COMPONENT_REGISTRY: Record<string, ComponentMetadata> = {
  text: { type: 'text', dataKind: 'string', supportsValidation: true, supportsOptions: false, isStatic: false },
  textarea: { type: 'textarea', dataKind: 'string', supportsValidation: true, supportsOptions: false, isStatic: false },
  number: { type: 'number', dataKind: 'number', supportsValidation: true, supportsOptions: false, isStatic: false },
  currency: { type: 'currency', dataKind: 'number', supportsValidation: true, supportsOptions: false, isStatic: false },
  percentage: { type: 'percentage', dataKind: 'number', supportsValidation: true, supportsOptions: false, isStatic: false },
  date: { type: 'date', dataKind: 'string', supportsValidation: true, supportsOptions: false, isStatic: false },
  datetime: { type: 'datetime', dataKind: 'string', supportsValidation: true, supportsOptions: false, isStatic: false },
  select: { type: 'select', dataKind: 'string', supportsValidation: false, supportsOptions: true, isStatic: false },
  radio: { type: 'radio', dataKind: 'string', supportsValidation: false, supportsOptions: true, isStatic: false },
  checkbox: { type: 'checkbox', dataKind: 'boolean', supportsValidation: false, supportsOptions: false, isStatic: false },
  file: { type: 'file', dataKind: 'object', supportsValidation: true, supportsOptions: false, isStatic: false },
  rating: { type: 'rating', dataKind: 'number', supportsValidation: true, supportsOptions: false, isStatic: false },
  acknowledgement: { type: 'acknowledgement', dataKind: 'object', supportsValidation: true, supportsOptions: false, isStatic: false },
  heading: { type: 'heading', dataKind: 'none', supportsValidation: false, supportsOptions: false, isStatic: true },
  paragraph: { type: 'paragraph', dataKind: 'none', supportsValidation: false, supportsOptions: false, isStatic: true },
  divider: { type: 'divider', dataKind: 'none', supportsValidation: false, supportsOptions: false, isStatic: true },
  spacer: { type: 'spacer', dataKind: 'none', supportsValidation: false, supportsOptions: false, isStatic: true },
  image: { type: 'image', dataKind: 'none', supportsValidation: false, supportsOptions: false, isStatic: true },
  info_box: { type: 'info_box', dataKind: 'none', supportsValidation: false, supportsOptions: false, isStatic: true },
  table: { type: 'table', dataKind: 'array', supportsValidation: true, supportsOptions: false, isStatic: false },
  repeating_group: { type: 'repeating_group', dataKind: 'array', supportsValidation: false, supportsOptions: false, isStatic: false },
  signature: { type: 'signature', dataKind: 'object', supportsValidation: true, supportsOptions: false, isStatic: false },
  kpi: { type: 'kpi', dataKind: 'string', supportsValidation: true, supportsOptions: false, isStatic: false },
};

export function isRegisteredComponentType(type: string): boolean {
  return Boolean(COMPONENT_REGISTRY[type]);
}

export interface SchemaErrorDetail {
  componentId?: string;
  fieldKey?: string;
  message: string;
}

export function validateDynamicTemplateSchema(template: any): { valid: boolean; errors: SchemaErrorDetail[] } {
  const errors: SchemaErrorDetail[] = [];

  if (!template || typeof template !== 'object') {
    return { valid: false, errors: [{ message: 'Template schema must be a valid JSON object.' }] };
  }

  if (!template.name || !String(template.name).trim()) {
    errors.push({ message: 'Template name is required.' });
  }

  const components: any[] = template.components || template.fields || [];
  const sections: any[] = template.dynamicSections || [];

  if (sections.length === 0 && components.length === 0) {
    errors.push({ message: 'Template must contain at least one section or component.' });
  }

  const keySet = new Set<string>();

  components.forEach((c: any) => {
    // 1. Check unregistered component types
    if (!c.type || !isRegisteredComponentType(c.type)) {
      errors.push({
        componentId: c.id,
        message: `Unsupported component type "${c.type}" on component "${c.label || c.id}".`,
      });
      return;
    }

    const meta = COMPONENT_REGISTRY[c.type];

    // 2. Key uniqueness check for interactive fields
    if (!meta.isStatic) {
      const k = (c.key || c.id || '').trim().toLowerCase();
      if (!k) {
        errors.push({ componentId: c.id, message: `Field "${c.label || c.id}" is missing a machine key.` });
      } else if (keySet.has(k)) {
        errors.push({ componentId: c.id, fieldKey: k, message: `Duplicate field key "${k}" found on component "${c.label || c.id}".` });
      } else {
        keySet.add(k);
      }
    }

    // 3. Selection options check
    if (meta.supportsOptions) {
      if (!c.options || !Array.isArray(c.options) || c.options.length === 0) {
        errors.push({ componentId: c.id, message: `Selection field "${c.label || c.id}" must contain at least one option.` });
      }
    }

    // 4. Table V2 columns & settings validation
    if (c.type === 'table') {
      const normComp = normalizeTableComponent(c);
      c.columns = normComp.columns;
      c.tableConfig = normComp.tableConfig;

      if (!c.columns || !Array.isArray(c.columns) || c.columns.length === 0) {
        errors.push({ componentId: c.id, message: `Table "${c.label || c.id}" must define at least one column.` });
      } else {
        const normCols = c.columns.map(normalizeTableColumnConfig);
        const colKeySet = new Set<string>();

        normCols.forEach((col: TableColumnConfig) => {
          const ck = (col.key || '').trim().toLowerCase();
          if (!ck) {
            errors.push({ componentId: c.id, message: `Column in table "${c.label}" is missing a unique key.` });
          } else if (colKeySet.has(ck)) {
            errors.push({ componentId: c.id, message: `Duplicate table column key "${ck}" in table "${c.label}". Choose a unique key for each column.` });
          }
          colKeySet.add(ck);

          if (!col.label || !col.label.trim()) {
            errors.push({ componentId: c.id, message: `Column "${ck}" in table "${c.label}" requires a non-empty label.` });
          }

          if (col.type === 'select') {
            if (!col.options || col.options.length === 0) {
              errors.push({ componentId: c.id, message: `Dropdown column "${col.label}" in table "${c.label}" must define options.` });
            }
          } else if (col.type === 'calculated') {
            if (!col.calculation || !col.calculation.operator) {
              errors.push({ componentId: c.id, message: `Calculated column "${col.label}" in table "${c.label}" must define a valid formula.` });
            } else {
              const leftKey = col.calculation.left?.columnKey;
              const rightKey = col.calculation.right?.columnKey;
              if (leftKey && !normCols.some((other: TableColumnConfig) => other.key === leftKey)) {
                errors.push({ componentId: c.id, message: `Calculated column "${col.label}" references unknown column "${leftKey}".` });
              }
              if (rightKey && !normCols.some((other: TableColumnConfig) => other.key === rightKey)) {
                errors.push({ componentId: c.id, message: `Calculated column "${col.label}" references unknown column "${rightKey}".` });
              }
            }
          }
        });

        // DFS Cycle Detection for Calculated Columns
        const cycleRes = detectTableCalculationCycles(normCols);
        if (cycleRes.hasCycle) {
          errors.push({
            componentId: c.id,
            message: `Circular calculation detected among table columns: ${cycleRes.cyclePath?.join(' -> ')}.`,
          });
        }
      }

      const rawMin = c.minRows !== undefined ? c.minRows : c.tableConfig?.minRows;
      const rawMax = c.maxRows !== undefined ? c.maxRows : c.tableConfig?.maxRows;

      const minRows = rawMin !== undefined ? Number(rawMin) : 1;
      const maxRows = rawMax !== undefined ? Number(rawMax) : 50;

      if (isNaN(minRows) || minRows < 0 || !Number.isInteger(minRows)) {
        errors.push({ componentId: c.id, message: `Table "${c.label || c.id}" minimum rows (${rawMin}) must be a non-negative integer.` });
      }

      if (isNaN(maxRows) || maxRows < 1 || !Number.isInteger(maxRows)) {
        errors.push({ componentId: c.id, message: `Table "${c.label || c.id}" maximum rows (${rawMax}) must be an integer of at least 1.` });
      }

      if (!isNaN(minRows) && !isNaN(maxRows) && Number.isInteger(minRows) && Number.isInteger(maxRows) && minRows >= 0 && maxRows >= 1 && minRows > maxRows) {
        errors.push({ componentId: c.id, message: `Table "${c.label || c.id}": Minimum rows (${minRows}) cannot exceed maximum rows (${maxRows}).` });
      }

      if (c.aggregates && Array.isArray(c.aggregates)) {
        const normCols = (c.columns || []).map(normalizeTableColumnConfig);
        c.aggregates.forEach((agg: any) => {
          const targetKey = agg.targetColumnKey || agg.columnKey;

          if (agg.operation === 'SUM' || agg.operation === 'AVG') {
            if (!targetKey) {
              errors.push({ componentId: c.id, message: `Table aggregate "${agg.label || 'Summary'}" operation ${agg.operation} requires a target column.` });
            } else {
              const targetCol = normCols.find((col: TableColumnConfig) => col.key === targetKey);
              if (!targetCol) {
                errors.push({ componentId: c.id, message: `Table aggregate "${agg.label}" references unknown column "${targetKey}".` });
              } else if (targetCol.type !== 'number' && targetCol.type !== 'currency' && targetCol.type !== 'percentage' && targetCol.type !== 'calculated') {
                errors.push({ componentId: c.id, message: `Table aggregate "${agg.label}" operation ${agg.operation} cannot target non-numeric column "${targetCol.label || targetKey}" of type "${targetCol.type}".` });
              }
            }
          } else if (agg.operation === 'MIN' || agg.operation === 'MAX') {
            if (!targetKey) {
              errors.push({ componentId: c.id, message: `Table aggregate "${agg.label || 'Summary'}" operation ${agg.operation} requires a target column.` });
            } else {
              const targetCol = normCols.find((col: TableColumnConfig) => col.key === targetKey);
              if (!targetCol) {
                errors.push({ componentId: c.id, message: `Table aggregate "${agg.label}" references unknown column "${targetKey}".` });
              } else if (targetCol.type !== 'number' && targetCol.type !== 'currency' && targetCol.type !== 'percentage' && targetCol.type !== 'calculated' && targetCol.type !== 'date' && targetCol.type !== 'datetime') {
                errors.push({ componentId: c.id, message: `Table aggregate "${agg.label}" operation ${agg.operation} cannot target column "${targetCol.label || targetKey}" of type "${targetCol.type}".` });
              }
            }
          } else if (agg.operation === 'COUNT') {
            if (targetKey) {
              const targetCol = normCols.find((col: TableColumnConfig) => col.key === targetKey);
              if (!targetCol) {
                errors.push({ componentId: c.id, message: `Table aggregate "${agg.label}" references unknown column "${targetKey}".` });
              }
            }
          }
        });
      }
    }

    // 5. Rating scale validation
    if (c.type === 'rating' && c.ratingConfig) {
      if (typeof c.ratingConfig.min === 'number' && typeof c.ratingConfig.max === 'number' && c.ratingConfig.min >= c.ratingConfig.max) {
        errors.push({ componentId: c.id, message: `Rating scale minimum (${c.ratingConfig.min}) must be strictly less than maximum (${c.ratingConfig.max}) on field "${c.label}".` });
      }
    }

    // 5.5. Signature role validation
    if (c.type === 'signature') {
      const sigRole = (c.signatureConfig?.signatureRole || '').trim().toLowerCase();
      if (!sigRole || (sigRole !== 'sender' && sigRole !== 'receiver')) {
        errors.push({
          componentId: c.id,
          fieldKey: c.key,
          message: `Signature component "${c.label || c.id}" must explicitly specify Signature Role (Sender or Receiver).`,
        });
      }
    }

    // 6. Display Tools Properties Validation
    if (c.type === 'heading' && c.headingConfig?.headingLevel) {
      if (!['h1', 'h2', 'h3'].includes(c.headingConfig.headingLevel)) {
        errors.push({ componentId: c.id, message: `Invalid heading level "${c.headingConfig.headingLevel}" on component "${c.label}". Must be h1, h2, or h3.` });
      }
    }

    if (c.type === 'paragraph') {
      const htmlStr = c.paragraphConfig?.contentHtml || c.label || '';
      if (htmlStr && (/<script/i.test(htmlStr) || /javascript:/i.test(htmlStr) || /<iframe/i.test(htmlStr))) {
        errors.push({ componentId: c.id, message: `Unsafe HTML or script content detected in paragraph component "${c.id}".` });
      }
    }

    if (c.type === 'divider' && c.dividerConfig?.dividerStyle) {
      if (!['solid', 'dashed', 'dotted'].includes(c.dividerConfig.dividerStyle)) {
        errors.push({ componentId: c.id, message: `Invalid divider style "${c.dividerConfig.dividerStyle}". Must be solid, dashed, or dotted.` });
      }
    }

    if (c.type === 'spacer') {
      const spSize = c.spacerConfig?.spacerSize || c.size;
      const heightPx = c.spacerConfig?.heightPx;

      if (spSize && !['xs', 'sm', 'md', 'lg', 'xl', 'custom', 'small', 'medium', 'large', 'extra_small', 'extra_large'].includes(spSize)) {
        errors.push({ componentId: c.id, message: `Invalid spacer size preset "${spSize}".` });
      }

      if (typeof heightPx === 'number') {
        if (isNaN(heightPx) || heightPx < 4 || heightPx > 200) {
          errors.push({ componentId: c.id, message: `Spacer height (${heightPx}px) out of bounds. Must be between 4px and 200px.` });
        }
      }
    }

    if (c.type === 'image') {
      const ref = c.imageConfig?.assetUrl || c.assetUrl || c.imageConfig?.assetId || c.assetId;
      if (ref && (ref.startsWith('file:') || ref.startsWith('/Users/') || /^[a-zA-Z]:\\/.test(ref))) {
        errors.push({ componentId: c.id, message: `Image asset reference "${ref}" cannot be a local filesystem path.` });
      }
    }

    if (c.type === 'info_box') {
      const preset = c.infoBoxConfig?.stylePreset || c.stylePreset;
      if (preset && !['info', 'warning', 'success', 'important', 'neutral'].includes(preset)) {
        errors.push({ componentId: c.id, message: `Invalid callout preset "${preset}".` });
      }
    }

    // 7. Repeating Group Validation
    if (c.type === 'repeating_group') {
      const rgConf = c.repeatingGroupConfig || {};
      const minItems = rgConf.minItems !== undefined ? rgConf.minItems : c.minItems;
      const maxItems = rgConf.maxItems !== undefined ? rgConf.maxItems : c.maxItems;

      if (typeof minItems === 'number' && typeof maxItems === 'number' && minItems > maxItems) {
        errors.push({ componentId: c.id, message: `Repeating Group "${c.label}" minimum items (${minItems}) cannot exceed maximum items (${maxItems}).` });
      }

      const nested = c.nestedComponents || [];
      const childKeySet = new Set<string>();
      nested.forEach((nc: any) => {
        if (nc.type === 'repeating_group') {
          errors.push({ componentId: c.id, message: `Nested Repeating Groups are not permitted inside "${c.label}". Single-level nesting only.` });
        }
        const ck = (nc.key || nc.id || '').trim().toLowerCase();
        if (ck) {
          if (childKeySet.has(ck)) {
            errors.push({ componentId: c.id, message: `Duplicate child field key "${ck}" in Repeating Group "${c.label}".` });
          }
          childKeySet.add(ck);
        }
      });
    }

    // 8. Signature Field Validation
    if (c.type === 'signature') {
      const sigConf = c.signatureConfig || {};
      if (sigConf.signatureType && !['typed_name', 'checkbox_confirmation', 'drawn'].includes(sigConf.signatureType)) {
        errors.push({ componentId: c.id, message: `Invalid signature type "${sigConf.signatureType}" on component "${c.label}".` });
      }
    }

    // 9. KPI Component Validation
    if (c.type === 'kpi') {
      const kConf = c.kpiConfig || {};
      const valType = kConf.valueType || kConf.format;
      if (valType && !['number', 'currency', 'percentage', 'text'].includes(valType)) {
        errors.push({ componentId: c.id, message: `Invalid KPI value type "${valType}" on component "${c.label}".` });
      }
    }

    // 7. Safe Regex compilation check
    if (c.validation?.pattern) {
      try {
        new RegExp(c.validation.pattern);
      } catch {
        errors.push({ componentId: c.id, message: `Invalid regex validation pattern "${c.validation.pattern}" on field "${c.label}".` });
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}
