import type { Sensor, SensorId, RoomId, SensorFidelity, SensorReach } from "../types.js";
import { sensorId } from "../types.js";

export interface SightSensorOptions {
  /** Fidelity override. Defaults to full. */
  fidelity?: SensorFidelity;
  /** Reach override. Defaults to room-scoped. */
  reach?: SensorReach;
  /** Custom description. */
  description?: string;
}

/**
 * Creates a sight sensor — visual perception of the room.
 * Default fidelity: full (sees everything).
 *
 * @param id - Sensor ID, e.g. "lobby.camera"
 * @param roomId - The room this sensor is installed in
 */
export function sightSensor(
  id: string,
  roomIdValue: RoomId,
  options?: SightSensorOptions,
): [SensorId, Sensor] {
  return [
    sensorId(id),
    {
      id: sensorId(id),
      roomId: roomIdValue,
      modality: "sight",
      name: `Sight (${id})`,
      description: options?.description ?? "Full visual awareness of the room.",
      fidelity: options?.fidelity ?? { kind: "full" },
      enabled: true,
      reach: options?.reach ?? { kind: "room" },
    },
  ];
}
