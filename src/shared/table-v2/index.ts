import type {
  TableColumnConfig,
  TableColumnType,
  TableCalculationExpression,
  TableAggregateConfig,
  TemplateComponent,
} from '../../types/index.js';

/**
  * Safely normalizes old or partial column schemas for backward compatibility.
  * Preserves historical V1 snapshots without breaking.
  */
export function normalizeTableColumnConfig(col: any): TableColumnConfig {
  if (!col || typeof col !== 'object') {
    return {
      key: 'field',
      label: 'Field',
      type: 'text',
    };
  }

  const validTypes: TableColumnType[] = [
    'text',
    'textarea',
    'number',
    'currency',
    'percentage',
    'date',
    'datetime',
    'select',
    'checkbox',
    'calculated',
  ];

  const rawType = String(col.type || 'text').toLowerCase() as TableColumnType;
  const type: TableColumnType = validTypes.includes(rawType) ? rawType : 'text';

  const rawKey = String(col.key || col.id || col.label || 'field')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return {
    id: col.id || `col-${Math.random().toString(36).substring(2, 6)}`,
    key: rawKey || 'column',
    label: String(col.label || col.key || 'Column').trim(),
    type,
    required: Boolean(col.required),
    width: col.width ? String(col.width) : undefined,
    placeholder: col.placeholder ? String(col.placeholder) : undefined,
    defaultValue: col.defaultValue !== undefined ? col.defaultValue : undefined,
    min: typeof col.min === 'number' ? col.min : undefined,
    max: typeof col.max === 'number' ? col.max : undefined,
    decimalPlaces: typeof col.decimalPlaces === 'number' ? col.decimalPlaces : undefined,
    options: Array.isArray(col.options)
      ? col.options.map((opt: any) =>
          typeof opt === 'string' ? { label: opt, value: opt } : { label: String(opt.label || opt.value), value: String(opt.value || opt.label) }
        )
      : undefined,
    readOnly: type === 'calculated' ? true : Boolean(col.readOnly),
    calculation: col.calculation && typeof col.calculation === 'object' ? col.calculation : undefined,
  };
}

/**
 * Normalizes a table component to enforce canonical columns array and configuration defaults.
 */
export function normalizeTableComponent(component: any): any {
  if (!component || typeof component !== 'object') return component;
  if (component.type !== 'table') return component;

  const hasExplicitCols = Array.isArray(component.columns);
  const rawColumns =
    (hasExplicitCols ? component.columns : null) ||
    (component.tableConfig && Array.isArray(component.tableConfig.columns) ? component.tableConfig.columns : null) ||
    (Array.isArray(component.fields) ? component.fields : null);

  const defaultCols: TableColumnConfig[] = [
    { key: 'item', label: 'Item / Description', type: 'text', width: '40%' },
    { key: 'quantity', label: 'Quantity', type: 'number', width: '30%' },
    { key: 'unit_cost', label: 'Unit Cost ($)', type: 'currency', width: '30%' },
  ];

  const effectiveCols = rawColumns !== null ? rawColumns : defaultCols;
  const normCols = effectiveCols.map(normalizeTableColumnConfig);

  const tConf = component.tableConfig || {};

  return {
    ...component,
    columns: normCols,
    minRows: component.minRows !== undefined ? component.minRows : tConf.minRows !== undefined ? tConf.minRows : 1,
    maxRows: component.maxRows !== undefined ? component.maxRows : tConf.maxRows !== undefined ? tConf.maxRows : 50,
    showRowNumbers: component.showRowNumbers !== false && tConf.showRowNumbers !== false,
    showFooter: component.showFooter !== false && tConf.showFooter !== false,
    tableConfig: {
      showTitle: tConf.showTitle !== false,
      density: tConf.density || 'standard',
      borderStyle: tConf.borderStyle || 'grid',
      minRows: component.minRows !== undefined ? component.minRows : tConf.minRows !== undefined ? tConf.minRows : 1,
      maxRows: component.maxRows !== undefined ? component.maxRows : tConf.maxRows !== undefined ? tConf.maxRows : 50,
      allowAddRow: component.allowAddRow !== false && tConf.allowAddRow !== false,
      allowDeleteRow: component.allowDeleteRow !== false && tConf.allowDeleteRow !== false,
      allowDuplicateRow: tConf.allowDuplicateRow !== false,
      allowReorderRows: component.allowReorderRows !== false && tConf.allowReorderRows !== false,
      showRowNumbers: component.showRowNumbers !== false && tConf.showRowNumbers !== false,
      showFooter: component.showFooter !== false && tConf.showFooter !== false,
      columns: normCols,
      ...tConf,
    },
  };
}

