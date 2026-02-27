'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import ChatWindow from '@/components/ChatWindow';

function SessionContent({ sessionId }: { sessionId: string }) {
  const params = useSearchParams();
  const skillId = params.get('skillId') ?? '';

  if (!skillId) {
    return <p className="text-sm text-red-500">Missing skillId param.</p>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600">← Dashboard</Link>
        <span className="text-sm text-gray-300">|</span>
        <span className="text-sm text-gray-500 font-mono truncate max-w-xs">{sessionId}</span>
      </div>
      <ChatWindow sessionId={sessionId} skillId={skillId} />
    </div>
  );
}

export default function SessionPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={<p className="text-sm text-gray-400">Loading session…</p>}>
      <SessionContent sessionId={params.id} />
    </Suspense>
  );
}
