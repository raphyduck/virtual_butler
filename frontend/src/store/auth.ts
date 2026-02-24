import { create } from 'zustand';
import { clearToken, getToken, isTokenValid, setToken } from '@/lib/auth';

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string) => void;
  logout: () => void;
  init: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  isAuthenticated: false,

  login: (token) => {
    setToken(token);
    set({ token, isAuthenticated: true });
  },

  logout: () => {
    clearToken();
    set({ token: null, isAuthenticated: false });
  },

  init: () => {
    const token = getToken();
    if (token && isTokenValid(token)) {
      set({ token, isAuthenticated: true });
    } else {
      clearToken();
      set({ token: null, isAuthenticated: false });
    }
  },
}));
