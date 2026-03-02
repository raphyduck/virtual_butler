'use client';

import { useEffect, useRef } from 'react';
import { ConversationSidebar } from './butler/ConversationSidebar';
import { MessageList } from './butler/MessageList';
import { useButlerChat } from './butler/useButlerChat';

export default function ButlerChatFull() {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const {
    activeConversationId,
    connected,
    conversations,
    input,
    inputRef,
    loadingConversations,
    messages,
    onInputKeyDown,
    selectConversation,
    send,
    sending,
    setInput,
    startNewConversation,
    updateJobMessage,
  } = useButlerChat();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  return (
    <div className="flex h-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <ConversationSidebar
        variant="full"
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={selectConversation}
        onNew={startNewConversation}
        loading={loadingConversations}
      />

      <div className="flex flex-1 flex-col overflow-hidden p-4">
        <div className="flex items-center gap-2 pb-3">
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'animate-pulse bg-gray-300'}`} />
          <span className="text-xs text-gray-400">{connected ? 'Connected' : 'Connecting…'}</span>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto pb-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600 text-2xl text-white shadow-lg">PA</div>
              <h2 className="text-lg font-semibold text-gray-800">How can I help you today?</h2>
              <p className="max-w-md text-sm text-gray-400">Ask me anything — manage your skills, check platform stats, change settings, or ask me to modify the platform itself.</p>
            </div>
          )}
          <MessageList messages={messages} onJobUpdate={updateJobMessage} variant="full" />
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-end gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onInputKeyDown}
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
            <button onClick={send} disabled={sending || !input.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-40" aria-label="Send">
              {sending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>}
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-gray-400">Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  );
}
