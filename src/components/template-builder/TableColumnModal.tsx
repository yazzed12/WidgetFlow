import React, { useState } from 'react';
import type {
  TableColumnConfig,
  TableColumnType,
  TableCalculationExpression,
} from '../../types/index.js';
import { X, Trash2, Calculator, Settings2 } from 'lucide-react';

interface TableColumnModalProps {
  column: TableColumnConfig;
  allColumns: TableColumnConfig[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedCol: TableColumnConfig) => void;
}

export const TableColumnModal: React.FC<TableColumnModalProps> = ({
  column,
  allColumns,
  isOpen,
  onClose,
  onSave,
}) => {
  if (!isOpen) return null;

  const [label, setLabel] = useState(column.label || '');
  const [key, setKey] = useState(column.key || '');
  const [type, setType] = useState<TableColumnType>(column.type || 'text');
  const [required, setRequired] = useState(Boolean(column.required));
  const [width, setWidth] = useState(column.width || '');
  const [placeholder, setPlaceholder] = useState(column.placeholder || '');
  const [defaultValue] = useState(column.defaultValue !== undefined ? String(column.defaultValue) : '');
  const [min, setMin] = useState<number | undefined>(column.min);
  const [max, setMax] = useState<number | undefined>(column.max);
  const [decimalPlaces, setDecimalPlaces] = useState<number | undefined>(column.decimalPlaces !== undefined ? column.decimalPlaces : 2);
  const [readOnly] = useState(Boolean(column.readOnly));
  const [options, setOptions] = useState<Array<{ label: string; value: string }>>(column.options || []);
  const [newOptionLabel, setNewOptionLabel] = useState('');

  // Formula State for Calculated Columns
  const [calcOperator, setCalcOperator] = useState<TableCalculationExpression['operator']>(
    column.calculation?.operator || 'multiply'
  );
  const [calcLeftType, setCalcLeftType] = useState<'col' | 'val'>(column.calculation?.left?.columnKey ? 'col' : 'val');
  const [calcLeftCol, setCalcLeftCol] = useState<string>(column.calculation?.left?.columnKey || '');
  const [calcLeftVal, setCalcLeftVal] = useState<number>(column.calculation?.left?.value || 0);

  const [calcRightType, setCalcRightType] = useState<'col' | 'val'>(column.calculation?.right?.columnKey ? 'col' : 'val');
  const [calcRightCol, setCalcRightCol] = useState<string>(column.calculation?.right?.columnKey || '');
  const [calcRightVal, setCalcRightVal] = useState<number>(column.calculation?.right?.value || 0);

  const availableDepColumns = allColumns.filter((c) => c.key !== key && c.type !== 'calculated');

  const handleAddOption = () => {
    if (!newOptionLabel.trim()) return;
    setOptions([...options, { label: newOptionLabel.trim(), value: newOptionLabel.trim() }]);
    setNewOptionLabel('');
  };

  const handleRemoveOption = (idx: number) => {
    setOptions(options.filter((_, i) => i !== idx));
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const cleanKey = (key || label).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `col_${Date.now()}`;

    let calculation: TableCalculationExpression | undefined = undefined;
    if (type === 'calculated') {
      calculation = {
        operator: calcOperator,
        left: calcLeftType === 'col' ? { columnKey: calcLeftCol } : { value: calcLeftVal },
        right: calcRightType === 'col' ? { columnKey: calcRightCol } : { value: calcRightVal },
      };
    }

    const updated: TableColumnConfig = {
      ...column,
      label: label.trim() || 'Column',
      key: cleanKey,
      type,
      required: type === 'calculated' ? false : required,
      width: width.trim() || undefined,
      placeholder: placeholder.trim() || undefined,
      defaultValue: defaultValue !== '' ? defaultValue : undefined,
      min: min !== undefined ? Number(min) : undefined,
      max: max !== undefined ? Number(max) : undefined,
      decimalPlaces: decimalPlaces !== undefined ? Number(decimalPlaces) : undefined,
      options: type === 'select' ? options : undefined,
      readOnly: type === 'calculated' ? true : readOnly,
      calculation,
    };

    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-extrabold text-slate-900">Configure Column: {column.label || 'New Column'}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleFormSubmit} className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* Label & Stable Key */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-800 mb-1">Column Label *</label>
              <input
                type="text"
                required
                value={label}
                onChange={(e) => {
                  setLabel(e.target.value);
                  if (!key || key === column.key) {
                    setKey(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_'));
                  }
                }}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-800 mb-1">Stable Key (Machine ID) *</label>
              <input
                type="text"
                required
                value={key}
                onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_'))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-700 focus:outline-none"
              />
            </div>
          </div>

          {/* Categorized Friendly Column Type Picker */}
          <div>
            <label className="block font-bold text-slate-800 mb-2">Column Data Type</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { id: 'text', group: 'Basic', label: 'Text' },
                { id: 'textarea', group: 'Basic', label: 'Long Text' },
                { id: 'number', group: 'Basic', label: 'Number' },
                { id: 'currency', group: 'Financial', label: 'Currency ($)' },
                { id: 'percentage', group: 'Financial', label: 'Percentage (%)' },
                { id: 'date', group: 'Date & Choice', label: 'Date' },
                { id: 'datetime', group: 'Date & Choice', label: 'Date & Time' },
                { id: 'select', group: 'Date & Choice', label: 'Dropdown' },
                { id: 'checkbox', group: 'Date & Choice', label: 'Checkbox' },
                { id: 'calculated', group: 'Smart', label: 'Calculated' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setType(item.id as TableColumnType)}
                  className={`p-2.5 rounded-xl border text-left font-bold transition-all cursor-pointer flex flex-col justify-between ${
                    type === item.id
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-[10px] opacity-75 uppercase tracking-wider">{item.group}</span>
                  <span className="text-xs mt-0.5">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Basic Controls: Required, ReadOnly, Width */}
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="block font-bold text-slate-800 mb-1">Column Width</label>
              <input
                type="text"
                placeholder="e.g. 150px or 25%"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-800 mb-1">Placeholder</label>
              <input
                type="text"
                placeholder="Hint text..."
                value={placeholder}
                onChange={(e) => setPlaceholder(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl"
              />
            </div>
            <div className="flex items-center gap-4 pt-5">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={required}
                  disabled={type === 'calculated'}
                  onChange={(e) => setRequired(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded"
                />
                <span className="font-bold text-slate-700">Required</span>
              </label>
            </div>
          </div>

          {/* Type-Specific Settings: Number / Currency / Percentage */}
          {(type === 'number' || type === 'currency' || type === 'percentage') && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Numeric Validation</h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Minimum Value</label>
                  <input
                    type="number"
                    value={min !== undefined ? min : ''}
                    onChange={(e) => setMin(e.target.value !== '' ? parseFloat(e.target.value) : undefined)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Maximum Value</label>
                  <input
                    type="number"
                    value={max !== undefined ? max : ''}
                    onChange={(e) => setMax(e.target.value !== '' ? parseFloat(e.target.value) : undefined)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Decimal Places</label>
                  <input
                    type="number"
                    value={decimalPlaces !== undefined ? decimalPlaces : 2}
                    onChange={(e) => setDecimalPlaces(e.target.value !== '' ? parseInt(e.target.value) : 2)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Type-Specific Settings: Dropdown Options */}
          {type === 'select' && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Dropdown Options</h4>
              <div className="space-y-1.5">
                {options.map((opt, idx) => (
                  <div key={idx} className="p-2 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
                    <span className="font-bold text-slate-800">{opt.label}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(idx)}
                      className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  placeholder="New option label..."
                  value={newOptionLabel}
                  onChange={(e) => setNewOptionLabel(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl"
                />
                <button
                  type="button"
                  onClick={handleAddOption}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl font-bold cursor-pointer hover:bg-indigo-700 transition-colors"
                >
                  Add Option
                </button>
              </div>
            </div>
          )}

          {/* Type-Specific Settings: Formula Builder for Calculated Columns */}
          {type === 'calculated' && (
            <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-3">
              <div className="flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-indigo-700" />
                <h4 className="font-bold text-indigo-950 uppercase tracking-wider text-[11px]">Row Formula Builder</h4>
              </div>

              <div className="space-y-3">
                {/* Left Operand */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Left Operand</label>
                  <div className="flex gap-2">
                    <select
                      value={calcLeftType}
                      onChange={(e) => setCalcLeftType(e.target.value as any)}
                      className="px-2 py-1.5 bg-white border border-slate-200 rounded-xl font-bold"
                    >
                      <option value="col">Column</option>
                      <option value="val">Number</option>
                    </select>
                    {calcLeftType === 'col' ? (
                      <select
                        value={calcLeftCol}
                        onChange={(e) => setCalcLeftCol(e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl font-medium"
                      >
                        <option value="">Select column...</option>
                        {availableDepColumns.map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.label} ({c.key})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="number"
                        value={calcLeftVal}
                        onChange={(e) => setCalcLeftVal(parseFloat(e.target.value) || 0)}
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl font-mono"
                      />
                    )}
                  </div>
                </div>

                {/* Operator */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Math Operator</label>
                  <select
                    value={calcOperator}
                    onChange={(e) => setCalcOperator(e.target.value as any)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl font-bold"
                  >
                    <option value="multiply">Multiply ( × )</option>
                    <option value="add">Add ( + )</option>
                    <option value="subtract">Subtract ( − )</option>
                    <option value="divide">Divide ( ÷ )</option>
                    <option value="percentage">Percentage ( % of )</option>
                    <option value="min">Minimum of</option>
                    <option value="max">Maximum of</option>
                  </select>
                </div>

                {/* Right Operand */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Right Operand</label>
                  <div className="flex gap-2">
                    <select
                      value={calcRightType}
                      onChange={(e) => setCalcRightType(e.target.value as any)}
                      className="px-2 py-1.5 bg-white border border-slate-200 rounded-xl font-bold"
                    >
                      <option value="col">Column</option>
                      <option value="val">Number</option>
                    </select>
                    {calcRightType === 'col' ? (
                      <select
                        value={calcRightCol}
                        onChange={(e) => setCalcRightCol(e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl font-medium"
                      >
                        <option value="">Select column...</option>
                        {availableDepColumns.map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.label} ({c.key})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="number"
                        value={calcRightVal}
                        onChange={(e) => setCalcRightVal(parseFloat(e.target.value) || 0)}
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl font-mono"
                      />
                    )}
                  </div>
                </div>

                {/* Formula Preview Display */}
                <div className="p-3 bg-white border border-indigo-200 rounded-xl font-mono font-extrabold text-indigo-900">
                  Formula Preview: {label || 'Total'} ={' '}
                  {calcLeftType === 'col' ? calcLeftCol || '?' : calcLeftVal} {calcOperator}{' '}
                  {calcRightType === 'col' ? calcRightCol || '?' : calcRightVal}
                </div>
              </div>
            </div>
          )}

          {/* Footer Action Buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors cursor-pointer shadow-xs"
            >
              Save Column Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
