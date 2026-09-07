import React from 'react';
import type { TemplateComponent, ReportTemplateField, TemplateTheme } from '../../types/index.js';
import { resolveContainerStyle } from '../../shared/themeResolver.js';
import { Plus, Trash2, Copy, Repeat } from 'lucide-react';
import { getReportBusinessFieldKey } from '../../shared/signatureResolver';

interface RepeatingGroupRendererProps {
  component: ReportTemplateField | TemplateComponent;
  value: any;
  mode: 'edit' | 'readOnly';
  onChange?: (key: string, val: any) => void;
  disabled?: boolean;
  theme?: TemplateTheme;
}

export const RepeatingGroupRenderer: React.FC<RepeatingGroupRendererProps> = ({
  component,
  value,
  mode,
  onChange,
  disabled,
  theme,
}) => {
  const cStyle = resolveContainerStyle(component, theme);
  const fieldKey = getReportBusinessFieldKey(component) || '';
  const rgConf = component.repeatingGroupConfig || {};

  const groupTitle = rgConf.groupTitle || component.label || 'Repeating Records';
  const itemLabel = rgConf.itemLabel || 'Record';
  const minItems = rgConf.minItems !== undefined ? rgConf.minItems : component.minRows !== undefined ? component.minRows : 1;
  const maxItems = rgConf.maxItems !== undefined ? rgConf.maxItems : component.maxRows !== undefined ? component.maxRows : 10;
  const allowAdd = rgConf.allowAdd !== false;
  const allowDelete = rgConf.allowDelete !== false;
  const allowDuplicate = rgConf.allowDuplicate !== false;

  const defaultChildComponents: TemplateComponent[] = component.nestedComponents && component.nestedComponents.length > 0
    ? component.nestedComponents
    : [
        { id: 'nc-1', type: 'text', key: 'full_name', label: 'Full Name', required: true, order: 0 },
        { id: 'nc-2', type: 'text', key: 'relationship_role', label: 'Relationship / Role', required: false, order: 1 },
        { id: 'nc-3', type: 'text', key: 'contact_phone', label: 'Contact Phone', required: false, order: 2 },
      ];

  const itemsList: Record<string, any>[] = Array.isArray(value) && value.length > 0
    ? value
    : Array.from({ length: Math.max(minItems, 1) }, (_, i) => ({ _rowId: `item-${i + 1}` }));

  const handleItemChange = (index: number, childKey: string, childVal: any) => {
    if (!onChange) return;
    const updated = itemsList.map((item, idx) => {
      if (idx === index) {
        return { ...item, [childKey]: childVal };
      }
      return item;
    });
    onChange(fieldKey, updated);
  };

  const handleAddItem = () => {
    if (!onChange || itemsList.length >= maxItems) return;
    const newItem = { _rowId: `item-${Date.now()}` };
    onChange(fieldKey, [...itemsList, newItem]);
  };

  const handleDuplicateItem = (index: number) => {
    if (!onChange || itemsList.length >= maxItems) return;
    const sourceItem = itemsList[index];
    const duplicated = { ...sourceItem, _rowId: `item-${Date.now()}` };
    const updated = [...itemsList.slice(0, index + 1), duplicated, ...itemsList.slice(index + 1)];
    onChange(fieldKey, updated);
  };

  const handleDeleteItem = (index: number) => {
    if (!onChange || itemsList.length <= minItems) return;
    const updated = itemsList.filter((_, i) => i !== index);
    onChange(fieldKey, updated);
  };

  return (
    <div
      className="col-span-12 space-y-3 p-4 border"
      style={{ backgroundColor: cStyle.surfaceBg, borderColor: cStyle.borderColor, borderRadius: cStyle.borderRadius }}
    >
      <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
        <div className="flex items-center gap-2">
          <Repeat className="w-4 h-4 text-purple-600 shrink-0" />
          <div>
            <h3
              className="text-xs font-bold"
              style={{ fontFamily: cStyle.labelFontFamily, color: cStyle.labelColor }}
            >
              {groupTitle}
            </h3>
            {component.description && <p className="text-[11px] text-slate-500 leading-snug">{component.description}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
            {itemsList.length} / {maxItems} {itemLabel}s
          </span>
          {mode === 'edit' && allowAdd && itemsList.length < maxItems && !disabled && (
            <button
              type="button"
              onClick={handleAddItem}
              className="px-2.5 py-1 bg-purple-600 text-white rounded-lg text-xs font-bold hover:bg-purple-700 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add {itemLabel}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {itemsList.map((itemData, idx) => (
          <div
            key={itemData._rowId || idx}
            className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs space-y-3 relative transition-all"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-[10px] font-mono">
                  {idx + 1}
                </span>
                {itemLabel} #{idx + 1}
              </span>

              {mode === 'edit' && !disabled && (
                <div className="flex items-center gap-1">
                  {allowDuplicate && itemsList.length < maxItems && (
                    <button
                      type="button"
                      onClick={() => handleDuplicateItem(idx)}
                      className="p-1 text-slate-400 hover:text-purple-600 rounded hover:bg-purple-50 transition-colors cursor-pointer"
                      title={`Duplicate ${itemLabel}`}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {allowDelete && itemsList.length > minItems && (
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(idx)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                      title={`Delete ${itemLabel}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-12 gap-3">
              {defaultChildComponents.map((childComp) => {
                const cKey = getReportBusinessFieldKey(childComp) || '';
                const cVal = itemData[cKey];
                const widthClass = childComp.layoutWidth === 'half' ? 'col-span-6' : childComp.layoutWidth === 'third' ? 'col-span-4' : 'col-span-12';

                return (
                  <div key={cKey} className={widthClass}>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      {childComp.label}
                      {childComp.required && <span className="text-rose-500 ml-0.5">*</span>}
                    </label>
                    {mode === 'edit' && !disabled ? (
                      <input
                        type={childComp.type === 'number' ? 'number' : 'text'}
                        value={cVal !== undefined ? cVal : ''}
                        onChange={(e) => handleItemChange(idx, cKey, e.target.value)}
                        placeholder={childComp.placeholder || `Enter ${(childComp.label || childComp.key || 'field').toLowerCase()}...`}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-purple-500 font-medium text-slate-900"
                      />
                    ) : (
                      <div className="text-xs font-semibold text-slate-900 p-1.5 bg-slate-50 border border-slate-100 rounded-lg">
                        {cVal !== undefined && cVal !== '' ? String(cVal) : <span className="text-slate-400 italic">Not specified</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
