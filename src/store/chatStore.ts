/**
 * chatStore.ts
 *
 * Zustand store that manages all chat sessions and the currently active session.
 * Acts as the single source of truth for the sidebar list and the chat area.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import type { ChatSession, Message } from "../types/chat";

// ─── helpers ────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function makeSession(id = uuidv4()): ChatSession {
  const ts = now();
  return { id, createdAt: ts, updatedAt: ts, messages: [] };
}

// ─── store shape ─────────────────────────────────────────────────────────────

export interface ChatStore {
  /** All sessions ordered newest-first */
  sessions: ChatSession[];
  /** ID of the session currently shown in the chat area */
  activeSessionId: string | null;

  // ── selectors ──────────────────────────────────────────────────────────────
  activeSession: () => ChatSession | null;

  // ── actions ────────────────────────────────────────────────────────────────
  /** Create a brand-new session and activate it */
  newSession: () => void;
  /** Switch the chat area to an existing session */
  selectSession: (id: string) => void;
  /** Append a message to a session and bump updatedAt */
  addMessage: (sessionId: string, message: Omit<Message, "id" | "createdAt">) => void;
  /** Replace every message in a session (used when streaming is done) */
  setMessages: (sessionId: string, messages: Message[]) => void;
}

// ─── store ───────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => {
      // Create the very first session so the app is never empty.
      const initial = makeSession();

      return {
        sessions: [initial],
        activeSessionId: initial.id,

        // ── selectors ──────────────────────────────────────────────────────
        activeSession: () => {
          const { sessions, activeSessionId } = get();
          return sessions.find((s) => s.id === activeSessionId) ?? null;
        },

        // ── actions ────────────────────────────────────────────────────────
        newSession: () => {
          const session = makeSession();
          set((state) => ({
            sessions: [session, ...state.sessions],
            activeSessionId: session.id,
          }));
        },

        selectSession: (id: string) => {
          set({ activeSessionId: id });
        },

        addMessage: (
          sessionId: string,
          message: Omit<Message, "id" | "createdAt">
        ) => {
          const full: Message = {
            ...message,
            id: uuidv4(),
            createdAt: now(),
          };
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === sessionId
                ? {
                    ...s,
                    messages: [...s.messages, full],
                    updatedAt: now(),
                  }
                : s
            ),
          }));
        },

        setMessages: (sessionId: string, messages: Message[]) => {
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === sessionId
                ? { ...s, messages, updatedAt: now() }
                : s
            ),
          }));
        },
      };
    },
    {
      name: "pa-chat-sessions", // localStorage key
      // Only persist the raw data, not derived selectors
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
      }),
    }
  )
);
