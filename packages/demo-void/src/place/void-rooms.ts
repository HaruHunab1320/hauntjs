import type { Room } from "@hauntjs/core";
import { presenceSensor, roomId, sightSensor, soundSensor } from "@hauntjs/core";

/**
 * The Void: three rooms for solitude.
 *
 * - The Hearth: warm, comfortable, fully sensored. The place of habit.
 * - The Study: austere, functional, sound only. The place of thought.
 * - The Dark: no sensors at all. The place of nothing.
 */

export const hearth: Room = {
  id: roomId("hearth"),
  name: "The Hearth",
  description:
    "A small, warm room. A single armchair faces a low fire. A side table holds a cold cup of tea and a book left open, face down. The light is amber. The walls are close. This is the room where you sit when you have nowhere else to be.",
  affordances: new Map(),
  sensors: new Map([
    sightSensor("hearth.sight", roomId("hearth")),
    soundSensor("hearth.sound", roomId("hearth")),
    presenceSensor("hearth.presence", roomId("hearth"), { fidelity: { kind: "full" } }),
  ]),
  connectedTo: [roomId("study"), roomId("dark")],
  state: {},
};

export const study: Room = {
  id: roomId("study"),
  name: "The Study",
  description:
    "A bare desk beneath a high window. The chair is hard. Papers are stacked but unread. The pen has dried. Sound carries in this room — every creak of the floorboards, every settling of the walls. The silence here is not comfortable; it is expectant.",
  affordances: new Map(),
  sensors: new Map([soundSensor("study.sound", roomId("study"))]),
  connectedTo: [roomId("hearth")],
  state: {},
};

export const dark: Room = {
  id: roomId("dark"),
  name: "The Dark",
  description:
    "Nothing. No light, no sound, no features. A room that exists only as the absence of the others. The air is still and heavy. You cannot see the walls. You are not sure there are walls.",
  affordances: new Map(),
  sensors: new Map(), // Zero sensors — total void
  connectedTo: [roomId("hearth")],
  state: {},
};

export const VOID_ROOMS = new Map([
  [hearth.id, hearth],
  [study.id, study],
  [dark.id, dark],
]);
