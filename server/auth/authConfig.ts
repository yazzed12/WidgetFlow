export type AuthConfig = {
  sessionTtlMs: number;
  invitationTtlMs: number;
  resetTtlMs: number;
  publicUrl: string;
  exposeDevelopmentTokens: boolean;
};

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getAuthConfig(nodeEnv = process.env.NODE_ENV || 'development'): AuthConfig {
  return {
    sessionTtlMs: positiveNumber(process.env.SESSION_TTL_HOURS, 12) * 60 * 60 * 1000,
    invitationTtlMs: positiveNumber(process.env.AUTH_INVITATION_TTL_HOURS, 72) * 60 * 60 * 1000,
    resetTtlMs: positiveNumber(process.env.AUTH_RESET_TTL_MINUTES, 30) * 60 * 1000,
    publicUrl: process.env.AUTH_PUBLIC_URL || 'http://localhost:5173',
    exposeDevelopmentTokens: nodeEnv !== 'production',
  };
}
