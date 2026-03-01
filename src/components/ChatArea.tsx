/**
 * ChatArea.tsx
 *
 * The right-hand panel of the chat layout.
 * Renders the message history for the active session and a message-input bar.
 *
 * This component is intentionally self-contained — all state comes from
 * useChatStore so it always stays in sync with whichever session is active.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { PaperAirplaneIcon, Bars3Icon } from "@heroicons/react/24/outline";
import { useChatStore } from "../store/chatStore";
import type { Message } from "../types/chat";

// ─── props ───────────────────────────────────────────────────────────────────

interface ChatAreaProps {
  /** Called when the mobile hamburger button is pressed */
  onOpenSidebar: () => void;
}

// ─── sub-component: a single message bubble ──────────────────────────────────

const MessageBubble: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.role === "user";

  return (
    <div
      className={[
        "flex w-full",
        isUser ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      <div
        className={[
          "max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
          isUser
            ? "bg-indigo-600 text-white rounded-br-sm"
            : "bg-white text-gray-800 border border-gray-200 rounded-bl-sm",
        ].join(" ")}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <p
          className={[
            "mt-1 text-right text-[10px]",
            isUser ? "text-indigo-200" : "text-gray-400",
          ].join(" ")}
        >
          {new Date(message.createdAt).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
};

// ─── sub-component: empty state ──────────────────────────────────────────────

const EmptyState: React.FC = () => (
  <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
    <div className="rounded-full bg-indigo-50 p-5">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-10 w-10 text-indigo-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0
             0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75
             0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0
             01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764
             9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969
             5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93
             16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
        />
      </svg>
    </div>
    <div>
      <h2 className="text-lg font-semibold text-gray-800">
        How can I help you today?
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        Start a conversation below, or pick a past session from the sidebar.
      </p>
    </div>
  </div>
);

// ─── main component ──────────────────────────────────────────────────────────

const ChatArea: React.FC<ChatAreaProps> = ({ onOpenSidebar }) => {
  const activeSession = useChatStore((s) => s.activeSession());
  const addMessage = useChatStore((s) => s.addMessage);

  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to the bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages]);

  // Reset input height when session changes
  useEffect(() => {
    setInputValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [activeSession?.id]);

  // Auto-grow textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  const handleSend = useCallback(async () => {
    if (!activeSession || !inputValue.trim() || isLoading) return;

    const userText = inputValue.trim();
    setInputValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    // Add the user message immediately
    addMessage(activeSession.id, { role: "user", content: userText });

    // ── Simulated assistant reply ────────────────────────────────────────────
    // Replace this block with your real API call (e.g. fetch / SSE streaming).
    setIsLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 900)); // simulate network latency
      addMessage(activeSession.id, {
        role: "assistant",
        content: `You said: "${userText}"\n\n(Connect your backend here to replace this placeholder response.)`,
      });
    } finally {
      setIsLoading(false);
    }
  }, [activeSession, inputValue, isLoading, addMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter; allow Shift+Enter for newlines
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const messages = activeSession?.messages ?? [];

  return (
    <div className="flex flex-1 flex-col min-w-0 h-full bg-gray-50">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        {/* Hamburger — mobile only */}
        <button
          onClick={onOpenSidebar}
          className="md:hidden -ml-1 rounded-md p-1.5 text-gray-500 hover:bg-gray-100
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          aria-label="Open sidebar"
        >
          <Bars3Icon className="h-5 w-5" />
        </button>

        <h1 className="flex-1 truncate text-base font-semibold text-gray-900">
          {activeSession && messages.length > 0
            ? messages.find((m) => m.role === "user")?.content.slice(0, 60) ??
              "New conversation"
            : "New conversation"}
        </h1>
      </header>

      {/* ── Message list ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {messages
              .filter((m) => m.role !== "system")
              .map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-4 py-3 shadow-sm">
                  <TypingIndicator />
                </div>
              </div>
            )}

            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Input bar ───────────────────────────────────────────────────────── */}
      <div className="border-t border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-end gap-3">
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Message Personal Assistant…"
            disabled={isLoading}
            className="flex-1 resize-none rounded-xl border border-gray-300 bg-gray-50
                       px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400
                       shadow-sm outline-none transition
                       focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30
                       disabled:opacity-50"
            style={{ minHeight: "42px", maxHeight: "160px" }}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            aria-label="Send message"
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center
                       rounded-xl bg-indigo-600 text-white shadow-sm
                       hover:bg-indigo-500 active:bg-indigo-700
                       disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors duration-150
                       focus-visible:outline-none focus-visible:ring-2
                       focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            <PaperAirplaneIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-gray-400">
          Press <kbd className="font-mono">Enter</kbd> to send ·{" "}
          <kbd className="font-mono">Shift+Enter</kbd> for a new line
        </p>
      </div>
    </div>
  );
};

// ─── Typing indicator ────────────────────────────────────────────────────────

const TypingIndicator: React.FC = () => (
  <span className="flex items-center gap-1" aria-label="Assistant is typing">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
        style={{ animationDelay: `${i * 0.15}s` }}
      />
    ))}
  </span>
);

export default ChatArea;
