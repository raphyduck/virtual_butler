const TOKEN_KEY = 'vb_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function decodeToken(token: string): { sub: string; exp: number } | null {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

export function isTokenValid(token: string): boolean {
  const payload = decodeToken(token);
  if (!payload) return false;
  return payload.exp * 1000 > Date.now();
}
