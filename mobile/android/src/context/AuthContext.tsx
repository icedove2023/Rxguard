/**
 * RxGuard Mobile — context/AuthContext.tsx
 *
 * Global authentication state managed via React Context + Zustand.
 *
 * Responsibilities:
 *   - Load persisted tokens and user on app start
 *   - Expose login / register / logout / refreshUser actions
 *   - Provide role-based permission helpers
 *   - Listen for 401 events emitted by the API interceptor
 *   - Persist user object to MMKV for offline access
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import { USER_ROLES, type UserRole } from '@constants';
import { TokenStore, ApiError } from '@services/api';
import { AuthService, UserService } from '@services';
import { unlockWithBiometrics, isBiometricLoginEnabled } from '@services/biometrics';
import type { User, LoginPayload, RegisterPayload } from '@types';

/* ─────────────────────────────────────────────────────────────────
   Auth store (Zustand + Immer)
───────────────────────────────────────────────────────────────── */

interface AuthState {
  user           : User | null;
  isAuthenticated: boolean;
  isLoading      : boolean;
  isInitialised  : boolean;
  error          : string | null;

  _setUser        : (user: User | null) => void;
  _setLoading     : (loading: boolean) => void;
  _setError       : (error: string | null) => void;
  _setInitialised : (done: boolean) => void;
}

const useAuthStore = create<AuthState>()(
  immer(set => ({
    user           : null,
    isAuthenticated: false,
    isLoading      : false,
    isInitialised  : false,
    error          : null,

    _setUser: (user) => set(state => {
      state.user            = user;
      state.isAuthenticated = user !== null;
      state.error           = null;
    }),

    _setLoading: (loading) => set(state => { state.isLoading = loading; }),
    _setError  : (error)   => set(state => { state.error    = error;   }),
    _setInitialised: (done)=> set(state => { state.isInitialised = done; }),
  }))
);

/* ─────────────────────────────────────────────────────────────────
   Context value shape
───────────────────────────────────────────────────────────────── */

interface AuthContextValue {
  /* State */
  user           : User | null;
  isAuthenticated: boolean;
  isLoading      : boolean;
  isInitialised  : boolean;
  error          : string | null;

  /* Actions */
  login        : (payload: LoginPayload)    => Promise<void>;
  register     : (payload: RegisterPayload) => Promise<{ requiresConfirmation: boolean }>;
  logout       : ()                         => Promise<void>;
  refreshUser  : ()                         => Promise<void>;
  /** Adopts tokens obtained outside the normal login flow (e.g. a
   *  Supabase email-confirmation deep link) and loads the user. */
  hydrateSession: (accessToken: string, refreshToken: string) => Promise<void>;
  /** True if the device supports it AND the user opted in via Settings. */
  biometricLoginAvailable: boolean;
  /** Triggers the OS biometric prompt and logs in on success. Returns
   *  false (never throws) if unavailable, cancelled, or failed. */
  loginWithBiometrics: () => Promise<boolean>;
  clearError   : ()                         => void;

  /* Role helpers */
  isAdmin      : boolean;
  isPhysician  : boolean;
  isPharmacist : boolean;
  isConsumer   : boolean;
  isProfessional: boolean;
  hasVerifiedLicence: boolean;
  hasRole      : (role: UserRole) => boolean;
  hasAnyRole   : (...roles: UserRole[]) => boolean;
}

/* ─────────────────────────────────────────────────────────────────
   Context
───────────────────────────────────────────────────────────────── */

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/* ─────────────────────────────────────────────────────────────────
   Provider
───────────────────────────────────────────────────────────────── */

interface AuthProviderProps {
  children: ReactNode;
  /** Called when the session is terminated (e.g. navigate to Login) */
  onSessionExpired?: () => void;
}

