import React, { useState, useEffect } from 'react';
import { useSystemConfig } from '../../context/SystemConfigContext';
import { configurationService } from '../../features/configuration/services/configurationService';
import { AdminInfoTooltip } from './AdminInfoTooltip';
import {
  Shapes,
  Type,
  AlignLeft,
  Hash,
  DollarSign,
  Percent,
  Calendar,
  Clock,
  ListFilter,
  CheckSquare,
  CircleDot,
  Star,
  FileCheck2,
  FileUp,
  Heading,
  FileText,
  Minus,
  MoveVertical,
  Image,
  Info,
  Table,
  Repeat,
  FileSignature,
  CheckCircle2,
} from 'lucide-react';

const ELEMENT_ICONS: Record<string, React.ReactNode> = {
  'elements.text': <Type className="w-4 h-4 text-slate-700" />,
  'elements.textarea': <AlignLeft className="w-4 h-4 text-slate-700" />,
  'elements.number': <Hash className="w-4 h-4 text-slate-700" />,
  'elements.currency': <DollarSign className="w-4 h-4 text-emerald-600" />,
  'elements.percentage': <Percent className="w-4 h-4 text-emerald-600" />,
  'elements.date': <Calendar className="w-4 h-4 text-blue-600" />,
  'elements.datetime': <Clock className="w-4 h-4 text-blue-600" />,
  'elements.select': <ListFilter className="w-4 h-4 text-indigo-600" />,
  'elements.checkbox': <CheckSquare className="w-4 h-4 text-indigo-600" />,
  'elements.radio': <CircleDot className="w-4 h-4 text-indigo-600" />,
  'elements.rating': <Star className="w-4 h-4 text-amber-500" />,
  'elements.acknowledgement': <FileCheck2 className="w-4 h-4 text-indigo-600" />,
  'elements.file': <FileUp className="w-4 h-4 text-purple-600" />,
  'elements.heading': <Heading className="w-4 h-4 text-slate-700" />,
  'elements.paragraph': <FileText className="w-4 h-4 text-slate-700" />,
  'elements.divider': <Minus className="w-4 h-4 text-slate-500" />,
  'elements.spacer': <MoveVertical className="w-4 h-4 text-slate-500" />,
  'elements.image': <Image className="w-4 h-4 text-blue-500" />,
  'elements.info_box': <Info className="w-4 h-4 text-amber-500" />,
  'elements.table': <Table className="w-4 h-4 text-emerald-600" />,
  'elements.repeating_group': <Repeat className="w-4 h-4 text-purple-600" />,
  'elements.signature': <FileSignature className="w-4 h-4 text-amber-600" />,
  'elements.kpi': <Shapes className="w-4 h-4 text-indigo-600" />,
};

const CATEGORIES = ['Basic Inputs', 'Choice Inputs', 'Financial', 'Layout', 'Advanced'];

export const AdminElementManagement: React.FC = () => {
  const { updateElement } = useSystemConfig();
  const [elements, setElements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchElements = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await configurationService.elements();
      setElements(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Failed to fetch admin elements:', err);
      setError(err.message || 'Unable to load element configuration.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchElements();
  }, []);

  const handleToggle = async (elementKey: string, currentEnabled: boolean) => {
    try {
      const newEnabled = !currentEnabled;
      await updateElement(elementKey, newEnabled);
      setElements((prev) =>
        prev.map((e) => ((e.element_key === elementKey || e.elementKey === elementKey) ? { ...e, enabled: newEnabled } : e))
      );
      const el = elements.find((e) => e.element_key === elementKey || e.elementKey === elementKey);
      const name = el?.element_name || el?.name || elementKey;
      setToastMessage(`${name} element ${newEnabled ? 'enabled' : 'disabled'} for creators`);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to update element setting');
    }
  };

  const filteredElements = elements.filter(
    (e) => selectedCategory === 'All' || e.category === selectedCategory
  );

  return (
    <div className="space-y-6 animate-fade-in p-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-slate-800 flex items-center gap-3 text-xs font-bold animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Shapes className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-black tracking-tight text-slate-900">Element Management</h2>
          </div>
          <p className="text-xs text-slate-500 font-medium pt-1">
            Control individual input fields, layout primitives, and business widgets available in Template Studio. Disabled elements are removed from the creator toolbox.
          </p>
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setSelectedCategory('All')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedCategory === 'All' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            All ({elements.length})
          </button>
          {CATEGORIES.map((cat) => {
            const count = elements.filter((e) => e.category === cat).length;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selectedCategory === cat ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <div className="p-8 text-center bg-rose-50 border border-rose-200 rounded-2xl space-y-3">
          <p className="text-sm font-bold text-rose-900">{error}</p>
          <button
            onClick={fetchElements}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl cursor-pointer transition-colors"
          >
            Retry Loading Elements
          </button>
        </div>
      ) : loading ? (
        <div className="p-12 text-center text-xs text-slate-400">Loading elements...</div>
      ) : elements.length === 0 ? (
        <div className="p-12 text-center text-xs text-slate-400 bg-white border border-slate-200 rounded-2xl">
          No element settings are configured.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredElements.map((el) => {
            const icon = ELEMENT_ICONS[el.element_key] || <Shapes className="w-4 h-4 text-slate-600" />;
            const isEnabled = Boolean(el.enabled);

            return (
              <div
                key={el.element_key}
                className={`p-4 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                  isEnabled ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-50/80 border-slate-200/80 opacity-75'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-slate-100 rounded-xl shrink-0">
                    {icon}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-xs font-extrabold text-slate-900">{el.element_name}</h3>
                      <AdminInfoTooltip
                        title={el.element_name}
                        description={el.description || `Controls element primitive ${el.element_name}.`}
                        whoItAffects="Operational template builders."
                        impact="Controls whether operational users can use this element when building templates. Admin can still manage disabled elements."
                      />
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                        {el.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium leading-snug">
                      {el.description}
                    </p>
                    <div className="text-[10px] font-mono text-slate-400 pt-0.5">
                      {el.element_key}
                    </div>
                  </div>
                </div>

                {/* Toggle Button */}
                <button
                  type="button"
                  onClick={() => handleToggle(el.element_key, isEnabled)}
                  className={`w-11 h-5 rounded-full transition-colors relative p-0.5 cursor-pointer shrink-0 ${
                    isEnabled ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                  title={isEnabled ? `Disable ${el.element_name}` : `Enable ${el.element_name}`}
                >
                  <span
                    className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform block ${
                      isEnabled ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
