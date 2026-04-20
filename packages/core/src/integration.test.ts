import { describe, expect, it, vi } from "vitest";
import { omniscientSensor } from "./sensors/omniscient.js";
import { presenceSensor } from "./sensors/presence-sensor.js";
import { soundSensor } from "./sensors/sound-sensor.js";
import { sightSensor } from "./sensors/sight-sensor.js";
import { Runtime } from "./runtime.js";
import {
  addAffordance,
  addGuest,
  addRoom,
  connectRooms,
  createPlace,
  enterRoom,
} from "./place.js";
import { affordanceId, guestId, roomId } from "./types.js";
import type {
  Affordance,
  Place,
  PresenceEvent,
  Perception,
  ResidentAction,
  ResidentMind,
  ResidentState,
  RuntimeContext,
} from "./types.js";

function makeTestPlace(): Place {
  const place = createPlace({ id: "test", name: "Test Place" });
  const lobby = roomId("lobby");
  const study = roomId("study");

  addRoom(place, { id: lobby, name: "Lobby", description: "Main hall" });
  addRoom(place, { id: study, name: "Study", description: "Quiet room" });
  connectRooms(place, lobby, study);

  // Lobby: full sensors
  const lobbyRoom = place.rooms.get(lobby)!;
  lobbyRoom.sensors = new Map([
    sightSensor("lobby.sight", lobby),
    soundSensor("lobby.sound", lobby),
    presenceSensor("lobby.presence", lobby, { fidelity: { kind: "full" } }),
  ]);

  // Study: no sensors (perceptually dark)
  // (left empty intentionally)

  const fireplace: Affordance = {
    id: affordanceId("fireplace"),
    roomId: lobby,
    kind: "fireplace",
    name: "Fireplace",
    description: "A fireplace",
    state: { lit: false },
    actions: [
      {
        id: "light",
        name: "Light",
        description: "Light the fire",
        stateChange: { lit: true },
        availableWhen: (s) => s.lit === false,
      },
    ],
    sensable: true,
  };
  addAffordance(place, lobby, fireplace);

  return place;
}

function makeResident(mode: "host" | "inhabitant" = "inhabitant"): ResidentState {
  return {
    id: "poe",
    character: {
      name: "Poe",
      archetype: "test",
      systemPrompt: "You are Poe.",
      voice: { register: "warm", quirks: [], avoidances: [] },
      loyalties: { principal: null, values: [] },
    },
    presenceMode: mode,
    currentRoom: roomId("lobby"),
    focusRoom: null,
    mood: { energy: 0.8, focus: 0.7, valence: 0.5 },
  };
}

