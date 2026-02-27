'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import SkillForm from '@/components/SkillForm';
import { type Skill, type SkillUpdate, getSkill, updateSkill } from '@/lib/api';

export default function EditSkillPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    getSkill(params.id)
      .then(setSkill)
      .catch((e) => setFetchError(e.message));
  }, [params.id]);

  async function handleSubmit(data: SkillUpdate) {
    setSaveError(null);
    setLoading(true);
    try {
      await updateSkill(params.id, data);
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
  if (!skill) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600">← Back</Link>
        <h1 className="text-xl font-semibold text-gray-900">Edit: {skill.name}</h1>
      </div>
      <SkillForm initial={skill} onSubmit={handleSubmit} loading={loading} error={saveError} />
    </div>
  );
}
