import { hopDistance, isWithinDepth, roomHasEnabledSensor } from "./sensor-reach.js";
import type {
  AffordanceId,
  Perception,
  Place,
  PresenceEvent,
  RoomId,
  Sensor,
  SensorModality,
} from "./types.js";

/**
 * Which sensor modalities can pick up which event types.
 *
 * An event type absent from this map produces **no perceptions at all** — it is
 * invisible to every sensor, silently. That is the correct strict-by-default
 * behavior, but it makes an unmapped type indistinguishable from an unsensed
 * one, so an adapter introducing new event types must extend the map or its
 * events will vanish without a word.
 */
export type EventModalityMap = Readonly<Record<string, readonly SensorModality[]>>;

/**
 * The modality routing for Haunt's built-in events.
 *
 * `SensorModality` is deliberately open — `(string & {})` — so adapters can
 * define modalities Haunt has never heard of. This table was not, which left
 * the two halves asymmetric: you could declare a `thermal` sensor and nothing
 * would ever route an event to it. Pass a merged map to {@link filterEvent} or
 * to `SensorSystem` to close that gap.
 */
export const DEFAULT_EVENT_MODALITIES: EventModalityMap = {
  "guest.entered": ["sight", "presence"],
  "guest.left": ["sight", "presence"],
  "guest.moved": ["sight", "presence"],
  "guest.spoke": ["sound", "text", "presence"],
  "guest.approached": ["sight", "presence"],
  "affordance.changed": ["sight", "state"],
};

/**
 * How much confidence survives each room boundary between sensor and event.
 *
 * Perception through a wall is worse than perception in the room, and a sensor
 * reporting a two-hop event with the certainty of a one-hop one is claiming
 * something it cannot support. Same-room events are unattenuated.
 */
export const ATTENUATION_PER_HOP = 0.6;

export interface FilterOptions {
  /** Overrides {@link DEFAULT_EVENT_MODALITIES}. Merge rather than replace to keep built-ins. */
  readonly modalities?: EventModalityMap;
  /** Overrides {@link ATTENUATION_PER_HOP}. `1` disables distance attenuation. */
  readonly attenuationPerHop?: number;
  /**
   * Adapter-supplied narration, consulted before core's built-in descriptions.
   *
   * Return `null` to fall through to core. Necessary for custom event types,
   * which core can locate and route but cannot describe — and useful for
   * places where core's prose is simply wrong, since a physically-sensed room
   * does not narrate the way a simulated one does.
   */
  readonly describe?: (event: PresenceEvent, sensor: Sensor, place: Place) => string | null;
}

/**
 * Routes a PresenceEvent through the place's sensors and produces Perceptions.
 *
 * Rules:
 * - Only sensors whose modality matches the event type are consulted
 * - Only sensors whose reach includes the event's location are consulted
 * - Only enabled sensors produce perceptions
 * - Sensor fidelity shapes the perception content and confidence
 * - Events with no matching sensors produce no perceptions (strict-by-default)
 * - Resident's own events (resident.spoke/moved/acted) and ticks skip the pipeline
 */
export function filterEvent(
  event: PresenceEvent,
  place: Place,
  options: FilterOptions = {},
): Perception[] {
  const modalityMap = options.modalities ?? DEFAULT_EVENT_MODALITIES;
  const attenuation = options.attenuationPerHop ?? ATTENUATION_PER_HOP;

  // Resident's own actions and ticks don't go through sensors
  if (
    event.type === "resident.spoke" ||
    event.type === "resident.moved" ||
    event.type === "resident.acted" ||
    event.type === "tick"
  ) {
    return [];
  }

  const eventRoomId = getEventRoomId(event);
  if (!eventRoomId) return [];

  const relevantModalities = modalityMap[event.type] ?? [];
  if (relevantModalities.length === 0) return [];

  const perceptions: Perception[] = [];

  // Check all sensors across all rooms
  for (const room of place.rooms.values()) {
    for (const sensor of room.sensors.values()) {
      if (!sensor.enabled) continue;
      if (!relevantModalities.includes(sensor.modality)) continue;
      if (!sensorReachesEvent(sensor, room.id, eventRoomId, event, place)) continue;

      // Distance is a property of this observation, not of the sensor's config.
      const hops = hopDistance(room.id, eventRoomId, place) ?? 0;
      const perception = generatePerception(
        sensor,
        event,
        eventRoomId,
        place,
        hops,
        attenuation,
        options.describe,
      );
      if (perception) {
        perceptions.push(perception);
      }
    }
  }

  return perceptions;
}

