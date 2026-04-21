import type { PhaseTransitionMap } from "@hauntjs/core";
import { roomId } from "@hauntjs/core";
import { VAULT_AFFORDANCES } from "./vault-affordances.js";
import { VAULT_ROOMS } from "./vault-rooms.js";

export const VAULT_CONFIG = {
  id: "the-vault",
  name: "The Vault",
  rooms: VAULT_ROOMS,
  affordances: VAULT_AFFORDANCES,
  entryRoom: roomId("foyer"),
  residentStartRoom: roomId("library"),
};

/**
 * Phase transitions define how the Vault changes with time.
 *
 * At night:
 * - Gallery sight degrades to ambiguous (dim lighting)
 * - Conservatory sight disabled (glass becomes mirror)
 * - Archive sight disabled entirely (no light)
 * - Hidden Room becomes accessible from Archive
 *
 * At dawn:
 * - Everything restores
 * - Hidden Room disconnects from Archive
 */
export const VAULT_PHASE_TRANSITIONS: PhaseTransitionMap = {
  night: {
    sensors: [
      { sensorId: "gallery.sight", enabled: false },
      { sensorId: "conservatory.sight", enabled: false },
      { sensorId: "archive.sight", enabled: false },
    ],
    connections: [
      { roomId: "archive", connectedTo: "hidden-room", connected: true },
    ],
  },
  dawn: {
    sensors: [
      { sensorId: "gallery.sight", enabled: true },
      { sensorId: "conservatory.sight", enabled: true },
      { sensorId: "archive.sight", enabled: true },
    ],
    connections: [
      { roomId: "archive", connectedTo: "hidden-room", connected: false },
    ],
  },
  // Day and dusk: no changes from dawn state
};
