import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/index.js';
import { authorizationService } from '../services/authorizationService.js';

export function demoUserMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const userIdHeader = (req.headers['x-demo-user-id'] as string) || 'user-employee';

  const user = authorizationService.resolveUser(userIdHeader) || authorizationService.resolveUser('user-employee');

  if (user) {
    if (user.status !== 'Active' || !user.roleActive) {
      res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_INACTIVE',
          message: user.status !== 'Active'
            ? `This account is ${user.status} and cannot access WidgetFlow.`
            : 'This account is assigned to an inactive organizational role.',
        },
      });
      return;
    }
    req.user = user;
  } else {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Demo user not found.' } });
  }

  next();
}
