import type { GuestId, Place, RoomId, SensorId } from "./types.js";
import type { TimePhase } from "./time-system.js";
import { createLogger } from "./logger.js";

const log = createLogger("PhaseTransition");

export interface SensorToggle {
  sensorId: string;
  enabled: boolean;
}

export interface ConnectionToggle {
  roomId: string;
  connectedTo: string;
  connected: boolean;
}

export interface RoomOverride {
  roomId: string;
  /** New description for this phase. */
  description?: string;
  /** New name for this phase (the room "becomes" something else). */
  name?: string;
}

export interface PhaseTransition {
  /** Sensors to enable/disable when entering this phase. */
  sensors?: SensorToggle[];
  /** Room connections to add/remove when entering this phase. */
  connections?: ConnectionToggle[];
  /** Room description/name overrides for this phase. */
  rooms?: RoomOverride[];
}

export type PhaseTransitionMap = Partial<Record<TimePhase, PhaseTransition>>;

/** Describes a guest evicted from a disconnected room. */
export interface GuestEviction {
  guestId: GuestId;
  from: RoomId;
  to: RoomId;
}

/**
 * Apply phase transitions to a Place.
 * Called when the time system detects a phase change.
 *
 * Returns a list of guest evictions caused by room disconnections.
 * The caller is responsible for emitting the corresponding `guest.moved` events.
 */
export function applyPhaseTransition(
  place: Place,
  phase: TimePhase,
  transitions: PhaseTransitionMap,
): GuestEviction[] {
  const transition = transitions[phase];
  if (!transition) return [];

  const evictions: GuestEviction[] = [];

  // Toggle sensors
  if (transition.sensors) {
    for (const toggle of transition.sensors) {
      for (const room of place.rooms.values()) {
        const sensor = room.sensors.get(toggle.sensorId as SensorId);
        if (sensor) {
          sensor.enabled = toggle.enabled;
          log.debug(`${toggle.sensorId} ${toggle.enabled ? "enabled" : "disabled"}`);
          break;
        }
      }
    }
  }

  // Toggle connections
  if (transition.connections) {
    for (const toggle of transition.connections) {
      const room = place.rooms.get(toggle.roomId as RoomId);
      if (!room) continue;

      const targetRoomId = toggle.connectedTo as RoomId;

      if (toggle.connected) {
        // Add connection (bidirectional)
        if (!room.connectedTo.includes(targetRoomId)) {
          room.connectedTo.push(targetRoomId);
        }
        const targetRoom = place.rooms.get(targetRoomId);
        if (targetRoom && !targetRoom.connectedTo.includes(toggle.roomId as RoomId)) {
          targetRoom.connectedTo.push(toggle.roomId as RoomId);
        }
        log.debug(`connected ${toggle.roomId} ↔ ${toggle.connectedTo}`);
      } else {
        // Remove connection (bidirectional)
        room.connectedTo = room.connectedTo.filter((id) => id !== targetRoomId);
        const targetRoom = place.rooms.get(targetRoomId);
        if (targetRoom) {
          targetRoom.connectedTo = targetRoom.connectedTo.filter((id) => id !== (toggle.roomId as RoomId));
        }
        log.debug(`disconnected ${toggle.roomId} ↔ ${toggle.connectedTo}`);

        // Evict guests stranded in rooms that lost all connections
        for (const [roomId, roomToCheck] of [
          [toggle.roomId as RoomId, room],
          [targetRoomId, targetRoom],
        ] as const) {
          if (!roomToCheck || roomToCheck.connectedTo.length > 0) continue;
          // This room is now completely disconnected — move guests out
          // Determine where to send them: the other side of the connection that was just removed
          const evacuateTo = roomId === (toggle.roomId as RoomId) ? targetRoomId : (toggle.roomId as RoomId);
          for (const guest of place.guests.values()) {
            if (guest.currentRoom === roomId) {
              log.debug(`evicting guest ${guest.id as string} from ${roomId as string} → ${evacuateTo as string}`);
              guest.currentRoom = evacuateTo;
              evictions.push({ guestId: guest.id, from: roomId, to: evacuateTo });
            }
          }
        }
      }
    }
  }

  // Override room descriptions/names
  if (transition.rooms) {
    for (const override of transition.rooms) {
      const room = place.rooms.get(override.roomId as RoomId);
      if (!room) continue;

      if (override.description) {
        room.description = override.description;
        log.debug(`${override.roomId} description updated`);
      }
      if (override.name) {
        room.name = override.name;
        log.debug(`${override.roomId} renamed to "${override.name}"`);
      }
    }
  }

  return evictions;
}
