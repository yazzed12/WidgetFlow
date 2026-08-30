import { Router } from 'express';
import { templateController } from '../controllers/templateController.js';

export const templateRouter = Router();

templateRouter.get('/', templateController.getTemplates);
templateRouter.post('/', templateController.createTemplateDraft);
templateRouter.put('/:id', templateController.createTemplateDraft);
templateRouter.get('/approvals', templateController.getPendingApprovals);
templateRouter.get('/:id', templateController.getTemplateById);
templateRouter.post('/:id/submit', templateController.submitTemplate);
templateRouter.post('/:id/claim', templateController.claimTemplate);
templateRouter.post('/:id/approve', templateController.approveTemplate);
templateRouter.post('/:id/reject', templateController.rejectTemplate);
templateRouter.get('/:id/comments', templateController.getComments);
templateRouter.post('/:id/comments', templateController.addComment);
templateRouter.post('/:id/version', templateController.createVersion);
