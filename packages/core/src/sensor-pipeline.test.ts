import { describe, expect, it } from "vitest";
import { addGuest, addRoom, connectRooms, createPlace, enterRoom } from "./place.js";
import {
  ATTENUATION_PER_HOP,
  DEFAULT_EVENT_MODALITIES,
  type EventModalityMap,
  filterEvent,
} from "./sensor-pipeline.js";
import { hopDistance } from "./sensor-reach.js";
import type { Place, PresenceEvent, RoomId, SensorFidelity, SensorReach } from "./types.js";
import { guestId, roomId, sensorId } from "./types.js";

const LOBBY = roomId("lobby");
const HALL = roomId("hall");
const STUDY = roomId("study");
const CELLAR = roomId("cellar");

/** lobby ── hall ── study ── cellar, a straight line so hop counts are unambiguous. */
function makePlace(): Place {
  const place = createPlace({ id: "p", name: "P" });
  for (const [id, name] of [
    [LOBBY, "Lobby"],
    [HALL, "Hall"],
    [STUDY, "Study"],
    [CELLAR, "Cellar"],
  ] as const) {
    addRoom(place, { id, name, description: "" });
  }
  connectRooms(place, LOBBY, HALL);
  connectRooms(place, HALL, STUDY);
  connectRooms(place, STUDY, CELLAR);
  return place;
}

function addSensor(
  place: Place,
  room: RoomId,
  id: string,
  opts: { modality?: string; fidelity?: SensorFidelity; reach?: SensorReach } = {},
): void {
  const sid = sensorId(id);
  place.rooms.get(room)!.sensors.set(sid, {
    id: sid,
    roomId: room,
    modality: opts.modality ?? "sight",
    name: id,
    description: "",
    fidelity: opts.fidelity ?? { kind: "full" },
    enabled: true,
    reach: opts.reach ?? { kind: "room" },
  });
}

function entered(room: RoomId): PresenceEvent {
  return { type: "guest.entered", guestId: guestId("takeshi"), roomId: room, at: new Date() };
}

function withGuest(place: Place, room: RoomId): Place {
  const g = addGuest(place, { id: guestId("takeshi"), name: "Takeshi" });
  enterRoom(place, g.id, room);
  return place;
}

describe("hopDistance", () => {
  it("is zero for the same room", () => {
    expect(hopDistance(LOBBY, LOBBY, makePlace())).toBe(0);
  });

  it("counts hops along a chain", () => {
    const place = makePlace();
    expect(hopDistance(LOBBY, HALL, place)).toBe(1);
    expect(hopDistance(LOBBY, STUDY, place)).toBe(2);
    expect(hopDistance(LOBBY, CELLAR, place)).toBe(3);
  });

  it("finds the shortest path when several exist", () => {
    const place = makePlace();
    // Shortcut: lobby ── cellar directly. Was 3 hops the long way.
    connectRooms(place, LOBBY, CELLAR);
    expect(hopDistance(LOBBY, CELLAR, place)).toBe(1);
  });

  it("returns null past maxHops and for unreachable rooms", () => {
    const place = makePlace();
    expect(hopDistance(LOBBY, CELLAR, place, 2)).toBeNull();

    const island = roomId("island");
    addRoom(place, { id: island, name: "Island", description: "" });
    expect(hopDistance(LOBBY, island, place)).toBeNull();
  });

  it("returns null for rooms that do not exist", () => {
    expect(hopDistance(LOBBY, roomId("nowhere"), makePlace())).toBeNull();
  });
});

describe("confidence attenuates with distance", () => {
  it("is unattenuated in the sensor's own room", () => {
    const place = withGuest(makePlace(), LOBBY);
    addSensor(place, LOBBY, "lobby.sight");

    const [perception] = filterEvent(entered(LOBBY), place);
    expect(perception!.confidence).toBe(1);
  });

  it("falls off per hop for an adjacent-reach sensor", () => {
    const place = withGuest(makePlace(), HALL);
    addSensor(place, LOBBY, "lobby.listen", {
      modality: "presence",
      reach: { kind: "adjacent", maxDepth: 2 },
    });
    // The target room needs a sensor of its own or it is a dead zone.
    addSensor(place, HALL, "hall.presence", { modality: "presence" });

    const perceptions = filterEvent(entered(HALL), place);
    const viaLobby = perceptions.find((p) => p.sourceSensorId === sensorId("lobby.listen"))!;
    const viaHall = perceptions.find((p) => p.sourceSensorId === sensorId("hall.presence"))!;

    expect(viaHall.confidence).toBe(1);
    expect(viaLobby.confidence).toBeCloseTo(ATTENUATION_PER_HOP, 10);
    expect(viaLobby.confidence).toBeLessThan(viaHall.confidence);
  });

  it("compounds across two hops", () => {
    const place = withGuest(makePlace(), STUDY);
    addSensor(place, LOBBY, "lobby.listen", {
      modality: "presence",
      reach: { kind: "adjacent", maxDepth: 2 },
    });
    addSensor(place, STUDY, "study.presence", { modality: "presence" });

    const viaLobby = filterEvent(entered(STUDY), place).find(
      (p) => p.sourceSensorId === sensorId("lobby.listen"),
    )!;
    expect(viaLobby.confidence).toBeCloseTo(ATTENUATION_PER_HOP ** 2, 10);
  });

  it("attenuates a place-wide sensor by real distance", () => {
    const place = withGuest(makePlace(), CELLAR);
    addSensor(place, LOBBY, "house.watch", { reach: { kind: "place-wide" } });
    addSensor(place, CELLAR, "cellar.sight");

    const viaHouse = filterEvent(entered(CELLAR), place).find(
      (p) => p.sourceSensorId === sensorId("house.watch"),
    )!;
    // Three hops away — a place-wide sensor reaches it, but not confidently.
    expect(viaHouse.confidence).toBeCloseTo(ATTENUATION_PER_HOP ** 3, 10);
  });

  it("scales fidelity rather than replacing it", () => {
    const place = withGuest(makePlace(), HALL);
    addSensor(place, LOBBY, "lobby.blur", {
      modality: "presence",
      fidelity: { kind: "ambiguous", confidence: 0.5 },
      reach: { kind: "adjacent" },
    });
    addSensor(place, HALL, "hall.presence", { modality: "presence" });

    const viaLobby = filterEvent(entered(HALL), place).find(
      (p) => p.sourceSensorId === sensorId("lobby.blur"),
    )!;
    expect(viaLobby.confidence).toBeCloseTo(0.5 * ATTENUATION_PER_HOP, 10);
  });

  it("can be disabled with attenuationPerHop: 1", () => {
    const place = withGuest(makePlace(), HALL);
    addSensor(place, LOBBY, "lobby.listen", {
      modality: "presence",
      reach: { kind: "adjacent" },
    });
    addSensor(place, HALL, "hall.presence", { modality: "presence" });

    const viaLobby = filterEvent(entered(HALL), place, { attenuationPerHop: 1 }).find(
      (p) => p.sourceSensorId === sensorId("lobby.listen"),
    )!;
    expect(viaLobby.confidence).toBe(1);
  });
});

