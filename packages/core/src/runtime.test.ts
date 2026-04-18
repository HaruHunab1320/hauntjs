import { describe, it, expect, vi } from "vitest";
import { Runtime } from "./runtime.js";
import {
  createPlace,
  addRoom,
  connectRooms,
  addAffordance,
  addGuest,
} from "./place.js";
import { roomId, affordanceId, guestId } from "./types.js";
import type {
  Place,
  ResidentState,
  ResidentAction,
  PresenceEvent,
  Affordance,
  ResidentInterface,
} from "./types.js";

function makeTestPlace(): Place {
  const place = createPlace({ id: "roost", name: "The Roost" });
  const lobby = roomId("lobby");
  const study = roomId("study");
  const garden = roomId("garden");

  addRoom(place, { id: lobby, name: "Lobby", description: "The main hall" });
  addRoom(place, { id: study, name: "Study", description: "A quiet room" });
  addRoom(place, { id: garden, name: "Garden", description: "The garden" });
  connectRooms(place, lobby, study);
  connectRooms(place, lobby, garden);

  const fireplace: Affordance = {
    id: affordanceId("fireplace"),
    roomId: lobby,
    kind: "fireplace",
    name: "Fireplace",
    description: "A stone fireplace",
    state: { lit: false },
    actions: [
      {
        id: "light",
        name: "Light",
        description: "Light the fire",
        availableWhen: (s) => s.lit === false,
      },
      {
        id: "extinguish",
        name: "Extinguish",
        description: "Put out the fire",
        availableWhen: (s) => s.lit === true,
      },
    ],
    sensable: true,
  };
  addAffordance(place, lobby, fireplace);

  return place;
}

function makeResident(): ResidentState {
  return {
    id: "poe",
    character: {
      name: "Poe",
      archetype: "hospitable concierge",
      systemPrompt: "You are Poe.",
      voice: { register: "warm", quirks: [], avoidances: [] },
      loyalties: { principal: null, values: ["guest safety"] },
    },
    currentRoom: roomId("lobby"),
    mood: { energy: 0.8, focus: 0.7, valence: 0.5 },
  };
}

function makeRuntime(
  place?: Place,
  residentMind?: ResidentInterface,
): Runtime {
  return new Runtime({
    place: place ?? makeTestPlace(),
    resident: makeResident(),
    residentMind,
  });
}

