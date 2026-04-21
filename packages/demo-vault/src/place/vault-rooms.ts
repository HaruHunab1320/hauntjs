import type { Room } from "@hauntjs/core";
import {
  presenceSensor,
  roomId,
  sightSensor,
  soundSensor,
  stateSensor,
} from "@hauntjs/core";

// --- The Vault: Six rooms with distinct sensor profiles ---

export const foyer: Room = {
  id: roomId("foyer"),
  name: "The Foyer",
  description:
    "A vaulted entrance hall. Stone columns frame the doorway. A guest ledger sits open on a narrow table. The air is cool and still, carrying the faint scent of old wood.",
  affordances: new Map(),
  sensors: new Map([
    presenceSensor("foyer.presence", roomId("foyer"), { fidelity: { kind: "full" } }),
    sightSensor("foyer.sight", roomId("foyer")),
    soundSensor("foyer.sound", roomId("foyer")),
    // Place-wide awareness (Poe IS the Vault)
    soundSensor("vault.intercom", roomId("foyer"), {
      reach: { kind: "place-wide" },
      description: "The Vault carries sound to its keeper — speech in any room is heard.",
    }),
    presenceSensor("vault.awareness", roomId("foyer"), {
      fidelity: { kind: "full" },
      reach: { kind: "place-wide" },
      description: "The Vault knows who is present, everywhere.",
    }),
  ]),
  connectedTo: [roomId("gallery"), roomId("library")],
  state: {},
};

export const gallery: Room = {
  id: roomId("gallery"),
  name: "The Gallery",
  description:
    "A long room hung with portraits. Some faces are labeled, others are not. The lighting is angled to catch details in the paint. One painting near the far wall seems newer than the rest.",
  affordances: new Map(),
  sensors: new Map([
    sightSensor("gallery.sight", roomId("gallery")),
    soundSensor("gallery.sound", roomId("gallery")),
    presenceSensor("gallery.presence", roomId("gallery"), { fidelity: { kind: "full" } }),
  ]),
  connectedTo: [roomId("foyer"), roomId("conservatory")],
  state: {},
};

export const library: Room = {
  id: roomId("library"),
  name: "The Library",
  description:
    "Floor-to-ceiling shelves, heavy with books. A reading lamp pools warm light on a worn leather chair. The shelves absorb sound — conversations here feel private, close.",
  affordances: new Map(),
  sensors: new Map([
    sightSensor("library.sight", roomId("library")),
    soundSensor("library.sound", roomId("library")),
    presenceSensor("library.presence", roomId("library"), { fidelity: { kind: "full" } }),
    stateSensor("library.lamp-state", roomId("library"), "library-lamp"),
  ]),
  connectedTo: [roomId("foyer"), roomId("archive")],
  state: {},
};

export const conservatory: Room = {
  id: roomId("conservatory"),
  name: "The Conservatory",
  description:
    "A glass-ceilinged room with a grand piano and potted ferns. By day, light pours in. By night, the glass becomes a mirror reflecting whoever stands below.",
  affordances: new Map(),
  sensors: new Map([
    sightSensor("conservatory.sight", roomId("conservatory"), {
      fidelity: { kind: "partial", reveals: ["presence", "identity"] },
    }),
    soundSensor("conservatory.sound", roomId("conservatory")),
    soundSensor("conservatory.gallery-sound", roomId("conservatory"), {
      reach: { kind: "adjacent", maxDepth: 1 },
      description: "Music and voices carry between the conservatory and gallery.",
    }),
  ]),
  connectedTo: [roomId("gallery")],
  state: {},
};

export const archive: Room = {
  id: roomId("archive"),
  name: "The Archive",
  description:
    "A windowless room lined with filing cabinets and locked drawers. The air is dry, preserved. There's no camera here — just the faint hum of climate control.",
  affordances: new Map(),
  sensors: new Map([
    sightSensor("archive.sight", roomId("archive"), {
      fidelity: { kind: "partial", reveals: ["presence"] },
    }),
    // No sound sensor — conversations here are private
  ]),
  connectedTo: [roomId("library")],
  // Hidden room connects at night only — handled by phase transitions
  state: {},
};

export const hiddenRoom: Room = {
  id: roomId("hidden-room"),
  name: "The Hidden Room",
  description:
    "A small chamber behind the archive shelving. No cameras, no microphones, no sensors of any kind. Whatever happens here, the Vault does not perceive. The walls are bare stone, older than the building around them.",
  affordances: new Map(),
  sensors: new Map(), // ZERO sensors — completely dark to Poe
  connectedTo: [], // Connected to archive at night only
  state: {},
};

export const VAULT_ROOMS: Room[] = [foyer, gallery, library, conservatory, archive, hiddenRoom];
