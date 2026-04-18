import type { PresenceEvent } from "./types.js";

export type EventHandler = (event: PresenceEvent) => void | Promise<void>;
export type EventType = PresenceEvent["type"];

export class EventBus {
  private handlers = new Map<EventType | "*", Set<EventHandler>>();

  on(type: EventType | "*", handler: EventHandler): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);

    return () => {
      set!.delete(handler);
      if (set!.size === 0) {
        this.handlers.delete(type);
      }
    };
  }

  async emit(event: PresenceEvent): Promise<void> {
    const specificHandlers = this.handlers.get(event.type);
    const wildcardHandlers = this.handlers.get("*");

    const all: EventHandler[] = [];
    if (specificHandlers) all.push(...specificHandlers);
    if (wildcardHandlers) all.push(...wildcardHandlers);

    for (const handler of all) {
      await handler(event);
    }
  }

  off(type: EventType | "*", handler: EventHandler): void {
    const set = this.handlers.get(type);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        this.handlers.delete(type);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
