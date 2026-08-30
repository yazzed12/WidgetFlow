import type { WidgetTemplate, TemplateComponent, TableColumnConfig, BuilderValidationIssue } from '../types/index.js';
import { normalizeTableColumnConfig } from '../shared/table-v2/index.js';

/**
 * Centralized Builder Validation Helper.
 * Recalculates all template validation issues across components, sections, logic, and workflow.
 */
export function getBuilderValidationIssues(template: WidgetTemplate): BuilderValidationIssue[] {
  const issues: BuilderValidationIssue[] = [];
  if (!template) return issues;

  // 1. Template Name Check
  if (!template.name || !template.name.trim()) {
    issues.push({
      area: 'template',
      code: 'NAME_REQUIRED',
      message: 'Template Name is required.',
    });
  }

  // 2. Sections Check
  const sections = template.dynamicSections || [];
  if (sections.length === 0) {
    issues.push({
      area: 'template',
      code: 'SECTIONS_REQUIRED',
      message: 'Template must contain at least one section.',
    });
  }

  // 3. Components Check
  const allComps = sections.flatMap((s) => s.components || []);
  const inputComps = allComps.filter(
    (c) => c.type !== 'heading' && c.type !== 'paragraph' && c.type !== 'divider' && c.type !== 'spacer'
  );

  if (inputComps.length === 0) {
    issues.push({
      area: 'template',
      code: 'INPUT_REQUIRED',
      message: 'Template must contain at least one input component.',
    });
  }

  // 4. Duplicate Keys Check
  const keyMap = new Map<string, TemplateComponent[]>();
  inputComps.forEach((c) => {
    const k = (c.key || c.id || '').trim().toLowerCase();
    if (!k) {
      issues.push({
        componentId: c.id,
        area: 'component',
        code: 'MISSING_KEY',
        message: `Component "${c.label || c.id}" is missing a field key.`,
      });
      return;
    }
    if (!keyMap.has(k)) keyMap.set(k, []);
    keyMap.get(k)!.push(c);
  });

  keyMap.forEach((comps, k) => {
    if (comps.length > 1) {
      comps.forEach((c) => {
        issues.push({
          componentId: c.id,
          fieldKey: k,
          area: 'component',
          code: 'DUPLICATE_KEY',
          message: `Duplicate field key "${k}" found on component "${c.label || c.id}". Keys must be unique.`,
        });
      });
    }
  });

  // 5. Component-Specific Validations
  allComps.forEach((c) => {
    if (c.type === 'select' || c.type === 'radio') {
      if (!c.options || c.options.length === 0) {
        issues.push({
          componentId: c.id,
          area: 'component',
          code: 'NO_OPTIONS',
          message: `Component "${c.label || c.id}" must have at least one selection option.`,
        });
      }
    } else if (c.type === 'rating' && c.ratingConfig) {
      const min = Number(c.ratingConfig.min);
      const max = Number(c.ratingConfig.max);
      if (!isNaN(min) && !isNaN(max) && min >= max) {
        issues.push({
          componentId: c.id,
          area: 'component',
          code: 'RATING_INVALID',
          message: `Rating scale minimum (${min}) must be less than maximum (${max}).`,
        });
      }
    } else if (c.type === 'table') {
      if (!c.columns || !Array.isArray(c.columns) || c.columns.length === 0) {
        issues.push({
          componentId: c.id,
          area: 'component',
          code: 'TABLE_NO_COLUMNS',
          message: `Add at least one column to this table before submitting the template.`,
        });
      } else {
        const colKeys = new Set<string>();
        const normCols = c.columns.map(normalizeTableColumnConfig);

        normCols.forEach((col: TableColumnConfig) => {
          const colKey = (col.key || '').trim().toLowerCase();
          if (!colKey) {
            issues.push({
              componentId: c.id,
              area: 'component',
              code: 'TABLE_COL_NO_KEY',
              message: `Table "${c.label || c.id}" contains a column missing a key.`,
            });
          } else if (colKeys.has(colKey)) {
            issues.push({
              componentId: c.id,
              area: 'component',
              code: 'TABLE_DUPLICATE_COL',
              message: `Table "${c.label || c.id}" contains duplicate column key "${colKey}".`,
            });
          } else {
            colKeys.add(colKey);
          }
        });

        // Min/Max Rows Check
        const rawMin = c.minRows !== undefined ? c.minRows : c.tableConfig?.minRows;
        const rawMax = c.maxRows !== undefined ? c.maxRows : c.tableConfig?.maxRows;
        const minRows = rawMin !== undefined ? Number(rawMin) : 1;
        const maxRows = rawMax !== undefined ? Number(rawMax) : 50;

        if (isNaN(minRows) || minRows < 0 || !Number.isInteger(minRows)) {
          issues.push({
            componentId: c.id,
            area: 'component',
            code: 'TABLE_MIN_INVALID',
            message: `Minimum rows must be a non-negative integer.`,
          });
        }

        if (isNaN(maxRows) || maxRows < 1 || !Number.isInteger(maxRows)) {
          issues.push({
            componentId: c.id,
            area: 'component',
            code: 'TABLE_MAX_INVALID',
            message: `Maximum rows must be a positive integer.`,
          });
        }

        if (!isNaN(minRows) && !isNaN(maxRows) && minRows > maxRows) {
          issues.push({
            componentId: c.id,
            area: 'component',
            code: 'TABLE_ROWS_INVALID',
            message: `Maximum rows must be greater than or equal to Minimum rows.`,
          });
        }
        // Aggregate Column Compatibility Check
        if (c.aggregates && Array.isArray(c.aggregates)) {
          c.aggregates.forEach((agg: any) => {
            const targetKey = agg.targetColumnKey || agg.columnKey;
            if (agg.operation === 'SUM' || agg.operation === 'AVG') {
              if (!targetKey) {
                issues.push({
                  componentId: c.id,
                  area: 'component',
                  code: 'TABLE_AGG_NO_TARGET',
                  message: `Table aggregate "${agg.label || 'Summary'}" operation ${agg.operation} requires a target column.`,
                });
              } else {
                const targetCol = normCols.find((col) => col.key === targetKey);
                if (!targetCol) {
                  issues.push({
                    componentId: c.id,
                    area: 'component',
                    code: 'TABLE_AGG_UNKNOWN_COL',
                    message: `Table aggregate "${agg.label}" references unknown column "${targetKey}".`,
                  });
                } else if (
                  targetCol.type !== 'number' &&
                  targetCol.type !== 'currency' &&
                  targetCol.type !== 'percentage' &&
                  targetCol.type !== 'calculated'
                ) {
                  issues.push({
                    componentId: c.id,
                    area: 'component',
                    code: 'TABLE_AGG_INVALID_COL',
                    message: `Table aggregate "${agg.label}" operation ${agg.operation} cannot target non-numeric column "${targetCol.label || targetKey}".`,
                  });
                }
              }
            }
          });
        }
      }
    } else if (c.type === 'signature') {
      const sigRole = (c.signatureConfig?.signatureRole || '').trim().toLowerCase();
      if (!sigRole || (sigRole !== 'sender' && sigRole !== 'receiver')) {
        issues.push({
          componentId: c.id,
          fieldKey: c.key,
          area: 'component',
          code: 'MISSING_SIGNATURE_ROLE',
          message: 'Choose whether this signature belongs to the report Sender or Receiver.',
        });
      }
    }
  });

  // 6. Workflow Definition Check
  const wf = (template as any).workflowDefinition;
  if (wf && wf.steps) {
    wf.steps.forEach((step: any, idx: number) => {
      if (!step.assigneeRole) {
        issues.push({
          area: 'workflow',
          code: 'WORKFLOW_INVALID_ROLE',
          message: `Workflow step ${idx + 1} ("${step.name}") requires an assigned role.`,
        });
      }
    });
  }

  return issues;
}
