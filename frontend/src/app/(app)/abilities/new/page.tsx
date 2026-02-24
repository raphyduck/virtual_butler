'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import AbilityForm from '@/components/AbilityForm';
import { type AbilityCreate, createAbility } from '@/lib/api';

export default function NewAbilityPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(data: AbilityCreate) {
    setError(null);
    setLoading(true);
    try {
      await createAbility(data);
      router.push('/dashboard');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600">← Back</Link>
        <h1 className="text-xl font-semibold text-gray-900">New Ability</h1>
      </div>
      <AbilityForm onSubmit={handleSubmit} loading={loading} error={error} />
    </div>
  );
}
