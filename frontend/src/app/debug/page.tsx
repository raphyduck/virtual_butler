// Server Component — no 'use client', runs at request time on the Next.js server.
// Visit /debug to see this page. Useful for diagnosing routing and API issues.

async function checkBackend(url: string): Promise<{ ok: boolean; status?: number; body?: string; error?: string }> {
  try {
    const res = await fetch(`${url}/api/v1/setup/status`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export const dynamic = 'force-dynamic';

export default async function DebugPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '(not set)';
  const backendInternalUrl = process.env.BACKEND_INTERNAL_URL ?? '(not set — rewrite fell back to NEXT_PUBLIC_API_URL or http://localhost:8000)';
  const nodeEnv = process.env.NODE_ENV ?? '(not set)';
  const port = process.env.PORT ?? '(not set)';
  const hostname = process.env.HOSTNAME ?? '(not set)';

  // Test the URL the Next.js rewrite proxy actually uses: BACKEND_INTERNAL_URL.
  // This is baked into routes-manifest.json at build time via next.config.mjs.
  const rewriteTarget = process.env.BACKEND_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
  const rewriteCheck = await checkBackend(rewriteTarget);

  // Also try the Docker-internal service name as a sanity check.
  const internalCheck = await checkBackend('http://backend:8000');

  return (
    <main style={{ fontFamily: 'monospace', padding: '2rem', maxWidth: '900px' }}>
      <h1 style={{ borderBottom: '2px solid #333', paddingBottom: '0.5rem' }}>
        Virtual Butler — Debug Page
      </h1>

      <section>
        <h2>Environment</h2>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {[
              ['NODE_ENV', nodeEnv],
              ['PORT', port],
              ['HOSTNAME', hostname],
              ['NEXT_PUBLIC_API_URL', apiUrl],
              ['BACKEND_INTERNAL_URL', backendInternalUrl],
            ].map(([k, v]) => (
              <tr key={k} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '0.4rem 1rem 0.4rem 0', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{k}</td>
                <td style={{ padding: '0.4rem 0', color: '#555' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Backend connectivity (from Next.js server process)</h2>

        <h3>
          Via rewrite target — BACKEND_INTERNAL_URL ({rewriteTarget})
          {' '}
          {rewriteCheck.ok ? '✅' : '❌'}
        </h3>
        <pre style={{ background: '#f4f4f4', padding: '1rem', overflowX: 'auto' }}>
          {rewriteCheck.ok
            ? `HTTP ${rewriteCheck.status}\n${rewriteCheck.body}`
            : `Error: ${rewriteCheck.error ?? `HTTP ${rewriteCheck.status} — ${rewriteCheck.body}`}`}
        </pre>

        <h3>
          Via Docker internal URL (http://backend:8000)
          {' '}
          {internalCheck.ok ? '✅' : '❌'}
        </h3>
        <pre style={{ background: '#f4f4f4', padding: '1rem', overflowX: 'auto' }}>
          {internalCheck.ok
            ? `HTTP ${internalCheck.status}\n${internalCheck.body}`
            : `Error: ${internalCheck.error ?? `HTTP ${internalCheck.status} — ${internalCheck.body}`}`}
        </pre>

        <p style={{ marginTop: '1rem', color: '#666', fontSize: '0.9rem' }}>
          <strong>What this means:</strong> All <code>/api/*</code> requests from
          the browser hit the Next.js server, which rewrites them to{' '}
          <code>BACKEND_INTERNAL_URL</code> (set at image build time via a Dockerfile{' '}
          <code>ARG</code>). In Docker this is <code>http://backend:8000</code>.{' '}
          <code>NEXT_PUBLIC_API_URL</code> is only used by the browser for WebSocket
          connections and direct links — it is <em>not</em> the rewrite target.
          Both checks above should show ✅ for the app to function correctly.
        </p>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Routing check</h2>
        <p>
          This page is rendered as a <strong>server component</strong> (no{' '}
          <code>&apos;use client&apos;</code>). If you can see it, server-side
          rendering and routing are working correctly.
        </p>
        <ul>
          <li>
            <a href="/">/ (root — client redirect)</a>
          </li>
          <li>
            <a href="/login">/login</a>
          </li>
          <li>
            <a href="/setup">/setup</a>
          </li>
          <li>
            <a href="/dashboard">/dashboard</a>
          </li>
        </ul>
      </section>
    </main>
  );
}
