import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TickScheduler } from "./tick.js";
import { Runtime } from "./runtime.js";
import { createPlace, addRoom, addGuest, enterRoom } from "./place.js";
import { roomId, guestId } from "./types.js";
import type { PresenceEvent } from "./types.js";

function makeRuntime(): Runtime {
  const place = createPlace({ id: "test", name: "Test" });
  addRoom(place, { id: roomId("lobby"), name: "Lobby", description: "A room" });

  return new Runtime({
    place,
    resident: {
      id: "poe",
      character: {
        name: "Poe",
        archetype: "test",
        systemPrompt: "You are Poe.",
        voice: { register: "warm", quirks: [], avoidances: [] },
        loyalties: { principal: null, values: [] },
      },
      currentRoom: roomId("lobby"),
      mood: { energy: 0.8, focus: 0.7, valence: 0.5 },
    },
  });
}

describe("TickScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits tick events at the configured interval", async () => {
    const runtime = makeRuntime();
    await runtime.start();

    // Add a guest so ticks fire (tickWhenEmpty defaults to false)
    addGuest(runtime.place, { id: guestId("g1"), name: "Takeshi" });
    enterRoom(runtime.place, guestId("g1"), roomId("lobby"));

    const events: PresenceEvent[] = [];
    runtime.eventBus.on("tick", (e) => { events.push(e); });

    const scheduler = new TickScheduler(runtime, { intervalMs: 1000 });
    scheduler.start();

    await vi.advanceTimersByTimeAsync(3500);

    scheduler.stop();
    expect(events.length).toBe(3);
    expect(events[0].type).toBe("tick");
  });

  it("does not emit ticks when no guests are present", async () => {
    const runtime = makeRuntime();
    await runtime.start();

    const events: PresenceEvent[] = [];
    runtime.eventBus.on("tick", (e) => { events.push(e); });

    const scheduler = new TickScheduler(runtime, { intervalMs: 1000 });
    scheduler.start();

    await vi.advanceTimersByTimeAsync(3500);

    scheduler.stop();
    expect(events.length).toBe(0);
  });

  it("emits ticks when empty if configured", async () => {
    const runtime = makeRuntime();
    await runtime.start();

    const events: PresenceEvent[] = [];
    runtime.eventBus.on("tick", (e) => { events.push(e); });

    const scheduler = new TickScheduler(runtime, { intervalMs: 1000, tickWhenEmpty: true });
    scheduler.start();

    await vi.advanceTimersByTimeAsync(2500);

    scheduler.stop();
    expect(events.length).toBe(2);
  });

  it("fires an immediate tick", async () => {
    const runtime = makeRuntime();
    await runtime.start();

    // Need a guest present for the tick to fire
    addGuest(runtime.place, { id: guestId("g1"), name: "Takeshi" });
    enterRoom(runtime.place, guestId("g1"), roomId("lobby"));

    const events: PresenceEvent[] = [];
    runtime.eventBus.on("tick", (e) => { events.push(e); });

    const scheduler = new TickScheduler(runtime, { intervalMs: 60000 });
    scheduler.start();

    await scheduler.fireImmediate();

    scheduler.stop();
    expect(events.length).toBe(1);
  });

  it("stops cleanly", async () => {
    const runtime = makeRuntime();
    await runtime.start();

    addGuest(runtime.place, { id: guestId("g1"), name: "Takeshi" });
    enterRoom(runtime.place, guestId("g1"), roomId("lobby"));

    const events: PresenceEvent[] = [];
    runtime.eventBus.on("tick", (e) => { events.push(e); });

    const scheduler = new TickScheduler(runtime, { intervalMs: 1000 });
    scheduler.start();
    scheduler.stop();

    await vi.advanceTimersByTimeAsync(3500);

    expect(events.length).toBe(0);
  });
});
