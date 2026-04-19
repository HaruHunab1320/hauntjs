import type { Sensor, RoomId, SensorFidelity, SensorReach } from "../types.js";
import { sensorId } from "../types.js";

export interface SoundSensorOptions {
  /** Fidelity override. Defaults to full. */
  fidelity?: SensorFidelity;
  /** Reach override. Defaults to room-scoped. */
  reach?: SensorReach;
  /** Custom description. */
  description?: string;
}

/**
 * Creates a sound sensor — audio perception of the room.
 * Default fidelity: full (hears speech clearly).
 *
 * @param id - Sensor ID, e.g. "lobby.mic"
 * @param roomId - The room this sensor is installed in
 */
export function soundSensor(
  id: string,
  roomIdValue: RoomId,
  options?: SoundSensorOptions,
): [string, Sensor] {
  return [
    id,
    {
      id: sensorId(id),
      roomId: roomIdValue,
      modality: "sound",
      name: `Sound (${id})`,
      description: options?.description ?? "Picks up speech and sounds in the room.",
      fidelity: options?.fidelity ?? { kind: "full" },
      enabled: true,
      reach: options?.reach ?? { kind: "room" },
    },
  ];
}

/**
 * Creates a muted/muffled audio sensor — hears something but can't make out details.
 * Useful for intercom, thin walls, adjacent rooms.
 */
export function mutedAudioSensor(
  id: string,
  roomIdValue: RoomId,
  options?: { confidence?: number; reach?: SensorReach; description?: string },
): [string, Sensor] {
  return [
    id,
    {
      id: sensorId(id),
      roomId: roomIdValue,
      modality: "sound",
      name: `Muted audio (${id})`,
      description: options?.description ?? "Muffled audio — detects sound but words are unclear.",
      fidelity: { kind: "ambiguous", confidence: options?.confidence ?? 0.4 },
      enabled: true,
      reach: options?.reach ?? { kind: "room" },
    },
  ];
}
