import { getToken } from './auth';

const BASE = '/api/v1';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...init.headers,
  };
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, body.detail ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  const form = new URLSearchParams({ username: email, password });
  const res = await fetch(`${BASE}/auth/token`, {
    method: 'POST',
    body: form,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, body.detail ?? res.statusText);
  }
  return res.json();
}

export async function register(email: string, password: string): Promise<{ id: string; email: string }> {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

// ─── Abilities ───────────────────────────────────────────────────────────────

export interface Ability {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  provider: string;
  model: string;
  system_prompt: string | null;
  deliverable_type: string;
  target_type: string;
  target_config: string | null;
  provider_config: string | null;
  created_at: string;
  updated_at: string;
}

export type AbilityCreate = Omit<Ability, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type AbilityUpdate = Partial<AbilityCreate>;

export const listAbilities = (): Promise<Ability[]> => request('/abilities/');
export const getAbility = (id: string): Promise<Ability> => request(`/abilities/${id}`);
export const createAbility = (data: AbilityCreate): Promise<Ability> =>
  request('/abilities/', { method: 'POST', body: JSON.stringify(data) });
export const updateAbility = (id: string, data: AbilityUpdate): Promise<Ability> =>
  request(`/abilities/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteAbility = (id: string): Promise<void> =>
  request(`/abilities/${id}`, { method: 'DELETE' });

// ─── Sessions ────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  ability_id: string;
  user_id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

export const createSession = (abilityId: string): Promise<Session> =>
  request(`/abilities/${abilityId}/sessions`, { method: 'POST', body: '{}' });
export const listSessions = (abilityId: string): Promise<Session[]> =>
  request(`/abilities/${abilityId}/sessions`);
export const getMessages = (abilityId: string, sessionId: string): Promise<ChatMessage[]> =>
  request(`/abilities/${abilityId}/sessions/${sessionId}/messages`);
