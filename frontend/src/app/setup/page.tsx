'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSetupStatus, runSetup } from '@/lib/api';
import { setToken } from '@/lib/auth';
import { useAuthStore } from '@/store/auth';

type Step = 'account' | 'config' | 'done';

interface FormData {
  email: string;
  password: string;
  confirmPassword: string;
  anthropic_api_key: string;
  openai_api_key: string;
  google_api_key: string;
  github_client_id: string;
  github_client_secret: string;
  github_callback_url: string;
  github_repo_owner: string;
  github_repo_name: string;
}

const DEFAULT_FORM: FormData = {
  email: '',
  password: '',
  confirmPassword: '',
  anthropic_api_key: '',
  openai_api_key: '',
  google_api_key: '',
  github_client_id: '',
  github_client_secret: '',
  github_callback_url: 'http://localhost:3000/github/callback',
  github_repo_owner: '',
  github_repo_name: '',
};

export default function SetupPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [step, setStep] = useState<Step>('account');
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Redirect away if setup already done
  useEffect(() => {
    getSetupStatus()
      .then(({ setup_required }) => {
        if (!setup_required) router.replace('/login');
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  function set(field: keyof FormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function nextStep() {
    setError(null);
    if (step === 'account') {
      if (!form.email) return setError('Email is required.');
      if (form.password.length < 8) return setError('Password must be at least 8 characters.');
      if (form.password !== form.confirmPassword) return setError('Passwords do not match.');
      setStep('config');
    }
  }

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const settings: Record<string, string> = {};
      for (const k of [
        'anthropic_api_key',
        'openai_api_key',
        'google_api_key',
        'github_client_id',
        'github_client_secret',
        'github_callback_url',
        'github_repo_owner',
        'github_repo_name',
      ] as (keyof FormData)[]) {
        if (form[k]) settings[k] = form[k];
      }

      const { access_token, refresh_token } = await runSetup(form.email, form.password, settings);
      setToken(access_token);
      login(access_token, refresh_token);
      setStep('done');
      setTimeout(() => router.replace('/dashboard'), 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Setup failed.');
    } finally {
      setLoading(false);
    }
  }

  if (checking) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">Personal Assistant</h1>
          <p className="mt-2 text-sm text-gray-500">First-time setup — create your admin account</p>
        </div>

        {/* Step indicator */}
        <div className="mb-6 flex items-center gap-2">
          {(['account', 'config'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className="h-px w-8 bg-gray-200" />}
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  step === s
                    ? 'bg-green-600 text-white'
                    : (step === 'config' && s === 'account') || step === 'done'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-400'
                }`}
              >
                {(step === 'config' && s === 'account') || step === 'done' ? '✓' : i + 1}
              </div>
              <span className={`text-xs ${step === s ? 'font-medium text-gray-800' : 'text-gray-400'}`}>
                {s === 'account' ? 'Admin account' : 'Configuration'}
              </span>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          {error && (
            <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* ── Step 1: account ── */}
          {step === 'account' && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  autoFocus
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="admin@example.com"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Minimum 8 characters"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Confirm password</label>
                <input
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e) => set('confirmPassword', e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && nextStep()}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <button
                onClick={nextStep}
                className="mt-2 w-full rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
              >
                Continue
              </button>
            </div>
          )}

          {/* ── Step 2: optional config ── */}
          {step === 'config' && (
            <div className="space-y-6">
              {/* AI providers */}
              <div>
                <h2 className="mb-3 text-sm font-semibold text-gray-700">AI Provider Keys</h2>
                <p className="mb-3 text-xs text-gray-500">
                  Optional — can also be configured later in Settings or set per-ability.
                </p>
                <div className="space-y-3">
                  {[
                    { key: 'anthropic_api_key', label: 'Anthropic API key' },
                    { key: 'openai_api_key', label: 'OpenAI API key' },
                    { key: 'google_api_key', label: 'Google Gemini API key' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
                      <input
                        type="password"
                        value={form[key as keyof FormData]}
                        onChange={(e) => set(key as keyof FormData, e.target.value)}
                        className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        placeholder="sk-…"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* GitHub OAuth */}
              <div>
                <h2 className="mb-3 text-sm font-semibold text-gray-700">GitHub OAuth App</h2>
                <p className="mb-3 text-xs text-gray-500">
                  Optional — required to connect GitHub accounts and use{' '}
                  <strong>repo mode</strong> for self-modification.{' '}
                  <span className="text-gray-400">
                    Create an app at github.com/settings/developers.
                  </span>
                </p>
                <div className="space-y-3">
                  {[
                    { key: 'github_client_id', label: 'Client ID', placeholder: 'Ov23li…' },
                    { key: 'github_client_secret', label: 'Client Secret', placeholder: '' },
                    {
                      key: 'github_callback_url',
                      label: 'Callback URL',
                      placeholder: 'http://localhost:3000/github/callback',
                    },
                    { key: 'github_repo_owner', label: 'Repo owner (username)', placeholder: 'raphyduck' },
                    { key: 'github_repo_name', label: 'Repo name', placeholder: 'virtual_butler' },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
                      <input
                        type={key === 'github_client_secret' ? 'password' : 'text'}
                        value={form[key as keyof FormData]}
                        onChange={(e) => set(key as keyof FormData, e.target.value)}
                        className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        placeholder={placeholder}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep('account')}
                  className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={submit}
                  disabled={loading}
                  className="flex-1 rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {loading ? 'Setting up…' : 'Finish setup'}
                </button>
              </div>
              <p className="text-center text-xs text-gray-400">
                You can skip configuration and set everything later in Settings.
              </p>
            </div>
          )}

          {/* ── Done ── */}
          {step === 'done' && (
            <div className="py-4 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <span className="text-2xl">✓</span>
              </div>
              <p className="font-semibold text-gray-800">Setup complete!</p>
              <p className="mt-1 text-sm text-gray-500">Redirecting to your dashboard…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
