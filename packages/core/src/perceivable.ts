import { sensorCoversRoom } from "./sensor-reach.js";
import type { Guest, Place, RoomId, SensorFidelity, SensorId, SensorModality } from "./types.js";

/**
 * Who the resident can currently tell is present, and how well it can tell.
 *
 * The sensor pipeline made *events* strict-by-default: an event nobody sensed
 * never reaches the resident. Standing state had no such gate — the prompt read
 * the guest roster straight off the Place, which is authoritative world data the
 * resident has no sensory claim to. The result was a prompt that could say "you
 * have no sensors here, you cannot perceive events in this room" and then list
 * that room's occupants by name.
 *
 * This closes that path. Presence is derived from sensors or it is not known.
 */

/** Modalities that can establish a person is present. */
const PRESENCE_MODALITIES: readonly SensorModality[] = ["sight", "presence"];

/** A guest the resident can currently sense, at the fidelity it senses them. */
export interface PerceivedGuest {
  guest: Guest;
  /** Best fidelity among the sensors that reach them. */
  fidelity: SensorFidelity;
  /** The sensor providing that best view. */
  viaSensorId: SensorId;
}

/** What the resident can currently tell about who is in a room. */
export interface PresenceView {
  roomId: RoomId;
  guests: PerceivedGuest[];
  /**
   * Best fidelity among enabled presence-capable sensors covering this room, or
   * `null` when nothing covers it.
   *
   * `null` is the load-bearing case: it distinguishes "I can see the room and it
   * is empty" from "I have no way to tell". Rendering both as "no one is here"
   * is how a resident ends up asserting an empty room it cannot see into.
   */
  coverage: SensorFidelity | null;
}

/** Ranks fidelity by how much it reveals. Higher wins when several sensors overlap. */
function fidelityRank(f: SensorFidelity): number {
  switch (f.kind) {
    case "full":
      return 4;
    case "partial":
      return 3;
    case "delayed":
      return 2;
    case "ambiguous":
      return 1;
    default:
      return 0;
  }
}

function better(a: SensorFidelity | null, b: SensorFidelity): SensorFidelity {
  return a === null || fidelityRank(b) > fidelityRank(a) ? b : a;
}

/**
 * Resolves what the resident can sense about presence in one room.
 *
 * Consults every enabled presence-capable sensor in the place whose reach covers
 * the room — matching `filterEvent`, which also scans all rooms rather than only
 * the observer's. That is what lets a place-wide sensor underwrite host mode.
 */
export function perceivePresence(place: Place, roomId: RoomId): PresenceView {
  let coverage: SensorFidelity | null = null;
  const bySensor: Array<{ id: SensorId; fidelity: SensorFidelity }> = [];

  for (const room of place.rooms.values()) {
    for (const sensor of room.sensors.values()) {
      if (!sensor.enabled) continue;
      if (!PRESENCE_MODALITIES.includes(sensor.modality)) continue;
      if (!sensorCoversRoom(sensor, room.id, roomId, place)) continue;

      coverage = better(coverage, sensor.fidelity);
      bySensor.push({ id: sensor.id, fidelity: sensor.fidelity });
    }
  }

  if (coverage === null) {
    return { roomId, guests: [], coverage: null };
  }

  // The best-covering sensor sets the fidelity every guest in the room is seen
  // at — sensors are room-scoped, so none of them singles out an individual.
  const best = bySensor.reduce((acc, s) =>
    fidelityRank(s.fidelity) > fidelityRank(acc.fidelity) ? s : acc,
  );

  const guests: PerceivedGuest[] = [];
  for (const guest of place.guests.values()) {
    if (guest.currentRoom !== roomId) continue;
    guests.push({ guest, fidelity: best.fidelity, viaSensorId: best.id });
  }

  return { roomId, guests, coverage };
}

/**
 * Whether a fidelity reveals a guest's identity.
 *
 * Mirrors the event pipeline's describe* functions, which reveal a name under
 * `full`, or under `partial` when "identity" is among the revealed fields, and
 * fall back to "someone" otherwise.
 */
export function revealsIdentity(fidelity: SensorFidelity): boolean {
  if (fidelity.kind === "full") return true;
  if (fidelity.kind === "partial") return fidelity.reveals.includes("identity");
  return false;
}
