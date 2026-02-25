'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSetupStatus } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, init } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    getSetupStatus()
      .then(({ setup_required }) => {
        if (setup_required) {
          router.replace('/setup');
        } else if (isAuthenticated) {
          router.replace('/dashboard');
        } else {
          router.replace('/login');
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[/] getSetupStatus failed:', msg);
        setError(msg);
        if (isAuthenticated) {
          router.replace('/dashboard');
        } else {
          router.replace('/login');
        }
      });
  }, [isAuthenticated, router]);

  if (error) {
    return (
      <div style={{ fontFamily: 'monospace', padding: '2rem', color: '#c00' }}>
        <strong>Backend unreachable — redirecting…</strong>
        <pre style={{ marginTop: '1rem', background: '#fff0f0', padding: '1rem' }}>{error}</pre>
        <p>
          Visit <a href="/debug">/debug</a> for diagnostics.
        </p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'monospace', padding: '2rem', color: '#555' }}>
      Loading…
    </div>
  );
}