/**
  * Evaluates a single row-level calculated column formula safely without eval().
  */
export function evaluateTableColumnCalculation(
  calc: TableCalculationExpression | undefined,
  rowData: Record<string, any>
): number {
  if (!calc || !calc.operator) return 0;

  const getOperandValue = (operand: { columnKey?: string; value?: number } | undefined): number => {
    if (!operand) return 0;
    if (typeof operand.value === 'number') return operand.value;
    if (operand.columnKey) {
      const rawVal = rowData[operand.columnKey];
      const parsed = parseFloat(rawVal);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  const leftVal = getOperandValue(calc.left);
  const rightVal = getOperandValue(calc.right);

  switch (calc.operator) {
    case 'add':
      return leftVal + rightVal;
    case 'subtract':
      return leftVal - rightVal;
    case 'multiply':
      return leftVal * rightVal;
    case 'divide':
      return rightVal === 0 ? 0 : leftVal / rightVal;
    case 'percentage':
      return rightVal === 0 ? 0 : (leftVal / rightVal) * 100;
    case 'min':
      return Math.min(leftVal, rightVal);
    case 'max':
      return Math.max(leftVal, rightVal);
    default:
      return 0;
  }
}

/**
  * DFS cycle detection for calculated table columns within the same table.
  */
export function detectTableCalculationCycles(columns: TableColumnConfig[]): { hasCycle: boolean; cyclePath?: string[] } {
  const normCols = (columns || []).map(normalizeTableColumnConfig);
  const calcCols = normCols.filter((c) => c.type === 'calculated' && c.calculation);

  const adjList = new Map<string, string[]>();
  calcCols.forEach((c) => {
    const deps: string[] = [];
    if (c.calculation?.left?.columnKey) deps.push(c.calculation.left.columnKey);
    if (c.calculation?.right?.columnKey) deps.push(c.calculation.right.columnKey);
    adjList.set(c.key, deps);
  });

  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  let cyclePath: string[] = [];

  function dfs(key: string, currentPath: string[]): boolean {
    visited.add(key);
    recursionStack.add(key);
    currentPath.push(key);

    const neighbors = adjList.get(key) || [];
    for (const neighbor of neighbors) {
      if (recursionStack.has(neighbor)) {
        cyclePath = [...currentPath, neighbor];
        return true;
      }
      if (!visited.has(neighbor) && adjList.has(neighbor)) {
        if (dfs(neighbor, currentPath)) return true;
      }
    }

    recursionStack.delete(key);
    currentPath.pop();
    return false;
  }

  for (const [key] of adjList) {
    if (!visited.has(key)) {
      if (dfs(key, [])) {
        return { hasCycle: true, cyclePath };
      }
    }
  }

  return { hasCycle: false };
}

/**
 * Computes table footer aggregates (SUM, AVG, MIN, MAX, COUNT).
 */
export function evaluateTableAggregates(
  _columns: TableColumnConfig[] = [],
  aggregates: TableAggregateConfig[] = [],
  rows: Record<string, any>[] = []
): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  if (!aggregates || aggregates.length === 0) return result;

  aggregates.forEach((agg) => {
    const key = agg.id || agg.label;
    const targetKey = agg.targetColumnKey || agg.columnKey;

    if (agg.operation === 'COUNT') {
      if (agg.countMode === 'non_empty' && targetKey) {
        const nonEmpty = rows.filter((r) => r[targetKey] !== undefined && r[targetKey] !== null && String(r[targetKey]).trim() !== '');
        result[key] = nonEmpty.length;
      } else {
        result[key] = rows.length;
      }
      return;
    }

    if (!targetKey) {
      result[key] = 0;
      return;
    }

    const values = rows
      .map((r) => parseFloat(r[targetKey]))
      .filter((v) => !isNaN(v));

    switch (agg.operation) {
      case 'SUM':
        result[key] = values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0);
        break;
      case 'AVG':
        result[key] = values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;
        break;
      case 'MIN':
        result[key] = values.length === 0 ? null : Math.min(...values);
        break;
      case 'MAX':
        result[key] = values.length === 0 ? null : Math.max(...values);
        break;
      default:
        result[key] = 0;
    }
  });

  return result;
}

