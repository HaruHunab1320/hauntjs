import type { Sensor, RoomId, SensorFidelity, SensorReach } from "../types.js";
import { sensorId } from "../types.js";

export interface PresenceSensorOptions {
  /** Fidelity override. Defaults to partial (reveals presence only). */
  fidelity?: SensorFidelity;
  /** Reach override. Defaults to room-scoped. */
  reach?: SensorReach;
  /** Custom description. */
  description?: string;
}

/**
 * Creates a presence sensor — detects entry, exit, and occupancy.
 * Default fidelity: partial (reveals presence but not identity).
 *
 * @param id - Sensor ID, e.g. "lobby.door-sensor"
 * @param roomId - The room this sensor is installed in
 */
export function presenceSensor(
  id: string,
  roomIdValue: RoomId,
  options?: PresenceSensorOptions,
): [string, Sensor] {
  return [
    id,
    {
      id: sensorId(id),
      roomId: roomIdValue,
      modality: "presence",
      name: `Presence sensor (${id})`,
      description: options?.description ?? "Detects when someone enters or leaves.",
      fidelity: options?.fidelity ?? { kind: "partial", reveals: ["presence"] },
      enabled: true,
      reach: options?.reach ?? { kind: "room" },
    },
  ];
}
