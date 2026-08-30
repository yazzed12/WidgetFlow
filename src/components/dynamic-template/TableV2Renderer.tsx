import React from 'react';
import type { TemplateComponent, TableColumnConfig, TableAggregateConfig, TemplateTheme } from '../../types/index.js';
import {
  normalizeTableColumnConfig,
  evaluateTableRows,
  formatTableAggregateValue,
} from '../../shared/table-v2/index.js';
import { resolveTableStyle } from '../../shared/themeResolver.js';
import { Plus, Trash2, Copy, Table as TableIcon, Check } from 'lucide-react';

interface TableV2RendererProps {
  component: TemplateComponent;
  value: any;
  mode: 'edit' | 'readOnly';
  onChange?: (key: string, val: any[]) => void;
  disabled?: boolean;
  theme?: TemplateTheme;
}

export const TableV2Renderer: React.FC<TableV2RendererProps> = ({
  component,
  value,
  mode,
  onChange,
  disabled,
  theme,
}) => {
  const tblStyle = resolveTableStyle(component, theme);
  const fieldKey = component.key || component.id;
  const label = component.label || fieldKey;

  const cols: TableColumnConfig[] = (component.columns || []).map(normalizeTableColumnConfig);
  const tConf = component.tableConfig || {};

  const minRows = component.minRows !== undefined ? Number(component.minRows) : tConf.minRows !== undefined ? Number(tConf.minRows) : 1;
  const maxRows = component.maxRows !== undefined ? Number(component.maxRows) : tConf.maxRows !== undefined ? Number(tConf.maxRows) : 50;

  const allowAddRow = component.allowAddRow !== false && tConf.allowAddRow !== false;
  const allowDeleteRow = component.allowDeleteRow !== false && tConf.allowDeleteRow !== false;
  const allowDuplicateRow = tConf.allowDuplicateRow !== false;
  const showRowNumbers = component.showRowNumbers !== false && tConf.showRowNumbers !== false;
  const showHeader = tConf.showHeader !== false;
  const showFooter = component.showFooter !== false && tConf.showFooter !== false && (component.aggregates?.length || 0) > 0;

  const density = tConf.density || 'standard';
  const borderStyle = tConf.borderStyle || 'grid';

  const cellPaddingClass =
    density === 'compact' ? 'p-1.5' : density === 'comfortable' ? 'p-3.5' : 'p-2.5';
  const borderClass =
    borderStyle === 'minimal'
      ? 'border-b border-slate-100'
      : borderStyle === 'clean'
      ? 'border-b border-slate-200'
      : 'border border-slate-200';

  const createDefaultRow = (): Record<string, any> => {
    const row: Record<string, any> = {};
    cols.forEach((c) => {
      if (c.defaultValue !== undefined) {
        row[c.key] = c.defaultValue;
      }
    });
    return row;
  };

  // Materialize minRows in Fill / Edit mode if current value has fewer rows
  React.useEffect(() => {
    if (mode === 'edit' && !disabled && onChange) {
      const existingRows = Array.isArray(value) ? value : [];
      if (existingRows.length < minRows) {
        const needed = minRows - existingRows.length;
        const newRows = [...existingRows];
        for (let i = 0; i < needed; i++) {
          newRows.push(createDefaultRow());
        }
        onChange(fieldKey, newRows);
      }
    }
  }, [mode, minRows, value, fieldKey, disabled]);

  // Determine rows to evaluate
  let rawRows: Record<string, any>[] = [];
  if (mode === 'edit') {
    if (Array.isArray(value) && value.length > 0) {
      rawRows = value;
    } else {
      const initial: Record<string, any>[] = [];
      for (let i = 0; i < Math.max(1, minRows); i++) {
        initial.push(createDefaultRow());
      }
      rawRows = initial;
    }
  } else {
    rawRows = Array.isArray(value) ? value : [];
  }

  // Evaluate row calculations and footer aggregates
  const { evaluatedRows, aggregateValues } = evaluateTableRows(component, rawRows);

  // Handle cell value change
  const handleCellChange = (rIdx: number, cKey: string, cellVal: any) => {
    const newRows = evaluatedRows.map((r, i) => (i === rIdx ? { ...r, [cKey]: cellVal } : r));
    if (onChange) {
      onChange(fieldKey, newRows);
    }
  };

  // Add new empty row
  const handleAddRow = () => {
    if (!allowAddRow || evaluatedRows.length >= maxRows) return;
    const newRow = createDefaultRow();
    if (onChange) {
      onChange(fieldKey, [...evaluatedRows, newRow]);
    }
  };

  // Duplicate row
  const handleDuplicateRow = (rIdx: number) => {
    if (!allowDuplicateRow || evaluatedRows.length >= maxRows) return;
    const sourceRow = evaluatedRows[rIdx] || {};
    const clonedRow = { ...sourceRow };
    const newRows = [
      ...evaluatedRows.slice(0, rIdx + 1),
      clonedRow,
      ...evaluatedRows.slice(rIdx + 1),
    ];
    if (onChange) {
      onChange(fieldKey, newRows);
    }
  };

  // Remove row
  const handleRemoveRow = (rIdx: number) => {
    if (!allowDeleteRow || evaluatedRows.length <= minRows) return;
    const newRows = evaluatedRows.filter((_, i) => i !== rIdx);
    if (onChange) {
      onChange(fieldKey, newRows);
    }
  };

  return (
    <div className="col-span-12 space-y-3">
      {/* Table Header Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TableIcon className="w-4 h-4 text-indigo-600" />
          <h4 className="text-xs font-bold text-slate-900">{label}</h4>
          {component.description && (
            <span className="text-[11px] text-slate-400 italic">({component.description})</span>
          )}
        </div>
        {mode === 'edit' && allowAddRow && !disabled && (
          <div className="flex items-center gap-2">
            {evaluatedRows.length >= maxRows && (
              <span className="text-[11px] font-semibold text-amber-600">
                Max of {maxRows} rows reached
              </span>
            )}
            <button
              type="button"
              onClick={handleAddRow}
              disabled={evaluatedRows.length >= maxRows}
              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40 text-indigo-700 font-bold text-xs rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Row
            </button>
          </div>
        )}
      </div>

      {/* Main Table Grid Container */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-2xs bg-white">
        <table className="w-full text-left border-collapse text-xs">
          {showHeader && (
            <thead>
              <tr
                className="font-bold border-b border-slate-200"
                style={{ backgroundColor: tblStyle.headerBg, color: tblStyle.headerTextColor, fontFamily: tblStyle.headerFontFamily }}
              >
                {showRowNumbers && <th className="p-3 w-10 text-center opacity-80">#</th>}
                {cols.map((col) => (
                  <th
                    key={col.key}
                    style={{ width: col.width, color: tblStyle.headerTextColor, fontFamily: tblStyle.headerFontFamily }}
                    className="p-3 font-bold"
                  >
                    <div className="flex items-center gap-1">
                      <span>{col.label}</span>
                      {col.required && <span className="text-rose-500 font-bold">*</span>}
                      {col.type === 'calculated' && (
                        <span className="text-[9px] uppercase tracking-wider text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-mono font-semibold">
                          Formula
                        </span>
                      )}
                    </div>
                  </th>
                ))}
                {mode === 'edit' && !disabled && (
                  <th className="p-3 w-20 text-center font-bold text-slate-700">Actions</th>
                )}
              </tr>
            </thead>
          )}

          <tbody className="divide-y divide-slate-200/80 bg-white">
            {evaluatedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={cols.length + (showRowNumbers ? 1 : 0) + (mode === 'edit' && !disabled ? 1 : 0)}
                  className="p-4 text-center text-slate-400 italic text-xs"
                >
                  No rows available.
                </td>
              </tr>
            ) : (
              evaluatedRows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50/70 transition-colors">
                  {showRowNumbers && (
                    <td className={`${cellPaddingClass} ${borderClass} text-center text-slate-400 font-mono font-semibold text-[11px]`}>
                      {rIdx + 1}
                    </td>
                  )}
                  {cols.map((col) => {
                    const cellVal = row[col.key] !== undefined ? row[col.key] : '';

                    if (mode === 'readOnly') {
                      let displayVal: React.ReactNode = String(cellVal !== undefined && cellVal !== null ? cellVal : '-');

                      if (col.type === 'currency') {
                        displayVal = (
                          <span className="font-mono font-bold text-slate-900">
                            {formatTableAggregateValue({ id: 'c', label: '', operation: 'SUM', format: 'currency' }, parseFloat(cellVal))}
                          </span>
                        );
                      } else if (col.type === 'percentage') {
                        displayVal = (
                          <span className="font-mono font-bold text-slate-900">
                            {formatTableAggregateValue({ id: 'p', label: '', operation: 'SUM', format: 'percentage' }, parseFloat(cellVal))}
                          </span>
                        );
                      } else if (col.type === 'checkbox') {
                        displayVal = Boolean(cellVal) ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-bold text-[10px]">
                            <Check className="w-3 h-3" /> Yes
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">No</span>
                        );
                      } else if (col.type === 'calculated') {
                        displayVal = (
                          <span className="font-mono font-extrabold text-indigo-900 bg-indigo-50 px-2 py-1 rounded-md">
                            {typeof cellVal === 'number' ? cellVal.toLocaleString() : cellVal || 0}
                          </span>
                        );
                      }

                      return (
                        <td key={col.key} className={`${cellPaddingClass} ${borderClass}`}>
                          {displayVal}
                        </td>
                      );
                    }

                    // EDIT MODE CELL CONTROLS
                    return (
                      <td key={col.key} className={`${cellPaddingClass} ${borderClass}`}>
                        {col.type === 'textarea' ? (
                          <textarea
                            value={cellVal}
                            disabled={disabled || col.readOnly}
                            onChange={(e) => handleCellChange(rIdx, col.key, e.target.value)}
                            placeholder={col.placeholder || `Enter ${col.label.toLowerCase()}...`}
                            rows={2}
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-indigo-500 disabled:bg-slate-100"
                          />
                        ) : col.type === 'number' ? (
                          <input
                            type="number"
                            value={cellVal}
                            min={col.min}
                            max={col.max}
                            step="any"
                            disabled={disabled || col.readOnly}
                            onChange={(e) => handleCellChange(rIdx, col.key, e.target.value)}
                            placeholder={col.placeholder || '0'}
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold focus:outline-none focus:border-indigo-500 disabled:bg-slate-100"
                          />
                        ) : col.type === 'currency' ? (
                          <div className="relative flex items-center">
                            <span className="absolute left-2.5 text-slate-400 font-bold text-xs">$</span>
                            <input
                              type="number"
                              value={cellVal}
                              step="0.01"
                              disabled={disabled || col.readOnly}
                              onChange={(e) => handleCellChange(rIdx, col.key, e.target.value)}
                              placeholder={col.placeholder || '0.00'}
                              className="w-full pl-6 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:outline-none focus:border-indigo-500 disabled:bg-slate-100"
                            />
                          </div>
                        ) : col.type === 'percentage' ? (
                          <div className="relative flex items-center">
                            <input
                              type="number"
                              value={cellVal}
                              step="0.1"
                              disabled={disabled || col.readOnly}
                              onChange={(e) => handleCellChange(rIdx, col.key, e.target.value)}
                              placeholder={col.placeholder || '0'}
                              className="w-full pl-2 pr-6 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:outline-none focus:border-indigo-500 disabled:bg-slate-100"
                            />
                            <span className="absolute right-2.5 text-slate-400 font-bold text-xs">%</span>
                          </div>
                        ) : col.type === 'date' ? (
                          <input
                            type="date"
                            value={cellVal}
                            disabled={disabled || col.readOnly}
                            onChange={(e) => handleCellChange(rIdx, col.key, e.target.value)}
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-indigo-500 disabled:bg-slate-100"
                          />
                        ) : col.type === 'datetime' ? (
                          <input
                            type="datetime-local"
                            value={cellVal}
                            disabled={disabled || col.readOnly}
                            onChange={(e) => handleCellChange(rIdx, col.key, e.target.value)}
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-indigo-500 disabled:bg-slate-100"
                          />
                        ) : col.type === 'select' ? (
                          <select
                            value={cellVal}
                            disabled={disabled || col.readOnly}
                            onChange={(e) => handleCellChange(rIdx, col.key, e.target.value)}
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-indigo-500 disabled:bg-slate-100"
                          >
                            <option value="">Select option...</option>
                            {col.options?.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : col.type === 'checkbox' ? (
                          <div className="flex items-center justify-center p-2">
                            <input
                              type="checkbox"
                              checked={Boolean(cellVal)}
                              disabled={disabled || col.readOnly}
                              onChange={(e) => handleCellChange(rIdx, col.key, e.target.checked)}
                              className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                            />
                          </div>
                        ) : col.type === 'calculated' ? (
                          <div className="p-2 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs font-mono font-extrabold text-indigo-900 flex items-center justify-between">
                            <span>{typeof cellVal === 'number' ? cellVal.toLocaleString() : cellVal || 0}</span>
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={cellVal}
                            disabled={disabled || col.readOnly}
                            onChange={(e) => handleCellChange(rIdx, col.key, e.target.value)}
                            placeholder={col.placeholder || `Enter ${col.label.toLowerCase()}...`}
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-indigo-500 disabled:bg-slate-100"
                          />
                        )}
                      </td>
                    );
                  })}

                  {/* ROW ACTION BUTTONS */}
                  {mode === 'edit' && !disabled && (
                    <td className={`${cellPaddingClass} ${borderClass} text-center`}>
                      <div className="flex items-center justify-center gap-1">
                        {allowDuplicateRow && (
                          <button
                            type="button"
                            onClick={() => handleDuplicateRow(rIdx)}
                            disabled={evaluatedRows.length >= maxRows}
                            title="Duplicate Row"
                            className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30 cursor-pointer transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {allowDeleteRow && (
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(rIdx)}
                            disabled={evaluatedRows.length <= minRows}
                            title="Delete Row"
                            className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30 cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>

          {/* TABLE FOOTER & AGGREGATES */}
          {showFooter && (
            <tfoot className="bg-slate-100/90 border-t-2 border-slate-300">
              {component.aggregates?.map((agg: TableAggregateConfig) => {
                const key = agg.id || agg.label;
                const rawVal = aggregateValues[key];
                const formattedVal = formatTableAggregateValue(agg, rawVal, cols);

                const alignClass =
                  agg.alignment === 'left' ? 'text-left' : agg.alignment === 'center' ? 'text-center' : 'text-right';
                const emphasisClass =
                  agg.emphasis === 'strong' ? 'font-extrabold text-slate-900 text-sm' : 'font-bold text-slate-700 text-xs';

                return (
                  <tr key={key} className="border-b border-slate-200/60">
                    {showRowNumbers && <td className="p-2.5"></td>}
                    <td
                      colSpan={Math.max(1, cols.length - 1)}
                      className={`p-2.5 ${alignClass} font-semibold text-slate-600 text-xs`}
                    >
                      {agg.showLabel !== false ? `${agg.label}:` : ''}
                    </td>
                    <td className={`p-2.5 ${alignClass} font-mono ${emphasisClass}`}>
                      {formattedVal}
                    </td>
                    {mode === 'edit' && !disabled && <td></td>}
                  </tr>
                );
              })}
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};
