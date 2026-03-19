'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ConversationSidebar } from './butler/ConversationSidebar';
import { MessageList } from './butler/MessageList';
import { ModelSelector } from './butler/ModelSelector';
import { useButlerChat } from './butler/useButlerChat';
import { useScrollAnchor } from '@/hooks/useScrollAnchor';

export default function ButlerChat() {
  const [open, setOpen] = useState(false);
  const {
    activeConversationId,
    connected,
    conversations,
    input,
    inputRef,
    loadingConversations,
    messages,
    onInputKeyDown: baseOnInputKeyDown,
    selectConversation,
    send: baseSend,
    sending,
    selectedModel,
    selectedProvider,
    sessionModel,
    sessionProvider,
    setInput,
    setModel,
    setProvider,
    startNewConversation,
    updateJobMessage,
  } = useButlerChat();

  // ── Scroll anchor ──────────────────────────────────────────────────────────
  const { scrollRef, bottomRef, isAtBottom, scrollToBottom } = useScrollAnchor();

  /**
   * Track the conversation id from the previous render so we can tell when the
   * user switched conversations (and therefore always jump to the bottom).
   */
  const prevConversationIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!open) return; // Don't scroll the hidden widget

    const conversationChanged = prevConversationIdRef.current !== activeConversationId;
    prevConversationIdRef.current = activeConversationId;

    if (conversationChanged) {
      scrollToBottom('instant' as ScrollBehavior);
      return;
    }

    // Same conversation — only auto-scroll when the user is near the bottom.
    if (isAtBottom) {
      scrollToBottom();
    }
  }, [messages, open, activeConversationId, isAtBottom, scrollToBottom]);

  // When the widget opens, jump to the bottom immediately.
  useEffect(() => {
    if (open) {
      setTimeout(() => scrollToBottom('instant' as ScrollBehavior), 0);
    }
  }, [open, scrollToBottom]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, inputRef]);

  // ── Wrap send to force-scroll after intentional send ──────────────────────
  const send = useCallback(() => {
    baseSend();
    scrollToBottom();
  }, [baseSend, scrollToBottom]);

  // Keep Enter key handler in sync with the wrapped send.
  const onInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    },
    [send],
  );

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="flex h-[520px] w-[540px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-base">🤵</span>
              <div>
                <p className="text-sm font-semibold text-white">Personal Assistant</p>
                <p className="text-[10px] text-green-200">{connected ? 'Connected' : 'Connecting…'}{sessionProvider && sessionModel ? ` · ${sessionProvider}/${sessionModel}` : ''}</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded p-1 text-green-200 hover:bg-white/10 hover:text-white" aria-label="Close butler chat">✕</button>
          </div>

          <div className="flex flex-1 overflow-hidden">
            <ConversationSidebar
              variant="compact"
              conversations={conversations}
              activeId={activeConversationId}
              onSelect={selectConversation}
              onNew={startNewConversation}
              loading={loadingConversations}
            />

            <div className="flex flex-1 flex-col overflow-hidden">
              <div
                ref={scrollRef}
                className="space-y-2 overflow-y-auto py-3 flex-1 relative"
                data-testid="butler-message-list"
              >
                {messages.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-gray-400">
                    <span className="text-3xl">🤵</span>
                    <p className="text-sm font-medium text-gray-600">Hello! I&apos;m your Personal Assistant.</p>
                    <p className="text-xs">Ask me about usage stats, skills, settings — or ask me to change something about the platform and I&apos;ll implement it for you.</p>
                  </div>
                )}
                <MessageList messages={messages} onJobUpdate={updateJobMessage} variant="compact" />
                <div ref={bottomRef} data-testid="scroll-bottom-sentinel" />
              </div>

              {/* Jump-to-latest button */}
              {!isAtBottom && messages.length > 0 && (
                <div className="flex justify-center py-1 border-t border-gray-100">
                  <button
                    onClick={() => scrollToBottom()}
                    className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-700 transition-colors"
                    aria-label="Jump to latest message"
                    data-testid="jump-to-latest"
                  >
                    ↓ Jump to latest
                  </button>
                </div>
              )}

              <div className="border-t border-gray-100 p-3">
                <ModelSelector
                  provider={selectedProvider}
                  model={selectedModel}
                  onProviderChange={setProvider}
                  onModelChange={setModel}
                  disabled={sending}
                  className="mb-2"
                />
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onInputKeyDown}
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
                    data-testid="message-input"
                  />
                  <button
                    onClick={send}
                    disabled={sending || !input.trim()}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-40"
                    aria-label="Send"
                    data-testid="send-button"
                  >
                    {sending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>}
                  </button>
                </div>
                <p className="mt-1 text-center text-[10px] text-gray-400">Shift+Enter for new line</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <button onClick={() => setOpen((v) => !v)} className={`flex h-12 w-12 items-center justify-center rounded-full text-xl shadow-lg transition-all hover:scale-105 ${open ? 'bg-gray-700 text-white' : 'bg-gradient-to-br from-green-600 to-emerald-600 text-white'}`} aria-label={open ? 'Close butler chat' : 'Open butler chat'}>
        {open ? '✕' : '🤵'}
      </button>

      {!open && messages.length > 0 && <span className="absolute -top-1 right-0 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white" />}
    </div>
  );
}
