'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { exchangeGithubCode } from '@/lib/api';
import { getToken } from '@/lib/auth';

/**
 * GitHub OAuth callback handler.
 *
 * GitHub redirects here after the user authorizes the OAuth app:
 *   http://localhost:3000/github/callback?code=<code>&state=<state>
 *
 * This page:
 *  1. Reads code + state from URL params
 *  2. Validates state against the value stored in localStorage
 *  3. Calls the backend /self/github/exchange endpoint (requires JWT)
 *  4. Redirects to /settings on success
 */
function GithubCallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [message, setMessage] = useState('Completing GitHub connection…');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get('code');
    const state = params.get('state');
    const storedState = localStorage.getItem('gh_oauth_state');

    if (!code || !state) {
      setError('Missing code or state in callback URL.');
      return;
    }
    if (state !== storedState) {
      setError('OAuth state mismatch — possible CSRF attack. Please try again.');
      return;
    }
    if (!getToken()) {
      setError('You must be logged in to connect GitHub. Please log in and try again.');
      return;
    }

    localStorage.removeItem('gh_oauth_state');

    exchangeGithubCode(code, state)
      .then((status) => {
        setMessage(
          status.is_repo_owner
            ? `Connected as @${status.login} (repo owner). Redirecting…`
            : `Connected as @${status.login}. Redirecting…`,
        );
        setTimeout(() => router.replace('/settings'), 1200);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'GitHub connection failed.');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
        {error ? (
          <>
            <p className="mb-4 text-sm font-medium text-red-600">{error}</p>
            <a href="/settings" className="text-sm text-green-600 underline">
              Back to settings
            </a>
          </>
        ) : (
          <p className="text-sm text-gray-600">{message}</p>
        )}
      </div>
    </div>
  );
}

export default function GithubCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <p className="text-sm text-gray-600">Loading…</p>
        </div>
      }
    >
      <GithubCallbackInner />
    </Suspense>
  );
}
