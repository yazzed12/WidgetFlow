import { Router } from 'express';
import { dynamicWorkflowService } from '../services/dynamicWorkflowService.js';
import { dbRepository } from '../repositories/dbRepository.js';
import type { AuthenticatedRequest } from '../types/index.js';
import { authorizationService } from '../services/authorizationService.js';

export const workflowRoutes = Router();

// 1. List Workflows
workflowRoutes.get('/workflows', (req, res, next) => {
  try {
    authorizationService.requirePermission((req as AuthenticatedRequest).user!, 'studio.workflow.use');
    const list = dbRepository.getWorkflows();
    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
});

// 2. Save Workflow Definition Draft
workflowRoutes.post('/workflows', (req: AuthenticatedRequest, res, next) => {
  try {
    const user = req.user!;
    const saved = dynamicWorkflowService.saveWorkflowDefinition(user, req.body);
    res.json({ success: true, data: saved });
  } catch (err) {
    next(err);
  }
});

// 3. Publish Workflow Definition Snapshot
workflowRoutes.post('/workflows/:id/publish', (req: AuthenticatedRequest, res, next) => {
  try {
    const user = req.user!;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const published = dynamicWorkflowService.publishWorkflow(user, id);
    res.json({ success: true, data: published });
  } catch (err) {
    next(err);
  }
});

// 4. Get Active Workflow for Template
workflowRoutes.get('/workflows/template/:templateId', (req, res, next) => {
  try {
    authorizationService.requirePermission((req as AuthenticatedRequest).user!, 'studio.workflow.use');
    const wf = dynamicWorkflowService.getActiveWorkflowForTemplate(req.params.templateId);
    res.json({ success: true, data: wf });
  } catch (err) {
    next(err);
  }
});

// 5. Get Workflow Execution Progress & History for Report
workflowRoutes.get('/workflows/reports/:reportId', (req, res, next) => {
  try {
    authorizationService.requireAnyPermission((req as AuthenticatedRequest).user!, ['reports.view_own', 'reports.view_received', 'reports.view_organization']);
    const details = dynamicWorkflowService.getWorkflowExecutionDetails(req.params.reportId);
    res.json({ success: true, data: details });
  } catch (err) {
    next(err);
  }
});

// 6. Get Pending Workflow Tasks for Logged-In User
workflowRoutes.get('/workflows/tasks/my', (req: AuthenticatedRequest, res, next) => {
  try {
    authorizationService.requireAnyPermission(req.user!, ['reports.view_received', 'reports.comment']);
    const user = req.user!;
    const tasks = dynamicWorkflowService.getPendingTasksForUser(user);
    res.json({ success: true, data: tasks });
  } catch (err) {
    next(err);
  }
});
