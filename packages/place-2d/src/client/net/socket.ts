import type { ServerMessage } from "../../shared/protocol-types.js";

export type SocketEventType = ServerMessage["type"];
export type SocketHandler<T extends ServerMessage = ServerMessage> = (msg: T) => void;

export class GameSocket {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<SocketHandler>>();
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error("WebSocket connection failed"));

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as ServerMessage;
          this.dispatch(msg);
        } catch {
          console.warn("Failed to parse server message");
        }
      };

      this.ws.onclose = () => {
        this.dispatch({ type: "error", message: "Connection closed" } as ServerMessage);
      };
    });
  }

  on<T extends ServerMessage>(type: T["type"], handler: SocketHandler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as SocketHandler);
    return () => { set!.delete(handler as SocketHandler); };
  }

  send(msg: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  join(guestName: string): void {
    this.send({ type: "join", guestName });
  }

  speak(text: string): void {
    this.send({ type: "speak", text });
  }

  move(toRoom: string): void {
    this.send({ type: "move", toRoom });
  }

  interact(affordanceId: string, actionId: string): void {
    this.send({ type: "interact", affordanceId, actionId });
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  private dispatch(msg: ServerMessage): void {
    const handlers = this.handlers.get(msg.type);
    if (handlers) {
      for (const h of handlers) {
        h(msg);
      }
    }
    // Also dispatch to wildcard
    const wildcardHandlers = this.handlers.get("*");
    if (wildcardHandlers) {
      for (const h of wildcardHandlers) {
        h(msg);
      }
    }
  }
}
