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
 * The event→modality mapping. Determines which sensor modalities
 * are relevant for each event type.
 */
const EVENT_MODALITY_MAP: Record<string, SensorModality[]> = {
  "guest.entered": ["sight", "presence"],
  "guest.left": ["sight", "presence"],
  "guest.moved": ["sight", "presence"],
  "guest.spoke": ["sound", "text", "presence"],
  "guest.approached": ["sight", "presence"],
  "affordance.changed": ["sight", "state"],
};

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
export function filterEvent(event: PresenceEvent, place: Place): Perception[] {
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

  const relevantModalities = EVENT_MODALITY_MAP[event.type] ?? [];
  if (relevantModalities.length === 0) return [];

  const perceptions: Perception[] = [];

  // Check all sensors across all rooms
  for (const room of place.rooms.values()) {
    for (const sensor of room.sensors.values()) {
      if (!sensor.enabled) continue;
      if (!relevantModalities.includes(sensor.modality)) continue;
      if (!sensorReachesEvent(sensor, room.id, eventRoomId, event, place)) continue;

      const perception = generatePerception(sensor, event, eventRoomId, place);
      if (perception) {
        perceptions.push(perception);
      }
    }
  }

  return perceptions;
}

/** Determine which room an event occurred in. */
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
    default:
      return null;
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
      const adjTarget = place.rooms.get(eventRoomId);
      if (!adjTarget) return false;
      const adjHasEnabledSensor = Array.from(adjTarget.sensors.values()).some(
        (s) => s.enabled,
      );
      if (!adjHasEnabledSensor) return false;
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
      const targetRoom = place.rooms.get(eventRoomId);
      if (!targetRoom) return false;
      const hasEnabledSensor = Array.from(targetRoom.sensors.values()).some(
        (s) => s.enabled,
      );
      return hasEnabledSensor;
    }

    default:
      return false;
  }
}

/** Check if targetRoom is within depth hops of sourceRoom. */
function isWithinDepth(
  sourceRoom: RoomId,
  targetRoom: RoomId,
  maxDepth: number,
  place: Place,
): boolean {
  if (maxDepth <= 0) return false;

  const room = place.rooms.get(sourceRoom);
  if (!room) return false;

  if (room.connectedTo.includes(targetRoom)) return true;

  if (maxDepth > 1) {
    for (const neighbor of room.connectedTo) {
      if (isWithinDepth(neighbor, targetRoom, maxDepth - 1, place)) return true;
    }
  }

  return false;
}

/** Generate a Perception from a sensor + event combination. */
function generatePerception(
  sensor: Sensor,
  event: PresenceEvent,
  eventRoomId: RoomId,
  place: Place,
): Perception | null {
  const confidence = getConfidence(sensor);
  const content = generateContent(sensor, event, eventRoomId, place);

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

function getConfidence(sensor: Sensor): number {
  switch (sensor.fidelity.kind) {
    case "full":
      return 1.0;
    case "partial":
      return 0.8;
    case "ambiguous":
      return sensor.fidelity.confidence;
    case "delayed":
      return 0.9;
    default:
      return 1.0;
  }
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
      return null;
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
