import type { Sensor, RoomId } from "../types.js";
import { sensorId } from "../types.js";

/**
 * The escape hatch: a place-wide, full-fidelity sensor that restores
 * Phase 1 omniscient behavior. Drop this into a room to make the
 * resident aware of everything in the place.
 *
 * Use sparingly — the whole point of sensors is that perception is
 * structured and limited. This is for authors who genuinely want
 * ambient awareness everywhere (e.g., a cozy writing retreat).
 *
 * @param id - Sensor ID, e.g. "lobby.omniscient"
 * @param roomId - The room this sensor is installed in
 */
export function omniscientSensor(
  id: string,
  roomIdValue: RoomId,
): [string, Sensor] {
  return [
    id,
    {
      id: sensorId(id),
      roomId: roomIdValue,
      modality: "sight",
      name: `Omniscient (${id})`,
      description: "Full awareness of everything in the place.",
      fidelity: { kind: "full" },
      enabled: true,
      reach: { kind: "place-wide" },
    },
  ];
}
