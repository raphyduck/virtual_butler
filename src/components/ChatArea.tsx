/**
 * ChatArea.tsx
 *
 * The right-hand panel of the chat layout.
 * Renders the message history for the active session and a message-input bar.
 *
 * This component is intentionally self-contained — all state comes from
 * useChatStore so it always stays in sync with whichever session is active.
 *
 * Scroll behaviour
 * ----------------
 * - Auto-scrolls to the bottom when a conversation is first loaded (initial render).
 * - Auto-scrolls on new incoming/streaming messages ONLY when the user is already
 *   near the bottom — so upward manual scrolling is never interrupted.
 * - Always force-scrolls to the bottom after the user explicitly sends a message.
 * - Exposes a "Jump to latest" button when the user has scrolled away from the
 *   bottom, so they can easily return.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { PaperAirplaneIcon, Bars3Icon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { useChatStore } from "../store/chatStore";
import type { Message } from "../types/chat";
import { useScrollAnchor } from "../hooks/useScrollAnchor";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: Message;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-semibold mr-2 flex-shrink-0 mt-1">
          AI
        </div>
      )}
      <div className={`max-w-[75%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? "bg-indigo-600 text-white rounded-br-sm"
              : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm"
          }`}
        >
          {message.content}
        </div>
        <span className="text-[10px] text-gray-400 mt-1 px-1">
          {formatTime(message.createdAt)}
        </span>
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-xs font-semibold ml-2 flex-shrink-0 mt-1">
          You
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ChatArea
// ─────────────────────────────────────────────────────────────────────────────

interface ChatAreaProps {
  onMenuClick?: () => void;
}

export default function ChatArea({ onMenuClick }: ChatAreaProps) {
  const { activeSessionId, sessions, sendMessage, isStreaming } = useChatStore();
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const messages = activeSession?.messages ?? [];

  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Scroll anchor ──────────────────────────────────────────────────────────
  const { scrollRef, bottomRef, isAtBottom, scrollToBottom } = useScrollAnchor();

  /**
   * Track the session/conversation that was active on the previous render so we
   * can distinguish "new messages in the current conversation" from "the user
   * switched to a different conversation".
   */
  const prevSessionIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const sessionChanged = prevSessionIdRef.current !== activeSessionId;
    prevSessionIdRef.current = activeSessionId;

    if (sessionChanged) {
      // Always jump to the bottom when the user switches conversations or on
      // the very first mount — do it instantly so there's no jarring animation.
      scrollToBottom("instant" as ScrollBehavior);
      return;
    }

    // Same conversation — only auto-scroll if the user is already near the
    // bottom.  If they have scrolled up to read earlier messages, leave them
    // alone.
    if (isAtBottom) {
      scrollToBottom();
    }
  }, [messages, activeSessionId, isAtBottom, scrollToBottom]);

  // ── Auto-resize textarea ───────────────────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  // ── Send ───────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    setInput("");
    setIsSending(true);

    try {
      await sendMessage(trimmed);
    } finally {
      setIsSending(false);
    }

    // Always scroll to the bottom after the user intentionally sends a message,
    // regardless of where they were scrolled.
    scrollToBottom();
  }, [input, isSending, sendMessage, scrollToBottom]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // ── Empty-state copy ───────────────────────────────────────────────────────
  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 lg:hidden"
            aria-label="Open sidebar"
          >
            <Bars3Icon className="w-5 h-5" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-gray-800 truncate">
            {activeSession ? `Chat · ${activeSession.id.slice(0, 8)}` : "No conversation selected"}
          </h2>
          {isStreaming && (
            <p className="text-[10px] text-indigo-500 font-medium animate-pulse">
              Assistant is typing…
            </p>
          )}
        </div>
      </div>

      {/* ── Message list ── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
        data-testid="message-list"
      >
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3">
            <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-2xl">
              💬
            </div>
            <p className="text-gray-500 text-sm">
              Start a conversation — type a message below.
            </p>
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}

        {/* Invisible bottom sentinel — scrolled into view to jump to latest */}
        <div ref={bottomRef} data-testid="scroll-bottom-sentinel" />
      </div>

      {/* ── Jump-to-latest button (shown when scrolled away from bottom) ── */}
      {!isAtBottom && messages.length > 0 && (
        <div className="absolute bottom-24 right-6 z-10">
          <button
            onClick={() => scrollToBottom()}
            className="flex items-center gap-1.5 bg-white border border-gray-200 shadow-md rounded-full px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all"
            aria-label="Jump to latest message"
            data-testid="jump-to-latest"
          >
            <ChevronDownIcon className="w-3.5 h-3.5" />
            Latest
          </button>
        </div>
      )}

      {/* ── Input bar ── */}
      <div className="flex-shrink-0 bg-white border-t border-gray-200 px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activeSessionId
                ? "Type a message… (Enter to send, Shift+Enter for new line)"
                : "Select or create a conversation to start chatting"
            }
            disabled={!activeSessionId || isSending}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-shadow"
            style={{ maxHeight: "160px", overflowY: "auto" }}
            aria-label="Message input"
            data-testid="message-input"
          />
          <button
            onClick={handleSend}
            disabled={!activeSessionId || isSending || !input.trim()}
            className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Send message"
            data-testid="send-button"
          >
            {isSending ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <PaperAirplaneIcon className="w-5 h-5" />
            )}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5 text-center">
          Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