/**
 * Determine which room an event occurred in.
 *
 * Falls back to a `roomId` property for event types core does not know about.
 * Extending {@link EventModalityMap} alone is not enough to make a custom event
 * perceptible — it also has to be locatable, and this is where an unrecognized
 * one would otherwise be dropped before any sensor is consulted.
 */
function getEventRoomId(event: PresenceEvent): RoomId | null {
  switch (event.type) {
    case "guest.entered":
    case "guest.left":
    case "guest.spoke":
    case "guest.approached":
      return event.roomId;
    case "guest.moved":
      return event.to; // The destination room
    case "affordance.changed":
      return event.roomId;
    default: {
      const roomId = (event as { roomId?: unknown }).roomId;
      return typeof roomId === "string" ? (roomId as RoomId) : null;
    }
  }
}

/** Check whether a sensor's reach includes the event's room. */
function sensorReachesEvent(
  sensor: Sensor,
  sensorRoomId: RoomId,
  eventRoomId: RoomId,
  event: PresenceEvent,
  place: Place,
): boolean {
  switch (sensor.reach.kind) {
    case "room":
      return sensorRoomId === eventRoomId;

    case "adjacent": {
      if (sensorRoomId === eventRoomId) return true;
      // Adjacent sensors cannot reach into rooms with zero enabled sensors (dead zones)
      if (!place.rooms.has(eventRoomId)) return false;
      if (!roomHasEnabledSensor(place, eventRoomId)) return false;
      const maxDepth = sensor.reach.maxDepth ?? 1;
      return isWithinDepth(sensorRoomId, eventRoomId, maxDepth, place);
    }

    case "affordance":
      if (sensorRoomId !== eventRoomId) return false;
      if (event.type === "affordance.changed") {
        return event.affordanceId === (sensor.reach.affordanceId as string);
      }
      return false;

    case "place-wide": {
      // A place-wide sensor can reach any room that has its own sensors.
      // Rooms with zero enabled sensors are dead zones — truly imperceptible.
      if (!place.rooms.has(eventRoomId)) return false;
      return roomHasEnabledSensor(place, eventRoomId);
    }

    default:
      return false;
  }
}

/** Generate a Perception from a sensor + event combination. */
function generatePerception(
  sensor: Sensor,
  event: PresenceEvent,
  eventRoomId: RoomId,
  place: Place,
  hops: number,
  attenuationPerHop: number,
  describe?: FilterOptions["describe"],
): Perception | null {
  const confidence = getConfidence(sensor, hops, attenuationPerHop);
  const content =
    describe?.(event, sensor, place) ?? generateContent(sensor, event, eventRoomId, place);

  if (!content) return null;

  return {
    sourceSensorId: sensor.id,
    roomId: eventRoomId,
    modality: sensor.modality,
    content,
    confidence,
    at: event.at,
    rawEvent: event,
  };
}

/**
 * Confidence for one observation.
 *
 * Fidelity sets the ceiling — what this instrument could tell you at best — and
 * distance takes it down from there. Both halves matter: a `full` sensor
 * reporting an event two rooms away is not as reliable as the same sensor
 * reporting its own room, and returning `1.0` for both is the sensor claiming a
 * certainty it has not earned.
 *
 * This is the one place the virtual pipeline can express per-observation
 * confidence. Hardware-driven perception bypasses this function entirely and
 * supplies its own — see `docs/PHYSICAL-PLACES.md`.
 */
function getConfidence(sensor: Sensor, hops: number, attenuationPerHop: number): number {
  let base: number;
  switch (sensor.fidelity.kind) {
    case "full":
      base = 1.0;
      break;
    case "partial":
      base = 0.8;
      break;
    case "ambiguous":
      base = sensor.fidelity.confidence;
      break;
    case "delayed":
      base = 0.9;
      break;
    default:
      base = 1.0;
      break;
  }

  if (hops <= 0) return base;
  return base * attenuationPerHop ** hops;
}

/** Generate the prose content of a perception based on fidelity. */
function generateContent(
  sensor: Sensor,
  event: PresenceEvent,
  eventRoomId: RoomId,
  place: Place,
): string | null {
  const room = place.rooms.get(eventRoomId);
  const roomName = room?.name ?? eventRoomId;

  switch (event.type) {
    case "guest.entered":
      return describeGuestEntered(sensor, event, roomName, place);
    case "guest.left":
      return describeGuestLeft(sensor, event, roomName, place);
    case "guest.moved":
      return describeGuestMoved(sensor, event, place);
    case "guest.spoke":
      return describeGuestSpoke(sensor, event, roomName, place);
    case "guest.approached":
      return describeGuestApproached(sensor, event, roomName, place);
    case "affordance.changed":
      return describeAffordanceChanged(sensor, event, roomName, place);
    default:
      // An event type core does not know about. It was routed here by a
      // caller-supplied modality map and located by its roomId, so it is
      // genuinely perceptible — but core cannot narrate it, and returning null
      // would drop it silently after all that. A bare description is honest and
      // keeps the perception; adapters that want prose supply `describe`.
      return `Something happened in the ${roomName}. (${event.type})`;
  }
}

