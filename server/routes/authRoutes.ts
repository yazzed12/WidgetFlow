import { Router } from 'express';
import type { SecurityConfig } from '../config/securityConfig.js';
import type { AuthConfig } from '../auth/authConfig.js';
import type { AuthenticatedRequest } from '../types/index.js';
import { authSchemas } from '../auth/authSchemas.js';
import { authService } from '../auth/authService.js';
import { sessionService } from '../auth/sessionService.js';
import { readCookie, setSessionCookie, clearSessionCookie } from '../auth/cookieService.js';
import { createAuthRateLimit } from '../middleware/authRateLimit.js';
import { authAuditRepository } from '../repositories/authAuditRepository.js';
import { authorizationService } from '../services/authorizationService.js';
import { createSessionIdentityMiddleware } from '../middleware/sessionIdentity.js';

function positiveEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function createAuthRouters(authConfig: AuthConfig, security: SecurityConfig) {
  const publicRouter = Router();
  const protectedRouter = Router();
  const windowMs = positiveEnv('AUTH_RATE_LIMIT_WINDOW_MINUTES', 15) * 60_000;
  const loginLimit = positiveEnv('AUTH_LOGIN_RATE_LIMIT', 10);
  const tokenLimit = positiveEnv('AUTH_TOKEN_RATE_LIMIT', 5);

  publicRouter.post('/login', createAuthRateLimit('login', loginLimit, windowMs), async (req, res, next) => {
    try {
      const input = authSchemas.login(req.body);
      const result = await authService.login(input.email, input.password, authConfig);
      setSessionCookie(res, security, result.session.token, result.session.expiresAt);
      res.json({ success: true, data: result.user });
    } catch (error) { next(error); }
  });

  publicRouter.post('/logout', (req, res, next) => {
    try {
      const token = readCookie(req, security.sessionCookie.name);
      const revokedSession = sessionService.revokeByToken(token);
      clearSessionCookie(res, security);
      if (revokedSession) authAuditRepository.record('AUTH_LOGOUT', 'SUCCESS', { userId: revokedSession.userId });
      res.json({ success: true, data: { loggedOut: true } });
    } catch (error) { next(error); }
  });

  publicRouter.get('/me', createSessionIdentityMiddleware(security), (req: AuthenticatedRequest, res) => {
    res.json({ success: true, data: authorizationService.resolveUser(req.user!.id) });
  });

  publicRouter.post('/forgot-password', createAuthRateLimit('forgot', tokenLimit, windowMs), (req, res, next) => {
    try { const input = authSchemas.forgotPassword(req.body); res.json({ success: true, data: authService.forgotPassword(input.email, authConfig) }); }
    catch (error) { next(error); }
  });

  publicRouter.post('/reset-password', createAuthRateLimit('reset', tokenLimit, windowMs), async (req, res, next) => {
    try { const input = authSchemas.resetPassword(req.body); const result = await authService.resetPassword(input.token, input.password); res.json({ success: true, data: { reset: true, revokedSessions: result.revokedSessions } }); }
    catch (error) { next(error); }
  });

  publicRouter.post('/invitations/accept', createAuthRateLimit('invite-accept', tokenLimit, windowMs), async (req, res, next) => {
    try { const input = authSchemas.acceptInvitation(req.body); const user = await authService.acceptInvitation(input.token, input.password); res.json({ success: true, data: user }); }
    catch (error) { next(error); }
  });

  protectedRouter.post('/invitations', (req: AuthenticatedRequest, res, next) => {
    try { const input = authSchemas.invite(req.body); res.json({ success: true, data: authService.inviteUser(req.user!, input.userId, authConfig) }); }
    catch (error) { next(error); }
  });

  return { publicRouter, protectedRouter };
}
