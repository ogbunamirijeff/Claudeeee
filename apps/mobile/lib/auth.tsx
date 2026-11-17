import type { MeResponse, VerifyOtpResponse } from '@jiko/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, authed, logout as apiLogout } from './api';
import { AppMode, loadMode, saveMode, saveTokens } from './session';

interface AuthState {
  status: 'loading' | 'signedOut' | 'signedIn';
  me: MeResponse | null;
  mode: AppMode;
  signIn(r: VerifyOtpResponse): Promise<void>;
  signOut(): Promise<void>;
  setMode(m: AppMode): Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [me, setMe] = useState<MeResponse | null>(null);
  const [mode, setModeState] = useState<AppMode>('client');

  useEffect(() => {
    (async () => {
      try {
        const [user, savedMode] = await Promise.all([authed<MeResponse>('/v1/me'), loadMode()]);
        setMe(user);
        setModeState(savedMode === 'artisan' && user.roles.includes('ARTISAN') ? 'artisan' : 'client');
        setStatus('signedIn');
      } catch (e) {
        // Offline with a stored session: stay signed out of the UI but keep tokens.
        if (!(e instanceof ApiError)) console.warn(e);
        setStatus('signedOut');
      }
    })();
  }, []);

  const signIn = useCallback(async (r: VerifyOtpResponse) => {
    await saveTokens(r);
    setMe(r.user);
    setModeState(r.user.roles.includes('ARTISAN') ? await loadMode() : 'client');
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    await apiLogout();
    setMe(null);
    setStatus('signedOut');
  }, []);

  const setMode = useCallback(async (m: AppMode) => {
    await saveMode(m);
    setModeState(m);
  }, []);

  const value = useMemo(() => ({ status, me, mode, signIn, signOut, setMode }), [status, me, mode, signIn, signOut, setMode]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