function getGuestName(guestId: string, place: Place): string {
  for (const guest of place.guests.values()) {
    if ((guest.id as string) === guestId) return guest.name;
  }
  return "someone";
}

function describeGuestEntered(
  sensor: Sensor,
  event: { guestId: string },
  roomName: string,
  place: Place,
): string {
  if (sensor.fidelity.kind === "full") {
    const name = getGuestName(event.guestId, place);
    return `${name} entered the ${roomName}.`;
  }
  if (sensor.fidelity.kind === "partial") {
    const reveals = sensor.fidelity.reveals;
    if (reveals.includes("identity")) {
      const name = getGuestName(event.guestId, place);
      return `${name} entered the ${roomName}.`;
    }
    return `Someone entered the ${roomName}.`;
  }
  if (sensor.fidelity.kind === "ambiguous") {
    return `There seems to be movement in the ${roomName} — someone may have entered.`;
  }
  return `Someone entered the ${roomName}.`;
}

function describeGuestLeft(
  sensor: Sensor,
  event: { guestId: string },
  roomName: string,
  place: Place,
): string {
  if (sensor.fidelity.kind === "full") {
    return `${getGuestName(event.guestId, place)} left the ${roomName}.`;
  }
  if (sensor.fidelity.kind === "partial" && sensor.fidelity.reveals.includes("identity")) {
    return `${getGuestName(event.guestId, place)} left the ${roomName}.`;
  }
  return `Someone left the ${roomName}.`;
}

function describeGuestMoved(
  sensor: Sensor,
  event: { guestId: string; from: string; to: string },
  place: Place,
): string {
  const fromRoom = place.rooms.get(event.from as RoomId)?.name ?? event.from;
  const toRoom = place.rooms.get(event.to as RoomId)?.name ?? event.to;

  if (sensor.fidelity.kind === "full") {
    return `${getGuestName(event.guestId, place)} moved from the ${fromRoom} to the ${toRoom}.`;
  }
  return `Someone moved from the ${fromRoom} to the ${toRoom}.`;
}

function describeGuestSpoke(
  sensor: Sensor,
  event: { guestId: string; text: string },
  roomName: string,
  place: Place,
): string {
  if (sensor.fidelity.kind === "full") {
    const name = getGuestName(event.guestId, place);
    return `${name} said: "${event.text}"`;
  }
  if (sensor.fidelity.kind === "partial") {
    const reveals = sensor.fidelity.reveals;
    if (reveals.includes("content") && reveals.includes("identity")) {
      return `${getGuestName(event.guestId, place)} said: "${event.text}"`;
    }
    if (reveals.includes("content")) {
      return `Someone in the ${roomName} said: "${event.text}"`;
    }
    if (reveals.includes("identity")) {
      return `${getGuestName(event.guestId, place)} is speaking in the ${roomName}.`;
    }
    return `Someone is speaking in the ${roomName}.`;
  }
  if (sensor.fidelity.kind === "ambiguous") {
    return `You hear voices in the ${roomName}, but the words are muffled.`;
  }
  return `Someone is speaking in the ${roomName}.`;
}

function describeGuestApproached(
  sensor: Sensor,
  event: { guestId: string; affordanceId: string; roomId: RoomId },
  roomName: string,
  place: Place,
): string {
  let affName = event.affordanceId as string;
  const room = place.rooms.get(event.roomId);
  if (room) {
    const aff = room.affordances.get(event.affordanceId as AffordanceId);
    if (aff) affName = aff.name;
  }

  if (sensor.fidelity.kind === "full") {
    return `${getGuestName(event.guestId, place)} walked over to the ${affName} in the ${roomName}.`;
  }
  return `Someone approached something in the ${roomName}.`;
}

function describeAffordanceChanged(
  sensor: Sensor,
  event: { affordanceId: string; newState: Record<string, unknown> },
  roomName: string,
  place: Place,
): string {
  let affName = event.affordanceId;
  for (const r of place.rooms.values()) {
    const aff = r.affordances.get(event.affordanceId as AffordanceId);
    if (aff) {
      affName = aff.name;
      break;
    }
  }

  if (sensor.fidelity.kind === "full") {
    const stateStr = Object.entries(event.newState)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    return `The ${affName} in the ${roomName} changed: ${stateStr}.`;
  }
  return `Something changed with the ${affName} in the ${roomName}.`;
}
