import express from 'express';
import cors from 'cors';
import { db, initDatabase } from './db/database.js';
import { ensureSystemRoles, seedDatabase } from './db/seed.js';
import { apiRouter } from './routes/apiRouter.js';
import { demoController } from './controllers/notificationController.js';
import { authorizationService } from './services/authorizationService.js';
import { AppError, errorHandler } from './middleware/errorHandler.js';
import { createIdentityMiddleware } from './middleware/identity.js';
import { createOriginProtection } from './middleware/security.js';
import { getSecurityConfig, type SecurityConfig } from './config/securityConfig.js';
import type { AuthenticatedRequest } from './types/index.js';
import { getAuthConfig } from './auth/authConfig.js';
import { createAuthRouters } from './routes/authRoutes.js';

export type CreateAppOptions = { initializeDatabase?: boolean; security?: SecurityConfig };

export function createApp(options: CreateAppOptions = {}) {
  const security = options.security || getSecurityConfig();
  if (options.initializeDatabase !== false) {
    initDatabase();
    ensureSystemRoles();
    const hasUsers = Number((db.prepare(`SELECT COUNT(*) as count FROM users`).get() as { count: number }).count || 0) > 0;
    if (!hasUsers) seedDatabase();
  }

  const app = express();
  const authConfig = getAuthConfig(security.nodeEnv);
  const authRouters = createAuthRouters(authConfig, security);
  app.use(cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || security.clientOrigins.includes(origin)) return callback(null, true);
      callback(new AppError('Request origin is not allowed.', 403, 'ORIGIN_NOT_ALLOWED'));
    },
  }));
  app.use(express.json({ limit: '10mb' }));
  app.get('/api/health', (_req, res) => res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() }));

  if (security.isProduction) {
    app.all('/api/demo/reset', (_req, res) => res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found.' } }));
  }
  app.use('/api', createOriginProtection(security));
  app.use('/api/auth', authRouters.publicRouter);
  app.use('/api', createIdentityMiddleware(security));

  if (security.demoIdentityEnabled) {
    app.post('/api/demo/reset', (req: AuthenticatedRequest, _res, next) => {
      try { authorizationService.requireAdmin(req.user); next(); } catch (error) { next(error); }
    }, demoController.resetDemo);
  }

  app.use('/api/auth', authRouters.protectedRouter);
  app.use('/api', apiRouter);
  app.use(errorHandler);
  return app;
}
