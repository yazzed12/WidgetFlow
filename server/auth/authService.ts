import { randomUUID } from 'node:crypto';
import { db } from '../db/database.js';
import { credentialRepository } from '../repositories/credentialRepository.js';
import { invitationRepository } from '../repositories/invitationRepository.js';
import { passwordResetRepository } from '../repositories/passwordResetRepository.js';
import { authAuditRepository } from '../repositories/authAuditRepository.js';
import { authorizationService } from '../services/authorizationService.js';
import { AppError } from '../middleware/errorHandler.js';
import type { ServerUser } from '../types/index.js';
import type { AuthConfig } from './authConfig.js';
import { DUMMY_PASSWORD_HASH, passwordService } from './passwordService.js';
import { generateOpaqueToken, hashOpaqueToken } from './tokenService.js';
import { sessionService } from './sessionService.js';
import { mailService } from './mailService.js';
import { normalizeEmail } from './authSchemas.js';

const NEUTRAL_RESET_MESSAGE = 'If an eligible account exists, password reset instructions have been sent.';

function eligibleUser(userId: string) {
  const user = authorizationService.resolveUser(userId);
  return user && user.status === 'Active' && user.roleActive ? user : null;
}

export const authService = {
  async login(email: string, password: string, config: AuthConfig) {
    const credential = credentialRepository.findByNormalizedEmail(email);
    const verified = await passwordService.verifyPassword(password, credential?.passwordHash || DUMMY_PASSWORD_HASH);
    const user = credential ? eligibleUser(credential.userId) : null;
    if (!credential || !credential.isEnabled || !verified || !user) {
      authAuditRepository.record('AUTH_LOGIN_FAILED', 'FAILURE', { userId: credential?.userId, email });
      throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }
    const session = sessionService.create(user.id, config);
    authAuditRepository.record('AUTH_LOGIN_SUCCEEDED', 'SUCCESS', { userId: user.id, email });
    return { user, session };
  },

  inviteUser(adminActor: ServerUser, userId: string, config: AuthConfig) {
    const admin = authorizationService.requireAdmin(adminActor);
    const user = eligibleUser(userId);
    if (!user) throw new AppError('User is not eligible for an invitation.', 400, 'ACCOUNT_UNAVAILABLE');
    if (credentialRepository.findByUserId(user.id)) throw new AppError('User already has credentials.', 409, 'CREDENTIALS_ALREADY_CONFIGURED');
    const rawToken = generateOpaqueToken();
    const deliveryUrl = mailService.invitation(config, user.email, rawToken);
    if (!deliveryUrl) throw new AppError('Authentication mail delivery is not configured.', 503, 'MAIL_DELIVERY_UNAVAILABLE');
    const now = new Date();
    invitationRepository.create({
      id: randomUUID(), userId: user.id, intendedEmail: normalizeEmail(user.email), tokenHash: hashOpaqueToken(rawToken),
      createdByAdmin: admin.id, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + config.invitationTtlMs).toISOString(), consumedAt: null,
    });
    authAuditRepository.record('AUTH_INVITATION_CREATED', 'SUCCESS', { userId: user.id, email: normalizeEmail(user.email) });
    return { userId: user.id, email: user.email, expiresAt: new Date(now.getTime() + config.invitationTtlMs).toISOString(), developmentInvitationUrl: deliveryUrl };
  },

  async acceptInvitation(token: string, password: string) {
    const invitation = invitationRepository.findByTokenHash(hashOpaqueToken(token));
    if (!invitation) throw new AppError('Invitation is invalid.', 400, 'INVITATION_INVALID');
    if (invitation.consumedAt) throw new AppError('Invitation has already been used.', 409, 'INVITATION_ALREADY_USED');
    if (Date.parse(invitation.expiresAt) <= Date.now()) throw new AppError('Invitation has expired.', 400, 'INVITATION_EXPIRED');
    const user = eligibleUser(invitation.userId);
    if (!user || normalizeEmail(user.email) !== invitation.intendedEmail) throw new AppError('Invitation is invalid.', 400, 'INVITATION_INVALID');
    const passwordHash = await passwordService.hashPassword(password);
    const consumedAt = new Date().toISOString();
    db.transaction(() => {
      if (invitationRepository.consumeIfUnused(invitation.id, consumedAt) !== 1) throw new AppError('Invitation has already been used.', 409, 'INVITATION_ALREADY_USED');
      credentialRepository.upsert(user.id, passwordHash);
    })();
    authAuditRepository.record('AUTH_INVITATION_ACCEPTED', 'SUCCESS', { userId: user.id, email: invitation.intendedEmail });
    return user;
  },

  forgotPassword(email: string, config: AuthConfig) {
    const credential = credentialRepository.findByNormalizedEmail(email);
    const user = credential ? eligibleUser(credential.userId) : null;
    let developmentResetUrl: string | null = null;
    if (credential?.isEnabled && user) {
      const rawToken = generateOpaqueToken();
      developmentResetUrl = mailService.passwordReset(config, user.email, rawToken);
      if (developmentResetUrl) {
        const now = new Date();
        passwordResetRepository.create({ id: randomUUID(), userId: user.id, tokenHash: hashOpaqueToken(rawToken),
          createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + config.resetTtlMs).toISOString(), consumedAt: null });
      }
    }
    authAuditRepository.record('AUTH_PASSWORD_RESET_REQUESTED', 'SUCCESS', { userId: user?.id, email });
    return { message: NEUTRAL_RESET_MESSAGE, developmentResetUrl: config.exposeDevelopmentTokens ? developmentResetUrl : undefined };
  },

  async resetPassword(token: string, password: string) {
    const reset = passwordResetRepository.findByTokenHash(hashOpaqueToken(token));
    if (!reset) throw new AppError('Password reset token is invalid.', 400, 'RESET_TOKEN_INVALID');
    if (reset.consumedAt) throw new AppError('Password reset token has already been used.', 409, 'RESET_TOKEN_ALREADY_USED');
    if (Date.parse(reset.expiresAt) <= Date.now()) throw new AppError('Password reset token has expired.', 400, 'RESET_TOKEN_EXPIRED');
    const user = eligibleUser(reset.userId);
    if (!user) throw new AppError('Account is unavailable.', 403, 'ACCOUNT_UNAVAILABLE');
    const passwordHash = await passwordService.hashPassword(password);
    const now = new Date().toISOString();
    let revoked = 0;
    db.transaction(() => {
      if (passwordResetRepository.consumeIfUnused(reset.id, now) !== 1) throw new AppError('Password reset token has already been used.', 409, 'RESET_TOKEN_ALREADY_USED');
      credentialRepository.upsert(user.id, passwordHash);
      revoked = sessionService.revokeAllForUser(user.id);
    })();
    authAuditRepository.record('AUTH_PASSWORD_RESET_COMPLETED', 'SUCCESS', { userId: user.id, email: normalizeEmail(user.email) });
    if (revoked > 0) authAuditRepository.record('AUTH_SESSION_REVOKED', 'SUCCESS', { userId: user.id });
    return { user, revokedSessions: revoked };
  },
};
