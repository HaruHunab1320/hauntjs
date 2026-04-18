import { describe, it, expect, vi } from "vitest";
import { EventBus } from "./event-bus.js";
import { roomId, guestId } from "./types.js";
import type { PresenceEvent } from "./types.js";

function makeEvent(type: PresenceEvent["type"] = "tick"): PresenceEvent {
  if (type === "tick") return { type: "tick", at: new Date() };

  if (type === "guest.entered") {
    return { type: "guest.entered", guestId: guestId("g1"), roomId: roomId("lobby"), at: new Date() };
  }

  if (type === "guest.spoke") {
    return {
      type: "guest.spoke",
      guestId: guestId("g1"),
      roomId: roomId("lobby"),
      text: "Hello",
      at: new Date(),
    };
  }

  return { type: "tick", at: new Date() };
}

describe("EventBus", () => {
  it("calls handlers for a specific event type", async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("tick", handler);

    await bus.emit(makeEvent("tick"));
    expect(handler).toHaveBeenCalledOnce();
  });

  it("calls wildcard handlers for all events", async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("*", handler);

    await bus.emit(makeEvent("tick"));
    await bus.emit(makeEvent("guest.entered"));
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("does not call handlers for unrelated event types", async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("guest.spoke", handler);

    await bus.emit(makeEvent("tick"));
    expect(handler).not.toHaveBeenCalled();
  });

  it("unsubscribes via returned function", async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsub = bus.on("tick", handler);

    unsub();
    await bus.emit(makeEvent("tick"));
    expect(handler).not.toHaveBeenCalled();
  });

  it("unsubscribes via off()", async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("tick", handler);

    bus.off("tick", handler);
    await bus.emit(makeEvent("tick"));
    expect(handler).not.toHaveBeenCalled();
  });

  it("clear removes all handlers", async () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on("tick", h1);
    bus.on("*", h2);

    bus.clear();
    await bus.emit(makeEvent("tick"));
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it("handles async handlers sequentially", async () => {
    const bus = new EventBus();
    const order: number[] = [];

    bus.on("tick", async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push(1);
    });
    bus.on("tick", async () => {
      order.push(2);
    });

    await bus.emit(makeEvent("tick"));
    expect(order).toEqual([1, 2]);
  });
});
