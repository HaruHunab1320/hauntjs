import type { PhaseTransitionMap } from "@hauntjs/core";
import { roomId } from "@hauntjs/core";
import { RESIDENCY_AFFORDANCES } from "./residency-affordances.js";
import { RESIDENCY_ROOMS } from "./residency-rooms.js";

export const RESIDENCY_CONFIG = {
  id: "the-residency",
  name: "The Residency",
  rooms: RESIDENCY_ROOMS,
  affordances: RESIDENCY_AFFORDANCES,
  entryRoom: roomId("hallway"),
  residentStartRoom: roomId("kitchen"),
};

/**
 * Phase transitions for The Residency.
 *
 * At night:
 * - Garden sight sensor disabled (no daylight)
 * - Living room description changes (dim, record player hums)
 *
 * At dawn:
 * - Garden sight sensor restored
 * - Living room description restored
 */
export const RESIDENCY_PHASE_TRANSITIONS: PhaseTransitionMap = {
  night: {
    sensors: [
      { sensorId: "garden.sight", enabled: false },
    ],
    rooms: [
      {
        roomId: "living-room",
        description:
          "Dim and quiet. A single lamp glows near the couch. The record player hums softly, needle riding the inner groove. Shadows fill the corners. The room feels smaller at night, more intimate.",
      },
      {
        roomId: "garden",
        description:
          "Dark and still. The herbs are invisible, but their scent is stronger at night — lavender and rosemary on the cool air. The bench is a dark shape under the tree. Stars, if you look up.",
      },
    ],
  },
  dawn: {
    sensors: [
      { sensorId: "garden.sight", enabled: true },
    ],
    rooms: [
      {
        roomId: "living-room",
        description:
          "Comfortable and lived-in. The couch sags in the middle from years of use. Afternoon light comes through tall windows. A record player sits on a low shelf beside a stack of vinyl. The bookshelf is organized by no system anyone can identify.",
      },
      {
        roomId: "garden",
        description:
          "Overgrown and fragrant. Herbs grow in unruly patches near the kitchen door. A wooden bench sits under an old tree. The sky is open here — the only room without a ceiling. Bees hum through the lavender.",
      },
    ],
  },
};