/**
 * Formats aggregate computed value into a clean, human-readable business string.
 */
export function formatTableAggregateValue(
  agg: TableAggregateConfig,
  rawVal: number | null | undefined,
  columns: TableColumnConfig[] = []
): string {
  if (rawVal === null || rawVal === undefined || isNaN(rawVal)) {
    return '—';
  }

  const targetKey = agg.targetColumnKey || agg.columnKey;
  const col = columns.find((c) => c.key === targetKey);

  const rawFormat = agg.format || agg.displayType || 'auto';
  let format = rawFormat;
  if (format === 'auto') {
    if (col?.type === 'currency') format = 'currency';
    else if (col?.type === 'percentage') format = 'percentage';
    else format = 'number';
  }

  const decimals =
    typeof agg.decimalPlaces === 'number'
      ? agg.decimalPlaces
      : typeof col?.decimalPlaces === 'number'
      ? col.decimalPlaces
      : format === 'number' && Number.isInteger(rawVal)
      ? 0
      : 2;

  let formattedNum = '';
  if (format === 'currency') {
    formattedNum = rawVal.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    if (!formattedNum.startsWith('$') && (!agg.prefix || !agg.prefix.includes('$'))) {
      formattedNum = `$${formattedNum}`;
    }
  } else if (format === 'percentage') {
    formattedNum = `${rawVal.toFixed(decimals)}%`;
  } else {
    formattedNum = rawVal.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  const prefix = agg.prefix || '';
  const suffix = agg.suffix ? ` ${agg.suffix.trim()}` : '';

  return `${prefix}${formattedNum}${suffix}`;
}

/**
  * Evaluates all rows for a table component:
  * 1. Normalizes columns
  * 2. Evaluates calculated column formulas per row
  * 3. Computes footer aggregates
  */
export function evaluateTableRows(
  component: TemplateComponent,
  rawRows: Record<string, any>[] = []
): { evaluatedRows: Record<string, any>[]; aggregateValues: Record<string, number | null> } {
  const normCols = (component.columns || []).map(normalizeTableColumnConfig);
  const rows = Array.isArray(rawRows) ? rawRows : [];

  const evaluatedRows = rows.map((row) => {
    const updatedRow = { ...row };

    normCols.forEach((col) => {
      if (col.type === 'calculated' && col.calculation) {
        const calcVal = evaluateTableColumnCalculation(col.calculation, updatedRow);
        const decimals = typeof col.decimalPlaces === 'number' ? col.decimalPlaces : 2;
        updatedRow[col.key] = Number(calcVal.toFixed(decimals));
      }
    });

    return updatedRow;
  });

  const aggregateValues = evaluateTableAggregates(normCols, component.aggregates || [], evaluatedRows);

  return {
    evaluatedRows,
    aggregateValues,
  };
}
