'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AbilityForm from '@/components/AbilityForm';
import { type Ability, type AbilityUpdate, getAbility, updateAbility } from '@/lib/api';

export default function EditAbilityPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [ability, setAbility] = useState<Ability | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    getAbility(params.id)
      .then(setAbility)
      .catch((e) => setFetchError(e.message));
  }, [params.id]);

  async function handleSubmit(data: AbilityUpdate) {
    setSaveError(null);
    setLoading(true);
    try {
      await updateAbility(params.id, data);
      router.push('/dashboard');
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  }

  if (fetchError) {
    return <p className="text-sm text-red-600">{fetchError}</p>;
  }
  if (!ability) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600">← Back</Link>
        <h1 className="text-xl font-semibold text-gray-900">Edit: {ability.name}</h1>
      </div>
      <AbilityForm initial={ability} onSubmit={handleSubmit} loading={loading} error={saveError} />
    </div>
  );
}
