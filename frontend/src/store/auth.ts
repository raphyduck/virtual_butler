import { create } from 'zustand';
import {
  clearToken,
  clearRefreshToken,
  getToken,
  getRefreshToken,
  isTokenValid,
  setToken,
  setRefreshToken,
} from '@/lib/auth';
import { getCurrentUser, refreshTokens } from '@/lib/api';

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isInitialized: boolean;
  login: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => void;
  init: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  isAuthenticated: false,
  isAdmin: false,
  isInitialized: false,

  login: async (accessToken, refreshToken) => {
    setToken(accessToken);
    setRefreshToken(refreshToken);
    try {
      const me = await getCurrentUser();
      set({ token: accessToken, isAuthenticated: true, isAdmin: me.is_admin });
    } catch {
      set({ token: accessToken, isAuthenticated: true, isAdmin: false });
    }
  },

  logout: () => {
    clearToken();
    clearRefreshToken();
    set({ token: null, isAuthenticated: false, isAdmin: false });
  },

  init: async () => {
    const token = getToken();

    if (token && isTokenValid(token)) {
      try {
        const me = await getCurrentUser();
        set({ token, isAuthenticated: true, isAdmin: me.is_admin, isInitialized: true });
      } catch {
        set({ token, isAuthenticated: true, isAdmin: false, isInitialized: true });
      }
      return;
    }

    // Access token absent or expired — try refresh
    const refreshToken = getRefreshToken();
    if (refreshToken && isTokenValid(refreshToken)) {
      try {
        const data = await refreshTokens(refreshToken);
        setToken(data.access_token);
        setRefreshToken(data.refresh_token);
        try {
          const me = await getCurrentUser();
          set({ token: data.access_token, isAuthenticated: true, isAdmin: me.is_admin, isInitialized: true });
        } catch {
          set({ token: data.access_token, isAuthenticated: true, isAdmin: false, isInitialized: true });
        }
        return;
      } catch {
        // Refresh failed, fall through to logout
      }
    }

    clearToken();
    clearRefreshToken();
    set({ token: null, isAuthenticated: false, isAdmin: false, isInitialized: true });
  },
}));