describe("event modality routing", () => {
  it("routes built-in events by the default map", () => {
    const place = withGuest(makePlace(), LOBBY);
    addSensor(place, LOBBY, "lobby.sight", { modality: "sight" });
    addSensor(place, LOBBY, "lobby.sound", { modality: "sound" });

    // guest.entered is sight+presence — the sound sensor must not pick it up.
    const perceptions = filterEvent(entered(LOBBY), place);
    expect(perceptions.map((p) => p.modality)).toEqual(["sight"]);
  });

  it("produces nothing for an event type with no mapping", () => {
    const place = withGuest(makePlace(), LOBBY);
    addSensor(place, LOBBY, "lobby.thermal", { modality: "thermal" });

    const custom = {
      type: "motion.detected",
      roomId: LOBBY,
      at: new Date(),
    } as unknown as PresenceEvent;

    // Strict by default — and silently, which is why the map is now extensible.
    expect(filterEvent(custom, place)).toHaveLength(0);
  });

  it("routes a custom event once the map is extended", () => {
    const place = withGuest(makePlace(), LOBBY);
    addSensor(place, LOBBY, "lobby.thermal", { modality: "thermal" });

    const modalities: EventModalityMap = {
      ...DEFAULT_EVENT_MODALITIES,
      "motion.detected": ["thermal"],
    };
    const custom = {
      type: "motion.detected",
      roomId: LOBBY,
      at: new Date(),
    } as unknown as PresenceEvent;

    const perceptions = filterEvent(custom, place, { modalities });
    expect(perceptions).toHaveLength(1);
    expect(perceptions[0]!.modality).toBe("thermal");
  });

  it("a replacing map drops the built-ins it omits", () => {
    const place = withGuest(makePlace(), LOBBY);
    addSensor(place, LOBBY, "lobby.sight");

    // The reason the docs say "merge, don't replace".
    expect(filterEvent(entered(LOBBY), place, { modalities: {} })).toHaveLength(0);
  });
});

describe("the describe hook", () => {
  it("narrates a custom event the adapter understands", () => {
    const place = withGuest(makePlace(), LOBBY);
    addSensor(place, LOBBY, "lobby.thermal", { modality: "thermal" });

    const custom = {
      type: "motion.detected",
      roomId: LOBBY,
      at: new Date(),
    } as unknown as PresenceEvent;

    const [perception] = filterEvent(custom, place, {
      modalities: { ...DEFAULT_EVENT_MODALITIES, "motion.detected": ["thermal"] },
      describe: (event) =>
        event.type === "motion.detected" ? "A warm shape crosses the lobby." : null,
    });

    expect(perception!.content).toBe("A warm shape crosses the lobby.");
  });

  it("falls back to core prose when the hook returns null", () => {
    const place = withGuest(makePlace(), LOBBY);
    addSensor(place, LOBBY, "lobby.sight");

    const [perception] = filterEvent(entered(LOBBY), place, { describe: () => null });
    expect(perception!.content).toBe("Takeshi entered the Lobby.");
  });

  it("overrides core prose when the hook answers", () => {
    const place = withGuest(makePlace(), LOBBY);
    addSensor(place, LOBBY, "lobby.sight");

    const [perception] = filterEvent(entered(LOBBY), place, {
      describe: () => "Someone came in from the cold.",
    });
    expect(perception!.content).toBe("Someone came in from the cold.");
  });

  it("keeps an unknown event perceptible even with no hook", () => {
    const place = withGuest(makePlace(), LOBBY);
    addSensor(place, LOBBY, "lobby.thermal", { modality: "thermal" });

    const custom = {
      type: "motion.detected",
      roomId: LOBBY,
      at: new Date(),
    } as unknown as PresenceEvent;

    const [perception] = filterEvent(custom, place, {
      modalities: { ...DEFAULT_EVENT_MODALITIES, "motion.detected": ["thermal"] },
    });

    // Core cannot narrate it, but dropping it after routing and locating it
    // would be the silent failure the whole change is about.
    expect(perception).toBeDefined();
    expect(perception!.content).toContain("motion.detected");
  });
});
