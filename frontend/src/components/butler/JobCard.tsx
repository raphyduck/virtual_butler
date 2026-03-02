import { useEffect, useRef, useState } from 'react';
import { type ButlerJob, cancelModifyJob, confirmModifyJob, mergeModifyJob } from '@/lib/api';
import type { AgentStep } from '@/lib/ws';
import { STATUS_COLOR, STATUS_LABELS, STEP_COLOR, STEP_PREFIX } from './constants';

type Variant = 'compact' | 'full';

export function JobCard({ job, onUpdate, steps, variant }: { job: ButlerJob; onUpdate: (job: ButlerJob) => void; steps: AgentStep[]; variant: Variant }) {
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const stepLogRef = useRef<HTMLDivElement | null>(null);
  const compact = variant === 'compact';

  useEffect(() => {
    if (stepLogRef.current) stepLogRef.current.scrollTop = stepLogRef.current.scrollHeight;
  }, [steps]);

  const run = async (fn: (id: string) => Promise<ButlerJob>, defaultError: string) => {
    setWorking(true);
    setErr(null);
    try {
      onUpdate(await fn(job.id));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : defaultError);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className={compact ? 'mt-2 rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-sm' : 'mt-2 rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-sm'}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[job.status] ?? 'bg-gray-100 text-gray-600'}`}>{job.status}</span>
      </div>
      <p className={compact ? 'mb-1 line-clamp-2 italic text-gray-600' : 'mb-1 italic text-gray-600'}>&quot;{job.instruction}&quot;</p>
      <p className={compact ? 'text-gray-500' : 'text-sm text-gray-500'}>{STATUS_LABELS[job.status] ?? job.status}</p>

      {steps.length > 0 && (
        <div className={compact ? 'mt-2 rounded border border-gray-100 bg-gray-50' : 'mt-3 rounded border border-gray-100 bg-gray-50'}>
          <p className={compact ? 'px-2 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400' : 'px-3 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400'}>
            Agent log · {steps.length} step{steps.length !== 1 ? 's' : ''}
          </p>
          <div ref={stepLogRef} className={compact ? 'max-h-28 overflow-y-auto px-2 pb-1.5 pt-0.5 text-[10px]' : 'max-h-40 overflow-y-auto px-3 pb-2 pt-1 text-xs'}>
            {steps.map((step, i) => (
              <div key={i} className="flex items-baseline gap-1.5 py-px font-mono">
                <span className={compact ? 'w-4 shrink-0 text-gray-300' : 'w-5 shrink-0 text-gray-300'}>{STEP_PREFIX[step.tool] ?? '·'}</span>
                <span className={STEP_COLOR[step.tool] ?? 'text-gray-500'}>{step.label}</span>
              </div>
            ))}
            {job.status === 'planning' && (
              <div className="flex items-center gap-1 py-px font-mono text-gray-400"><span className="animate-pulse">•</span><span>thinking…</span></div>
            )}
          </div>
        </div>
      )}

      {job.status === 'planned' && job.plan && (
        <div className={compact ? 'mt-2' : 'mt-3'}>
          <p className="mb-1 font-medium text-gray-700">{job.plan.changes.length} file{job.plan.changes.length !== 1 ? 's' : ''} to change:</p>
          <ul className={compact ? 'mb-2 space-y-0.5 font-mono' : 'mb-2 space-y-0.5 font-mono text-xs'}>
            {job.plan.changes.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span className={`w-12 shrink-0 font-semibold ${c.action === 'create' ? 'text-green-700' : c.action === 'delete' ? 'text-red-600' : 'text-yellow-700'}`}>{c.action === 'create' ? '+ new' : c.action === 'delete' ? '− del' : '~ mod'}</span>
                <span className="truncate text-gray-700">{c.path}</span>
              </li>
            ))}
          </ul>
          {job.plan.commit_message && <p className={compact ? 'mb-2 text-gray-400' : 'mb-2 text-xs text-gray-400'}>Commit: <em>{job.plan.commit_message}</em></p>}
          {err && <p className={compact ? 'mb-1 text-red-600' : 'mb-1 text-sm text-red-600'}>{err}</p>}
          <div className="flex gap-2">
            <button onClick={() => run(confirmModifyJob, 'Failed to confirm')} disabled={working} className={compact ? 'rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50' : 'rounded bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50'}>{working ? 'Working…' : 'Apply changes'}</button>
            <button onClick={() => run(cancelModifyJob, 'Failed to cancel')} disabled={working} className={compact ? 'rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50' : 'rounded border border-gray-300 px-4 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50'}>Cancel</button>
          </div>
        </div>
      )}

      {job.status === 'awaiting_merge' && (
        <div className={compact ? 'mt-2' : 'mt-3'}>
          {job.pr_url && <a href={job.pr_url} target="_blank" rel="noopener noreferrer" className={compact ? 'mb-2 block font-medium text-blue-600 hover:underline' : 'mb-2 block text-sm font-medium text-blue-600 hover:underline'}>View Pull Request #{job.pr_number}</a>}
          {err && <p className={compact ? 'mb-1 text-red-600' : 'mb-1 text-sm text-red-600'}>{err}</p>}
          <div className="flex gap-2">
            <button onClick={() => run(mergeModifyJob, 'Failed to merge')} disabled={working} className={compact ? 'rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50' : 'rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'}>{working ? 'Working…' : 'Merge & Deploy'}</button>
            <button onClick={() => run(cancelModifyJob, 'Failed to cancel')} disabled={working} className={compact ? 'rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50' : 'rounded border border-gray-300 px-4 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50'}>Cancel</button>
          </div>
        </div>
      )}

      {job.status === 'done' && (
        <div className="mt-1 space-y-1">
          <p className="text-green-700">Done{job.commit_sha ? ` · sha ${job.commit_sha.slice(0, 7)}` : ''}</p>
          {job.pr_url && <a href={job.pr_url} target="_blank" rel="noopener noreferrer" className={compact ? 'block font-medium text-blue-600 hover:underline' : 'block text-sm font-medium text-blue-600 hover:underline'}>Pull Request on GitHub</a>}
        </div>
      )}

      {job.status === 'failed' && job.error && <p className={compact ? 'mt-1 text-red-600' : 'mt-2 text-sm text-red-600'}>Error: {job.error}</p>}
    </div>
  );
}
