import type { Sensor, RoomId, SensorFidelity } from "../types.js";
import { sensorId, affordanceId as toAffordanceId } from "../types.js";

export interface StateSensorOptions {
  /** Fidelity override. Defaults to full. */
  fidelity?: SensorFidelity;
  /** Custom description. */
  description?: string;
}

/**
 * Creates a state sensor — monitors the state of a specific affordance.
 * Scoped to a single affordance (e.g., knows if the fireplace is lit).
 *
 * @param id - Sensor ID, e.g. "lobby.fireplace-state"
 * @param roomId - The room this sensor is installed in
 * @param targetAffordanceId - The affordance this sensor monitors
 */
export function stateSensor(
  id: string,
  roomIdValue: RoomId,
  targetAffordanceId: string,
  options?: StateSensorOptions,
): [string, Sensor] {
  return [
    id,
    {
      id: sensorId(id),
      roomId: roomIdValue,
      modality: "state",
      name: `State monitor (${id})`,
      description: options?.description ?? `Monitors the state of ${targetAffordanceId}.`,
      fidelity: options?.fidelity ?? { kind: "full" },
      enabled: true,
      reach: { kind: "affordance", affordanceId: toAffordanceId(targetAffordanceId) },
    },
  ];
}
