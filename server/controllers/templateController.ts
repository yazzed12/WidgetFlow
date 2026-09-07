import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/index.js';
import { dbRepository } from '../repositories/dbRepository.js';
import { workflowService } from '../services/workflowService.js';
import { authorizationService } from '../services/authorizationService.js';
import { resourceAccessService } from '../services/resourceAccessService.js';
import { AppError } from '../middleware/errorHandler.js';

export const templateController = {
  getTemplates(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      authorizationService.requireAnyPermission(req.user!, ['templates.view_approved', 'templates.create']);
      const { status, categoryId, search } = req.query as { status?: string; categoryId?: string; search?: string };
      const templates = dbRepository.getTemplates({ status, categoryId, search })
        .filter((template) => resourceAccessService.canAccessTemplate(req.user!, template));
      res.json({ success: true, data: templates });
    } catch (err) {
      next(err);
    }
  },

  getTemplateById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      authorizationService.requireAnyPermission(req.user!, ['templates.view_approved', 'templates.create']);
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const template = dbRepository.getTemplateById(id);
      if (!template) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Template not found' } });
      if (!resourceAccessService.canAccessTemplate(req.user!, template)) {
        throw new AppError('You do not have access to this template.', 403, 'FORBIDDEN');
      }
      res.json({ success: true, data: template });
    } catch (err) {
      next(err);
    }
  },

  createTemplateDraft(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tpl = workflowService.saveTemplateDraft(req.user!, req.body);
      res.json({ success: true, data: tpl });
    } catch (err) {
      next(err);
    }
  },

  submitTemplate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const tpl = workflowService.submitTemplateForApproval(req.user!, req.body, id);
      res.json({ success: true, data: tpl });
    } catch (err) {
      next(err);
    }
  },

  getPendingApprovals(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      authorizationService.requirePermission(req.user!, 'template_approvals.view');
      const pending = dbRepository.getPendingApprovalsForUser(req.user!.id);
      res.json({ success: true, data: pending });
    } catch (err) {
      next(err);
    }
  },

  claimTemplate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const tpl = workflowService.claimTemplateReview(req.user!, id);
      res.json({ success: true, data: tpl });
    } catch (err) {
      next(err);
    }
  },

  approveTemplate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const tpl = workflowService.approveTemplate(req.user!, id);
      res.json({ success: true, data: tpl });
    } catch (err) {
      next(err);
    }
  },

  rejectTemplate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const tpl = workflowService.rejectTemplate(req.user!, id, req.body.reason);
      res.json({ success: true, data: tpl });
    } catch (err) {
      next(err);
    }
  },

  getComments(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      authorizationService.requirePermission(req.user!, 'template_approvals.comment');
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const template = dbRepository.getTemplateById(id);
      if (!template) throw new AppError('Template not found.', 404, 'NOT_FOUND');
      if (!resourceAccessService.canAccessTemplate(req.user!, template)) {
        throw new AppError('You do not have access to this template.', 403, 'FORBIDDEN');
      }
      const comments = dbRepository.getTemplateComments(id);
      res.json({ success: true, data: comments });
    } catch (err) {
      next(err);
    }
  },

  addComment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const comments = workflowService.addTemplateComment(req.user!, id, req.body.message);
      res.json({ success: true, data: comments });
    } catch (err) {
      next(err);
    }
  },

  createVersion(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const newDraft = workflowService.createNewTemplateVersion(req.user!, id);
      res.json({ success: true, data: newDraft });
    } catch (err) {
      next(err);
    }
  },
};
