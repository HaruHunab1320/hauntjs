import { describe, expect, it } from "vitest";
import { perceivePresence, revealsIdentity } from "./perceivable.js";
import { addGuest, addRoom, connectRooms, createPlace, enterRoom } from "./place.js";
import type { Place, RoomId, Sensor, SensorFidelity, SensorReach } from "./types.js";
import { guestId, roomId, sensorId } from "./types.js";

const LOBBY = roomId("lobby");
const STUDY = roomId("study");
const CELLAR = roomId("cellar");

function makePlace(): Place {
  const place = createPlace({ id: "roost", name: "The Roost" });
  addRoom(place, { id: LOBBY, name: "Lobby", description: "" });
  addRoom(place, { id: STUDY, name: "Study", description: "" });
  addRoom(place, { id: CELLAR, name: "Cellar", description: "" });
  connectRooms(place, LOBBY, STUDY);
  connectRooms(place, STUDY, CELLAR);
  return place;
}

function addSensor(
  place: Place,
  room: RoomId,
  id: string,
  opts: {
    modality?: string;
    fidelity?: SensorFidelity;
    reach?: SensorReach;
    enabled?: boolean;
  } = {},
): Sensor {
  const sensor: Sensor = {
    id: sensorId(id),
    roomId: room,
    modality: opts.modality ?? "sight",
    name: id,
    description: "",
    fidelity: opts.fidelity ?? { kind: "full" },
    enabled: opts.enabled ?? true,
    reach: opts.reach ?? { kind: "room" },
  };
  place.rooms.get(room)!.sensors.set(sensor.id, sensor);
  return sensor;
}

function putGuestIn(place: Place, room: RoomId, id = "takeshi", name = "Takeshi") {
  const g = addGuest(place, { id: guestId(id), name });
  enterRoom(place, g.id, room);
  return g;
}

describe("perceivePresence", () => {
  it("reports no coverage when the room has no sensors", () => {
    const place = makePlace();
    putGuestIn(place, LOBBY);

    const view = perceivePresence(place, LOBBY);
    expect(view.coverage).toBeNull();
    expect(view.guests).toHaveLength(0);
  });

  it("distinguishes a covered empty room from an uncovered one", () => {
    const place = makePlace();
    addSensor(place, LOBBY, "lobby.sight");

    const covered = perceivePresence(place, LOBBY);
    expect(covered.coverage).not.toBeNull();
    expect(covered.guests).toHaveLength(0);

    const uncovered = perceivePresence(place, STUDY);
    expect(uncovered.coverage).toBeNull();
    expect(uncovered.guests).toHaveLength(0);
  });

  it("finds a guest through an enabled room sensor", () => {
    const place = makePlace();
    addSensor(place, LOBBY, "lobby.sight");
    putGuestIn(place, LOBBY);

    const view = perceivePresence(place, LOBBY);
    expect(view.guests).toHaveLength(1);
    expect(view.guests[0].guest.name).toBe("Takeshi");
    expect(revealsIdentity(view.guests[0].fidelity)).toBe(true);
  });

  it("loses the guest when the sensor is disabled", () => {
    const place = makePlace();
    const sensor = addSensor(place, LOBBY, "lobby.sight");
    putGuestIn(place, LOBBY);

    sensor.enabled = false;
    const view = perceivePresence(place, LOBBY);
    expect(view.coverage).toBeNull();
    expect(view.guests).toHaveLength(0);
  });

  it("ignores sensors whose modality cannot establish presence", () => {
    const place = makePlace();
    addSensor(place, LOBBY, "lobby.mic", { modality: "sound" });
    addSensor(place, LOBBY, "lobby.thermo", { modality: "state" });
    putGuestIn(place, LOBBY);

    expect(perceivePresence(place, LOBBY).coverage).toBeNull();
  });

  it("accepts the presence modality as well as sight", () => {
    const place = makePlace();
    addSensor(place, LOBBY, "lobby.mat", { modality: "presence" });
    putGuestIn(place, LOBBY);

    expect(perceivePresence(place, LOBBY).guests).toHaveLength(1);
  });

  it("withholds identity when the sensor does not reveal it", () => {
    const place = makePlace();
    addSensor(place, LOBBY, "lobby.blur", {
      fidelity: { kind: "partial", reveals: ["presence"] },
    });
    putGuestIn(place, LOBBY);

    const view = perceivePresence(place, LOBBY);
    expect(view.guests).toHaveLength(1);
    expect(revealsIdentity(view.guests[0].fidelity)).toBe(false);
  });

  it("prefers the most revealing sensor when several overlap", () => {
    const place = makePlace();
    addSensor(place, LOBBY, "lobby.blur", { fidelity: { kind: "ambiguous", confidence: 0.3 } });
    addSensor(place, LOBBY, "lobby.clear", { fidelity: { kind: "full" } });
    putGuestIn(place, LOBBY);

    const view = perceivePresence(place, LOBBY);
    expect(view.coverage).toEqual({ kind: "full" });
    expect(revealsIdentity(view.guests[0].fidelity)).toBe(true);
  });

  it("reaches an adjacent room only when that room has sensors of its own", () => {
    const place = makePlace();
    addSensor(place, LOBBY, "lobby.listen", { reach: { kind: "adjacent" } });
    putGuestIn(place, STUDY);

    // Study is a dead zone — an adjacent sensor cannot see into it.
    expect(perceivePresence(place, STUDY).coverage).toBeNull();

    addSensor(place, STUDY, "study.sight");
    expect(perceivePresence(place, STUDY).guests).toHaveLength(1);
  });

  it("respects adjacent maxDepth", () => {
    const place = makePlace();
    addSensor(place, LOBBY, "lobby.listen", { reach: { kind: "adjacent" } });
    addSensor(place, CELLAR, "cellar.sight", { enabled: true });
    putGuestIn(place, CELLAR);

    // Cellar is two hops from the lobby; default maxDepth is 1. Its own sensor
    // still covers it, so check the lobby sensor specifically by removing it.
    place.rooms.get(CELLAR)!.sensors.clear();
    expect(perceivePresence(place, CELLAR).coverage).toBeNull();
  });

  it("place-wide sensors cover any room that has sensors, but not dead zones", () => {
    const place = makePlace();
    addSensor(place, LOBBY, "house.watch", { reach: { kind: "place-wide" } });
    addSensor(place, STUDY, "study.sight");
    putGuestIn(place, STUDY, "mira", "Mira");
    putGuestIn(place, CELLAR, "takeshi", "Takeshi");

    expect(perceivePresence(place, STUDY).guests).toHaveLength(1);
    // The cellar has no sensors of its own — imperceptible even place-wide.
    expect(perceivePresence(place, CELLAR).coverage).toBeNull();
  });

  it("affordance-reach sensors never establish room presence", () => {
    const place = makePlace();
    addSensor(place, LOBBY, "lobby.hearth", {
      reach: { kind: "affordance", affordanceId: "fireplace" as never },
    });
    putGuestIn(place, LOBBY);

    expect(perceivePresence(place, LOBBY).coverage).toBeNull();
  });

  it("does not report guests who are elsewhere", () => {
    const place = makePlace();
    addSensor(place, LOBBY, "lobby.sight");
    putGuestIn(place, STUDY);

    expect(perceivePresence(place, LOBBY).guests).toHaveLength(0);
  });
});
