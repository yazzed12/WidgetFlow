import { createContext } from 'react';
import type { AuthPrincipal, AuthSessionState, LoginCredentials } from './authTypes.js';

export interface AuthContextValue extends AuthSessionState {
  isAuthenticated: boolean;
  isProtectedAdmin: boolean;
  permissions: AuthPrincipal['effectivePermissions'];
  login: (credentials: LoginCredentials) => Promise<AuthPrincipal>;
  logout: () => Promise<void>;
  refreshPrincipal: () => Promise<AuthPrincipal | null>;
  clearAuthError: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
