import type { Place, RoomId, Sensor } from "./types.js";

/**
 * Spatial reach rules, shared by the event pipeline and the presence query.
 *
 * Extracted so that "what can a sensor cover?" has exactly one definition. The
 * event path (`filterEvent`) and the standing-state path (`perceivePresence`)
 * disagreeing about reach is the class of bug where a resident hears something
 * happen in a room it cannot see into.
 */

/** Whether a room has at least one enabled sensor of its own. */
export function roomHasEnabledSensor(place: Place, roomId: RoomId): boolean {
  const room = place.rooms.get(roomId);
  if (!room) return false;
  for (const sensor of room.sensors.values()) {
    if (sensor.enabled) return true;
  }
  return false;
}

/** Whether targetRoom is reachable from sourceRoom within maxDepth hops. */
export function isWithinDepth(
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

/**
 * Whether a sensor's reach covers a target room, ignoring modality and enabled
 * state — callers check those.
 *
 * `affordance` reach is never room-covering: it watches one object, not a space,
 * so it can report that a thing changed but never that a room is occupied.
 */
export function sensorCoversRoom(
  sensor: Sensor,
  sensorRoomId: RoomId,
  targetRoomId: RoomId,
  place: Place,
): boolean {
  switch (sensor.reach.kind) {
    case "room":
      return sensorRoomId === targetRoomId;

    case "adjacent": {
      if (sensorRoomId === targetRoomId) return true;
      // Adjacent sensors cannot reach into rooms with zero enabled sensors.
      if (!roomHasEnabledSensor(place, targetRoomId)) return false;
      return isWithinDepth(sensorRoomId, targetRoomId, sensor.reach.maxDepth ?? 1, place);
    }

    case "place-wide":
      // Reaches any room that has sensors of its own. Rooms with none are dead
      // zones — truly imperceptible, even to a place-wide sensor.
      return roomHasEnabledSensor(place, targetRoomId);

    case "affordance":
      return false;

    default:
      return false;
  }
}