export function AuthProvider({ children, onSessionExpired }: AuthProviderProps) {
  const {
    user, isLoading, isInitialised, error, isAuthenticated,
    _setUser, _setLoading, _setError, _setInitialised,
  } = useAuthStore();

  const onSessionExpiredRef = useRef(onSessionExpired);
  useEffect(() => { onSessionExpiredRef.current = onSessionExpired; }, [onSessionExpired]);

  /* ── Bootstrap: restore session on app open ── */
  useEffect(() => {
    (async () => {
      _setLoading(true);
      try {
        const token = TokenStore.getAccess();
        if (!token) { _setInitialised(true); return; }

        // Try to restore from MMKV cache first (instant)
        const cached = TokenStore.getUser<User>();
        if (cached) _setUser(cached);

        // Then verify with server in background
        const res  = await AuthService.me();
        const fresh = res.data;
        _setUser(fresh);
        TokenStore.setUser(fresh);

      } catch (err) {
        // Token is invalid — clear and show login
        TokenStore.clearTokens();
        _setUser(null);
      } finally {
        _setLoading(false);
        _setInitialised(true);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Re-verify session when app returns to foreground ── */
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', async nextState => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextState === 'active' &&
        TokenStore.getAccess()
      ) {
        try {
          const res = await AuthService.me();
          _setUser(res.data);
          TokenStore.setUser(res.data);
        } catch {
          /* Silently ignore — interceptor handles 401 */
        }
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Actions ── */

  const login = useCallback(async (payload: LoginPayload) => {
    _setLoading(true);
    _setError(null);
    try {
      const res  = await AuthService.login(payload);
      const { access_token, refresh_token, user: userData } = res.data;
      TokenStore.setTokens(access_token, refresh_token);
      TokenStore.setUser(userData);
      _setUser(userData);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Login failed. Please try again.';
      _setError(msg);
      throw err;
    } finally {
      _setLoading(false);
    }
  }, [_setLoading, _setError, _setUser]);

  const register = useCallback(async (payload: RegisterPayload) => {
    _setLoading(true);
    _setError(null);
    try {
      const res = await AuthService.register(payload);
      const { access_token, refresh_token, user: userData, requires_confirmation } = res.data;

      // Supabase's default project setting requires email confirmation
      // before a session is issued — in that case there's nothing to log
      // in with yet, so leave auth state untouched and let the caller
      // show a "check your email" screen instead.
      if (!access_token || !refresh_token) {
        return { requiresConfirmation: Boolean(requires_confirmation) };
      }

      TokenStore.setTokens(access_token, refresh_token);
      TokenStore.setUser(userData);
      _setUser(userData);
      return { requiresConfirmation: false };
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Registration failed.';
      _setError(msg);
      throw err;
    } finally {
      _setLoading(false);
    }
  }, [_setLoading, _setError, _setUser]);

  const logout = useCallback(async () => {
    _setLoading(true);
    try {
      await AuthService.logout();
    } catch {
      /* Best-effort; always clear locally */
    } finally {
      TokenStore.clearTokens();
      _setUser(null);
      _setLoading(false);
    }
  }, [_setLoading, _setUser]);

  const refreshUser = useCallback(async () => {
    try {
      const res = await UserService.profile();
      _setUser(res.data);
      TokenStore.setUser(res.data);
    } catch {
      /* Silently ignore */
    }
  }, [_setUser]);

  const hydrateSession = useCallback(async (accessToken: string, refreshToken: string) => {
    _setLoading(true);
    try {
      TokenStore.setTokens(accessToken, refreshToken);
      const res = await UserService.profile();
      _setUser(res.data);
      TokenStore.setUser(res.data);
    } catch (err) {
      TokenStore.clearTokens();
      _setError(err instanceof ApiError ? err.message : 'Could not restore your session. Please log in.');
      throw err;
    } finally {
      _setLoading(false);
    }
  }, [_setLoading, _setError, _setUser]);

  const loginWithBiometrics = useCallback(async (): Promise<boolean> => {
    const storedRefreshToken = await unlockWithBiometrics();
    if (!storedRefreshToken) return false;

    _setLoading(true);
    try {
      const res = await AuthService.refreshToken(storedRefreshToken);
      // AuthService.refreshToken doesn't return the user, unlike login —
      // fetch it once we have a fresh access token.
      TokenStore.setTokens(res.data.access_token, res.data.refresh_token ?? storedRefreshToken);
      const profileRes = await UserService.profile();
      _setUser(profileRes.data);
      TokenStore.setUser(profileRes.data);
      return true;
    } catch {
      // Stored refresh token expired/revoked (e.g. password changed
      // elsewhere) — fall back to normal password login.
      return false;
    } finally {
      _setLoading(false);
    }
  }, [_setLoading, _setUser]);

  const clearError = useCallback(() => _setError(null), [_setError]);

  /* ── Role helpers ── */

  const role: UserRole | undefined = user?.role;

  const value: AuthContextValue = {
    user,
    isAuthenticated,
    isLoading,
    isInitialised,
    error,

    login,
    register,
    logout,
    refreshUser,
    hydrateSession,
    biometricLoginAvailable: isBiometricLoginEnabled(),
    loginWithBiometrics,
    clearError,

    isAdmin       : role === USER_ROLES.ADMIN,
    isPhysician   : role === USER_ROLES.PHYSICIAN,
    isPharmacist  : role === USER_ROLES.PHARMACIST,
    isConsumer    : role === USER_ROLES.CONSUMER,
    isProfessional: role === USER_ROLES.PHARMACIST || role === USER_ROLES.PHYSICIAN,
    hasVerifiedLicence:
      (role === USER_ROLES.PHARMACIST || role === USER_ROLES.PHYSICIAN) &&
      (user?.professional_profile?.license_verified ?? false),

    hasRole    : (r) => role === r,
    hasAnyRole : (...roles) => roles.some(r => r === role),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* ─────────────────────────────────────────────────────────────────
   Hook
───────────────────────────────────────────────────────────────── */

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return ctx;
}

export default AuthContext;