describe("Integration: full pipeline", () => {
  describe("Inhabitant mode", () => {
    it("perceives events in sensored rooms, not unsensored ones", async () => {
      const perceiveCalls: Array<{ event: PresenceEvent; perceptions: Perception[] }> = [];
      const mind: ResidentMind = {
        perceive: vi.fn(async (event, perceptions, _ctx) => {
          perceiveCalls.push({ event, perceptions });
          return null;
        }),
      };

      const rt = new Runtime({
        place: makeTestPlace(),
        resident: makeResident("inhabitant"),
        residentMind: mind,
      });
      await rt.start();

      addGuest(rt.place, { id: guestId("g1"), name: "Takeshi" });

      // Guest enters lobby (has sensors) — should produce perceptions
      await rt.emit({
        type: "guest.entered",
        guestId: guestId("g1"),
        roomId: roomId("lobby"),
        at: new Date(),
      });

      expect(perceiveCalls).toHaveLength(1);
      expect(perceiveCalls[0].perceptions.length).toBeGreaterThan(0);

      // Guest moves to study (no sensors) — should NOT produce perceptions
      perceiveCalls.length = 0;
      await rt.emit({
        type: "guest.moved",
        guestId: guestId("g1"),
        from: roomId("lobby"),
        to: roomId("study"),
        at: new Date(),
      });

      // AutonomySystem should have blocked deliberation (no perceptions)
      expect(perceiveCalls).toHaveLength(0);

      await rt.stop();
    });

    it("tick events always pass through regardless of sensors", async () => {
      const mind: ResidentMind = {
        perceive: vi.fn(async () => null),
      };

      const rt = new Runtime({
        place: makeTestPlace(),
        resident: makeResident("inhabitant"),
        residentMind: mind,
      });
      await rt.start();

      await rt.emit({ type: "tick", at: new Date() });

      expect(mind.perceive).toHaveBeenCalledOnce();
      await rt.stop();
    });

    it("resident actions broadcast through the event bus", async () => {
      const speakAction: ResidentAction = {
        type: "speak",
        text: "Welcome home.",
        audience: "all",
      };
      const mind: ResidentMind = {
        perceive: vi.fn(async () => speakAction),
      };

      const rt = new Runtime({
        place: makeTestPlace(),
        resident: makeResident("inhabitant"),
        residentMind: mind,
      });
      await rt.start();

      addGuest(rt.place, { id: guestId("g1"), name: "Takeshi" });
      enterRoom(rt.place, guestId("g1"), roomId("lobby"));

      const events: PresenceEvent[] = [];
      rt.eventBus.on("resident.spoke", (e) => {
        events.push(e);
      });

      await rt.emit({
        type: "guest.entered",
        guestId: guestId("g1"),
        roomId: roomId("lobby"),
        at: new Date(),
      });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("resident.spoke");

      await rt.stop();
    });
  });

  describe("Host mode", () => {
    it("auto-focuses on the event room", async () => {
      const mind: ResidentMind = {
        perceive: vi.fn(async () => null),
      };

      const place = makeTestPlace();
      // Add full sensors to study so events are perceived
      place.rooms.get(roomId("study"))!.sensors = new Map([
        sightSensor("study.sight", roomId("study")),
        soundSensor("study.sound", roomId("study")),
        presenceSensor("study.presence", roomId("study"), { fidelity: { kind: "full" } }),
      ]);

      const resident = makeResident("host");
      const rt = new Runtime({ place, resident, residentMind: mind });
      await rt.start();

      addGuest(rt.place, { id: guestId("g1"), name: "Takeshi" });
      enterRoom(rt.place, guestId("g1"), roomId("study"));

      await rt.emit({
        type: "guest.spoke",
        guestId: guestId("g1"),
        roomId: roomId("study"),
        text: "Hello",
        at: new Date(),
      });

      expect(resident.focusRoom).toBe(roomId("study"));

      await rt.stop();
    });

    it("sees all guests in context, not just current room", async () => {
      let capturedContext: RuntimeContext | null = null;
      const mind: ResidentMind = {
        perceive: vi.fn(async (_event, _perceptions, ctx) => {
          capturedContext = ctx;
          return null;
        }),
      };

      const place = makeTestPlace();
      place.rooms.get(roomId("lobby"))!.sensors = new Map([
        sightSensor("lobby.sight", roomId("lobby")),
        soundSensor("lobby.sound", roomId("lobby")),
        presenceSensor("lobby.presence", roomId("lobby"), { fidelity: { kind: "full" } }),
      ]);
      place.rooms.get(roomId("study"))!.sensors = new Map([
        sightSensor("study.sight", roomId("study")),
        soundSensor("study.sound", roomId("study")),
        presenceSensor("study.presence", roomId("study"), { fidelity: { kind: "full" } }),
      ]);

      const rt = new Runtime({
        place,
        resident: makeResident("host"),
        residentMind: mind,
      });
      await rt.start();

      // Add two guests in different rooms
      addGuest(rt.place, { id: guestId("g1"), name: "Takeshi" });
      addGuest(rt.place, { id: guestId("g2"), name: "Rei" });
      enterRoom(rt.place, guestId("g1"), roomId("lobby"));
      enterRoom(rt.place, guestId("g2"), roomId("study"));

      await rt.emit({
        type: "guest.spoke",
        guestId: guestId("g1"),
        roomId: roomId("lobby"),
        text: "Hello",
        at: new Date(),
      });

      expect(capturedContext).not.toBeNull();
      expect(capturedContext!.guestsInRoom).toHaveLength(2);

      await rt.stop();
    });

    it("speak action routes to focus room", async () => {
      const place = makeTestPlace();
      place.rooms.get(roomId("study"))!.sensors = new Map([
        omniscientSensor("study.omni", roomId("study")),
      ]);

      const resident = makeResident("host");
      const rt = new Runtime({ place, resident });
      await rt.start();

      addGuest(rt.place, { id: guestId("g1"), name: "Takeshi" });
      enterRoom(rt.place, guestId("g1"), roomId("study"));

      // Set focus to study
      resident.focusRoom = roomId("study");

      const result = await rt.applyAction({
        type: "speak",
        text: "Hello there",
        audience: "all",
      });

      expect(result.success).toBe(true);
      expect(result.event?.type).toBe("resident.spoke");
      if (result.event?.type === "resident.spoke") {
        expect(result.event.roomId).toBe(roomId("study"));
      }

      await rt.stop();
    });

    it("move action becomes focus shift, no connectivity check", async () => {
      const resident = makeResident("host");
      const rt = new Runtime({
        place: makeTestPlace(),
        resident,
      });
      await rt.start();

      // Study is connected to lobby, but garden wouldn't be
      // For Host mode, move should just shift focus without checking
      const result = await rt.applyAction({
        type: "move",
        toRoom: roomId("study"),
      });

      expect(result.success).toBe(true);
      expect(resident.focusRoom).toBe(roomId("study"));
      // No resident.moved event for Host mode
      expect(result.event).toBeUndefined();

      await rt.stop();
    });
  });

  describe("Sensor pipeline", () => {
    it("produces different perceptions based on sensor fidelity", async () => {
      const perceiveCalls: Perception[][] = [];
      const mind: ResidentMind = {
        perceive: vi.fn(async (_event, perceptions) => {
          perceiveCalls.push([...perceptions]);
          return null;
        }),
      };

      const place = makeTestPlace();
      // Replace lobby sensors with partial presence (no identity)
      place.rooms.get(roomId("lobby"))!.sensors = new Map([
        presenceSensor("lobby.partial", roomId("lobby")),
      ]);

      const rt = new Runtime({ place, resident: makeResident(), residentMind: mind });
      await rt.start();

      addGuest(rt.place, { id: guestId("g1"), name: "Takeshi" });

      await rt.emit({
        type: "guest.entered",
        guestId: guestId("g1"),
        roomId: roomId("lobby"),
        at: new Date(),
      });

      expect(perceiveCalls).toHaveLength(1);
      const perceptions = perceiveCalls[0];
      expect(perceptions.length).toBeGreaterThan(0);
      // Partial presence sensor should say "Someone" not "Takeshi"
      expect(perceptions[0].content).toContain("Someone");
      expect(perceptions[0].content).not.toContain("Takeshi");

      await rt.stop();
    });
  });
});
