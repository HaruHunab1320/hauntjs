import type { Place, RoomId, SensorId } from "./types.js";
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

/**
 * Apply phase transitions to a Place.
 * Called when the time system detects a phase change.
 */
export function applyPhaseTransition(
  place: Place,
  phase: TimePhase,
  transitions: PhaseTransitionMap,
): void {
  const transition = transitions[phase];
  if (!transition) return;

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
}
