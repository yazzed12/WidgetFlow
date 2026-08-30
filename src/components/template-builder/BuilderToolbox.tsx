import React from 'react';
import type { TemplateComponentType, TableColumnConfig } from '../../types';
import {
  Type,
  AlignLeft,
  Hash,
  DollarSign,
  Percent,
  Calendar,
  Clock,
  ListFilter,
  CheckCircle,
  CheckSquare,
  Paperclip,
  Heading,
  FileText,
  Minus,
  Square,
  Image as ImageIcon,
  Info,
  Table,
  Repeat,
  PenTool,
  TrendingUp,
  Plus,
  GripVertical,
  Star,
  ShieldCheck,
} from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';

export interface ToolboxItem {
  type: TemplateComponentType;
  label: string;
  category: 'basic' | 'content' | 'structure' | 'business';
  icon: React.ReactNode;
  defaultLabel: string;
  defaultPlaceholder?: string;
  defaultOptions?: string[];
  defaultColumns?: TableColumnConfig[];
}

export const TOOLBOX_ITEMS: ToolboxItem[] = [
  // Basic Fields
  {
    type: 'text',
    label: 'Text Input',
    category: 'basic',
    icon: <Type className="w-4 h-4 text-blue-500" />,
    defaultLabel: 'Text Field',
    defaultPlaceholder: 'Enter text...',
  },
  {
    type: 'textarea',
    label: 'Text Area',
    category: 'basic',
    icon: <AlignLeft className="w-4 h-4 text-indigo-500" />,
    defaultLabel: 'Text Area',
    defaultPlaceholder: 'Enter detailed notes...',
  },
  {
    type: 'number',
    label: 'Number',
    category: 'basic',
    icon: <Hash className="w-4 h-4 text-purple-500" />,
    defaultLabel: 'Numeric Quantity',
    defaultPlaceholder: '0',
  },
  {
    type: 'currency',
    label: 'Currency ($)',
    category: 'basic',
    icon: <DollarSign className="w-4 h-4 text-emerald-500" />,
    defaultLabel: 'Amount ($)',
    defaultPlaceholder: '0.00',
  },
  {
    type: 'percentage',
    label: 'Percentage (%)',
    category: 'basic',
    icon: <Percent className="w-4 h-4 text-amber-500" />,
    defaultLabel: 'Percentage Rate',
    defaultPlaceholder: '0',
  },
  {
    type: 'date',
    label: 'Target Date',
    category: 'basic',
    icon: <Calendar className="w-4 h-4 text-teal-500" />,
    defaultLabel: 'Required Completion Date',
  },
  {
    type: 'datetime',
    label: 'Timestamp (Date & Time)',
    category: 'basic',
    icon: <Clock className="w-4 h-4 text-cyan-500" />,
    defaultLabel: 'Scheduled Review Time',
  },
  {
    type: 'select',
    label: 'Dropdown Select',
    category: 'basic',
    icon: <ListFilter className="w-4 h-4 text-violet-500" />,
    defaultLabel: 'Category / Selection',
    defaultOptions: ['Option 1', 'Option 2', 'Option 3'],
  },
  {
    type: 'radio',
    label: 'Radio Options',
    category: 'basic',
    icon: <CheckCircle className="w-4 h-4 text-pink-500" />,
    defaultLabel: 'Radio Choice',
    defaultOptions: ['Low', 'Medium', 'High'],
  },
  {
    type: 'checkbox',
    label: 'Checkbox Option',
    category: 'basic',
    icon: <CheckSquare className="w-4 h-4 text-emerald-600" />,
    defaultLabel: 'Enable Special Option',
  },
  {
    type: 'rating',
    label: 'Rating',
    category: 'basic',
    icon: <Star className="w-4 h-4 text-amber-500" />,
    defaultLabel: 'Service Quality Rating',
  },
  {
    type: 'acknowledgement',
    label: 'Acknowledgement',
    category: 'basic',
    icon: <ShieldCheck className="w-4 h-4 text-emerald-600" />,
    defaultLabel: 'Agreement Confirmation',
  },
  {
    type: 'file',
    label: 'File Attachment',
    category: 'basic',
    icon: <Paperclip className="w-4 h-4 text-orange-500" />,
    defaultLabel: 'Supporting Document',
  },

  // Content & Structure
  {
    type: 'heading',
    label: 'Section Heading',
    category: 'content',
    icon: <Heading className="w-4 h-4 text-slate-700" />,
    defaultLabel: 'Section Header Title',
  },
  {
    type: 'paragraph',
    label: 'Paragraph Text',
    category: 'content',
    icon: <FileText className="w-4 h-4 text-slate-600" />,
    defaultLabel: 'Instructional text for report fill context.',
  },
  {
    type: 'divider',
    label: 'Section Divider',
    category: 'content',
    icon: <Minus className="w-4 h-4 text-slate-500" />,
    defaultLabel: 'Divider',
  },
  {
    type: 'spacer',
    label: 'Layout Spacer',
    category: 'content',
    icon: <Square className="w-4 h-4 text-slate-400" />,
    defaultLabel: 'Spacer',
  },
  {
    type: 'image',
    label: 'Image Asset / Logo',
    category: 'content',
    icon: <ImageIcon className="w-4 h-4 text-sky-500" />,
    defaultLabel: 'Company Logo / Image',
  },
  {
    type: 'info_box',
    label: 'Info / Callout Box',
    category: 'content',
    icon: <Info className="w-4 h-4 text-blue-600" />,
    defaultLabel: 'Important Compliance Callout',
  },

  // Business Components
  {
    type: 'table',
    label: 'Data Table',
    category: 'business',
    icon: <Table className="w-4 h-4 text-indigo-600" />,
    defaultLabel: 'Itemized Breakdown Table',
    defaultColumns: [
      { key: 'item', label: 'Item / Description', type: 'text', width: '40%' },
      { key: 'quantity', label: 'Quantity', type: 'number', width: '30%' },
      { key: 'unit_cost', label: 'Unit Cost ($)', type: 'currency', width: '30%' },
    ],
  },
  {
    type: 'repeating_group',
    label: 'Repeating Group',
    category: 'business',
    icon: <Repeat className="w-4 h-4 text-purple-600" />,
    defaultLabel: 'Repeating Records',
  },
  {
    type: 'signature',
    label: 'Document Signature',
    category: 'business',
    icon: <PenTool className="w-4 h-4 text-rose-600" />,
    defaultLabel: 'Signer Acknowledgement',
  },
  {
    type: 'kpi',
    label: 'KPI Metric Block',
    category: 'business',
    icon: <TrendingUp className="w-4 h-4 text-emerald-600" />,
    defaultLabel: 'Annual Revenue Metric',
  },
];

