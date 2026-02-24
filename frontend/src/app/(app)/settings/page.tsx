'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AppSettings,
  cancelModifyJob,
  confirmModifyJob,
  disconnectGithub,
  FileChangeOut,
  getAppSettings,
  getGithubAuthorizeUrl,
  getGithubStatus,
  getModifyJob,
  GithubStatus,
  ModifyJob,
  startModifyJob,
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

  if (!cfg) return <p className="text-sm text-gray-400">Loading…</p>;

  const field = (key: keyof AppSettings, label: string, placeholder = '', secret = false) => (
    <div key={key}>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      <input
        type={secret ? 'password' : 'text'}
        value={form[key] ?? ''}
        onChange={(e) => set(key, e.target.value)}
        placeholder={isMasked(cfg[key]) ? '(already set — type to replace)' : placeholder}
        className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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

// ── Self-modification section ─────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set(['done', 'failed', 'cancelled']);

function PlanPreview({ changes }: { changes: FileChangeOut[] }) {
  const actionColor = (a: string) =>
    a === 'create' ? 'text-green-700' : a === 'delete' ? 'text-red-600' : 'text-yellow-700';
  const actionLabel = (a: string) =>
    a === 'create' ? '+ create' : a === 'delete' ? '− delete' : '~ modify';

  return (
    <ul className="mt-2 space-y-1 rounded border border-gray-200 bg-gray-50 p-3 font-mono text-xs">
      {changes.map((c, i) => (
        <li key={i} className="flex items-center gap-2">
          <span className={`w-14 shrink-0 font-semibold ${actionColor(c.action)}`}>
            {actionLabel(c.action)}
          </span>
          <span className="truncate text-gray-700">{c.path}</span>
        </li>
      ))}
    </ul>
  );
}

function SelfModifySection() {
  const [instruction, setInstruction] = useState('');
  const [mode, setMode] = useState<'local' | 'repo'>('local');
  const [provider, setProvider] = useState('anthropic');
  const [model, setModel] = useState('claude-sonnet-4-6');
  const [job, setJob] = useState<ModifyJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll job status until terminal
  useEffect(() => {
    if (!job || TERMINAL_STATUSES.has(job.status)) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const updated = await getModifyJob(job.id);
        setJob(updated);
      } catch {
        /* ignore transient errors */
      }
    }, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [job?.id, job?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    if (!instruction.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const j = await startModifyJob(instruction, mode, provider, model);
      setJob(j);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start job.');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirm() {
    if (!job) return;
    try {
      const updated = await confirmModifyJob(job.id);
      setJob(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to confirm.');
    }
  }

  async function cancel() {
    if (!job) return;
    try {
      const updated = await cancelModifyJob(job.id);
      setJob(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to cancel.');
    }
  }

  function reset() {
    setJob(null);
    setInstruction('');
    setError(null);
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending: 'bg-gray-100 text-gray-700',
      planning: 'bg-blue-100 text-blue-700',
      planned: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-blue-100 text-blue-700',
      applying: 'bg-blue-100 text-blue-700',
      committing: 'bg-blue-100 text-blue-700',
      pushing: 'bg-blue-100 text-blue-700',
      restarting: 'bg-orange-100 text-orange-700',
      done: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-700',
      cancelled: 'bg-gray-100 text-gray-500',
    };
    return map[s] ?? 'bg-gray-100 text-gray-700';
  };

  return (
    <section className="rounded-lg border border-gray-200 p-6">
      <h2 className="mb-1 text-base font-semibold">Self-Modification</h2>
      <p className="mb-4 text-sm text-gray-500">
        Describe a change and Virtual Butler will generate, preview, and optionally apply it to its
        own codebase using AI.
      </p>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {/* ── Input form (shown when no active job) ── */}
      {!job && (
        <div className="space-y-4">
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={4}
            placeholder="e.g. Add rate-limiting middleware to the FastAPI backend (10 req/min per user)"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="flex flex-wrap items-end gap-4">
            {/* Mode */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as 'local' | 'repo')}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="local">local — apply to this instance + restart</option>
                <option value="repo">repo — push to GitHub (owner only)</option>
              </select>
            </div>

            {/* Provider */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Provider</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="google">Google</option>
                <option value="ollama">Ollama</option>
              </select>
            </div>

            {/* Model */}
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-600">Model</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>

            <button
              onClick={submit}
              disabled={submitting || !instruction.trim()}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Generate plan'}
            </button>
          </div>
        </div>
      )}

      {/* ── Active job ── */}
      {job && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold ${statusBadge(job.status)}`}
            >
              {job.status}
            </span>
            <span className="text-xs text-gray-500">
              {job.mode} mode · {job.provider} / {job.model}
            </span>
          </div>

          <p className="rounded bg-gray-50 px-3 py-2 text-sm italic text-gray-700">
            &ldquo;{job.instruction}&rdquo;
          </p>

          {/* Spinner for in-progress states */}
          {!TERMINAL_STATUSES.has(job.status) && job.status !== 'planned' && (
            <p className="text-sm text-gray-500">
              {job.status === 'planning' && 'AI is generating the plan…'}
              {job.status === 'confirmed' && 'Preparing to apply…'}
              {job.status === 'applying' && 'Writing files to disk…'}
              {job.status === 'committing' && 'Committing changes…'}
              {job.status === 'pushing' && 'Pushing to GitHub…'}
              {job.status === 'restarting' && 'Triggering application restart…'}
            </p>
          )}

          {/* Plan preview + confirm / cancel */}
          {job.status === 'planned' && job.plan && (
            <div>
              <p className="text-sm font-medium text-gray-700">
                Proposed changes ({job.plan.changes.length} file
                {job.plan.changes.length !== 1 ? 's' : ''}):
              </p>
              <PlanPreview changes={job.plan.changes} />
              <p className="mt-2 text-xs text-gray-500">
                Commit message: <em>{job.plan.commit_message}</em>
              </p>
              <div className="mt-3 flex gap-3">
                <button
                  onClick={confirm}
                  className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  Apply changes
                </button>
                <button
                  onClick={cancel}
                  className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Done */}
          {job.status === 'done' && (
            <div className="rounded bg-green-50 p-3 text-sm text-green-800">
              Changes applied successfully.
              {job.commit_sha && (
                <span className="ml-2 font-mono text-xs text-green-700">
                  sha: {job.commit_sha.slice(0, 7)}
                </span>
              )}
            </div>
          )}

          {/* Failed */}
          {job.status === 'failed' && (
            <div className="rounded bg-red-50 p-3 text-sm text-red-700">
              <strong>Error:</strong> {job.error ?? 'Unknown error.'}
            </div>
          )}

          {/* Start again */}
          {TERMINAL_STATUSES.has(job.status) && (
            <button
              onClick={reset}
              className="text-sm text-blue-600 underline hover:text-blue-800"
            >
              Start a new modification
            </button>
          )}
        </div>
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
      <SelfModifySection />
    </div>
  );
}
