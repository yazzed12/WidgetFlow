import React, { useState } from 'react';
import type { TableAggregateConfig, TableColumnConfig, TableAggregateOperation } from '../../types/index.js';
import { X, Check, Calculator, AlertCircle } from 'lucide-react';

interface TableAggregateModalProps {
  aggregate: TableAggregateConfig;
  columns: TableColumnConfig[];
  onSave: (updated: TableAggregateConfig) => void;
  onClose: () => void;
}

export const TableAggregateModal: React.FC<TableAggregateModalProps> = ({
  aggregate,
  columns,
  onSave,
  onClose,
}) => {
  const [label, setLabel] = useState(aggregate.label || 'Grand Total');
  const [operation, setOperation] = useState<TableAggregateOperation>(aggregate.operation || 'SUM');
  const [targetColumnKey, setTargetColumnKey] = useState(aggregate.targetColumnKey || aggregate.columnKey || (columns[0]?.key || ''));
  const [countMode, setCountMode] = useState<'all_rows' | 'non_empty'>(aggregate.countMode || 'all_rows');
  const [displayType, setDisplayType] = useState<'auto' | 'number' | 'currency' | 'percentage' | 'text'>(aggregate.displayType || aggregate.format || 'auto');
  const [decimalPlaces, setDecimalPlaces] = useState<number>(typeof aggregate.decimalPlaces === 'number' ? aggregate.decimalPlaces : 2);
  const [prefix, setPrefix] = useState(aggregate.prefix || '');
  const [suffix, setSuffix] = useState(aggregate.suffix || '');
  const [alignment, setAlignment] = useState<'left' | 'center' | 'right'>(aggregate.alignment || 'right');
  const [emphasis, setEmphasis] = useState<'normal' | 'strong'>(aggregate.emphasis || 'strong');
  const [showLabel, setShowLabel] = useState<boolean>(aggregate.showLabel !== false);

  const selectedCol = columns.find((c) => c.key === targetColumnKey);

  // Validate column compatibility
  const isNumericCol = selectedCol && (selectedCol.type === 'number' || selectedCol.type === 'currency' || selectedCol.type === 'percentage' || selectedCol.type === 'calculated');
  const isDateCol = selectedCol && (selectedCol.type === 'date' || selectedCol.type === 'datetime');

  let validationError: string | null = null;
  if (!label.trim()) {
    validationError = 'Aggregate Label is required.';
  } else if ((operation === 'SUM' || operation === 'AVG') && selectedCol && !isNumericCol) {
    validationError = `Operation ${operation} requires a numeric, currency, or percentage column. "${selectedCol.label}" is type ${selectedCol.type}.`;
  } else if ((operation === 'MIN' || operation === 'MAX') && selectedCol && !isNumericCol && !isDateCol) {
    validationError = `Operation ${operation} requires a numeric or date column. "${selectedCol.label}" is type ${selectedCol.type}.`;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validationError) return;

    onSave({
      ...aggregate,
      id: aggregate.id || `agg-${Date.now()}`,
      label: label.trim(),
      operation,
      targetColumnKey,
      columnKey: targetColumnKey,
      countMode: operation === 'COUNT' ? countMode : undefined,
      displayType,
      format: displayType,
      decimalPlaces,
      prefix: prefix.trim(),
      suffix: suffix.trim(),
      alignment,
      emphasis,
      showLabel,
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Configure Footer Aggregate
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {validationError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Label */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Aggregate Label <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Grand Total, Average Price, Line Count"
              className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Operation & Column Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Operation</label>
              <select
                value={operation}
                onChange={(e) => setOperation(e.target.value as TableAggregateOperation)}
                className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
              >
                <option value="SUM">SUM (Total)</option>
                <option value="AVG">AVG (Average)</option>
                <option value="MIN">MIN (Minimum)</option>
                <option value="MAX">MAX (Maximum)</option>
                <option value="COUNT">COUNT (Row Count)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Target Column</label>
              <select
                value={targetColumnKey}
                onChange={(e) => setTargetColumnKey(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
              >
                {columns.map((col) => (
                  <option key={col.key} value={col.key}>
                    {col.label} ({col.type})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* COUNT Mode Selection */}
          {operation === 'COUNT' && (
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Count Mode</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setCountMode('all_rows')}
                  className={`px-3 py-2 rounded-xl border text-left font-semibold cursor-pointer transition-colors ${
                    countMode === 'all_rows'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-bold">Total Table Rows</div>
                  <div className="text-[10px] text-slate-500 font-normal">Count all rows in table</div>
                </button>

                <button
                  type="button"
                  onClick={() => setCountMode('non_empty')}
                  className={`px-3 py-2 rounded-xl border text-left font-semibold cursor-pointer transition-colors ${
                    countMode === 'non_empty'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-bold">Non-Empty Values</div>
                  <div className="text-[10px] text-slate-500 font-normal">Count non-blank column cells</div>
                </button>
              </div>
            </div>
          )}

          {/* Format & Decimal Places */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Display Format</label>
              <select
                value={displayType}
                onChange={(e) => setDisplayType(e.target.value as any)}
                className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
              >
                <option value="auto">Auto (Infer from column)</option>
                <option value="number">Number</option>
                <option value="currency">Currency ($)</option>
                <option value="percentage">Percentage (%)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Decimal Places</label>
              <select
                value={decimalPlaces}
                onChange={(e) => setDecimalPlaces(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
              >
                <option value={0}>0 (Whole Integer)</option>
                <option value={1}>1 (0.0)</option>
                <option value={2}>2 (0.00)</option>
                <option value={3}>3 (0.000)</option>
              </select>
            </div>
          </div>

          {/* Prefix & Suffix */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Prefix</label>
              <input
                type="text"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder="e.g. $, Total:"
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Suffix</label>
              <input
                type="text"
                value={suffix}
                onChange={(e) => setSuffix(e.target.value)}
                placeholder="e.g. items, hrs, kg"
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Alignment & Emphasis */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Alignment</label>
              <select
                value={alignment}
                onChange={(e) => setAlignment(e.target.value as any)}
                className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
              >
                <option value="right">Right Aligned</option>
                <option value="center">Center Aligned</option>
                <option value="left">Left Aligned</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Emphasis</label>
              <select
                value={emphasis}
                onChange={(e) => setEmphasis(e.target.value as any)}
                className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
              >
                <option value="strong">Strong Bold (Executive)</option>
                <option value="normal">Normal Text</option>
              </select>
            </div>
          </div>

          {/* Show Label Toggle */}
          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={showLabel}
                onChange={(e) => setShowLabel(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              <span className="font-semibold text-slate-800">Display Label in Footer</span>
            </label>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={Boolean(validationError)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" /> Save Aggregate
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
