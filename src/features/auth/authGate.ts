import type { AuthStatus } from './authTypes.js';

export type AuthView = 'loading' | 'application' | 'login';

export function resolveAuthView(status: AuthStatus): AuthView {
  if (status === 'initializing' || status === 'authenticating') return 'loading';
  if (status === 'authenticated') return 'application';
  return 'login';
}
