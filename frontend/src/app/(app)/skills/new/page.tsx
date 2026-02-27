'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import SkillForm from '@/components/SkillForm';
import { type SkillCreate, createSkill } from '@/lib/api';

export default function NewSkillPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(data: SkillCreate) {
    setError(null);
    setLoading(true);
    try {
      await createSkill(data);
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
        <h1 className="text-xl font-semibold text-gray-900">New Skill</h1>
      </div>
      <SkillForm onSubmit={handleSubmit} loading={loading} error={error} />
    </div>
  );
}
