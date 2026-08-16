import type { PhaseTransitionMap } from "@hauntjs/core";
import { roomId } from "@hauntjs/core";
import { dark, hearth, study } from "./void-rooms.js";

export const VOID_CONFIG = {
  id: "the-void",
  name: "The Void",
  rooms: [hearth, study, dark],
  affordances: [],
  entryRoom: roomId("hearth"),
  residentStartRoom: roomId("hearth"),
};

// No phase transitions — the void doesn't change with time.
// The only thing that changes is the being inside it.
export const VOID_PHASE_TRANSITIONS: PhaseTransitionMap = {};