describe("Runtime", () => {
  describe("lifecycle", () => {
    it("throws when emitting before start", async () => {
      const rt = makeRuntime();
      await expect(
        rt.emit({ type: "tick", at: new Date() }),
      ).rejects.toThrow(/not running/);
    });

    it("starts and stops cleanly", async () => {
      const rt = makeRuntime();
      await rt.start();
      await rt.stop();
    });
  });

  describe("emit — guest events update state", () => {
    it("guest.entered updates guest room", async () => {
      const rt = makeRuntime();
      await rt.start();
      addGuest(rt.place, { id: guestId("g1"), name: "Takeshi" });

      await rt.emit({
        type: "guest.entered",
        guestId: guestId("g1"),
        roomId: roomId("lobby"),
        at: new Date(),
      });

      const guest = rt.place.guests.get(guestId("g1"))!;
      expect(guest.currentRoom).toBe(roomId("lobby"));
      expect(guest.visitCount).toBe(1);
    });

    it("guest.moved updates guest room", async () => {
      const rt = makeRuntime();
      await rt.start();
      addGuest(rt.place, { id: guestId("g1"), name: "Takeshi" });

      await rt.emit({
        type: "guest.entered",
        guestId: guestId("g1"),
        roomId: roomId("lobby"),
        at: new Date(),
      });
      await rt.emit({
        type: "guest.moved",
        guestId: guestId("g1"),
        from: roomId("lobby"),
        to: roomId("study"),
        at: new Date(),
      });

      const guest = rt.place.guests.get(guestId("g1"))!;
      expect(guest.currentRoom).toBe(roomId("study"));
    });

    it("guest.left clears guest room", async () => {
      const rt = makeRuntime();
      await rt.start();
      addGuest(rt.place, { id: guestId("g1"), name: "Takeshi" });

      await rt.emit({
        type: "guest.entered",
        guestId: guestId("g1"),
        roomId: roomId("lobby"),
        at: new Date(),
      });
      await rt.emit({
        type: "guest.left",
        guestId: guestId("g1"),
        roomId: roomId("lobby"),
        at: new Date(),
      });

      const guest = rt.place.guests.get(guestId("g1"))!;
      expect(guest.currentRoom).toBeNull();
    });
  });

  describe("emit — event bus broadcasts", () => {
    it("notifies specific event handlers", async () => {
      const rt = makeRuntime();
      await rt.start();

      const handler = vi.fn();
      rt.eventBus.on("tick", handler);

      await rt.emit({ type: "tick", at: new Date() });
      expect(handler).toHaveBeenCalledOnce();
    });

    it("notifies wildcard handlers", async () => {
      const rt = makeRuntime();
      await rt.start();

      const handler = vi.fn();
      rt.eventBus.on("*", handler);

      await rt.emit({ type: "tick", at: new Date() });
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe("applyAction — speak", () => {
    it("succeeds for a valid room", async () => {
      const rt = makeRuntime();
      addGuest(rt.place, { id: guestId("g1"), name: "Takeshi" });

      const result = await rt.applyAction({
        type: "speak",
        text: "Welcome home.",
        audience: [guestId("g1")],
      });

      expect(result.success).toBe(true);
      expect(result.event?.type).toBe("resident.spoke");
    });

    it("resolves 'all' audience to guests in room", async () => {
      const rt = makeRuntime();
      addGuest(rt.place, { id: guestId("g1"), name: "Takeshi" });
      const g = rt.place.guests.get(guestId("g1"))!;
      g.currentRoom = roomId("lobby");

      const result = await rt.applyAction({
        type: "speak",
        text: "Hello everyone.",
        audience: "all",
      });

      expect(result.success).toBe(true);
      const event = result.event as PresenceEvent & { type: "resident.spoke" };
      expect(event.audience).toContain(guestId("g1"));
    });

    it("fails for a non-existent room", async () => {
      const rt = makeRuntime();
      const result = await rt.applyAction({
        type: "speak",
        text: "Hello",
        audience: "all",
        roomId: roomId("basement"),
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/does not exist/);
    });
  });

  describe("applyAction — move", () => {
    it("moves the resident to a connected room", async () => {
      const rt = makeRuntime();
      const result = await rt.applyAction({ type: "move", toRoom: roomId("study") });
      expect(result.success).toBe(true);
      expect(rt.resident.currentRoom).toBe(roomId("study"));
    });

    it("fails for an unconnected room", async () => {
      const rt = makeRuntime();
      // study and garden are not connected to each other
      rt.resident.currentRoom = roomId("study");
      const result = await rt.applyAction({ type: "move", toRoom: roomId("garden") });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not connected/);
    });

    it("fails for a non-existent room", async () => {
      const rt = makeRuntime();
      const result = await rt.applyAction({ type: "move", toRoom: roomId("basement") });
      expect(result.success).toBe(false);
    });
  });

  describe("applyAction — act", () => {
    it("succeeds for an available action", async () => {
      const rt = makeRuntime();
      const result = await rt.applyAction({
        type: "act",
        affordanceId: affordanceId("fireplace"),
        actionId: "light",
      });
      expect(result.success).toBe(true);
      expect(result.event?.type).toBe("resident.acted");
    });

    it("fails when action is not available in current state", async () => {
      const rt = makeRuntime();
      // fireplace starts unlit, so extinguish should fail
      const result = await rt.applyAction({
        type: "act",
        affordanceId: affordanceId("fireplace"),
        actionId: "extinguish",
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not available/);
    });

    it("fails for a non-existent affordance", async () => {
      const rt = makeRuntime();
      const result = await rt.applyAction({
        type: "act",
        affordanceId: affordanceId("piano"),
        actionId: "play",
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/does not exist/);
    });

    it("fails for a non-existent action", async () => {
      const rt = makeRuntime();
      const result = await rt.applyAction({
        type: "act",
        affordanceId: affordanceId("fireplace"),
        actionId: "explode",
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/does not exist/);
    });
  });

  describe("applyAction — note and wait", () => {
    it("note always succeeds", async () => {
      const rt = makeRuntime();
      const result = await rt.applyAction({
        type: "note",
        content: "Takeshi seems tired.",
        about: guestId("g1"),
      });
      expect(result.success).toBe(true);
    });

    it("wait always succeeds", async () => {
      const rt = makeRuntime();
      const result = await rt.applyAction({ type: "wait" });
      expect(result.success).toBe(true);
    });
  });

  describe("resident mind integration", () => {
    it("calls perceive on the resident mind when events arrive", async () => {
      const mind: ResidentInterface = {
        perceive: vi.fn().mockResolvedValue(null),
      };
      const rt = makeRuntime(undefined, mind);
      await rt.start();

      await rt.emit({ type: "tick", at: new Date() });
      expect(mind.perceive).toHaveBeenCalledOnce();
    });

    it("applies the action returned by the resident mind", async () => {
      const speakAction: ResidentAction = {
        type: "speak",
        text: "Welcome home, Takeshi.",
        audience: "all",
      };
      const mind: ResidentInterface = {
        perceive: vi.fn().mockResolvedValue(speakAction),
      };
      const rt = makeRuntime(undefined, mind);
      await rt.start();

      const events: PresenceEvent[] = [];
      rt.eventBus.on("*", (e) => { events.push(e); });

      addGuest(rt.place, { id: guestId("g1"), name: "Takeshi" });
      await rt.emit({
        type: "guest.entered",
        guestId: guestId("g1"),
        roomId: roomId("lobby"),
        at: new Date(),
      });

      expect(mind.perceive).toHaveBeenCalledOnce();
    });

    it("does not call perceive for resident's own events", async () => {
      const mind: ResidentInterface = {
        perceive: vi.fn().mockResolvedValue(null),
      };
      const rt = makeRuntime(undefined, mind);
      await rt.start();

      await rt.emit({
        type: "resident.spoke",
        roomId: roomId("lobby"),
        text: "Hello",
        audience: [],
        at: new Date(),
      });
      expect(mind.perceive).not.toHaveBeenCalled();
    });
  });

  describe("integration: full event sequence", () => {
    it("handles a complete guest visit flow", async () => {
      const rt = makeRuntime();
      await rt.start();

      const events: PresenceEvent[] = [];
      rt.eventBus.on("*", (e) => { events.push(e); });

      // Add guest
      addGuest(rt.place, { id: guestId("takeshi"), name: "Takeshi" });

      // Guest enters lobby
      await rt.emit({
        type: "guest.entered",
        guestId: guestId("takeshi"),
        roomId: roomId("lobby"),
        at: new Date(),
      });

      // Guest speaks
      await rt.emit({
        type: "guest.spoke",
        guestId: guestId("takeshi"),
        roomId: roomId("lobby"),
        text: "Good evening, Poe.",
        at: new Date(),
      });

      // Guest moves to study
      await rt.emit({
        type: "guest.moved",
        guestId: guestId("takeshi"),
        from: roomId("lobby"),
        to: roomId("study"),
        at: new Date(),
      });

      // Guest leaves
      await rt.emit({
        type: "guest.left",
        guestId: guestId("takeshi"),
        roomId: roomId("study"),
        at: new Date(),
      });

      // Verify final state
      const guest = rt.place.guests.get(guestId("takeshi"))!;
      expect(guest.currentRoom).toBeNull();
      expect(events).toHaveLength(4);
      expect(events.map((e) => e.type)).toEqual([
        "guest.entered",
        "guest.spoke",
        "guest.moved",
        "guest.left",
      ]);

      await rt.stop();
    });
  });
});
