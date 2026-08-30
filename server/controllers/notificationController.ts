import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/index.js';
import { dbRepository } from '../repositories/dbRepository.js';
import { db } from '../db/database.js';
import { seedDatabase } from '../db/seed.js';
import { authorizationService } from '../services/authorizationService.js';

export const notificationController = {
  getNotifications(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      authorizationService.requirePermission(req.user!, 'notifications.view');
      const notifs = dbRepository.getNotificationsForUser(req.user!.id);
      res.json({ success: true, data: notifs });
    } catch (err) {
      next(err);
    }
  },

  markRead(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      authorizationService.requirePermission(req.user!, 'notifications.read_state.manage');
      db.prepare(`
        UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient_user_id = ?
      `).run(req.params.id, req.user!.id);

      const notifs = dbRepository.getNotificationsForUser(req.user!.id);
      res.json({ success: true, data: notifs });
    } catch (err) {
      next(err);
    }
  },

  markAllRead(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      authorizationService.requirePermission(req.user!, 'notifications.read_state.manage');
      db.prepare(`
        UPDATE notifications SET is_read = 1 WHERE recipient_user_id = ?
      `).run(req.user!.id);

      const notifs = dbRepository.getNotificationsForUser(req.user!.id);
      res.json({ success: true, data: notifs });
    } catch (err) {
      next(err);
    }
  },
};

export const demoController = {
  resetDemo(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      seedDatabase();
      res.json({ success: true, message: 'Demo dataset reset to initial state.' });
    } catch (err) {
      next(err);
    }
  },
};
