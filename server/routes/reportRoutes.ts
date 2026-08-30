import { Router } from 'express';
import { reportController } from '../controllers/reportController.js';

export const reportRouter = Router();

reportRouter.get('/', reportController.getReports);
reportRouter.post('/', reportController.createReport);
reportRouter.get('/:id', reportController.getReportById);
reportRouter.put('/:id', reportController.updateReport);
reportRouter.post('/:id/complete', reportController.completeReport);
reportRouter.post('/:id/send', reportController.sendReport);
reportRouter.post('/:id/return', reportController.returnReport);
reportRouter.post('/:id/reject', reportController.rejectReport);
reportRouter.post('/:id/sign', reportController.signReport);
reportRouter.get('/:id/comments', reportController.getComments);
reportRouter.post('/:id/comments', reportController.addComment);
