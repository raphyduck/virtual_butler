'use client';

import { useEffect, useState } from 'react';
import {
  type Skill,
  type SkillInstallResponse,
  listSkills,
  installSkill,
  enableSkill,
  disableSkill,
  uninstallSkill,
} from '@/lib/api';

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Install form
  const [repoUrl, setRepoUrl] = useState('');
  const [version, setVersion] = useState('latest');
  const [installing, setInstalling] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  async function fetchSkills() {
    setLoading(true);
    try {
      const data = await listSkills();
      setSkills(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSkills();
  }, []);

  async function handleInstall() {
    if (!repoUrl.trim()) return;
    setInstalling(true);
    setError(null);
    setWarnings([]);
    try {
      const resp: SkillInstallResponse = await installSkill(repoUrl.trim(), version || 'latest');
      setWarnings(resp.warnings);
      setRepoUrl('');
      setVersion('latest');
      await fetchSkills();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Install failed');
    } finally {
      setInstalling(false);
    }
  }

  async function handleToggle(skill: Skill) {
    setError(null);
    try {
      const updated = skill.enabled ? await disableSkill(skill.id) : await enableSkill(skill.id);
      setSkills((prev) => prev.map((s) => (s.id === skill.id ? updated : s)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Toggle failed');
    }
  }

  async function handleUninstall(id: string) {
    if (!confirm('Uninstall this skill? This will remove its files.')) return;
    setError(null);
    try {
      await uninstallSkill(id);
      setSkills((prev) => prev.filter((s) => s.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Uninstall failed');
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Loading skills...</p>;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Skills</h1>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {warnings.length > 0 && (
        <div className="space-y-1 rounded-lg bg-yellow-50 px-4 py-3">
          {warnings.map((w, i) => (
            <p key={i} className="text-sm text-yellow-800">{w}</p>
          ))}
        </div>
      )}

      {/* Install new skill */}
      <section className="rounded-lg border border-gray-200 p-6">
        <h2 className="mb-2 text-base font-semibold">Install a Skill</h2>
        <p className="mb-4 text-sm text-gray-500">
          Enter a git repository URL containing a <code className="rounded bg-gray-100 px-1 text-xs">skill.json</code> manifest.
          The Butler will guide you through any required secrets or dependencies.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-600">Repository URL</label>
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/user/my-skill.git"
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="w-32">
            <label className="mb-1 block text-xs font-medium text-gray-600">Version</label>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="latest"
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <button
            onClick={handleInstall}
            disabled={installing || !repoUrl.trim()}
            className="rounded bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {installing ? 'Installing...' : 'Install'}
          </button>
        </div>
      </section>

      {/* Installed skills list */}
      <section>
        <h2 className="mb-4 text-base font-semibold">Installed Skills</h2>
        {skills.length === 0 ? (
          <div className="rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-gray-500">No skills installed yet.</p>
            <p className="mt-1 text-xs text-gray-400">
              Install your first skill using the form above, or ask the Butler for recommendations.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {skills.map((skill) => (
              <li key={skill.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">{skill.name}</h3>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono text-gray-500">
                        {skill.version}
                      </span>
                      {skill.enabled ? (
                        <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                          enabled
                        </span>
                      ) : (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                          disabled
                        </span>
                      )}
                      {skill.requires_rebuild && (
                        <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-700">
                          needs rebuild
                        </span>
                      )}
                    </div>
                    {skill.description && (
                      <p className="mt-1 text-sm text-gray-500">{skill.description}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-400 font-mono">{skill.repo_url}</p>

                    {/* Dependencies info */}
                    {(skill.requires_secrets.length > 0 ||
                      skill.requires_packages.length > 0 ||
                      skill.requires_system_packages.length > 0) && (
                      <div className="mt-2 space-y-1">
                        {skill.requires_secrets.length > 0 && (
                          <p className="text-xs text-gray-500">
                            <span className="font-medium">Secrets:</span>{' '}
                            {skill.requires_secrets.join(', ')}
                          </p>
                        )}
                        {skill.requires_packages.length > 0 && (
                          <p className="text-xs text-gray-500">
                            <span className="font-medium">Packages:</span>{' '}
                            {skill.requires_packages.join(', ')}
                          </p>
                        )}
                        {skill.requires_system_packages.length > 0 && (
                          <p className="text-xs text-yellow-600">
                            <span className="font-medium">System deps:</span>{' '}
                            {skill.requires_system_packages.join(', ')} (requires Docker rebuild)
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleToggle(skill)}
                      className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
                    >
                      {skill.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => handleUninstall(skill.id)}
                      className="rounded border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Uninstall
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Info box */}
      <section className="rounded-lg border border-gray-100 bg-gray-50 p-6">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">About Skills</h2>
        <ul className="list-disc space-y-1 pl-5 text-xs text-gray-500">
          <li>Skills extend the platform with new capabilities.</li>
          <li>Each skill is a git repo with a <code>skill.json</code> manifest.</li>
          <li>Python-only skills install without rebuilding Docker images.</li>
          <li>Skills requiring system packages (apt) need a release to embed deps in the image.</li>
          <li>Required secrets must be configured in Settings before the skill can run.</li>
        </ul>
      </section>
    </div>
  );
}
