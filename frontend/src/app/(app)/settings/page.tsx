'use client';

import { useEffect, useState } from 'react';
import {
  AppSettings,
  disconnectGithub,
  getAppSettings,
  getGithubAuthorizeUrl,
  getGithubStatus,
  GithubStatus,
  updateAppSettings,
} from '@/lib/api';

// ── Application configuration section ────────────────────────────────────────

const MASKED = '***';

function isMasked(v: string | null) {
  return v === MASKED;
}

function AppConfigSection() {
  const [cfg, setCfg] = useState<AppSettings | null>(null);
  const [form, setForm] = useState<Partial<AppSettings>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAppSettings()
      .then((data) => {
        setCfg(data);
        setForm(data);
      })
      .catch(() => setError('Could not load settings.'));
  }, []);

  function set(key: keyof AppSettings, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Only send fields that changed and are not the masked placeholder
      const patch: Partial<AppSettings> = {};
      for (const k of Object.keys(form) as (keyof AppSettings)[]) {
        const v = form[k];
        if (v && !isMasked(v) && v !== cfg?.[k]) {
          (patch as Record<string, string>)[k] = v;
        }
      }
      if (Object.keys(patch).length === 0) {
        setSaved(true);
        return;
      }
      const updated = await updateAppSettings(patch);
      setCfg(updated);
      setForm(updated);
      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) {
    return error
      ? <p className="text-sm text-red-600">{error}</p>
      : <p className="text-sm text-gray-400">Loading…</p>;
  }

  const field = (key: keyof AppSettings, label: string, placeholder = '', secret = false) => (
    <div key={key}>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      <input
        type={secret ? 'password' : 'text'}
        value={form[key] ?? ''}
        onChange={(e) => set(key, e.target.value)}
        placeholder={isMasked(cfg[key]) ? '(already set — type to replace)' : placeholder}
        className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
      />
    </div>
  );

  return (
    <section className="rounded-lg border border-gray-200 p-6">
      <h2 className="mb-1 text-base font-semibold">Application Configuration</h2>
      <p className="mb-4 text-sm text-gray-500">
        API keys and OAuth credentials are stored in the database and take priority over environment variables.
        Secret values are never returned in full — type a new value to replace.
      </p>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="space-y-6">
        {/* AI providers */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-700">AI Provider Keys</h3>
          <div className="space-y-3">
            {field('anthropic_api_key', 'Anthropic API key', 'sk-ant-…', true)}
            {field('openai_api_key', 'OpenAI API key', 'sk-…', true)}
            {field('google_api_key', 'Google Gemini API key', '', true)}
          </div>
        </div>

        {/* Butler Assistant */}
        <div>
          <h3 className="mb-1 text-sm font-semibold text-gray-700">Butler Assistant</h3>
          <p className="mb-3 text-xs text-gray-500">
            AI provider and model used by the floating butler chat widget.
            Defaults to Anthropic / claude-sonnet-4-6 if not set.
          </p>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Provider</label>
              <select
                value={form['butler_provider'] ?? ''}
                onChange={(e) => { set('butler_provider', e.target.value); }}
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">— use default (anthropic) —</option>
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="google">Google</option>
                <option value="ollama">Ollama</option>
              </select>
            </div>
            {field('butler_model', 'Model', 'claude-sonnet-4-6')}
          </div>
        </div>

        {/* GitHub OAuth App */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-700">GitHub OAuth App</h3>
          <p className="mb-3 text-xs text-gray-500">
            Required to connect GitHub accounts and enable repo mode.
          </p>
          <div className="space-y-3">
            {field('github_client_id', 'Client ID', 'Ov23li…')}
            {field('github_client_secret', 'Client Secret', '', true)}
            {field('github_callback_url', 'Callback URL', 'http://localhost:3000/github/callback')}
            {field('github_repo_owner', 'Repo owner', 'raphyduck')}
            {field('github_repo_name', 'Repo name', 'virtual_butler')}
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {saved && <span className="text-sm text-green-600">Saved.</span>}
      </div>
    </section>
  );
}

// ── GitHub section ────────────────────────────────────────────────────────────

function GithubSection() {
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getGithubStatus()
      .then(setStatus)
      .catch(() => setStatus({ connected: false, login: null, is_repo_owner: false }));
  }, []);

  async function connect() {
    setLoading(true);
    setError(null);
    try {
      const { url, state } = await getGithubAuthorizeUrl();
      localStorage.setItem('gh_oauth_state', state);
      window.location.href = url;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start GitHub OAuth.');
      setLoading(false);
    }
  }

  async function disconnect() {
    setLoading(true);
    setError(null);
    try {
      await disconnectGithub();
      setStatus({ connected: false, login: null, is_repo_owner: false });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to disconnect.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 p-6">
      <h2 className="mb-1 text-base font-semibold">GitHub Connection</h2>
      <p className="mb-4 text-sm text-gray-500">
        Connect your GitHub account to enable <strong>repo mode</strong> — modifications are pushed
        directly to the upstream repository (repo owner only).
      </p>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {status === null ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : status.connected ? (
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <span className="font-medium text-green-700">@{status.login}</span>
            {status.is_repo_owner && (
              <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                repo owner
              </span>
            )}
          </div>
          <button
            onClick={disconnect}
            disabled={loading}
            className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          onClick={connect}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {loading ? 'Redirecting…' : 'Connect GitHub'}
        </button>
      )}
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>
      <AppConfigSection />
      <GithubSection />
    </div>
  );
}
