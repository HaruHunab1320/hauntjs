import type { Room } from "@hauntjs/core";
import {
  presenceSensor,
  roomId,
  sightSensor,
  soundSensor,
} from "@hauntjs/core";

// --- The Residency: Seven rooms of a shared living space ---

export const kitchen: Room = {
  id: roomId("kitchen"),
  name: "The Kitchen",
  description:
    "Warm and well-lit, the kitchen smells of coffee and whatever was last cooked. A wooden table sits in the center, scarred by years of use. Pots hang from a rack above the stove. This is where people end up, whether they meant to or not.",
  affordances: new Map(),
  sensors: new Map([
    sightSensor("kitchen.sight", roomId("kitchen")),
    soundSensor("kitchen.sound", roomId("kitchen")),
    presenceSensor("kitchen.presence", roomId("kitchen"), { fidelity: { kind: "full" } }),
  ]),
  connectedTo: [roomId("living-room"), roomId("garden")],
  state: {},
};

export const livingRoom: Room = {
  id: roomId("living-room"),
  name: "The Living Room",
  description:
    "Comfortable and lived-in. The couch sags in the middle from years of use. Afternoon light comes through tall windows. A record player sits on a low shelf beside a stack of vinyl. The bookshelf is organized by no system anyone can identify.",
  affordances: new Map(),
  sensors: new Map([
    sightSensor("living-room.sight", roomId("living-room")),
    soundSensor("living-room.sound", roomId("living-room")),
  ]),
  connectedTo: [roomId("kitchen"), roomId("hallway")],
  state: {},
};

export const hallway: Room = {
  id: roomId("hallway"),
  name: "The Hallway",
  description:
    "Narrow and dim. Doors line both sides — bedrooms, the bathroom. A coat rack leans against one wall. Shoes pile near the entrance. You pass through here; you don't stay.",
  affordances: new Map(),
  sensors: new Map([
    presenceSensor("hallway.presence", roomId("hallway"), {
      fidelity: { kind: "partial", reveals: ["presence", "identity"] },
    }),
  ]),
  connectedTo: [
    roomId("living-room"),
    roomId("bedroom-1"),
    roomId("bedroom-2"),
    roomId("bedroom-3"),
    roomId("bathroom"),
  ],
  state: {},
};

export const bedroom1: Room = {
  id: roomId("bedroom-1"),
  name: "Bedroom 1",
  description:
    "Small and personal. A single window faces east, catching the morning light. A desk is pushed against the wall, covered in papers and half-finished thoughts.",
  affordances: new Map(),
  sensors: new Map([
    soundSensor("bedroom-1.sound", roomId("bedroom-1")),
  ]),
  connectedTo: [roomId("hallway")],
  state: {},
};

export const bedroom2: Room = {
  id: roomId("bedroom-2"),
  name: "Bedroom 2",
  description:
    "Cozy and cluttered. Bookshelves line one wall, double-stacked and overflowing. A reading chair sits in the corner with a lamp beside it. The bed is unmade.",
  affordances: new Map(),
  sensors: new Map([
    soundSensor("bedroom-2.sound", roomId("bedroom-2")),
  ]),
  connectedTo: [roomId("hallway")],
  state: {},
};

export const bedroom3: Room = {
  id: roomId("bedroom-3"),
  name: "Bedroom 3",
  description:
    "Sparse and clean. Very little on the walls. A window seat looks out over the garden. The bed is neatly made. The room smells faintly of lavender.",
  affordances: new Map(),
  sensors: new Map([
    soundSensor("bedroom-3.sound", roomId("bedroom-3")),
  ]),
  connectedTo: [roomId("hallway")],
  state: {},
};

export const bathroom: Room = {
  id: roomId("bathroom"),
  name: "The Bathroom",
  description:
    "Small and tiled in white. The only truly private space in the house. A frosted window lets in light but nothing else. The mirror is slightly fogged.",
  affordances: new Map(),
  sensors: new Map(), // No sensors — total privacy
  connectedTo: [roomId("hallway")],
  state: {},
};

export const garden: Room = {
  id: roomId("garden"),
  name: "The Garden",
  description:
    "Overgrown and fragrant. Herbs grow in unruly patches near the kitchen door. A wooden bench sits under an old tree. The sky is open here — the only room without a ceiling. Bees hum through the lavender.",
  affordances: new Map(),
  sensors: new Map([
    sightSensor("garden.sight", roomId("garden"), {
      fidelity: { kind: "partial", reveals: ["presence", "identity"] },
      description: "Daylight vision — clear in the day, dark at night.",
    }),
    soundSensor("garden.sound", roomId("garden")),
  ]),
  connectedTo: [roomId("kitchen")],
  state: {},
};

export const RESIDENCY_ROOMS: Room[] = [
  kitchen,
  livingRoom,
  hallway,
  bedroom1,
  bedroom2,
  bedroom3,
  bathroom,
  garden,
];
