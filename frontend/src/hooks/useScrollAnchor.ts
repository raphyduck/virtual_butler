/**
 * useScrollAnchor.ts  (Next.js / butler frontend)
 *
 * Provides smart scroll-anchor behaviour for chat message lists:
 *
 *  - Tracks whether the user is currently near the bottom of the scroll container.
 *  - Exposes `scrollToBottom()` for intentional programmatic scrolls (e.g. after
 *    the user presses Send).
 *  - Exposes `isAtBottom` so callers can conditionally auto-scroll on new content
 *    only when the user is already near the bottom.
 *  - Attaches a scroll listener that marks the user as "away from bottom" the
 *    moment they scroll upward — preventing auto-scroll from interrupting reading.
 *
 * Usage
 * -----
 *   const { scrollRef, bottomRef, isAtBottom, scrollToBottom } = useScrollAnchor();
 *
 *   // In JSX:
 *   <div ref={scrollRef} className="overflow-y-auto flex-1">
 *     {messages.map(...)}
 *     <div ref={bottomRef} />
 *   </div>
 *
 *   // Auto-scroll on new message only if already near bottom:
 *   useEffect(() => {
 *     if (isAtBottom) scrollToBottom();
 *   }, [messages]);
 *
 *   // Force-scroll after the user presses Send (regardless of position):
 *   function handleSend() {
 *     send();
 *     scrollToBottom();
 *   }
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Distance from the bottom (in px) within which we consider the user "at the bottom". */
const NEAR_BOTTOM_THRESHOLD_PX = 80;

export interface ScrollAnchor {
  /** Ref to attach to the scrollable container element. */
  scrollRef: React.RefObject<HTMLDivElement>;
  /** Ref to attach to the invisible sentinel div placed after the last message. */
  bottomRef: React.RefObject<HTMLDivElement>;
  /**
   * True when the user is at (or within NEAR_BOTTOM_THRESHOLD_PX of) the bottom
   * of the scroll container.
   */
  isAtBottom: boolean;
  /**
   * Imperatively scroll to the bottom sentinel.
   * Always scrolls regardless of the current scroll position — use this for
   * intentional actions such as sending a new message.
   */
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

export function useScrollAnchor(): ScrollAnchor {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  /** Recompute isAtBottom based on the scroll container's current position. */
  const checkBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsAtBottom(distanceFromBottom <= NEAR_BOTTOM_THRESHOLD_PX);
  }, []);

  /** Attach / re-attach the scroll listener whenever the container mounts. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener('scroll', checkBottom, { passive: true });
    // Run once immediately so the initial state is correct.
    checkBottom();

    return () => {
      el.removeEventListener('scroll', checkBottom);
    };
  }, [checkBottom]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior });
    // Immediately mark as "at bottom" so follow-up effects don't double-scroll.
    setIsAtBottom(true);
  }, []);

  return { scrollRef, bottomRef, isAtBottom, scrollToBottom };
}
