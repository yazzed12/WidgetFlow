import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { authService } from './authService.js';
import { AuthContext, type AuthContextValue } from './authContextDefinition.js';
import { toAuthError } from './authErrors.js';
import { isProtectedAdmin } from './authTypes.js';
import type {
  AuthError,
  AuthPrincipal,
  AuthSessionState,
  LoginCredentials,
} from './authTypes.js';

const INITIAL_STATE: AuthSessionState = {
  status: 'initializing',
  session: null,
  authUser: null,
  principal: null,
  error: null,
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthSessionState>(INITIAL_STATE);
  const stateRef = useRef(state);
  const generationRef = useRef(0);
  const blockedErrorRef = useRef<AuthError | null>(null);

  const commitState = useCallback((next: AuthSessionState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const establishSession = useCallback(async (session: Session): Promise<AuthPrincipal> => {
    const generation = ++generationRef.current;
    try {
      const principal = await authService.resolvePrincipal();
      if (generation !== generationRef.current) return principal;

      blockedErrorRef.current = null;
      commitState({
        status: 'authenticated',
        session,
        authUser: session.user,
        principal,
        error: null,
      });
      return principal;
    } catch (error) {
      const authError = toAuthError(error);
      if (generation === generationRef.current) {
        blockedErrorRef.current = authError;
        commitState({
          status: 'blocked',
          session: null,
          authUser: null,
          principal: null,
          error: authError,
        });
        try {
          await authService.signOut();
        } catch {
          // The application is already failed closed locally. A later Auth event
          // or refresh will re-evaluate the persisted session and block again.
        }
      }
      throw error;
    }
  }, [commitState]);

  useEffect(() => {
    let disposed = false;
    try {
      const unsubscribe = authService.onAuthStateChange((event, session) => {
        // Supabase recommends keeping this callback synchronous. Database work
        // is deferred outside the Auth client's internal callback lock.
        window.setTimeout(() => {
          if (disposed) return;
          if (event === 'SIGNED_OUT' || !session) {
            generationRef.current += 1;
            const blockedError = blockedErrorRef.current;
            commitState({
              status: blockedError ? 'blocked' : 'unauthenticated',
              session: null,
              authUser: null,
              principal: null,
              error: blockedError,
            });
            return;
          }

          if (event === 'SIGNED_IN' && stateRef.current.status === 'authenticating') return;
          if (['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
            void establishSession(session).catch(() => undefined);
          }
        }, 0);
      });
      return () => {
        disposed = true;
        generationRef.current += 1;
        unsubscribe();
      };
    } catch (error) {
      const authError = toAuthError(error);
      queueMicrotask(() => {
        if (disposed) return;
        commitState({
          status: 'blocked',
          session: null,
          authUser: null,
          principal: null,
          error: authError,
        });
      });
      return () => {
        disposed = true;
        generationRef.current += 1;
      };
    }
  }, [commitState, establishSession]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    blockedErrorRef.current = null;
    commitState({
      status: 'authenticating',
      session: null,
      authUser: null,
      principal: null,
      error: null,
    });

    try {
      const { session } = await authService.signIn(credentials);
      return await establishSession(session);
    } catch (error) {
      if (stateRef.current.status === 'authenticating') {
        const authError = toAuthError(error);
        commitState({
          status: 'unauthenticated',
          session: null,
          authUser: null,
          principal: null,
          error: authError,
        });
      }
      throw error;
    }
  }, [commitState, establishSession]);

  const logout = useCallback(async () => {
    generationRef.current += 1;
    blockedErrorRef.current = null;
    commitState({
      status: 'unauthenticated',
      session: null,
      authUser: null,
      principal: null,
      error: null,
    });
    await authService.signOut();
  }, [commitState]);

  const refreshPrincipal = useCallback(async () => {
    const session = stateRef.current.session;
    if (!session) return null;
    return establishSession(session);
  }, [establishSession]);

  const clearAuthError = useCallback(() => {
    blockedErrorRef.current = null;
    const current = stateRef.current;
    commitState({
      ...current,
      status: current.status === 'blocked' ? 'unauthenticated' : current.status,
      error: null,
    });
  }, [commitState]);

  const value = useMemo<AuthContextValue>(() => ({
    ...state,
    isAuthenticated: state.status === 'authenticated' && Boolean(state.principal),
    isProtectedAdmin: isProtectedAdmin(state.principal),
    permissions: state.principal?.effectivePermissions ?? [],
    login,
    logout,
    refreshPrincipal,
    clearAuthError,
  }), [clearAuthError, login, logout, refreshPrincipal, state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
