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
import { refreshTokens } from '@/lib/api';

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  login: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
  init: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  isAuthenticated: false,
  isInitialized: false,

  login: (accessToken, refreshToken) => {
    setToken(accessToken);
    setRefreshToken(refreshToken);
    set({ token: accessToken, isAuthenticated: true });
  },

  logout: () => {
    clearToken();
    clearRefreshToken();
    set({ token: null, isAuthenticated: false });
  },

  init: async () => {
    const token = getToken();

    if (token && isTokenValid(token)) {
      set({ token, isAuthenticated: true, isInitialized: true });
      return;
    }

    // Access token absent or expired — try refresh
    const refreshToken = getRefreshToken();
    if (refreshToken && isTokenValid(refreshToken)) {
      try {
        const data = await refreshTokens(refreshToken);
        setToken(data.access_token);
        setRefreshToken(data.refresh_token);
        set({ token: data.access_token, isAuthenticated: true, isInitialized: true });
        return;
      } catch {
        // Refresh failed, fall through to logout
      }
    }

    clearToken();
    clearRefreshToken();
    set({ token: null, isAuthenticated: false, isInitialized: true });
  },
}));
