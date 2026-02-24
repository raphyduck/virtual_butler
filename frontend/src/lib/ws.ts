import { getToken } from './auth';

const WS_BASE = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_WS_URL ?? `ws://${window.location.hostname}:8000`)
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
