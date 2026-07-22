type Listener = (payload: Record<string, unknown>, at: number) => void;

interface WsMessage {
  type: string;
  payload: Record<string, unknown>;
  at: number;
}

const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;
const BACKOFF_FACTOR = 2;

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private currentDelay = INITIAL_DELAY_MS;
  private running = false;
  private baseUrl: string;
  private token: string | null = null;
  private onReconnectCallback: (() => void) | null = null;
  private wasEverConnected = false;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || '';
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  onReconnect(callback: () => void): void {
    this.onReconnectCallback = callback;
  }

  offReconnect(): void {
    this.onReconnectCallback = null;
  }

  connect(): void {
    if (this.running) return;
    this.running = true;
    this.currentDelay = INITIAL_DELAY_MS;
    this.doConnect();
  }

  disconnect(): void {
    this.running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  subscribe(eventType: string, listener: Listener): () => void {
    let set = this.listeners.get(eventType);
    if (!set) {
      set = new Set();
      this.listeners.set(eventType, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
      if (set?.size === 0) {
        this.listeners.delete(eventType);
      }
    };
  }

  private doConnect(): void {
    if (!this.running) return;

    const url = this.buildUrl();
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.currentDelay = INITIAL_DELAY_MS;
      if (this.wasEverConnected && this.onReconnectCallback) {
        try {
          this.onReconnectCallback();
        } catch {
          // Swallow
        }
      }
      this.wasEverConnected = true;
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg: WsMessage = JSON.parse(event.data as string);
        const set = this.listeners.get(msg.type);
        if (set) {
          for (const listener of set) {
            try {
              listener(msg.payload, msg.at);
            } catch {
              // Swallow listener errors
            }
          }
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      this.ws = null;
      if (!this.running) return;

      if (this.onReconnectCallback) {
        try {
          this.onReconnectCallback();
        } catch {
          // Swallow
        }
      }

      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  private buildUrl(): string {
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const prefix = !this.baseUrl && import.meta.env.DEV ? '/api' : '';
    const host = this.baseUrl || window.location.host;
    const path = `${wsProto}//${host}${prefix}/ws`;
    return this.token ? `${path}?token=${this.token}` : path;
  }

  private scheduleReconnect(): void {
    if (!this.running) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, this.currentDelay);
    this.currentDelay = Math.min(this.currentDelay * BACKOFF_FACTOR, MAX_DELAY_MS);
  }
}

export const realtime = new RealtimeClient();
