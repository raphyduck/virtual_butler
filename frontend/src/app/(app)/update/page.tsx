'use client';

import { useEffect, useState } from 'react';
import {
  type UpdateStatus,
  type UpdateApplyResponse,
  type UpdateRollbackResponse,
  getUpdateStatus,
  applyUpdate,
  rollbackUpdate,
} from '@/lib/api';

export default function UpdatePage() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetVersion, setTargetVersion] = useState('');
  const [applying, setApplying] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function fetchStatus() {
    setLoading(true);
    setError(null);
    try {
      const s = await getUpdateStatus();
      setStatus(s);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load update status');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStatus();
  }, []);

  async function handleApply() {
    if (!targetVersion.trim()) return;
    setApplying(true);
    setError(null);
    setResult(null);
    try {
      const resp: UpdateApplyResponse = await applyUpdate(targetVersion.trim());
      setResult(resp.message);
      await fetchStatus();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setApplying(false);
    }
  }

  async function handleRollback() {
    setRollingBack(true);
    setError(null);
    setResult(null);
    try {
      const resp: UpdateRollbackResponse = await rollbackUpdate();
      setResult(resp.message);
      await fetchStatus();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Rollback failed');
    } finally {
      setRollingBack(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Loading update status...</p>;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Platform Update</h1>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {result && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{result}</div>
      )}

      {/* Current version info */}
      <section className="rounded-lg border border-gray-200 p-6">
        <h2 className="mb-4 text-base font-semibold">Current Version</h2>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-700">Version:</span>
            <span className="rounded bg-green-100 px-2 py-0.5 font-mono text-green-800">
              {status?.current_version ?? 'unknown'}
            </span>
          </div>
          {status?.previous_version && (
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-700">Previous:</span>
              <span className="font-mono text-gray-500">{status.previous_version}</span>
            </div>
          )}
          {status?.build_date && (
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-700">Build date:</span>
              <span className="text-gray-500">{status.build_date}</span>
            </div>
          )}
          {!status?.available && (
            <p className="mt-2 text-xs text-gray-400">
              Production compose environment not detected. Update and rollback are only
              available when deployed via docker-compose.prod.yml.
            </p>
          )}
        </div>
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="mt-4 rounded border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? 'Checking...' : 'Check status'}
        </button>
      </section>

      {/* Update to a new version */}
      {status?.available && (
        <section className="rounded-lg border border-gray-200 p-6">
          <h2 className="mb-2 text-base font-semibold">Update to New Version</h2>
          <p className="mb-4 text-sm text-gray-500">
            Enter a release tag (e.g. <code className="rounded bg-gray-100 px-1 text-xs">v0.3.2</code>)
            to pull the corresponding Docker images and restart services.
          </p>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Target version
              </label>
              <input
                type="text"
                value={targetVersion}
                onChange={(e) => setTargetVersion(e.target.value)}
                placeholder="v0.3.2"
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <button
              onClick={handleApply}
              disabled={applying || !targetVersion.trim()}
              className="rounded bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {applying ? 'Updating...' : 'Apply update'}
            </button>
          </div>
        </section>
      )}

      {/* Rollback */}
      {status?.available && status?.previous_version && (
        <section className="rounded-lg border border-gray-200 p-6">
          <h2 className="mb-2 text-base font-semibold">Rollback</h2>
          <p className="mb-4 text-sm text-gray-500">
            Roll back to the previous version{' '}
            <code className="rounded bg-gray-100 px-1 text-xs">{status.previous_version}</code>.
          </p>
          <button
            onClick={handleRollback}
            disabled={rollingBack}
            className="rounded border border-red-300 px-4 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {rollingBack ? 'Rolling back...' : `Rollback to ${status.previous_version}`}
          </button>
        </section>
      )}

      {/* How it works */}
      <section className="rounded-lg border border-gray-100 bg-gray-50 p-6">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">How updates work</h2>
        <ol className="list-decimal space-y-1 pl-5 text-xs text-gray-500">
          <li>Code changes are committed and merged to main via Pull Requests.</li>
          <li>A GitHub release is created with a semver tag (e.g. v0.3.2).</li>
          <li>GitHub Actions automatically builds and publishes Docker images to GHCR.</li>
          <li>Enter the tag here and click &quot;Apply update&quot; to pull new images and restart.</li>
          <li>If something goes wrong, use &quot;Rollback&quot; to return to the previous version.</li>
        </ol>
      </section>
    </div>
  );
}
