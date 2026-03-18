'use client';

import { useEffect, useRef, useState } from 'react';
import { type ChatMessage as ApiMessage, getMessages } from '@/lib/api';
import { SessionWebSocket, type WsEvent } from '@/lib/ws';
import clsx from 'clsx';
import { useScrollAnchor } from '@/hooks/useScrollAnchor';

interface Props {
  sessionId: string;
  skillId: string;
}

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

export default function ChatWindow({ sessionId, skillId }: Props) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<SessionWebSocket | null>(null);

  // ── Scroll anchor ──────────────────────────────────────────────────────────
  const { scrollRef, bottomRef, isAtBottom, scrollToBottom } = useScrollAnchor();

  /**
   * Track whether this is the very first message load so we can do an instant
   * jump to the bottom on initial render without caring about the user's current
   * scroll position.
   */
  const initialLoadRef = useRef(true);

  // Load existing messages then connect WS
  useEffect(() => {
    // Reset the initial-load flag when the session changes.
    initialLoadRef.current = true;

    getMessages(skillId, sessionId)
      .then((msgs: ApiMessage[]) => {
        setMessages(
          msgs
            .filter((m) => m.role !== 'system')
            .map((m) => ({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content })),
        );
        // After the history loads, snap straight to the bottom.
        // We use a microtask so the DOM has a chance to update first.
        setTimeout(() => scrollToBottom('instant' as ScrollBehavior), 0);
        initialLoadRef.current = false;
      })
      .catch(() => {
        initialLoadRef.current = false;
      });

    const ws = new SessionWebSocket(sessionId, (evt: WsEvent) => {
      if (evt.type === 'chunk') {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.streaming) {
            return [...prev.slice(0, -1), { ...last, content: last.content + evt.content }];
          }
          return [
            ...prev,
            { id: `streaming-${Date.now()}`, role: 'assistant', content: evt.content, streaming: true },
          ];
        });
      } else if (evt.type === 'done') {
        setMessages((prev) =>
          prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
        );
        setBusy(false);
      } else if (evt.type === 'error') {
        setError(evt.detail);
        setBusy(false);
      } else if (evt.type === 'connected' || evt.type === 'reconnected') {
        setConnected(true);
      } else if (evt.type === 'disconnected') {
        setConnected(false);
      }
    });

    ws.connect();
    wsRef.current = ws;

    return () => {
      ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, skillId]);

  // ── Conditional auto-scroll on new / streaming messages ───────────────────
  // Only scroll if the user is already near the bottom — never interrupt manual
  // upward scrolling.
  useEffect(() => {
    if (initialLoadRef.current) return; // handled by the load effect above
    if (isAtBottom) {
      scrollToBottom();
    }
  }, [messages, isAtBottom, scrollToBottom]);

  // ── Send ───────────────────────────────────────────────────────────────────
  function send() {
    const text = input.trim();
    if (!text || busy) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('You are currently disconnected. Please wait while we reconnect.');
      setConnected(false);
      return;
    }

    setError(null);
    setInput('');
    setBusy(true);
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', content: text },
    ]);
    wsRef.current.send(text);

    // Always scroll to the bottom after the user intentionally sends a message.
    scrollToBottom();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-4 pb-4 relative"
        data-testid="message-list"
      >
        {messages.length === 0 && (
          <p className="text-center text-sm text-gray-400 pt-16">
            Send a message to start the conversation.
          </p>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
        <div ref={bottomRef} data-testid="scroll-bottom-sentinel" />
      </div>

      {/* Jump-to-latest button */}
      {!isAtBottom && messages.length > 0 && (
        <div className="flex justify-center pb-2">
          <button
            onClick={() => scrollToBottom()}
            className="flex items-center gap-1 text-xs text-gray-500 bg-white border border-gray-200 shadow-sm rounded-full px-3 py-1 hover:bg-gray-50 transition-colors"
            aria-label="Jump to latest message"
            data-testid="jump-to-latest"
          >
            ↓ Jump to latest
          </button>
        </div>
      )}

      {/* Error bar */}
      {error && (
        <div className="mb-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4 font-medium">×</button>
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2 border-t border-gray-200 pt-4">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          disabled={!connected || busy}
          placeholder={connected ? 'Type a message… (Enter to send, Shift+Enter for newline)' : 'Connecting…'}
          className="input flex-1 resize-none"
          data-testid="message-input"
        />
        <button
          onClick={send}
          disabled={!connected || busy || !input.trim()}
          className="btn-primary self-end px-6"
          data-testid="send-button"
        >
          {busy ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

function Bubble({ message }: { message: DisplayMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={clsx('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap',
          isUser
            ? 'bg-brand-600 text-white rounded-br-sm'
            : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm',
        )}
      >
        {message.content}
        {message.streaming && (
          <span className="ml-1 inline-block h-2 w-0.5 animate-pulse bg-current opacity-60" />
        )}
      </div>
    </div>
  );
}
