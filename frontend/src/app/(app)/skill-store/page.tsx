'use client';

import { useEffect, useState } from 'react';
import {
  type InstalledSkillInfo,
  type SkillManifest,
  disableInstalledSkill,
  enableInstalledSkill,
  getAvailableSkills,
  getInstalledSkills,
  installSkillFromStore,
} from '@/lib/api';

export default function SkillStorePage() {
  const [available, setAvailable] = useState<SkillManifest[]>([]);
  const [installed, setInstalled] = useState<InstalledSkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getAvailableSkills(), getInstalledSkills()])
      .then(([avail, inst]) => {
        setAvailable(avail);
        setInstalled(inst);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const installedNames = new Set(installed.map((s) => s.name));

  async function handleInstall(manifest: SkillManifest) {
    if (!manifest._dir) return;
    setWorking(manifest.name);
    setError(null);
    try {
      const skill = await installSkillFromStore(manifest._dir);
      setInstalled((prev) => [...prev, skill]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Install failed');
    } finally {
      setWorking(null);
    }
  }

  async function handleToggle(skill: InstalledSkillInfo) {
    setWorking(skill.id);
    setError(null);
    try {
      const updated = skill.enabled
        ? await disableInstalledSkill(skill.id)
        : await enableInstalledSkill(skill.id);
      setInstalled((prev) => prev.map((s) => (s.id === skill.id ? updated : s)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Toggle failed');
    } finally {
      setWorking(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Loading skills…</p>;
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Skill Store</h1>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* ── Installed Skills ────────────────────────────────────────────── */}
      {installed.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
            Installed
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {installed.map((s) => (
              <li key={s.id} className="card flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-gray-900">{s.name}</h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      s.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {s.enabled ? 'enabled' : 'disabled'}
                  </span>
                </div>
                {s.description && (
                  <p className="text-sm text-gray-500">{s.description}</p>
                )}
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>v{s.version}</span>
                  <span>·</span>
                  <span>{s.directory}</span>
                </div>
                <button
                  onClick={() => handleToggle(s)}
                  disabled={working === s.id}
                  className={`mt-1 self-start rounded px-3 py-1 text-xs font-medium ${
                    s.enabled
                      ? 'border border-gray-300 hover:bg-gray-50'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  } disabled:opacity-50`}
                >
                  {working === s.id ? 'Working…' : s.enabled ? 'Disable' : 'Enable'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Available (not yet installed) ─────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
          Available to install
        </h2>
        {available.filter((m) => !installedNames.has(m.name)).length === 0 ? (
          <p className="text-sm text-gray-400">
            {available.length === 0
              ? 'No skills found in the skills/ directory.'
              : 'All available skills are already installed.'}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {available
              .filter((m) => !installedNames.has(m.name))
              .map((m) => (
                <li key={m.name} className="card flex flex-col gap-2">
                  <h3 className="font-medium text-gray-900">{m.name}</h3>
                  {m.description && (
                    <p className="text-sm text-gray-500">{m.description}</p>
                  )}
                  {m.version && (
                    <p className="text-xs text-gray-400">v{m.version}</p>
                  )}

                  {/* Prerequisites */}
                  {m.requires?.secrets && m.requires.secrets.length > 0 && (
                    <div className="rounded bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                      <p className="font-medium">Required secrets:</p>
                      <ul className="mt-1 list-disc pl-4">
                        {m.requires.secrets.map((s) => (
                          <li key={s} className="font-mono">{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {m.permissions && (
                    <div className="flex flex-wrap gap-1.5 text-[10px]">
                      {Object.entries(m.permissions).map(([k, v]) => (
                        <span
                          key={k}
                          className={`rounded-full px-2 py-0.5 ${
                            v ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {k}: {v ? 'yes' : 'no'}
                        </span>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => handleInstall(m)}
                    disabled={working === m.name}
                    className="mt-1 self-start rounded bg-brand-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {working === m.name ? 'Installing…' : 'Install'}
                  </button>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}
