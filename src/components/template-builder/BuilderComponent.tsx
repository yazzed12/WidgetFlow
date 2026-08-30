import type { TemplateComponent, BuilderValidationIssue } from '../../types';
import { TOOLBOX_ITEMS } from './BuilderToolbox';
import { GripVertical, Copy, Trash2, Tag, AlertCircle, DollarSign, Percent, Calendar, Paperclip, CheckCircle } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface BuilderComponentProps {
  component: TemplateComponent;
  isSelected: boolean;
  validationIssue?: BuilderValidationIssue;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export const BuilderComponent: React.FC<BuilderComponentProps> = ({
  component,
  isSelected,
  validationIssue,
  onSelect,
  onDuplicate,
  onDelete,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: component.id,
    data: { component, isComponent: true },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const layoutWidth = (component as any).layoutWidth || component.layout?.width || 'full';

  const getColSpanClass = (width: string) => {
    switch (width) {
      case 'half':
        return 'col-span-12 sm:col-span-6';
      case 'third':
        return 'col-span-12 sm:col-span-4';
      case 'full':
      default:
        return 'col-span-12';
    }
  };

  const colClass = getColSpanClass(layoutWidth);
  const itemDef = TOOLBOX_ITEMS.find((t) => t.type === component.type);

  const isContent = component.type === 'heading' || component.type === 'paragraph';

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={`${colClass} relative group transition-all duration-150 cursor-pointer ${
        isDragging ? 'opacity-30' : ''
      }`}
    >
      <div
        id={component.id}
        className={`p-3.5 rounded-xl border bg-white transition-all shadow-2xs relative ${
          validationIssue
            ? 'border-rose-500 ring-2 ring-rose-300 bg-rose-50/10 shadow-md z-10'
            : isSelected
            ? 'border-indigo-600 ring-2 ring-indigo-500/20 shadow-md z-10'
            : 'border-slate-200 hover:border-indigo-300 hover:shadow-xs'
        }`}
      >
        {/* Header Bar: Drag Handle, Icon, Label & Key */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 overflow-hidden">
            <button
              type="button"
              {...attributes}
              {...listeners}
              className="p-1 text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing rounded"
            >
              <GripVertical className="w-4 h-4" />
            </button>

            <div className="p-1 bg-slate-100 rounded text-slate-600 shrink-0">
              {itemDef?.icon || <Tag className="w-3.5 h-3.5" />}
            </div>

            <span className="text-xs font-bold text-slate-900 truncate">
              {component.label || component.key}
            </span>

            {component.required && (
              <span className="text-rose-500 text-xs font-bold shrink-0">*</span>
            )}
          </div>

          {/* Right Info Badges */}
          <div className="flex items-center gap-1.5 shrink-0">
            {validationIssue && (
              <span className="font-bold text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded border border-rose-200 flex items-center gap-1 shrink-0">
                <AlertCircle className="w-3 h-3 text-rose-600" />
                <span>Needs attention</span>
              </span>
            )}

            {!isContent && (
              <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 font-semibold flex items-center gap-1">
                <Tag className="w-2.5 h-2.5 text-slate-400" />
                {component.key}
              </span>
            )}

            <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded uppercase">
              {layoutWidth}
            </span>
          </div>
        </div>

        {/* Description Preview */}
        {component.description && (
          <p className="text-[11px] text-slate-500 mb-2 pl-7 leading-tight">{component.description}</p>
        )}

        {/* Visual Input Field Preview (Non-interactive representation) */}
        <div className="pl-7 pt-1">
          {(() => {
            switch (component.type) {
              case 'heading':
                return (
                  <div className="py-1 border-b border-slate-200">
                    <span className="text-sm font-bold text-slate-900">{component.label}</span>
                  </div>
                );

              case 'paragraph':
                return (
                  <div className="p-2.5 bg-indigo-50/70 border border-indigo-100 rounded-lg text-xs text-indigo-950 font-medium">
                    {component.label}
                  </div>
                );

              case 'textarea':
                return (
                  <div className="w-full h-16 bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-400 italic">
                    {component.placeholder || 'Text area input preview...'}
                  </div>
                );

              case 'select':
              case 'radio':
                const options = component.options || ['Option 1', 'Option 2'];
                return (
                  <div className="flex flex-wrap gap-1.5">
                    {options.map((opt: any, idx: number) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-slate-100 border border-slate-200 rounded text-[11px] font-medium text-slate-700"
                      >
                        {typeof opt === 'string' ? opt : opt.label}
                      </span>
                    ))}
                  </div>
                );

              case 'checkbox':
                return (
                  <div className="flex items-center gap-2 p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>{component.label}</span>
                  </div>
                );

              case 'currency':
                return (
                  <div className="flex items-center gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-700">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{component.placeholder || '0.00'}</span>
                  </div>
                );

              case 'percentage':
                return (
                  <div className="flex items-center gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-700">
                    <span>{component.placeholder || '0'}</span>
                    <Percent className="w-3.5 h-3.5 text-indigo-500" />
                  </div>
                );

              case 'date':
              case 'datetime':
                return (
                  <div className="flex items-center gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>YYYY-MM-DD</span>
                  </div>
                );

              case 'file':
                return (
                  <div className="flex items-center gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
                    <Paperclip className="w-3.5 h-3.5 text-rose-500" />
                    <span>Attach document preview</span>
                  </div>
                );

              case 'signature':
                const sigRole = component.signatureConfig?.signatureRole;
                return (
                  <div className="p-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center space-y-1">
                    <span className="text-xs font-bold text-slate-700 block">
                      {sigRole ? `${sigRole} Signature Area` : 'Signature Component'}
                    </span>
                    <p className="text-[11px] text-slate-500 italic">
                      {sigRole === 'Sender'
                        ? '[ Sender signature will appear here when report is signed and sent ]'
                        : sigRole === 'Receiver'
                        ? '[ Receiver signature will appear here when reviewer signs ]'
                        : '[ Choose Signature Role (Sender or Receiver) in Properties ]'}
                    </p>
                  </div>
                );

              case 'text':
              default:
                return (
                  <div className="w-full py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-400 italic">
                    {component.placeholder || 'Text field preview...'}
                  </div>
                );
            }
          })()}
        </div>

        {/* Inline Component Error Message */}
        {validationIssue && (
          <div className="mt-2.5 ml-7 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{validationIssue.message}</span>
          </div>
        )}

        {/* Selected Component Quick Action Toolbar */}
        {isSelected && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-slate-900 text-white p-1 rounded-lg shadow-lg z-20 animate-fade-in">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate();
              }}
              title="Duplicate Component"
              className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Delete Component"
              className="p-1 hover:bg-rose-900/80 text-rose-300 hover:text-rose-100 rounded transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
