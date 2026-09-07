import type { NextFunction, Request, Response } from 'express';
import type { SecurityConfig } from '../config/securityConfig.js';
import { AppError } from './errorHandler.js';

export function createOriginProtection(config: SecurityConfig) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!config.isProduction || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (!origin || !config.clientOrigins.includes(origin)) return next(new AppError('Request origin is not allowed.', 403, 'ORIGIN_NOT_ALLOWED'));
    next();
  };
}
