'use client';

/**
 * ButlerChat — floating AI platform assistant.
 *
 * • Connects to /ws/butler via WebSocket
 * • Streams responses in real-time
 * • When the AI triggers a code modification, shows a job status card inline
 * • Users confirm / cancel jobs from within the chat
 */

import { useEffect, useRef, useState } from 'react';
import { type ButlerJob, cancelModifyJob, confirmModifyJob } from '@/lib/api';
import { ButlerWebSocket, type ButlerWsEvent } from '@/lib/ws';

// ── Types ─────────────────────────────────────────────────────────────────────

type ChatRole = 'user' | 'butler' | 'system';

interface TextMessage {
  id: string;
  kind: 'text';
  role: ChatRole;
  content: string;
  streaming?: boolean;
}

interface JobMessage {
  id: string;
  kind: 'job';
  job: ButlerJob;
}

type ChatMessage = TextMessage | JobMessage;

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2);
}

const TERMINAL = new Set(['done', 'failed', 'cancelled']);

const STATUS_LABELS: Record<string, string> = {
  pending:    'Queued…',
  planning:   'AI is generating the plan…',
  planned:    'Plan ready — review below',
  confirmed:  'Preparing to apply…',
  applying:   'Writing files…',
  committing: 'Committing…',
  pushing:    'Pushing to GitHub…',
  restarting: 'Restarting the application…',
  done:       'Changes applied successfully',
  failed:     'Failed',
  cancelled:  'Cancelled',
};

