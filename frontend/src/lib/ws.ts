import { type ButlerJob, refreshTokens } from './api';
import { getToken, getRefreshToken, isTokenValid, setToken, setRefreshToken } from './auth';

/** Derive the WebSocket base URL.
 *  Prefer the explicit env var.  Otherwise connect to the *same* origin that
 *  serves the page so the connection goes through the Next.js / nginx proxy
 *  instead of requiring direct access to the backend port. */
const WS_BASE = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_WS_URL ?? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`)
  : 'ws://localhost:8000';

export type WsEvent =
  | { type: 'chunk'; content: string }
  | { type: 'done' }
  | { type: 'error'; detail: string }
  | { type: 'connected' }
  | { type: 'disconnected' }
  | { type: 'reconnected' };

export type WsEventHandler = (event: WsEvent) => void;

const MAX_RECONNECT_DELAY = 30000;

async function refreshAuthToken(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt || !isTokenValid(rt)) return false;
  try {
    const data = await refreshTokens(rt);
    setToken(data.access_token);
    setRefreshToken(data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

export class SessionWebSocket {
  private ws: WebSocket | null = null;
  private onEvent: WsEventHandler;
  private sessionId: string;
  private _intentionalClose = false;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _reconnectDelay = 1000;
  private _hasConnectedBefore = false;

  constructor(sessionId: string, onEvent: WsEventHandler) {
    this.sessionId = sessionId;
    this.onEvent = onEvent;
  }

  connect(): void {
    this._intentionalClose = false;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    const token = getToken();
    const url = `${WS_BASE}/ws/session/${this.sessionId}${token ? `?token=${token}` : ''}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this._reconnectDelay = 1000;
      this.onEvent({ type: this._hasConnectedBefore ? 'reconnected' : 'connected' });
      this._hasConnectedBefore = true;
    };

    this.ws.onmessage = (e) => {
      try {
        const data: WsEvent = JSON.parse(e.data);
        this.onEvent(data);
      } catch {
        // ignore malformed frames
      }
    };

    this.ws.onerror = () => {
      // Error events are followed by close; reconnect is handled in onclose
    };

    this.ws.onclose = (ev) => {
      this.ws = null;
      this.onEvent({ type: 'disconnected' });
      if (this._intentionalClose) return;
      if (ev.code === 4001) {
        this._refreshAndReconnect();
      } else {
        this._scheduleReconnect();
      }
    };
  }

  private async _refreshAndReconnect(): Promise<void> {
    if (await refreshAuthToken()) {
      this.connect();
      return;
    }
    this.onEvent({ type: 'error', detail: 'Session expired — please log in again' });
  }

  private _scheduleReconnect(): void {
    if (this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      const token = getToken();
      if (!token || !isTokenValid(token)) {
        this._refreshAndReconnect();
      } else {
        this.connect();
      }
    }, this._reconnectDelay);
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, MAX_RECONNECT_DELAY);
  }

  send(content: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.onEvent({ type: 'error', detail: 'Not connected' });
      return;
    }
    this.ws.send(JSON.stringify({ content }));
  }

  close(): void {
    this._intentionalClose = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }
}

// ─── Butler WebSocket ──────────────────────────────────────────────────────────

export interface AgentStep {
  tool: string;
  label: string;
  status: string;
}

export type ButlerWsEvent =
  | { type: 'chunk'; content: string }
  | { type: 'done' }
  | { type: 'error'; detail: string }
  | { type: 'connected' }
  | { type: 'disconnected' }
  | { type: 'modify_started'; job: ButlerJob }
  | { type: 'modify_snapshot'; job: ButlerJob }
  | { type: 'modify_step'; job_id: string; step: AgentStep }
  | { type: 'modify_update'; job: ButlerJob }
  | { type: 'modify_done'; job: ButlerJob }
  | { type: 'reconnected' };

export type ButlerWsEventHandler = (event: ButlerWsEvent) => void;

function describeWebSocketClose(ev: CloseEvent): string {
  const meta = `code ${ev.code}, raison: ${ev.reason || 'absente'}, fermeture ${ev.wasClean ? 'propre' : 'non propre'}`;
  if (ev.code === 4001) return `Session expirée (${meta})`;
  if (ev.code === 1006 || !ev.reason) return `Problème réseau / proxy WebSocket (${meta})`;
  return `Connexion fermée à distance (${meta})`;
}

export class ButlerWebSocket {
  private ws: WebSocket | null = null;
  private onEvent: ButlerWsEventHandler;
  private _intentionalClose = false;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _reconnectDelay = 1000;
  private _hasConnectedBefore = false;
  private _conversationId: string | null;

  constructor(onEvent: ButlerWsEventHandler, conversationId: string | null = null) {
    this.onEvent = onEvent;
    this._conversationId = conversationId;
  }

  connect(): void {
    this._intentionalClose = false;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    const token = getToken();
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (this._conversationId) params.set('conversation_id', this._conversationId);
    const url = `${WS_BASE}/ws/butler?${params}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this._reconnectDelay = 1000;
      this.onEvent({ type: this._hasConnectedBefore ? 'reconnected' : 'connected' });
      this._hasConnectedBefore = true;
    };

    this.ws.onmessage = (e) => {
      try {
        const data: ButlerWsEvent = JSON.parse(e.data);
        this.onEvent(data);
      } catch {
        // ignore malformed frames
      }
    };

    this.ws.onerror = () => {
      // Error events are followed by close; reconnect is handled in onclose
    };

    this.ws.onclose = (ev) => {
      this.ws = null;
      if (!this._intentionalClose) {
        this.onEvent({ type: 'error', detail: describeWebSocketClose(ev) });
      }
      this.onEvent({ type: 'disconnected' });
      if (!this._intentionalClose) {
        if (ev.code === 4001) {
          // Auth rejected — refresh token before reconnecting
          this._refreshAndReconnect();
        } else {
          this._scheduleReconnect();
        }
      }
    };
  }

  /** Try to refresh the JWT, then reconnect. Falls back to normal reconnect schedule on failure. */
  private async _refreshAndReconnect(): Promise<void> {
    if (await refreshAuthToken()) {
      this.connect();
      return;
    }
    // Can't refresh — tell the user and stop retrying
    this.onEvent({ type: 'error', detail: 'Session expired — please log in again' });
  }

  private _scheduleReconnect(): void {
    if (this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      // Before reconnecting, ensure token is still valid; refresh if needed
      const token = getToken();
      if (!token || !isTokenValid(token)) {
        this._refreshAndReconnect();
      } else {
        this.connect();
      }
    }, this._reconnectDelay);
    this._reconnectDelay = Math.min(
      this._reconnectDelay * 2,
      MAX_RECONNECT_DELAY,
    );
  }

  send(content: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.onEvent({ type: 'error', detail: 'Butler not connected' });
      return;
    }
    this.ws.send(JSON.stringify({ content }));
  }

  close(): void {
    this._intentionalClose = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
