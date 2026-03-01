/**
 * sessionUtils.ts
 *
 * Pure utility helpers shared between Sidebar and any other component that
 * needs to derive display data from a ChatSession.
 */

import type { ChatSession } from "../types/chat";

const TITLE_MAX = 40;

/**
 * Derive a human-readable title from a session.
 * Uses the text of the first user message, truncated to TITLE_MAX chars.
 * Falls back to "New conversation" when there are no user messages yet.
 */
export function getSessionTitle(session: ChatSession): string {
  const firstUserMsg = session.messages.find((m) => m.role === "user");
  if (!firstUserMsg?.content.trim()) return "New conversation";

  const text = firstUserMsg.content.trim().replace(/\s+/g, " ");
  return text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX).trimEnd()}…` : text;
}

/**
 * Return a short relative date label for a session.
 *
 * - Same calendar day  → "Today"
 * - Previous calendar day → "Yesterday"
 * - Same year          → "Jan 5"
 * - Older              → "Jan 5, 2023"
 */
export function getSessionDateLabel(session: ChatSession): string {
  const date = new Date(session.updatedAt);
  const now = new Date();

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, now)) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return "Yesterday";

  const opts: Intl.DateTimeFormatOptions =
    date.getFullYear() === now.getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };

  return date.toLocaleDateString(undefined, opts);
}
