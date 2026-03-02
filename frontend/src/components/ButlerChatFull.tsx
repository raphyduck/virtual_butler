'use client';

/**
 * ButlerChatFull — full-page Butler chat for the dashboard.
 *
 * Same WebSocket logic as ButlerChat but rendered as a full-height
 * inline panel instead of a floating popup. Includes the conversation
 * sidebar so users can switch between past chats or start new ones.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type ButlerConversationSummary,
  type ButlerJob,
  cancelModifyJob,
  confirmModifyJob,
  createButlerConversation,
  getButlerConversation,
  listButlerConversations,
  mergeModifyJob,
} from '@/lib/api';
import { type AgentStep, ButlerWebSocket, type ButlerWsEvent } from '@/lib/ws';

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
  steps: AgentStep[];
}

type ChatMessage = TextMessage | JobMessage;

function uid() {
  return Math.random().toString(36).slice(2);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const STATUS_LABELS: Record<string, string> = {
  pending:         'Queued…',
  planning:        'Agent is exploring the codebase…',
  planned:         'Plan ready — review below',
  confirmed:       'Preparing to apply…',
  applying:        'Writing files…',
  committing:      'Committing…',
  pushing:         'Pushing to GitHub…',
  awaiting_merge:  'PR created — review and merge below',
  merging:         'Merging pull request…',
  building:        'Building Docker images…',
  deploying:       'Deploying new version…',
  restarting:      'Restarting the application…',
  done:            'Changes applied successfully',
  failed:          'Failed',
  cancelled:       'Cancelled',
};

const STATUS_COLOR: Record<string, string> = {
  pending:         'bg-gray-100 text-gray-600',
  planning:        'bg-green-100 text-green-700',
  planned:         'bg-yellow-100 text-yellow-800',
  confirmed:       'bg-green-100 text-green-700',
  applying:        'bg-green-100 text-green-700',
  committing:      'bg-green-100 text-green-700',
  pushing:         'bg-green-100 text-green-700',
  awaiting_merge:  'bg-blue-100 text-blue-800',
  merging:         'bg-blue-100 text-blue-700',
  building:        'bg-orange-100 text-orange-700',
  deploying:       'bg-orange-100 text-orange-700',
  restarting:      'bg-orange-100 text-orange-700',
  done:            'bg-green-100 text-green-800',
  failed:          'bg-red-100 text-red-700',
  cancelled:       'bg-gray-100 text-gray-500',
};

const STEP_PREFIX: Record<string, string> = {
  list_files:  'ls',
  read_file:   'rd',
  search_code: 'gr',
  edit_file:   'ed',
  plan_change: '→ ',
  finish:      '✓ ',
};

const STEP_COLOR: Record<string, string> = {
  list_files:  'text-gray-400',
  read_file:   'text-gray-400',
  search_code: 'text-gray-400',
  edit_file:   'text-blue-600 font-medium',
  plan_change: 'text-green-700 font-medium',
  finish:      'text-green-700 font-medium',
};

// ── Job card ──────────────────────────────────────────────────────────────────

function JobCard({
  job,
  steps,
  onUpdate,
}: {
  job: ButlerJob;
  steps: AgentStep[];
  onUpdate: (j: ButlerJob) => void;
}) {
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const stepLogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (stepLogRef.current) {
      stepLogRef.current.scrollTop = stepLogRef.current.scrollHeight;
    }
  }, [steps]);

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

  async function merge() {
    setWorking(true);
    setErr(null);
    try {
      const updated = await mergeModifyJob(job.id);
      onUpdate(updated as unknown as ButlerJob);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to merge');
    } finally {
      setWorking(false);
    }
  }

  const badgeClass = STATUS_COLOR[job.status] ?? 'bg-gray-100 text-gray-600';
  const isPlanning = job.status === 'planning';

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${badgeClass}`}>
          {job.status}
        </span>
      </div>

      <p className="mb-1 italic text-gray-600">&quot;{job.instruction}&quot;</p>
      <p className="text-gray-500 text-sm">{STATUS_LABELS[job.status] ?? job.status}</p>

      {steps.length > 0 && (
        <div className="mt-3 rounded border border-gray-100 bg-gray-50">
          <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Agent log · {steps.length} step{steps.length !== 1 ? 's' : ''}
          </p>
          <div ref={stepLogRef} className="max-h-40 overflow-y-auto px-3 pb-2 pt-1">
            {steps.map((step, i) => (
              <div key={i} className="flex items-baseline gap-2 py-px font-mono text-xs">
                <span className="w-5 shrink-0 text-gray-300">
                  {STEP_PREFIX[step.tool] ?? '·'}
                </span>
                <span className={STEP_COLOR[step.tool] ?? 'text-gray-500'}>
                  {step.label}
                </span>
              </div>
            ))}
            {isPlanning && (
              <div className="flex items-center gap-1 py-px font-mono text-xs text-gray-400">
                <span className="animate-pulse">•</span>
                <span>thinking…</span>
              </div>
            )}
          </div>
        </div>
      )}

      {job.status === 'planned' && job.plan && (
        <div className="mt-3">
          <p className="mb-1 font-medium text-gray-700">
            {job.plan.changes.length} file{job.plan.changes.length !== 1 ? 's' : ''} to change:
          </p>
          <ul className="mb-2 space-y-0.5 font-mono text-xs">
            {job.plan.changes.map((c, i) => (
              <li key={i} className="flex gap-2">
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
            <p className="mb-2 text-xs text-gray-400">
              Commit: <em>{job.plan.commit_message}</em>
            </p>
          )}
          {err && <p className="mb-1 text-sm text-red-600">{err}</p>}
          <div className="flex gap-2">
            <button
              onClick={confirm}
              disabled={working}
              className="rounded bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {working ? 'Working…' : 'Apply changes'}
            </button>
            <button
              onClick={cancel}
              disabled={working}
              className="rounded border border-gray-300 px-4 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Awaiting merge (repo mode) ── */}
      {job.status === 'awaiting_merge' && (
        <div className="mt-3">
          {job.pr_url && (
            <a
              href={job.pr_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-2 block text-sm font-medium text-blue-600 hover:underline"
            >
              View Pull Request #{job.pr_number}
            </a>
          )}
          {err && <p className="mb-1 text-sm text-red-600">{err}</p>}
          <div className="flex gap-2">
            <button
              onClick={merge}
              disabled={working}
              className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {working ? 'Working…' : 'Merge & Deploy'}
            </button>
            <button
              onClick={cancel}
              disabled={working}
              className="rounded border border-gray-300 px-4 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {job.status === 'done' && (
        <div className="mt-2 space-y-1">
          <p className="text-green-700">
            Done{job.commit_sha ? ` · sha ${job.commit_sha.slice(0, 7)}` : ''}
          </p>
          {job.pr_url && (
            <a
              href={job.pr_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm font-medium text-blue-600 hover:underline"
            >
              Pull Request on GitHub
            </a>
          )}
        </div>
      )}

      {job.status === 'failed' && job.error && (
        <p className="mt-2 text-sm text-red-600">Error: {job.error}</p>
      )}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  onJobUpdate,
}: {
  msg: ChatMessage;
  onJobUpdate: (id: string, job: ButlerJob) => void;
}) {
  if (msg.kind === 'job') {
    return (
      <div className="max-w-2xl">
        <JobCard job={msg.job} steps={msg.steps} onUpdate={(j) => onJobUpdate(msg.id, j)} />
      </div>
    );
  }

  if (msg.role === 'system') {
    return (
      <div className="py-1 text-center text-xs text-gray-400">{msg.content}</div>
    );
  }

  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-2xl rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'rounded-br-sm bg-green-600 text-white'
            : 'rounded-bl-sm bg-gray-100 text-gray-900'
        }`}
      >
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

// ── Sidebar ───────────────────────────────────────────────────────────────────

function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  loading,
}: {
  conversations: ButlerConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-gray-50">
      {/* New chat button */}
      <div className="p-3">
        <button
          onClick={onNew}
          className="flex w-full items-center gap-1.5 rounded-lg border border-green-200 bg-white px-3 py-2 text-sm font-medium text-green-700 shadow-sm hover:bg-green-50 hover:border-green-300 transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <p className="px-3 py-4 text-center text-xs text-gray-400">Loading…</p>
        )}
        {!loading && conversations.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-gray-400">No past chats</p>
        )}
        {conversations.map((conv) => {
          const isActive = conv.id === activeId;
          return (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`w-full px-3 py-2.5 text-left transition-colors hover:bg-gray-100 ${
                isActive ? 'bg-green-50 border-r-2 border-green-500' : ''
              }`}
            >
              <p className={`text-xs font-medium ${isActive ? 'text-green-700' : 'text-gray-500'}`}>
                {formatDate(conv.updated_at)}
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs text-gray-700 leading-tight">
                {conv.preview ?? <span className="italic text-gray-400">Empty chat</span>}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ButlerChatFull() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);

  // Sidebar state
  const [conversations, setConversations] = useState<ButlerConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(false);

  const wsRef = useRef<ButlerWebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // ── Connect WebSocket for a given conversationId ─────────────────────────

  const connectWs = useCallback((conversationId: string | null) => {
    wsRef.current?.close();
    setConnected(false);
    const ws = new ButlerWebSocket(handleWsEvent, conversationId);
    wsRef.current = ws;
    ws.connect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load conversation list ───────────────────────────────────────────────

  const refreshConversations = useCallback(async () => {
    try {
      const list = await listButlerConversations();
      setConversations(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  // ── Initial setup on mount ───────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      setLoadingConversations(true);
      try {
        const list = await listButlerConversations();
        setConversations(list);

        if (list.length > 0) {
          const latest = list[0];
          setActiveConversationId(latest.id);

          try {
            const conv = await getButlerConversation(latest.id);
            if (conv.messages.length > 0) {
              setMessages(
                conv.messages.map((m) => ({
                  id: m.id,
                  kind: 'text' as const,
                  role: m.role === 'user' ? ('user' as const) : ('butler' as const),
                  content: m.content,
                })),
              );
            }
          } catch {/* start fresh if fetch fails */}

          connectWs(latest.id);
        } else {
          // No conversations yet — connect without an ID (backend creates one on first message)
          connectWs(null);
        }
      } finally {
        setLoadingConversations(false);
      }
    }

    init();

    return () => {
      wsRef.current?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
      // Refresh conversation list to update previews
      refreshConversations().then((list) => {
        if (list.length > 0 && !activeConversationId) {
          setActiveConversationId(list[0].id);
        }
      });
    } else if (event.type === 'error') {
      setMessages((prev) => [
        ...prev,
        { id: uid(), kind: 'text', role: 'system', content: event.detail },
      ]);
      setSending(false);
    } else if (event.type === 'connected') {
      setConnected(true);
    } else if (event.type === 'disconnected') {
      setConnected(false);
    } else if (event.type === 'reconnected') {
      setConnected(true);
      setSending(false);
      setMessages((prev) => [
        ...prev,
        { id: uid(), kind: 'text', role: 'system', content: 'Reconnected' },
      ]);
    } else if (event.type === 'modify_started') {
      setMessages((prev) => {
        const exists = prev.some(
          (m) => m.kind === 'job' && m.job.id === event.job.id,
        );
        if (exists) {
          return prev.map((m) =>
            m.kind === 'job' && m.job.id === event.job.id
              ? { ...m, job: event.job, steps: [] }
              : m,
          );
        }
        return [...prev, { id: uid(), kind: 'job', job: event.job, steps: [] }];
      });
    } else if (event.type === 'modify_step') {
      setMessages((prev) =>
        prev.map((m) =>
          m.kind === 'job' && m.job.id === event.job_id
            ? { ...m, steps: [...m.steps, event.step] }
            : m,
        ),
      );
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

  // ── Switch to a different conversation ───────────────────────────────────

  async function selectConversation(id: string) {
    if (id === activeConversationId) return;
    setActiveConversationId(id);
    setMessages([]);
    setSending(false);

    try {
      const conv = await getButlerConversation(id);
      setMessages(
        conv.messages.map((m) => ({
          id: m.id,
          kind: 'text' as const,
          role: m.role === 'user' ? ('user' as const) : ('butler' as const),
          content: m.content,
        })),
      );
    } catch {/* show empty chat on failure */}

    connectWs(id);
  }

  // ── Start a new conversation ─────────────────────────────────────────────

  async function startNewConversation() {
    try {
      const conv = await createButlerConversation();
      setConversations((prev) => [
        { id: conv.id, created_at: conv.created_at, updated_at: conv.updated_at, preview: null },
        ...prev,
      ]);
      setActiveConversationId(conv.id);
      setMessages([]);
      setSending(false);
      connectWs(conv.id);
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch {/* silently ignore */}
  }

  function send() {
    const content = input.trim();
    if (!content || sending) return;

    setMessages((prev) => [
      ...prev,
      { id: uid(), kind: 'text', role: 'user', content },
    ]);
    setInput('');
    setSending(true);

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setConnected(false);
      setMessages((prev) => [
        ...prev,
        { id: uid(), kind: 'text', role: 'system', content: 'Not connected — reconnecting automatically…' },
      ]);
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

  return (
    <div className="flex h-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Sidebar */}
      <ConversationSidebar
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={selectConversation}
        onNew={startNewConversation}
        loading={loadingConversations}
      />

      {/* Chat area */}
      <div className="flex flex-1 flex-col overflow-hidden p-4">
        {/* Connection indicator */}
        <div className="flex items-center gap-2 pb-3">
          <span
            className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-300 animate-pulse'}`}
          />
          <span className="text-xs text-gray-400">
            {connected ? 'Connected' : 'Connecting…'}
          </span>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600 text-2xl text-white shadow-lg">
                PA
              </div>
              <h2 className="text-lg font-semibold text-gray-800">
                How can I help you today?
              </h2>
              <p className="max-w-md text-sm text-gray-400">
                Ask me anything — manage your skills, check platform stats,
                change settings, or ask me to modify the platform itself.
              </p>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} onJobUpdate={handleJobUpdate} />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-end gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message your Personal Assistant… (Enter to send)"
              rows={1}
              disabled={sending}
              className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400 disabled:opacity-60"
              style={{ maxHeight: '160px', overflowY: 'auto' }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
              }}
            />
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-40"
              aria-label="Send"
            >
              {sending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              )}
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-gray-400">
            Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
