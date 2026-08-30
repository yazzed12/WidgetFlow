import { db } from '../db/database.js';
import { dbRepository } from '../repositories/dbRepository.js';
import { AppError } from '../middleware/errorHandler.js';
import { resolveNextWorkflowStep } from '../../src/shared/workflow/index.js';
import type { WorkflowDefinition, WorkflowStep, WorkflowStepAction } from '../../src/shared/workflow/index.js';
import type { ServerUser } from '../types/index.js';
import { authorizationService } from './authorizationService.js';

export const dynamicWorkflowService = {
  // 1. Save or Update Workflow Definition Draft
  saveWorkflowDefinition(user: ServerUser, payload: any): WorkflowDefinition | null {
    user = authorizationService.requirePermission(user, 'studio.workflow.use');
    const { id, name, description, templateId, steps, version } = payload;
    const wfId = id || `wf-${Date.now()}`;
    const now = new Date().toISOString();
    const wfVersion = version || 'v1.0';
    const status = payload.status || 'Draft';

    const defJson = JSON.stringify({
      id: wfId,
      name: name || 'Untitled Workflow',
      description: description || '',
      templateId,
      version: wfVersion,
      status,
      steps: steps || [],
    });

    const existing = db.prepare(`SELECT id FROM workflow_definitions WHERE id = ?`).get(wfId);

    if (existing) {
      db.prepare(`
        UPDATE workflow_definitions
        SET name = ?, description = ?, template_id = ?, version = ?, status = ?, definition_json = ?, updated_at = ?
        WHERE id = ?
      `).run(name, description || '', templateId || null, wfVersion, status, defJson, now, wfId);
    } else {
      db.prepare(`
        INSERT INTO workflow_definitions (id, name, description, template_id, version, status, definition_json, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(wfId, name, description || '', templateId || null, wfVersion, status, defJson, user.id, now, now);
    }

    return this.getWorkflowById(wfId);
  },

  // 2. Publish Workflow Snapshot Version
  publishWorkflow(user: ServerUser, workflowId: string): WorkflowDefinition | null {
    user = authorizationService.requirePermission(user, 'studio.workflow.use');
    const wf = this.getWorkflowById(workflowId);
    if (!wf) throw new AppError('Workflow definition not found.', 404, 'NOT_FOUND');

    const now = new Date().toISOString();
    const versionId = `wfv-${wf.id}-${wf.version}`;
    const snapshotJson = JSON.stringify(wf);

    db.transaction(() => {
      db.prepare(`
        INSERT OR REPLACE INTO workflow_versions (id, workflow_id, version, snapshot_json, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(versionId, wf.id, wf.version, snapshotJson, user.id, now);

      db.prepare(`UPDATE workflow_definitions SET status = 'Active', updated_at = ? WHERE id = ?`).run(now, wf.id);
    })();

    return this.getWorkflowById(workflowId);
  },

  // 3. Get Workflow Definition by ID
  getWorkflowById(id: string): WorkflowDefinition | null {
    const row = db.prepare(`SELECT * FROM workflow_definitions WHERE id = ?`).get(id) as any;
    if (!row) return null;
    const parsed = JSON.parse(row.definition_json);
    return {
      ...parsed,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  // 4. Get Active Workflow Definition by Template ID
  getActiveWorkflowForTemplate(templateId: string): WorkflowDefinition | null {
    const row = db.prepare(`SELECT * FROM workflow_definitions WHERE template_id = ? AND status = 'Active' ORDER BY updated_at DESC LIMIT 1`).get(templateId) as any;
    if (!row) return null;
    return JSON.parse(row.definition_json);
  },

  // 5. Start Workflow Instance on Report Submission
  startWorkflowInstance(user: ServerUser, reportId: string, templateId: string, recipientUserId?: string) {
    const report = dbRepository.getReportById(reportId);
    if (!report) throw new AppError('Report not found.', 404, 'NOT_FOUND');

    const activeWf = this.getActiveWorkflowForTemplate(templateId);
    if (!activeWf) {
      // Fallback: No custom dynamic workflow attached to template
      return null;
    }

    const now = new Date().toISOString();
    const versionId = `wfv-${activeWf.id}-${activeWf.version}`;

    // Ensure snapshot exists
    const versionRow = db.prepare(`SELECT id FROM workflow_versions WHERE id = ?`).get(versionId);
    if (!versionRow) {
      db.prepare(`
        INSERT OR IGNORE INTO workflow_versions (id, workflow_id, version, snapshot_json, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(versionId, activeWf.id, activeWf.version, JSON.stringify(activeWf), user.id, now);
    }

    const instanceId = `wfi-${Date.now()}`;
    const startStep = activeWf.steps.find((s) => s.type === 'start') || activeWf.steps[0];
    const firstStep = resolveNextWorkflowStep(startStep, report.data || {}, activeWf.steps);

    if (!firstStep || firstStep.type === 'end') {
      // Instant completion if no steps
      db.prepare(`
        INSERT INTO workflow_instances (id, report_id, workflow_version_id, current_step_id, status, started_at, completed_at)
        VALUES (?, ?, ?, 'end', 'Completed', ?, ?)
      `).run(instanceId, reportId, versionId, now, now);

      db.prepare(`UPDATE reports SET status = 'Completed', updated_at = ? WHERE id = ?`).run(now, reportId);
      return instanceId;
    }

    // Create Instance & Initial Task
    const taskId = `task-${Date.now()}`;
    let assignedUserId: string | undefined = undefined;
    let assignedRole: 'Employee' | 'Manager' | 'Director' | undefined = undefined;

    if (firstStep.assignee.strategy === 'specific_user') {
      assignedUserId = firstStep.assignee.userId;
    } else if (firstStep.assignee.strategy === 'role') {
      assignedRole = firstStep.assignee.role;
    } else if (firstStep.assignee.strategy === 'selected_by_sender') {
      assignedUserId = recipientUserId;
    } else if (firstStep.assignee.strategy === 'creators_manager') {
      const creatorUser = db.prepare(`SELECT manager_user_id FROM users WHERE id = ?`).get(user.id) as any;
      const activeManager = creatorUser?.manager_user_id
        ? db.prepare(`SELECT id FROM users WHERE id = ? AND COALESCE(status, 'Active') = 'Active'`).get(creatorUser.manager_user_id) as any
        : db.prepare(`SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.key = 'manager' AND r.role_type = 'System' AND r.is_active = 1 AND COALESCE(u.status, 'Active') = 'Active' LIMIT 1`).get() as any;
      assignedUserId = activeManager?.id;
      if (!assignedUserId) throw new Error('No active manager is available for this workflow assignment.');
    }

    if (assignedUserId) {
      const assignee = db.prepare(`SELECT id FROM users WHERE id = ? AND COALESCE(status, 'Active') = 'Active'`).get(assignedUserId) as any;
      if (!assignee) throw new Error('Selected workflow assignee is not active.');
    }

    db.transaction(() => {
      db.prepare(`
        INSERT INTO workflow_instances (id, report_id, workflow_version_id, current_step_id, status, started_at)
        VALUES (?, ?, ?, ?, 'In Progress', ?)
      `).run(instanceId, reportId, versionId, firstStep.id, now);

      db.prepare(`
        INSERT INTO workflow_tasks (id, workflow_instance_id, step_id, step_name, assigned_user_id, assigned_role, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?)
      `).run(taskId, instanceId, firstStep.id, firstStep.name, assignedUserId || null, assignedRole || null, now);

      db.prepare(`
        INSERT INTO workflow_history (id, workflow_instance_id, step_id, step_name, actor_id, actor_name, actor_role, action, comment, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Started', 'Workflow instance started.', ?)
      `).run(`wfh-${Date.now()}`, instanceId, firstStep.id, firstStep.name, user.id, user.name, user.role, now);

      // Update Report status
      db.prepare(`
        UPDATE reports
        SET status = 'Sent', sent_to_user_id = ?, sent_to_name = ?, sent_at = ?, updated_at = ?
        WHERE id = ?
      `).run(assignedUserId || null, assignedUserId ? 'Reviewer' : null, now, now, reportId);
    })();

    return instanceId;
  },

  // 6. Execute Workflow Action by Reviewer
  executeWorkflowTaskAction(
    user: ServerUser,
    reportId: string,
    action: WorkflowStepAction,
    comment?: string,
    signatureVerificationId?: string,
    recipientUserId?: string
  ) {
    const now = new Date().toISOString();
    const report = dbRepository.getReportById(reportId);
    if (!report) throw new AppError('Report not found.', 404, 'NOT_FOUND');

    const actionPermission = action === 'Reject'
      ? 'reports.reject'
      : action === 'Return for Changes'
        ? 'reports.return'
        : action === 'Sign'
          ? 'reports.sign'
          : 'reports.comment';
    user = authorizationService.requirePermission(user, actionPermission);

    const wfInstance = db.prepare(`SELECT * FROM workflow_instances WHERE report_id = ? AND status IN ('In Progress', 'Returned')`).get(reportId) as any;
    if (!wfInstance) {
      throw new AppError('No active workflow instance found for this report.', 404, 'NOT_FOUND');
    }

    const versionRow = db.prepare(`SELECT snapshot_json FROM workflow_versions WHERE id = ?`).get(wfInstance.workflow_version_id) as any;
    if (!versionRow) throw new AppError('Workflow version snapshot not found.', 404, 'NOT_FOUND');
    const wfSnapshot: WorkflowDefinition = JSON.parse(versionRow.snapshot_json);

    const pendingTask = db.prepare(`
      SELECT * FROM workflow_tasks
      WHERE workflow_instance_id = ? AND status = 'Pending'
      ORDER BY created_at DESC LIMIT 1
    `).get(wfInstance.id) as any;

    if (!pendingTask) throw new AppError('No pending workflow task available.', 400, 'NO_PENDING_TASK');

    // Permission Enforcement
    const isAssignedUser = pendingTask.assigned_user_id && pendingTask.assigned_user_id === user.id;
    const isAssignedRole = pendingTask.assigned_role && pendingTask.assigned_role === user.role;
    if (!isAssignedUser && !isAssignedRole) {
      throw new AppError('You are not authorized to perform actions on this workflow step task.', 403, 'FORBIDDEN');
    }

    const currentStep = wfSnapshot.steps.find((s) => s.id === pendingTask.step_id);
    if (!currentStep) throw new AppError('Workflow step configuration error.', 500, 'INTERNAL_ERROR');

    // Validate Signature Requirement
    if (currentStep.requiresSignature || action === 'Sign') {
      if (!signatureVerificationId) {
        throw new AppError('Verified Workflow Signature is required to complete this step.', 400, 'SIGNATURE_REQUIRED');
      }
    }

    const transaction = db.transaction(() => {
      // 1. Record History
      db.prepare(`
        INSERT INTO workflow_history (id, workflow_instance_id, step_id, step_name, actor_id, actor_name, actor_role, action, comment, signature_verification_id, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(`wfh-${Date.now()}`, wfInstance.id, currentStep.id, currentStep.name, user.id, user.name, user.role, action, comment || null, signatureVerificationId || null, now);

      if (action === 'Return for Changes') {
        // Mark task returned
        db.prepare(`UPDATE workflow_tasks SET status = 'Returned', completed_at = ? WHERE id = ?`).run(now, pendingTask.id);
        db.prepare(`UPDATE workflow_instances SET status = 'Returned' WHERE id = ?`).run(wfInstance.id);
        db.prepare(`
          UPDATE reports
          SET status = 'Returned', return_reason = ?, returned_at = ?, updated_at = ?
          WHERE id = ?
        `).run(comment || 'Returned for updates', now, now, reportId);
        return;
      }

      if (action === 'Reject') {
        // Mark task rejected & cancel instance
        db.prepare(`UPDATE workflow_tasks SET status = 'Rejected', completed_at = ? WHERE id = ?`).run(now, pendingTask.id);
        db.prepare(`UPDATE workflow_instances SET status = 'Rejected', completed_at = ? WHERE id = ?`).run(wfInstance.id);
        db.prepare(`
          UPDATE reports
          SET status = 'Rejected', rejection_reason = ?, rejected_at = ?, updated_at = ?
          WHERE id = ?
        `).run(comment || 'Rejected during review', now, now, reportId);
        return;
      }

      // Action is Approve / Acknowledge / Sign -> Advance to next step
      db.prepare(`UPDATE workflow_tasks SET status = 'Completed', completed_at = ? WHERE id = ?`).run(now, pendingTask.id);

      const nextStep = resolveNextWorkflowStep(currentStep, report.data || {}, wfSnapshot.steps);

      if (!nextStep || nextStep.type === 'end') {
        // Workflow End Reached!
        const finalReportStatus = action === 'Sign' || currentStep.requiresSignature ? 'Signed' : 'Completed';
        db.prepare(`UPDATE workflow_instances SET status = 'Completed', current_step_id = 'end', completed_at = ? WHERE id = ?`).run(now, wfInstance.id);
        db.prepare(`UPDATE reports SET status = ?, updated_at = ? WHERE id = ?`).run(finalReportStatus, now, reportId);
      } else {
        // Create next step task
        const nextTaskId = `task-${Date.now()}`;
        let nextAssignedUserId: string | undefined = undefined;
        let nextAssignedRole: 'Employee' | 'Manager' | 'Director' | undefined = undefined;

        if (nextStep.assignee.strategy === 'specific_user') {
          nextAssignedUserId = nextStep.assignee.userId;
        } else if (nextStep.assignee.strategy === 'role') {
          nextAssignedRole = nextStep.assignee.role;
        } else if (nextStep.assignee.strategy === 'selected_by_sender') {
          nextAssignedUserId = recipientUserId;
        } else if (nextStep.assignee.strategy === 'creators_manager') {
          const manager = db.prepare(`SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.key = 'manager' AND r.role_type = 'System' AND r.is_active = 1 AND COALESCE(u.status, 'Active') = 'Active' LIMIT 1`).get() as any;
          nextAssignedUserId = manager?.id;
          if (!nextAssignedUserId) throw new Error('No active manager is available for this workflow assignment.');
        }

        if (nextAssignedUserId) {
          const assignee = db.prepare(`SELECT id FROM users WHERE id = ? AND COALESCE(status, 'Active') = 'Active'`).get(nextAssignedUserId) as any;
          if (!assignee) throw new Error('Selected workflow assignee is not active.');
        }

        db.prepare(`UPDATE workflow_instances SET current_step_id = ? WHERE id = ?`).run(nextStep.id, wfInstance.id);

        db.prepare(`
          INSERT INTO workflow_tasks (id, workflow_instance_id, step_id, step_name, assigned_user_id, assigned_role, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?)
        `).run(nextTaskId, wfInstance.id, nextStep.id, nextStep.name, nextAssignedUserId || null, nextAssignedRole || null, now);

        db.prepare(`UPDATE reports SET sent_to_user_id = ?, updated_at = ? WHERE id = ?`).run(nextAssignedUserId || null, now, reportId);
      }
    })();

    return dbRepository.getReportById(reportId);
  },

  // 7. Get Pending Workflow Tasks for User
  getPendingTasksForUser(user: ServerUser) {
    const tasks = db.prepare(`
      SELECT t.*, i.report_id as reportId, r.title as reportTitle, r.template_name as templateName
      FROM workflow_tasks t
      JOIN workflow_instances i ON t.workflow_instance_id = i.id
      JOIN reports r ON i.report_id = r.id
      WHERE t.status = 'Pending' AND (t.assigned_user_id = ? OR t.assigned_role = ?)
      ORDER BY t.created_at DESC
    `).all(user.id, user.role);

    return tasks;
  },

  // 8. Get Workflow Instance & Execution History for Report
  getWorkflowExecutionDetails(reportId: string) {
    const instance = db.prepare(`SELECT * FROM workflow_instances WHERE report_id = ? ORDER BY started_at DESC LIMIT 1`).get(reportId) as any;
    if (!instance) return null;

    const versionRow = db.prepare(`SELECT snapshot_json FROM workflow_versions WHERE id = ?`).get(instance.workflow_version_id) as any;
    const snapshot: WorkflowDefinition | null = versionRow ? JSON.parse(versionRow.snapshot_json) : null;

    const tasks = db.prepare(`SELECT * FROM workflow_tasks WHERE workflow_instance_id = ? ORDER BY created_at ASC`).all(instance.id) as any[];
    const history = db.prepare(`SELECT * FROM workflow_history WHERE workflow_instance_id = ? ORDER BY timestamp ASC`).all(instance.id) as any[];

    return {
      instance,
      snapshot,
      tasks,
      history,
    };
  },
};
