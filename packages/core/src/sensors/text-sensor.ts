import type { RoomId, Sensor, SensorFidelity, SensorId, SensorReach } from "../types.js";
import { sensorId } from "../types.js";

export interface TextSensorOptions {
  /** Fidelity override. Defaults to full. */
  fidelity?: SensorFidelity;
  /** Reach override. Defaults to room-scoped. */
  reach?: SensorReach;
  /** Custom description. */
  description?: string;
}

/**
 * Creates a text sensor — for typed chat / text-only communication rooms.
 * Default fidelity: full (reads all text clearly).
 *
 * @param id - Sensor ID, e.g. "chat.text"
 * @param roomId - The room this sensor is installed in
 */
export function textSensor(
  id: string,
  roomIdValue: RoomId,
  options?: TextSensorOptions,
): [SensorId, Sensor] {
  return [
    sensorId(id),
    {
      id: sensorId(id),
      roomId: roomIdValue,
      modality: "text",
      name: `Text (${id})`,
      description: options?.description ?? "Reads typed messages and text content.",
      fidelity: options?.fidelity ?? { kind: "full" },
      enabled: true,
      reach: options?.reach ?? { kind: "room" },
    },
  ];
}