const STATUS_COLOR: Record<string, string> = {
  pending:    'bg-gray-100 text-gray-600',
  planning:   'bg-green-100 text-green-700',
  planned:    'bg-yellow-100 text-yellow-800',
  confirmed:  'bg-green-100 text-green-700',
  applying:   'bg-green-100 text-green-700',
  committing: 'bg-green-100 text-green-700',
  pushing:    'bg-green-100 text-green-700',
  restarting: 'bg-orange-100 text-orange-700',
  done:       'bg-green-100 text-green-800',
  failed:     'bg-red-100 text-red-700',
  cancelled:  'bg-gray-100 text-gray-500',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function JobCard({ job, onUpdate }: { job: ButlerJob; onUpdate: (j: ButlerJob) => void }) {
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirm() {
    setWorking(true);
    setErr(null);
    try {
      const updated = await confirmModifyJob(job.id);
      onUpdate(updated as unknown as ButlerJob);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to confirm');
    } finally {
      setWorking(false);
    }
  }

  async function cancel() {
    setWorking(true);
    setErr(null);
    try {
      const updated = await cancelModifyJob(job.id);
      onUpdate(updated as unknown as ButlerJob);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to cancel');
    } finally {
      setWorking(false);
    }
  }

  const badgeClass = STATUS_COLOR[job.status] ?? 'bg-gray-100 text-gray-600';

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${badgeClass}`}>
          {job.status}
        </span>
        <span className="text-gray-500">{job.mode} mode</span>
      </div>

      <p className="mb-1 italic text-gray-600 line-clamp-2">&quot;{job.instruction}&quot;</p>

      <p className="text-gray-500">{STATUS_LABELS[job.status] ?? job.status}</p>

      {job.status === 'planned' && job.plan && (
        <div className="mt-2">
          <p className="mb-1 font-medium text-gray-700">
            {job.plan.changes.length} file{job.plan.changes.length !== 1 ? 's' : ''} to change:
          </p>
          <ul className="mb-2 space-y-0.5 font-mono">
            {job.plan.changes.map((c, i) => (
              <li key={i} className="flex gap-1.5">
                <span
                  className={`w-12 shrink-0 font-semibold ${
                    c.action === 'create'
                      ? 'text-green-700'
                      : c.action === 'delete'
                        ? 'text-red-600'
                        : 'text-yellow-700'
                  }`}
                >
                  {c.action === 'create' ? '+ new' : c.action === 'delete' ? '− del' : '~ mod'}
                </span>
                <span className="truncate text-gray-700">{c.path}</span>
              </li>
            ))}
          </ul>
          {job.plan.commit_message && (
            <p className="mb-2 text-gray-400">
              Commit: <em>{job.plan.commit_message}</em>
            </p>
          )}
          {err && <p className="mb-1 text-red-600">{err}</p>}
          <div className="flex gap-2">
            <button
              onClick={confirm}
              disabled={working}
              className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {working ? 'Working…' : 'Apply changes'}
            </button>
            <button
              onClick={cancel}
              disabled={working}
              className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {job.status === 'done' && (
        <p className="mt-1 text-green-700">
          ✓ Done{job.commit_sha ? ` · sha ${job.commit_sha.slice(0, 7)}` : ''}
        </p>
      )}

      {job.status === 'failed' && job.error && (
        <p className="mt-1 text-red-600">Error: {job.error}</p>
      )}
    </div>
  );
}

function MessageBubble({
  msg,
  onJobUpdate,
}: {
  msg: ChatMessage;
  onJobUpdate: (id: string, job: ButlerJob) => void;
}) {
  if (msg.kind === 'job') {
    return (
      <div className="px-3">
        <JobCard job={msg.job} onUpdate={(j) => onJobUpdate(msg.id, j)} />
      </div>
    );
  }

  if (msg.role === 'system') {
    return (
      <div className="px-3 py-1 text-center text-[11px] text-gray-400">{msg.content}</div>
    );
  }

  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} px-3`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? 'rounded-br-sm bg-green-600 text-white'
            : 'rounded-bl-sm bg-gray-100 text-gray-900'
        }`}
      >
        {/* Render line-breaks and preserve code blocks visually */}
        {msg.content.split('\n').map((line, i) => (
          <span key={i}>
            {line}
            {i < msg.content.split('\n').length - 1 && <br />}
          </span>
        ))}
        {msg.streaming && (
          <span className="ml-1 inline-block h-3 w-1.5 animate-pulse rounded-sm bg-gray-400" />
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ButlerChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<ButlerWebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // ── WebSocket lifecycle ──────────────────────────────────────────────────

  useEffect(() => {
    const ws = new ButlerWebSocket(handleWsEvent);
    wsRef.current = ws;
    ws.connect();

    // Poll for connection readiness (WebSocket doesn't expose onopen nicely)
    const timer = setInterval(() => {
      setConnected(ws.isConnected);
    }, 500);

    return () => {
      clearInterval(timer);
      ws.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scroll to bottom when messages update ───────────────────────────────

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  // ── Focus input when chat opens ─────────────────────────────────────────

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // ── WebSocket event handler ──────────────────────────────────────────────

  function handleWsEvent(event: ButlerWsEvent) {
    if (event.type === 'chunk') {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.kind === 'text' && last.role === 'butler' && last.streaming) {
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + event.content },
          ];
        }
        // Start a new streaming butler message
        return [
          ...prev,
          { id: uid(), kind: 'text', role: 'butler', content: event.content, streaming: true },
        ];
      });
    } else if (event.type === 'done') {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.kind === 'text' && last.role === 'butler' && last.streaming) {
          return [...prev.slice(0, -1), { ...last, streaming: false }];
        }
        return prev;
      });
      setSending(false);
    } else if (event.type === 'error') {
      setMessages((prev) => [
        ...prev,
        { id: uid(), kind: 'text', role: 'system', content: `⚠ ${event.detail}` },
      ]);
      setSending(false);
    } else if (event.type === 'modify_started') {
      setMessages((prev) => [
        ...prev,
        { id: uid(), kind: 'job', job: event.job },
      ]);
    } else if (event.type === 'modify_update' || event.type === 'modify_done') {
      setMessages((prev) =>
        prev.map((m) =>
          m.kind === 'job' && m.job.id === event.job.id ? { ...m, job: event.job } : m,
        ),
      );
    }
  }

  function handleJobUpdate(msgId: string, updatedJob: ButlerJob) {
    setMessages((prev) =>
      prev.map((m) => (m.kind === 'job' && m.id === msgId ? { ...m, job: updatedJob } : m)),
    );
  }

  // ── Send message ─────────────────────────────────────────────────────────

  function send() {
    const content = input.trim();
    if (!content || sending) return;

    setMessages((prev) => [
      ...prev,
      { id: uid(), kind: 'text', role: 'user', content },
    ]);
    setInput('');
    setSending(true);

    if (!wsRef.current?.isConnected) {
      setMessages((prev) => [
        ...prev,
        { id: uid(), kind: 'text', role: 'system', content: '⚠ Not connected — reconnecting…' },
      ]);
      wsRef.current?.connect();
      setSending(false);
      return;
    }

    wsRef.current.send(content);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {/* Chat panel */}
      {open && (
        <div className="flex h-[520px] w-80 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-base">🤵</span>
              <div>
                <p className="text-sm font-semibold text-white">Virtual Butler</p>
                <p className="text-[10px] text-green-200">
                  {connected ? 'Connected' : 'Connecting…'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded p-1 text-green-200 hover:bg-white/10 hover:text-white"
              aria-label="Close butler chat"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto py-3 space-y-2">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-gray-400 px-6">
                <span className="text-3xl">🤵</span>
                <p className="text-sm font-medium text-gray-600">Hello! I&apos;m your Virtual Butler.</p>
                <p className="text-xs">
                  Ask me about usage stats, abilities, settings — or ask me to change something
                  about the platform and I&apos;ll implement it for you.
                </p>
              </div>
            )}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} onJobUpdate={handleJobUpdate} />
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask me anything… (Enter to send)"
                rows={1}
                disabled={sending}
                className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400 disabled:opacity-60"
                style={{ maxHeight: '120px', overflowY: 'auto' }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                }}
              />
              <button
                onClick={send}
                disabled={sending || !input.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-40"
                aria-label="Send"
              >
                {sending ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                )}
              </button>
            </div>
            <p className="mt-1 text-center text-[10px] text-gray-400">
              Shift+Enter for new line
            </p>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex h-12 w-12 items-center justify-center rounded-full text-xl shadow-lg transition-all hover:scale-105 ${
          open
            ? 'bg-gray-700 text-white'
            : 'bg-gradient-to-br from-green-600 to-emerald-600 text-white'
        }`}
        aria-label={open ? 'Close butler chat' : 'Open butler chat'}
      >
        {open ? '✕' : '🤵'}
      </button>

      {/* Unread dot when closed and there are messages */}
      {!open && messages.length > 0 && (
        <span className="absolute -top-1 right-0 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white" />
      )}
    </div>
  );
}
