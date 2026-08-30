import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/index.js';
import { dbRepository } from '../repositories/dbRepository.js';
import { workflowService } from '../services/workflowService.js';
import { authorizationService } from '../services/authorizationService.js';
import { AppError } from '../middleware/errorHandler.js';

function getId(req: AuthenticatedRequest): string {
  return Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
}

export const reportController = {
  getReports(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      authorizationService.requireAnyPermission(req.user!, ['reports.view_own', 'reports.view_received', 'reports.view_organization']);
      const { mine, received, status } = req.query as { mine?: string; received?: string; status?: string };
      const reports = dbRepository.getReports(
        {
          mine: mine === 'true',
          received: received === 'true',
          status,
        },
        req.user!.id
      );
      res.json({ success: true, data: reports });
    } catch (err) {
      next(err);
    }
  },

  getReportById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const report = dbRepository.getReportById(getId(req));
      if (!report) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Report not found' } });
      const canAccess =
        (report.createdById === req.user!.id && authorizationService.hasPermission(req.user!, 'reports.view_own')) ||
        (report.sentToId === req.user!.id && authorizationService.hasPermission(req.user!, 'reports.view_received')) ||
        authorizationService.hasPermission(req.user!, 'reports.view_organization');
      if (!canAccess) throw new AppError('You do not have access to this report.', 403, 'FORBIDDEN');
      res.json({ success: true, data: report });
    } catch (err) {
      next(err);
    }
  },

  createReport(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { templateId, data, title } = req.body;
      const report = workflowService.createReportInstance(req.user!, templateId, data, title);
      res.json({ success: true, data: report });
    } catch (err) {
      next(err);
    }
  },

  updateReport(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const report = workflowService.updateReportInstance(req.user!, getId(req), req.body);
      res.json({ success: true, data: report });
    } catch (err) {
      next(err);
    }
  },

  completeReport(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const report = workflowService.updateReportInstance(req.user!, getId(req), { ...req.body, markAsCompleted: true });
      res.json({ success: true, data: report });
    } catch (err) {
      next(err);
    }
  },

  sendReport(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { recipientUserId, senderNote, signaturePayload } = req.body;
      const report = workflowService.sendReport(req.user!, getId(req), recipientUserId, senderNote, signaturePayload);
      res.json({ success: true, data: report });
    } catch (err) {
      next(err);
    }
  },

  returnReport(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { reason } = req.body;
      const report = workflowService.returnReport(req.user!, getId(req), reason);
      res.json({ success: true, data: report });
    } catch (err) {
      next(err);
    }
  },

  rejectReport(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { reason } = req.body;
      const report = workflowService.rejectReport(req.user!, getId(req), reason);
      res.json({ success: true, data: report });
    } catch (err) {
      next(err);
    }
  },

  signReport(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const report = workflowService.signReport(req.user!, getId(req), req.body);
      res.json({ success: true, data: report });
    } catch (err) {
      next(err);
    }
  },

  getComments(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      authorizationService.requirePermission(req.user!, 'reports.comment');
      const comments = dbRepository.getReportComments(getId(req));
      res.json({ success: true, data: comments });
    } catch (err) {
      next(err);
    }
  },

  addComment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const comments = workflowService.addReportComment(req.user!, getId(req), req.body.message);
      res.json({ success: true, data: comments });
    } catch (err) {
      next(err);
    }
  },
};