import { HelpCircle } from 'lucide-react';

const DraggableToolboxItem: React.FC<{
  item: ToolboxItem;
  onAdd: (item: ToolboxItem) => void;
  onOpenHelp?: (type: string) => void;
}> = ({ item, onAdd, onOpenHelp }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `toolbox-${item.type}`,
    data: { item, isToolboxItem: true },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onAdd(item)}
      className={`p-2.5 bg-white border border-slate-200 hover:border-indigo-400 hover:shadow-xs rounded-xl flex items-center justify-between cursor-grab active:cursor-grabbing transition-all select-none group ${
        isDragging ? 'opacity-40 border-indigo-500 shadow-md ring-2 ring-indigo-500/20' : ''
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <GripVertical className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 shrink-0" />
        <div className="p-1.5 bg-slate-50 rounded-lg shrink-0">{item.icon}</div>
        <span className="text-xs font-semibold text-slate-800 truncate">{item.label}</span>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {onOpenHelp && (
          <button
            type="button"
            aria-label={`Learn about ${item.label}`}
            onClick={(e) => {
              e.stopPropagation();
              onOpenHelp(item.type);
            }}
            title="Quick Guide / Help"
            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          aria-label={`Add ${item.label} component`}
          onClick={(e) => {
            e.stopPropagation();
            onAdd(item);
          }}
          title="Click to add component to active section"
          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

interface BuilderToolboxProps {
  onAddComponent: (item: ToolboxItem) => void;
  onOpenHelp?: (type: string) => void;
}

export const BuilderToolbox: React.FC<BuilderToolboxProps> = ({ onAddComponent, onOpenHelp }) => {
  const basicItems = TOOLBOX_ITEMS.filter((i) => i.category === 'basic');
  const contentItems = TOOLBOX_ITEMS.filter((i) => i.category === 'content');
  const businessItems = TOOLBOX_ITEMS.filter((i) => i.category === 'business');

  return (
    <aside className="w-full lg:w-72 bg-slate-50/80 border-r border-slate-200 p-4 space-y-6 overflow-y-auto shrink-0 select-none">
      <div>
        <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1">Component Toolbox</h2>
        <p className="text-[11px] text-slate-500 leading-normal">
          Drag components onto canvas or click <Plus className="w-3 h-3 inline text-indigo-600" /> to add. Click <HelpCircle className="w-3 h-3 inline text-slate-400" /> for quick guide.
        </p>
      </div>

      {/* Basic Input Fields */}
      <div className="space-y-2">
        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-1">Basic Fields</h3>
        <div className="space-y-1.5">
          {basicItems.map((item) => (
            <DraggableToolboxItem key={item.type} item={item} onAdd={onAddComponent} onOpenHelp={onOpenHelp} />
          ))}
        </div>
      </div>

      {/* Advanced Business Components */}
      <div className="space-y-2 pt-2 border-t border-slate-200">
        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-1">Business Components</h3>
        <div className="space-y-1.5">
          {businessItems.map((item) => (
            <DraggableToolboxItem key={item.type} item={item} onAdd={onAddComponent} onOpenHelp={onOpenHelp} />
          ))}
        </div>
      </div>

      {/* Content Components */}
      <div className="space-y-2 pt-2 border-t border-slate-200">
        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-1">Content Components</h3>
        <div className="space-y-1.5">
          {contentItems.map((item) => (
            <DraggableToolboxItem key={item.type} item={item} onAdd={onAddComponent} onOpenHelp={onOpenHelp} />
          ))}
        </div>
      </div>
    </aside>
  );
};
