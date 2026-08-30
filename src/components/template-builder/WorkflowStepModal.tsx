import React, { useState } from 'react';
import type { WorkflowStep, WorkflowStepAction, WorkflowStepType, AssigneeStrategy } from '../../shared/workflow';
import type { TemplateComponent } from '../../types';
import { X, GitCommit, CheckCircle2, ShieldCheck } from 'lucide-react';

interface WorkflowStepModalProps {
  step: WorkflowStep | null;
  allSteps?: WorkflowStep[];
  components?: TemplateComponent[];
  onSave: (step: WorkflowStep) => void;
  onClose: () => void;
}

export const WorkflowStepModal: React.FC<WorkflowStepModalProps> = ({
  step,
  onSave,
  onClose,
}) => {
  const [name, setName] = useState(step?.name || 'New Review Step');
  const [type, setType] = useState<WorkflowStepType>(step?.type || 'review');

  const [strategy, setStrategy] = useState<AssigneeStrategy>(step?.assignee?.strategy || 'role');
  const [role, setRole] = useState<'Employee' | 'Manager' | 'Director'>(step?.assignee?.role || 'Manager');
  const [userId, setUserId] = useState(step?.assignee?.userId || 'user-manager');

  const initialActions: WorkflowStepAction[] = step?.actions || ['Approve', 'Return for Changes', 'Reject', 'Comment'];
  const [actions, setActions] = useState<WorkflowStepAction[]>(initialActions);
  const [requiresSignature, setRequiresSignature] = useState<boolean>(Boolean(step?.requiresSignature));

  const toggleAction = (act: WorkflowStepAction) => {
    if (actions.includes(act)) {
      setActions(actions.filter((a) => a !== act));
    } else {
      setActions([...actions, act]);
    }
  };

  const handleSave = () => {
    const updatedStep: WorkflowStep = {
      id: step?.id || `step-${Date.now()}`,
      name: name.trim() || 'Workflow Step',
      type,
      assignee: {
        strategy,
        role: strategy === 'role' ? role : undefined,
        userId: strategy === 'specific_user' ? userId : undefined,
        userName: strategy === 'specific_user' ? (userId === 'user-manager' ? 'Sarah Mohamed' : 'Omar Ali') : undefined,
      },
      actions,
      requiresSignature,
      transitions: step?.transitions || [],
    };
    onSave(updatedStep);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <GitCommit className="w-5 h-5 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900">{step ? 'Edit Workflow Step' : 'Add Workflow Step'}</h2>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Step Name & Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Step Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Manager Review"
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Step Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as WorkflowStepType)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-indigo-700"
              >
                <option value="review">Review Step</option>
                <option value="approval">Approval Step</option>
                <option value="acknowledgement">Acknowledgement Step</option>
              </select>
            </div>
          </div>

          {/* Assignee Strategy */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider">Assignee Strategy</label>

            <div className="space-y-2">
              <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="strategy"
                  checked={strategy === 'role'}
                  onChange={() => setStrategy('role')}
                  className="accent-indigo-600"
                />
                <span>By Organizational Role</span>
              </label>
              {strategy === 'role' && (
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full ml-6 p-2 bg-white border border-slate-200 rounded-lg font-bold text-slate-800"
                >
                  <option value="Manager">Manager</option>
                  <option value="Director">Director</option>
                  <option value="Employee">Employee</option>
                </select>
              )}

              <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="strategy"
                  checked={strategy === 'selected_by_sender'}
                  onChange={() => setStrategy('selected_by_sender')}
                  className="accent-indigo-600"
                />
                <span>Selected by Sender during Submit</span>
              </label>

              <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="strategy"
                  checked={strategy === 'specific_user'}
                  onChange={() => setStrategy('specific_user')}
                  className="accent-indigo-600"
                />
                <span>Specific Designated Person</span>
              </label>
              {strategy === 'specific_user' && (
                <select
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className="w-full ml-6 p-2 bg-white border border-slate-200 rounded-lg font-bold text-slate-800"
                >
                  <option value="user-manager">Sarah Mohamed (Manager)</option>
                  <option value="user-director">Omar Ali (Director)</option>
                  <option value="user-employee">Ahmed Hassan (Employee)</option>
                </select>
              )}
            </div>
          </div>

          {/* Allowed Actions */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider">Allowed Actions on this Step</label>

            <div className="grid grid-cols-2 gap-2 font-bold text-slate-800">
              {(['Approve', 'Return for Changes', 'Reject', 'Comment', 'Acknowledge', 'Sign'] as WorkflowStepAction[]).map((act) => (
                <label key={act} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={actions.includes(act)}
                    onChange={() => toggleAction(act)}
                    className="accent-indigo-600 rounded-md"
                  />
                  <span>{act}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Verified Signature Requirement */}
          <div className="p-4 bg-indigo-50/50 border border-indigo-200 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0" />
              <div>
                <div className="font-bold text-slate-900">Require Verified Workflow Signature</div>
                <div className="text-[10px] text-slate-500">Signer must generate verified signature ID to complete step</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={requiresSignature}
              onChange={(e) => setRequiresSignature(e.target.checked)}
              className="w-5 h-5 accent-indigo-600 cursor-pointer"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-end gap-2 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" /> Save Step
          </button>
        </div>
      </div>
    </div>
  );
};
