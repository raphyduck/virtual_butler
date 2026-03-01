/**
 * store.js — Centralised state management
 * ─────────────────────────────────────────────────────────────
 * Manages chat sessions and persists them to localStorage so
 * the history survives page refreshes.
 *
 * Data shape:
 *   sessions: Array<Session>
 *   activeId: string | null
 *
 *   Session {
 *     id        : string          (uuid-like)
 *     title     : string          (derived from first user message)
 *     createdAt : number          (timestamp ms)
 *     updatedAt : number          (timestamp ms)
 *     status    : 'active'|'past' ('active' while in focus; 'past' on switch)
 *     messages  : Array<Message>
 *   }
 *
 *   Message {
 *     id        : string
 *     role      : 'user' | 'assistant'
 *     content   : string
 *     timestamp : number
 *   }
 */

const STORAGE_KEY = 'pa_sessions_v1';
const MAX_TITLE_LEN = 42;

/* ── Utilities ───────────────────────────────────────────────── */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function clamp(str, max) {
  if (!str) return '';
  const s = str.trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** Derive a human-readable title from the first user message. */
function deriveTitle(text) {
  if (!text) return 'New Chat';
  return clamp(text, MAX_TITLE_LEN) || 'New Chat';
}

/** Friendly relative timestamp. */
function relativeTime(ts) {
  const diff = Date.now() - ts;
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);

  if (mins  <  1) return 'Just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  <  7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ── Store ───────────────────────────────────────────────────── */
const Store = (() => {
  let state = { sessions: [], activeId: null };

  /* Subscribers (functions called after every mutation) */
  const listeners = new Set();

  /* ── Persistence ─────────────────────────────────────────── */
  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) state = JSON.parse(raw);
    } catch (_) {
      /* corrupted storage — start fresh */
      state = { sessions: [], activeId: null };
    }
  }

  function _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) { /* storage full – silently ignore */ }
  }

  function _notify() {
    listeners.forEach(fn => fn(state));
  }

  function _commit() {
    _save();
    _notify();
  }

  /* ── Public API ──────────────────────────────────────────── */

  /** Subscribe to state changes. Returns an unsubscribe function. */
  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /** Return the full current state (read-only snapshot). */
  function getState() {
    return state;
  }

  /** Return the active Session object, or null. */
  function getActiveSession() {
    return state.sessions.find(s => s.id === state.activeId) ?? null;
  }

  /**
   * Create a brand-new session, make it active,
   * and mark the previous active session as 'past'.
   */
  function createSession() {
    /* Mark the current active session as past */
    if (state.activeId) {
      const prev = state.sessions.find(s => s.id === state.activeId);
      if (prev) prev.status = 'past';
    }

    const session = {
      id:        uid(),
      title:     'New Chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status:    'active',
      messages:  [],
    };

    state.sessions.unshift(session);
    state.activeId = session.id;
    _commit();
    return session;
  }

  /**
   * Switch to an existing session.
   * The previously active session is marked as 'past';
   * the new one is marked 'active'.
   */
  function switchSession(id) {
    if (id === state.activeId) return;

    /* Demote previous active session */
    if (state.activeId) {
      const prev = state.sessions.find(s => s.id === state.activeId);
      if (prev) prev.status = 'past';
    }

    const target = state.sessions.find(s => s.id === id);
    if (!target) return;

    target.status  = 'active';
    state.activeId = id;
    _commit();
  }

  /**
   * Delete a session by id.
   * If the deleted session was active, activate the next one
   * (or create a fresh session if none remain).
   */
  function deleteSession(id) {
    const idx = state.sessions.findIndex(s => s.id === id);
    if (idx === -1) return;

    state.sessions.splice(idx, 1);

    if (state.activeId === id) {
      if (state.sessions.length > 0) {
        /* Activate the session that slotted into this position */
        const next = state.sessions[Math.min(idx, state.sessions.length - 1)];
        next.status    = 'active';
        state.activeId = next.id;
      } else {
        /* No sessions left — create a fresh one */
        const fresh = {
          id:        uid(),
          title:     'New Chat',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          status:    'active',
          messages:  [],
        };
        state.sessions.push(fresh);
        state.activeId = fresh.id;
      }
    }

    _commit();
  }

  /**
   * Append a message to the active session.
   * Updates the session title from the first user message.
   */
  function addMessage(role, content) {
    const session = getActiveSession();
    if (!session) return null;

    const msg = {
      id:        uid(),
      role,
      content,
      timestamp: Date.now(),
    };

    session.messages.push(msg);
    session.updatedAt = Date.now();

    /* Set title from first user message */
    if (role === 'user' && session.title === 'New Chat') {
      session.title = deriveTitle(content);
    }

    _commit();
    return msg;
  }

  /** Expose the relativeTime helper for use by the UI. */
  function formatTime(ts) {
    return relativeTime(ts);
  }

  /* ── Initialise ──────────────────────────────────────────── */
  function init() {
    _load();

    /* Ensure there is always at least one session */
    if (state.sessions.length === 0) {
      const session = {
        id:        uid(),
        title:     'New Chat',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status:    'active',
        messages:  [],
      };
      state.sessions.push(session);
      state.activeId = session.id;
      _save();
    }

    /* If there's no active session, activate the first */
    if (!state.activeId || !state.sessions.find(s => s.id === state.activeId)) {
      state.activeId = state.sessions[0].id;
      state.sessions[0].status = 'active';
      _save();
    }
  }

  return {
    init,
    subscribe,
    getState,
    getActiveSession,
    createSession,
    switchSession,
    deleteSession,
    addMessage,
    formatTime,
  };
})();
