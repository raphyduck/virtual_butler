import { type ButlerJob } from './api';
import { getToken } from './auth';

const WS_BASE = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_WS_URL ?? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:8000`)
  : 'ws://localhost:8000';

export type WsEvent =
  | { type: 'chunk'; content: string }
  | { type: 'done' }
  | { type: 'error'; detail: string };

export type WsEventHandler = (event: WsEvent) => void;

export class SessionWebSocket {
  private ws: WebSocket | null = null;
  private onEvent: WsEventHandler;
  private sessionId: string;

  constructor(sessionId: string, onEvent: WsEventHandler) {
    this.sessionId = sessionId;
    this.onEvent = onEvent;
  }

  connect(): void {
    const token = getToken();
    const url = `${WS_BASE}/ws/session/${this.sessionId}${token ? `?token=${token}` : ''}`;
    this.ws = new WebSocket(url);

    this.ws.onmessage = (e) => {
      try {
        const data: WsEvent = JSON.parse(e.data);
        this.onEvent(data);
      } catch {
        // ignore malformed frames
      }
    };

    this.ws.onerror = () => {
      this.onEvent({ type: 'error', detail: 'WebSocket connection error' });
    };
  }

  send(content: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.onEvent({ type: 'error', detail: 'Not connected' });
      return;
    }
    this.ws.send(JSON.stringify({ content }));
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }
}

// ─── Butler WebSocket ──────────────────────────────────────────────────────────

export type ButlerWsEvent =
  | { type: 'chunk'; content: string }
  | { type: 'done' }
  | { type: 'error'; detail: string }
  | { type: 'modify_started'; job: ButlerJob }
  | { type: 'modify_update'; job: ButlerJob }
  | { type: 'modify_done'; job: ButlerJob };

export type ButlerWsEventHandler = (event: ButlerWsEvent) => void;

export class ButlerWebSocket {
  private ws: WebSocket | null = null;
  private onEvent: ButlerWsEventHandler;

  constructor(onEvent: ButlerWsEventHandler) {
    this.onEvent = onEvent;
  }

  connect(): void {
    const token = getToken();
    const url = `${WS_BASE}/ws/butler${token ? `?token=${token}` : ''}`;
    this.ws = new WebSocket(url);

    this.ws.onmessage = (e) => {
      try {
        const data: ButlerWsEvent = JSON.parse(e.data);
        this.onEvent(data);
      } catch {
        // ignore malformed frames
      }
    };

    this.ws.onerror = () => {
      this.onEvent({ type: 'error', detail: 'WebSocket connection error' });
    };

    this.ws.onclose = () => {
      this.ws = null;
    };
  }

  send(content: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.onEvent({ type: 'error', detail: 'Butler not connected' });
      return;
    }
    this.ws.send(JSON.stringify({ content }));
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
