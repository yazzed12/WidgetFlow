import { AppError } from '../middleware/errorHandler.js';

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('Invalid request body.', 400, 'VALIDATION_ERROR');
  return value as Record<string, unknown>;
}
function requiredString(body: Record<string, unknown>, key: string, max = 512): string {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new AppError(`${key} is required.`, 400, 'VALIDATION_ERROR');
  return value;
}
export function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new AppError('A valid email address is required.', 400, 'VALIDATION_ERROR');
  return normalized;
}

export const authSchemas = {
  login(value: unknown) { const body = objectBody(value); return { email: normalizeEmail(requiredString(body, 'email', 320)), password: requiredString(body, 'password', 128) }; },
  invite(value: unknown) { const body = objectBody(value); return { userId: requiredString(body, 'userId', 128) }; },
  acceptInvitation(value: unknown) { const body = objectBody(value); return { token: requiredString(body, 'token', 512), password: requiredString(body, 'password', 128) }; },
  forgotPassword(value: unknown) { const body = objectBody(value); return { email: normalizeEmail(requiredString(body, 'email', 320)) }; },
  resetPassword(value: unknown) { const body = objectBody(value); return { token: requiredString(body, 'token', 512), password: requiredString(body, 'password', 128) }; },
};
