import { randomUUID } from 'node:crypto';
import { sessionRepository } from '../repositories/sessionRepository.js';
import { authorizationService } from '../services/authorizationService.js';
import { AppError } from '../middleware/errorHandler.js';
import type { AuthConfig } from './authConfig.js';
import { generateOpaqueToken, hashOpaqueToken } from './tokenService.js';
import { authAuditRepository } from '../repositories/authAuditRepository.js';

export const sessionService = {
  create(userId: string, config: AuthConfig) {
    const token = generateOpaqueToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.sessionTtlMs);
    const id = randomUUID();
    sessionRepository.create({ id, userId, tokenHash: hashOpaqueToken(token), createdAt: now.toISOString(), expiresAt: expiresAt.toISOString() });
    return { id, token, expiresAt };
  },
  authenticate(token: string) {
    const session = sessionRepository.findByTokenHash(hashOpaqueToken(token));
    if (!session) throw new AppError('Authentication is required.', 401, 'AUTHENTICATION_REQUIRED');
    if (session.revokedAt) throw new AppError('Session has been revoked.', 401, 'SESSION_REVOKED');
    if (Date.parse(session.expiresAt) <= Date.now()) {
      sessionRepository.revoke(session.id);
      authAuditRepository.record('AUTH_SESSION_REVOKED', 'SUCCESS', { userId: session.userId });
      throw new AppError('Session has expired.', 401, 'SESSION_EXPIRED');
    }
    const user = authorizationService.resolveUser(session.userId);
    if (!user || user.status !== 'Active' || !user.roleActive) {
      sessionRepository.revoke(session.id);
      authAuditRepository.record('AUTH_SESSION_REVOKED', 'SUCCESS', { userId: session.userId });
      throw new AppError('Account is unavailable.', 403, 'ACCOUNT_UNAVAILABLE');
    }
    sessionRepository.touch(session.id);
    return { session, user };
  },
  revokeByToken(token?: string) {
    if (!token) return null;
    const session = sessionRepository.findByTokenHash(hashOpaqueToken(token));
    if (!session) return null;
    sessionRepository.revoke(session.id);
    return session;
  },
  revokeAllForUser(userId: string) { return sessionRepository.revokeForUser(userId); },
};
