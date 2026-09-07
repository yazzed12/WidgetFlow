import type { AuthError, AuthErrorCode } from './authTypes.js';

const AUTH_MESSAGES: Record<AuthErrorCode, string> = {
  INVALID_CREDENTIALS: 'Invalid email or password.',
  ACCOUNT_INACTIVE: 'Your account is inactive. Contact your administrator.',
  ACCOUNT_NOT_CONFIGURED: 'Your WidgetFlow account is not configured. Contact an administrator.',
  AUTH_UNAVAILABLE: 'Unable to sign in right now. Please try again.',
  AUTH_CONFIGURATION: 'WidgetFlow authentication is not configured.',
};

export class AuthFlowError extends Error {
  readonly authError: AuthError;

  constructor(code: AuthErrorCode, cause?: unknown) {
    super(AUTH_MESSAGES[code], cause === undefined ? undefined : { cause });
    this.name = 'AuthFlowError';
    this.authError = { code, message: AUTH_MESSAGES[code] };
  }
}

export function toAuthError(error: unknown): AuthError {
  if (error instanceof AuthFlowError) return error.authError;
  if (error instanceof Error && error.message.includes('Missing required browser configuration')) {
    return { code: 'AUTH_CONFIGURATION', message: AUTH_MESSAGES.AUTH_CONFIGURATION };
  }
  return { code: 'AUTH_UNAVAILABLE', message: AUTH_MESSAGES.AUTH_UNAVAILABLE };
}
