import type { AuthConfig } from './authConfig.js';

export const mailService = {
  invitation(config: AuthConfig, email: string, token: string) {
    if (!config.exposeDevelopmentTokens) return null;
    return `${config.publicUrl}/register?invitation=${encodeURIComponent(token)}`;
  },
  passwordReset(config: AuthConfig, email: string, token: string) {
    if (!config.exposeDevelopmentTokens) return null;
    return `${config.publicUrl}/reset-password?token=${encodeURIComponent(token)}`;
  },
};
