import React, { useState } from 'react';
import type { WorkflowDefinition } from '../../shared/workflow';
import { simulateWorkflowPath } from '../../shared/workflow';
import type { TemplateComponent } from '../../types';
import { X, Play, GitMerge, CheckCircle2, ArrowRight } from 'lucide-react';

interface WorkflowSimulatorModalProps {
  workflow: WorkflowDefinition;
  components: TemplateComponent[];
  onClose: () => void;
}

export const WorkflowSimulatorModal: React.FC<WorkflowSimulatorModalProps> = ({
  workflow,
  components,
  onClose,
}) => {
  const numericOrSelectComps = components.filter(
    (c) => c.type !== 'heading' && c.type !== 'paragraph' && c.type !== 'divider' && c.type !== 'spacer'
  );

  const initialValues: Record<string, any> = {};
  numericOrSelectComps.forEach((c) => {
    const k = c.key || c.id;
    if (c.type === 'number' || c.type === 'currency') initialValues[k] = 25000;
    else if (c.type === 'select' && c.options?.[0]) initialValues[k] = typeof c.options[0] === 'string' ? c.options[0] : c.options[0].value;
    else initialValues[k] = 'Sample Value';
  });

  const [testValues, setTestValues] = useState<Record<string, any>>(initialValues);

  const simulatedPath = simulateWorkflowPath(workflow, testValues);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900">Test Workflow Simulation</h2>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Sample Input Values Form */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Play className="w-3.5 h-3.5 text-indigo-600" /> Enter Sample Form Payload
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {numericOrSelectComps.slice(0, 6).map((comp) => {
                const k = comp.key || comp.id;
                return (
                  <div key={comp.id} className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-700">{comp.label} ({k})</label>
                    {comp.type === 'select' ? (
                      <select
                        value={String(testValues[k] ?? '')}
                        onChange={(e) => setTestValues({ ...testValues, [k]: e.target.value })}
                        className="w-full p-2 text-xs bg-white border border-slate-200 rounded-lg font-bold text-slate-800"
                      >
                        {(comp.options || []).map((opt: any) => {
                          const val = typeof opt === 'string' ? opt : opt.value;
                          return (
                            <option key={val} value={val}>
                              {val}
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <input
                        type={comp.type === 'number' || comp.type === 'currency' ? 'number' : 'text'}
                        value={String(testValues[k] ?? '')}
                        onChange={(e) =>
                          setTestValues({
                            ...testValues,
                            [k]: comp.type === 'number' || comp.type === 'currency' ? Number(e.target.value) : e.target.value,
                          })
                        }
                        className="w-full p-2 text-xs bg-white border border-slate-200 rounded-lg font-bold text-slate-800"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Simulated Routing Path */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Simulated Routing Sequence ({simulatedPath.length} Steps)
            </h3>

            <div className="space-y-2">
              {simulatedPath.map((step, idx) => (
                <div key={step.stepId} className="flex items-center gap-3">
                  <div
                    className={`p-3 rounded-2xl border flex-1 flex items-center justify-between ${
                      step.type === 'start'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : step.type === 'end'
                        ? 'bg-emerald-950 text-emerald-100 border-emerald-900'
                        : 'bg-white text-slate-900 border-slate-200 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 font-extrabold text-[11px] flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="font-bold text-xs">{step.stepName}</div>
                        <div className="text-[10px] opacity-75">{step.assigneeLabel}</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-white/10 font-bold">
                      {step.type}
                    </span>
                  </div>

                  {idx < simulatedPath.length - 1 && (
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-end bg-slate-50">
          <button onClick={onClose} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
