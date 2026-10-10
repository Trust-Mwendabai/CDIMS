import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, isNetworkError } from './api';
import { applyThemePref } from './theme';

const AuthContext = createContext(null);
const SNAPSHOT_KEY = 'cdims-user';

// The last signed-in user is remembered on the device so the app can open while offline.
// It holds the same profile data the screen shows, never a password or token.
const readSnapshot = () => { try { return JSON.parse(localStorage.getItem(SNAPSHOT_KEY)); } catch { return null; } };
const writeSnapshot = (u) => { try { u ? localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(u)) : localStorage.removeItem(SNAPSHOT_KEY); } catch { /* storage unavailable */ } };

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [offlineSession, setOfflineSession] = useState(false); // signed in from the device copy, not yet confirmed by the server

  // Keep the signed-in user's saved theme in effect
  const setUser = useCallback((u) => {
    setUserState(u);
    writeSnapshot(u);
    if (u?.preferences?.theme) applyThemePref(u.preferences.theme);
  }, []);

  const verify = useCallback(async (opts) => {
    try {
      const d = await api.me(opts);
      // We remembered a signed-in user but the server no longer recognises the session: it ended (idle, revoked, role changed)
      if (!d.user && readSnapshot()) {
        try { sessionStorage.setItem('cdims-expired', '1'); } catch { /* storage unavailable */ }
      }
      setUser(d.user);
      setOfflineSession(false);
      return d.user;
    } catch (e) {
      if (isNetworkError(e)) {
        const cached = readSnapshot();
        if (cached) { setUserState(cached); setOfflineSession(true); return cached; }
      }
      setUserState(null);
      return null;
    }
  }, [setUser]);

  useEffect(() => { verify().finally(() => setLoading(false)); }, [verify]);

  // When the connection returns, confirm the session is still valid and refresh the CSRF token
  useEffect(() => {
    const onOnline = () => { verify({ background: true }); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [verify]);

  // Any request answered with 401 means the server ended this session (idle, revoked, role changed): return to sign-in
  useEffect(() => {
    const onUnauthorized = () => {
      setUserState((cur) => {
        if (cur) {
          try { sessionStorage.setItem('cdims-expired', '1'); } catch { /* storage unavailable */ }
          writeSnapshot(null);
        }
        return null;
      });
    };
    window.addEventListener('cdims-unauthorized', onUnauthorized);
    return () => window.removeEventListener('cdims-unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (identifier, password) => {
    const d = await api.login(identifier, password);
    setUser(d.user);
    setOfflineSession(false);
    return d.user;
  }, [setUser]);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    await api.me().catch(() => {}); // refresh CSRF token for the new session
    writeSnapshot(null);
    setUserState(null);
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    login,
    logout,
    verify,
    offlineSession,
    updateUser: setUser,
    /** True when the signed-in user's role grants the permission (the server enforces the same rules). */
    can: (permission) => !!user && user.permissions.includes(permission),
  }), [user, loading, login, logout, verify, offlineSession, setUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
