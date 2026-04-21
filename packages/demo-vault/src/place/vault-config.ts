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
  dusk: {
    rooms: [
      {
        roomId: "gallery",
        description:
          "The portraits watch from the walls as the light fades. The newer painting near the far wall seems to glow faintly in the dying light. Shadows pool in the corners.",
      },
      {
        roomId: "conservatory",
        description:
          "The glass ceiling darkens overhead. The piano sits in gathering shadow. Through the glass, the last light bleeds orange and violet. The room feels like it's holding its breath.",
      },
    ],
  },
  night: {
    sensors: [
      { sensorId: "gallery.sight", enabled: false },
      { sensorId: "conservatory.sight", enabled: false },
      { sensorId: "archive.sight", enabled: false },
    ],
    connections: [
      { roomId: "archive", connectedTo: "hidden-room", connected: true },
    ],
    rooms: [
      {
        roomId: "foyer",
        description:
          "The entrance hall is dim. Moonlight slants through the high windows, casting long shadows across the stone floor. The guest ledger is barely legible. The columns look taller in the dark.",
      },
      {
        roomId: "gallery",
        name: "The Dark Gallery",
        description:
          "The portraits have vanished into shadow. Only the faintest outlines of frames are visible. The newer painting seems to have moved — or is that a trick of the dark? Sound carries strangely here at night. Footsteps echo differently.",
      },
      {
        roomId: "library",
        description:
          "The reading lamp is the only light. Its circle illuminates the chair and a few nearby shelves, leaving the rest of the room in deep darkness. The books seem closer in the dark, the shelves higher. Sounds are muffled by the heavy volumes.",
      },
      {
        roomId: "conservatory",
        name: "The Mirror Room",
        description:
          "The glass ceiling has become a vast dark mirror. Every movement below is reflected above, doubled. The piano stands in the center, its open lid catching fragments of light. The room feels inverted, as if the ceiling is the floor of another room looking down.",
      },
      {
        roomId: "archive",
        name: "The Open Archive",
        description:
          "The filing cabinets loom in total darkness. No light reaches here at night. But a gap has appeared in the far wall — a passage that was not there during the day, leading to somewhere the Vault does not watch.",
      },
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
    rooms: [
      {
        roomId: "foyer",
        description:
          "A vaulted entrance hall. Stone columns frame the doorway. A guest ledger sits open on a narrow table. The air is cool and still, carrying the faint scent of old wood.",
      },
      {
        roomId: "gallery",
        name: "The Gallery",
        description:
          "A long room hung with portraits. Some faces are labeled, others are not. The lighting is angled to catch details in the paint. One painting near the far wall seems newer than the rest.",
      },
      {
        roomId: "library",
        description:
          "Floor-to-ceiling shelves, heavy with books. A reading lamp pools warm light on a worn leather chair. The shelves absorb sound — conversations here feel private, close.",
      },
      {
        roomId: "conservatory",
        name: "The Conservatory",
        description:
          "A glass-ceilinged room with a grand piano and potted ferns. By day, light pours in. By night, the glass becomes a mirror reflecting whoever stands below.",
      },
      {
        roomId: "archive",
        name: "The Archive",
        description:
          "A windowless room lined with filing cabinets and locked drawers. The air is dry, preserved. There's no camera here — just the faint hum of climate control.",
      },
    ],
  },
};
