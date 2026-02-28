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

// ─── Setup & App Settings ────────────────────────────────────────────────────

export interface SetupStatus {
  setup_required: boolean;
}

export interface AppSettings {
  anthropic_api_key: string | null;
  openai_api_key: string | null;
  google_api_key: string | null;
  github_client_id: string | null;
  github_client_secret: string | null;
  github_callback_url: string | null;
  github_repo_owner: string | null;
  github_repo_name: string | null;
  butler_provider: string | null;
  butler_model: string | null;
}

export const getSetupStatus = (): Promise<SetupStatus> => request('/setup/status');

export async function runSetup(
  email: string,
  password: string,
  settings?: Record<string, string>,
): Promise<TokenResponse> {
  return request('/setup', {
    method: 'POST',
    body: JSON.stringify({ email, password, settings: settings && Object.keys(settings).length ? settings : null }),
  });
}

export const getAppSettings = (): Promise<AppSettings> => request('/settings');

export const updateAppSettings = (data: Partial<AppSettings>): Promise<AppSettings> =>
  request('/settings', { method: 'PATCH', body: JSON.stringify(data) });

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function register(email: string, password: string): Promise<{ id: string; email: string }> {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  return request('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

// ─── Skills ─────────────────────────────────────────────────────────────────

export interface Skill {
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

export type SkillCreate = Omit<Skill, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type SkillUpdate = Partial<SkillCreate>;

export const listSkills = (): Promise<Skill[]> => request('/skills');
export const getSkill = (id: string): Promise<Skill> => request(`/skills/${id}`);
export const createSkill = (data: SkillCreate): Promise<Skill> =>
  request('/skills', { method: 'POST', body: JSON.stringify(data) });
export const updateSkill = (id: string, data: SkillUpdate): Promise<Skill> =>
  request(`/skills/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteSkill = (id: string): Promise<void> =>
  request(`/skills/${id}`, { method: 'DELETE' });

// ─── Sessions ────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  skill_id: string;
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

export const createSession = (skillId: string): Promise<Session> =>
  request(`/skills/${skillId}/sessions`, { method: 'POST', body: '{}' });
export const listSessions = (skillId: string): Promise<Session[]> =>
  request(`/skills/${skillId}/sessions`);
export const getMessages = (skillId: string, sessionId: string): Promise<ChatMessage[]> =>
  request(`/skills/${skillId}/sessions/${sessionId}/messages`);

// ─── Self-modification ────────────────────────────────────────────────────────

export interface FileChangeOut {
  path: string;
  action: 'create' | 'modify' | 'delete';
  content: string | null;
}

export interface ModifyPlan {
  changes: FileChangeOut[];
  commit_message: string;
}

export interface ModifyJob {
  id: string;
  status: string;
  mode: string;
  instruction: string;
  provider: string;
  model: string;
  plan: ModifyPlan | null;
  error: string | null;
  commit_sha: string | null;
  pr_url: string | null;
  pr_number: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface GithubStatus {
  connected: boolean;
  login: string | null;
  is_repo_owner: boolean;
}

export const getGithubStatus = (): Promise<GithubStatus> =>
  request('/self/github/status');

export const getGithubAuthorizeUrl = (): Promise<{ url: string; state: string }> =>
  request('/self/github/authorize');

export const exchangeGithubCode = (code: string, state: string): Promise<GithubStatus> =>
  request('/self/github/exchange', { method: 'POST', body: JSON.stringify({ code, state }) });

export const disconnectGithub = (): Promise<void> =>
  request('/self/github/disconnect', { method: 'DELETE' });

export const startModifyJob = (
  instruction: string,
  provider = 'anthropic',
  model = 'claude-sonnet-4-6',
): Promise<ModifyJob> =>
  request('/self/modify', { method: 'POST', body: JSON.stringify({ instruction, provider, model }) });

export const getModifyJob = (jobId: string): Promise<ModifyJob> =>
  request(`/self/modify/${jobId}`);

export const confirmModifyJob = (jobId: string): Promise<ModifyJob> =>
  request(`/self/modify/${jobId}/confirm`, { method: 'POST' });

export const cancelModifyJob = (jobId: string): Promise<ModifyJob> =>
  request(`/self/modify/${jobId}/cancel`, { method: 'POST' });

export const mergeModifyJob = (jobId: string): Promise<ModifyJob> =>
  request(`/self/modify/${jobId}/merge`, { method: 'POST' });

// ─── Skill Store ─────────────────────────────────────────────────────────────

export interface SkillManifest {
  name: string;
  version: string | null;
  description: string | null;
  permissions: Record<string, boolean> | null;
  requires: Record<string, string[]> | null;
  _dir: string | null;
}

export interface InstalledSkillInfo {
  id: string;
  name: string;
  version: string;
  description: string | null;
  directory: string;
  enabled: boolean;
  installed_at: string;
}

export const getAvailableSkills = (): Promise<SkillManifest[]> => request('/skill-store/available');
export const getInstalledSkills = (): Promise<InstalledSkillInfo[]> => request('/skill-store/installed');
export const installSkillFromStore = (directory: string): Promise<InstalledSkillInfo> =>
  request('/skill-store/install', { method: 'POST', body: JSON.stringify({ directory }) });
export const enableInstalledSkill = (id: string): Promise<InstalledSkillInfo> =>
  request(`/skill-store/${id}/enable`, { method: 'POST' });
export const disableInstalledSkill = (id: string): Promise<InstalledSkillInfo> =>
  request(`/skill-store/${id}/disable`, { method: 'POST' });

// ─── Update ──────────────────────────────────────────────────────────────────

export interface UpdateStatus {
  current_version: string;
  available_version: string | null;
}

export interface UpdateResult {
  success: boolean;
  message: string;
}

export const getUpdateStatus = (): Promise<UpdateStatus> => request('/update/status');
export const applyUpdate = (): Promise<UpdateResult> => request('/update/apply', { method: 'POST' });
export const rollbackUpdate = (): Promise<UpdateResult> => request('/update/rollback', { method: 'POST' });

// ─── Butler chat history ─────────────────────────────────────────────────────

export interface ButlerMessageOut {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ButlerConversation {
  id: string;
  created_at: string;
  updated_at: string;
  messages: ButlerMessageOut[];
}

export const getButlerHistory = (): Promise<ButlerConversation | null> =>
  request('/butler/conversations/latest');

// ─── Logs ────────────────────────────────────────────────────────────────────

export interface LogEntry {
  ts: string;
  level: string;
  logger: string;
  message: string;
}

export const getLogs = (
  limit = 200,
  level?: string,
  loggerName?: string,
): Promise<LogEntry[]> => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (level) params.set('level', level);
  if (loggerName) params.set('logger', loggerName);
  return request(`/logs?${params}`);
};

// ─── Butler chat ─────────────────────────────────────────────────────────────
// The butler WebSocket streams these lightweight job snapshots (no file content).

export interface ButlerJobPlanChange {
  path: string;
  action: 'create' | 'modify' | 'delete';
}

export interface ButlerJobPlan {
  changes: ButlerJobPlanChange[];
  commit_message: string;
}

export interface ButlerJob {
  id: string;
  status: string;
  mode: string;
  instruction: string;
  provider: string;
  model: string;
  plan: ButlerJobPlan | null;
  error: string | null;
  commit_sha: string | null;
  pr_url: string | null;
  pr_number: number | null;
  created_at: string;
  completed_at: string | null;
}
