import type { RuleConditionGroup } from '../template-rules/index.js';
import { evaluateConditionGroup } from '../template-rules/index.js';

export type WorkflowStepType = 'start' | 'review' | 'approval' | 'acknowledgement' | 'end';

export type AssigneeStrategy = 'specific_user' | 'role' | 'selected_by_sender' | 'creators_manager';

export type WorkflowStepAction = 'Approve' | 'Return for Changes' | 'Reject' | 'Comment' | 'Acknowledge' | 'Sign';

export interface WorkflowAssignee {
  strategy: AssigneeStrategy;
  userId?: string;
  userName?: string;
  role?: 'Employee' | 'Manager' | 'Director';
}

export interface WorkflowTransition {
  id: string;
  targetStepId: string;
  label?: string;
  conditionGroup?: RuleConditionGroup;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: WorkflowStepType;
  assignee: WorkflowAssignee;
  actions: WorkflowStepAction[];
  transitions: WorkflowTransition[];
  requiresSignature?: boolean;
  order?: number;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  templateId?: string;
  version: string;
  status: 'Draft' | 'Active' | 'Archived';
  steps: WorkflowStep[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowInstance {
  id: string;
  reportId: string;
  workflowVersionId: string;
  currentStepId: string;
  status: 'In Progress' | 'Returned' | 'Rejected' | 'Completed';
  startedAt: string;
  completedAt?: string;
}

export interface WorkflowTask {
  id: string;
  workflowInstanceId: string;
  stepId: string;
  stepName: string;
  assignedUserId?: string;
  assignedUserName?: string;
  assignedRole?: 'Employee' | 'Manager' | 'Director';
  status: 'Pending' | 'Completed' | 'Returned' | 'Rejected' | 'Cancelled';
  createdAt: string;
  completedAt?: string;
}

export interface WorkflowHistoryEntry {
  id: string;
  workflowInstanceId: string;
  stepId: string;
  stepName: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: WorkflowStepAction | 'Started' | 'Resubmitted';
  comment?: string;
  signatureVerificationId?: string;
  timestamp: string;
}

// 1. Resolve Next Step via Conditional Transitions
export function resolveNextWorkflowStep(
  currentStep: WorkflowStep,
  reportValues: Record<string, any>,
  allSteps: WorkflowStep[]
): WorkflowStep | null {
  if (!currentStep || currentStep.type === 'end' || !currentStep.transitions || currentStep.transitions.length === 0) {
    const endStep = allSteps.find((s) => s.type === 'end');
    return endStep || null;
  }

  // Iterate over transitions in order
  for (const trans of currentStep.transitions) {
    if (!trans.conditionGroup || trans.conditionGroup.conditions.length === 0) {
      const target = allSteps.find((s) => s.id === trans.targetStepId);
      if (target) return target;
    } else {
      const isMet = evaluateConditionGroup(trans.conditionGroup, reportValues);
      if (isMet) {
        const target = allSteps.find((s) => s.id === trans.targetStepId);
        if (target) return target;
      }
    }
  }

  // Fallback to next step in order or end step
  const nextOrderStep = allSteps.find((s) => (s.order || 0) === (currentStep.order || 0) + 1);
  return nextOrderStep || allSteps.find((s) => s.type === 'end') || null;
}

// 2. Simulate Full Workflow Path
export function simulateWorkflowPath(
  workflow: WorkflowDefinition,
  reportValues: Record<string, any>
): Array<{ stepId: string; stepName: string; assigneeLabel: string; type: WorkflowStepType }> {
  const path: Array<{ stepId: string; stepName: string; assigneeLabel: string; type: WorkflowStepType }> = [];
  const steps = workflow.steps || [];

  let current: WorkflowStep | undefined = steps.find((s) => s.type === 'start') || steps[0];
  const visited = new Set<string>();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);

    let assigneeLabel = 'System';
    if (current.assignee) {
      if (current.assignee.strategy === 'specific_user') {
        assigneeLabel = current.assignee.userName || current.assignee.userId || 'Specific User';
      } else if (current.assignee.strategy === 'role') {
        assigneeLabel = `Role: ${current.assignee.role || 'Any'}`;
      } else if (current.assignee.strategy === 'selected_by_sender') {
        assigneeLabel = 'Selected by Sender';
      } else if (current.assignee.strategy === 'creators_manager') {
        assigneeLabel = "Creator's Manager";
      }
    }

    path.push({
      stepId: current.id,
      stepName: current.name,
      assigneeLabel,
      type: current.type,
    });

    if (current.type === 'end') break;

    const next = resolveNextWorkflowStep(current, reportValues, steps);
    if (!next || next.id === current.id) break;
    current = next;
  }

  return path;
}
