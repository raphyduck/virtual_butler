/**
 * Sidebar.tsx
 *
 * Left-hand navigation panel that lists all chat sessions.
 *
 * Behaviour
 * ─────────
 * • Fixed ~260 px wide on md+ screens.
 * • Collapses off-screen on mobile; a hamburger button in the chat header
 *   toggles it open/closed.
 * • "New Chat" button creates a fresh session.
 * • Clicking a session row activates it in the chat area.
 * • The list scrolls independently so long session histories don't push the
 *   button out of view.
 */

import React, { useEffect, useState } from "react";
import {
  PlusIcon,
  ChatBubbleLeftIcon,
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { useChatStore } from "../store/chatStore";
import { getSessionTitle, getSessionDateLabel } from "../utils/sessionUtils";
import type { ChatSession } from "../types/chat";

// ─── props ───────────────────────────────────────────────────────────────────

interface SidebarProps {
  /** Whether the sidebar drawer is open on mobile */
  mobileOpen: boolean;
  /** Called when the mobile close button is pressed */
  onMobileClose: () => void;
}

// ─── sub-component: a single session row ─────────────────────────────────────

interface SessionRowProps {
  session: ChatSession;
  isActive: boolean;
  collapsed: boolean;
  onClick: () => void;
}

const SessionRow: React.FC<SessionRowProps> = ({ session, isActive, collapsed, onClick }) => {
  const title = getSessionTitle(session);
  const date = getSessionDateLabel(session);

  return (
    <button
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      title={collapsed ? title : undefined}
      className={[
        "group w-full flex rounded-lg px-3 py-2.5 text-left",
        collapsed ? "justify-center" : "items-start gap-3",
        "transition-colors duration-150 focus-visible:outline-none",
        "focus-visible:ring-2 focus-visible:ring-indigo-500",
        isActive
          ? "bg-indigo-50 text-indigo-700"
          : "text-gray-700 hover:bg-gray-100",
      ].join(" ")}
    >
      {/* icon */}
      <ChatBubbleLeftIcon
        className={[
          "mt-0.5 h-4 w-4 shrink-0",
          isActive ? "text-indigo-500" : "text-gray-400 group-hover:text-gray-500",
        ].join(" ")}
        aria-hidden="true"
      />

      {/* text block */}
      <span className={["min-w-0 flex-1", collapsed ? "hidden" : "block"].join(" ")}>
        <span
          className={[
            "block truncate text-sm font-medium leading-snug",
            isActive ? "text-indigo-700" : "text-gray-800",
          ].join(" ")}
        >
          {title}
        </span>
        <span
          className={[
            "block text-xs leading-tight mt-0.5",
            isActive ? "text-indigo-400" : "text-gray-400",
          ].join(" ")}
        >
          {date}
        </span>
      </span>
    </button>
  );
};

// ─── main component ──────────────────────────────────────────────────────────

const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onMobileClose }) => {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sidebar_collapsed") === "true";
  });
  const sessions = useChatStore((s) => s.sessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const newSession = useChatStore((s) => s.newSession);
  const selectSession = useChatStore((s) => s.selectSession);

  const handleNewChat = () => {
    newSession();
    onMobileClose(); // close drawer on mobile after action
  };

  const handleSelectSession = (id: string) => {
    selectSession(id);
    onMobileClose();
  };

  useEffect(() => {
    window.localStorage.setItem("sidebar_collapsed", String(collapsed));
  }, [collapsed]);

  // ── inner panel (shared between mobile drawer and desktop sidebar) ──────────
  const renderPanel = (isDesktop: boolean) => {
    const isCollapsed = isDesktop && collapsed;

    return (
    <div className="flex h-full flex-col bg-white border-r border-gray-200">
      {/* ── header ─────────────────────────────────────────────────────────── */}
      <div className={["flex items-center px-4 pt-5 pb-3", isCollapsed ? "justify-center" : "justify-between"].join(" ")}>
        <span className={["text-base font-semibold text-gray-900 tracking-tight", isCollapsed ? "hidden" : "block"].join(" ")}>
          Conversations
        </span>

        {/* Mobile close button — visible only inside the drawer */}
        <button
          onClick={onMobileClose}
          className="md:hidden -mr-1 rounded-md p-1 text-gray-400 hover:text-gray-600
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          aria-label="Close sidebar"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* ── new chat button ─────────────────────────────────────────────────── */}
      <div className="px-3 pb-3">
        <button
          onClick={handleNewChat}
          title={isCollapsed ? "New Chat" : undefined}
          className="flex w-full items-center justify-center gap-2 rounded-lg
                     bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white
                     shadow-sm hover:bg-indigo-500 active:bg-indigo-700
                     transition-colors duration-150
                     focus-visible:outline-none focus-visible:ring-2
                     focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          <PlusIcon className="h-4 w-4" aria-hidden="true" />
          <span className={isCollapsed ? "hidden" : "block"}>New Chat</span>
        </button>
      </div>

      {/* ── divider ────────────────────────────────────────────────────────── */}
      <div className="mx-3 border-t border-gray-100" />

      {/* ── session list ───────────────────────────────────────────────────── */}
      <nav
        aria-label="Chat sessions"
        className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5"
      >
        {sessions.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-gray-400">
            No conversations yet.
          </p>
        ) : (
          sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
              collapsed={isCollapsed}
              onClick={() => handleSelectSession(session.id)}
            />
          ))
        )}
      </nav>

      {/* ── footer (optional branding / version) ───────────────────────────── */}
      <div className="px-4 py-3 border-t border-gray-100">
        <p className={["text-xs text-gray-400 text-center select-none", isCollapsed ? "hidden" : "block"].join(" ")}>
          Personal Assistant
        </p>
      </div>
    </div>
    );
  };

  return (
    <>
      {/* ── Desktop sidebar (always visible on md+) ──────────────────────── */}
      <aside
        className={[
          "relative hidden h-full md:flex md:flex-col md:shrink-0",
          "transition-[width] duration-300 ease-in-out",
          collapsed ? "md:w-12" : "md:w-[260px]",
        ].join(" ")}
        aria-label="Sidebar"
      >
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="absolute -right-3 top-6 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 md:flex"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRightIcon className="h-4 w-4" /> : <ChevronLeftIcon className="h-4 w-4" />}
        </button>
        {renderPanel(true)}
      </aside>

      {/* ── Mobile drawer overlay ────────────────────────────────────────── */}
      {/* Backdrop */}
      <div
        className={[
          "fixed inset-0 z-20 bg-black/40 transition-opacity duration-200 md:hidden",
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        ].join(" ")}
        aria-hidden="true"
        onClick={onMobileClose}
      />

      {/* Drawer panel */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-30 w-[260px] md:hidden",
          "transform transition-transform duration-200 ease-in-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
        aria-label="Sidebar"
      >
        {renderPanel(false)}
      </aside>
    </>
  );
};

export default Sidebar;
