'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { type Ability, createSession, deleteAbility, listAbilities } from '@/lib/api';

export default function DashboardPage() {
  const [abilities, setAbilities] = useState<Ability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    listAbilities()
      .then(setAbilities)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleStart(ability: Ability) {
    setStartingId(ability.id);
    try {
      const session = await createSession(ability.id);
      router.push(`/sessions/${session.id}?abilityId=${ability.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not start session');
      setStartingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this ability?')) return;
    try {
      await deleteAbility(id);
      setAbilities((prev) => prev.filter((a) => a.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">My Abilities</h1>
        <Link href="/abilities/new" className="btn-primary">
          + New ability
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {abilities.length === 0 ? (
        <div className="card flex flex-col items-center py-16 text-center">
          <p className="text-gray-500">No abilities yet.</p>
          <Link href="/abilities/new" className="btn-primary mt-4">
            Create your first ability
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {abilities.map((a) => (
            <li key={a.id} className="card flex flex-col gap-3">
              <div className="flex-1">
                <h2 className="font-medium text-gray-900">{a.name}</h2>
                {a.description && (
                  <p className="mt-1 text-sm text-gray-500 line-clamp-2">{a.description}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge>{a.provider}</Badge>
                  <Badge>{a.model}</Badge>
                  <Badge>{a.deliverable_type}</Badge>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleStart(a)}
                  disabled={startingId === a.id}
                  className="btn-primary flex-1 text-xs"
                >
                  {startingId === a.id ? 'Starting…' : 'Start session'}
                </button>
                <Link href={`/abilities/${a.id}`} className="btn-ghost text-xs">
                  Edit
                </Link>
                <button
                  onClick={() => handleDelete(a.id)}
                  className="btn-ghost text-xs text-red-600 hover:bg-red-50"
                >
                  Del
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
      {children}
    </span>
  );
}
