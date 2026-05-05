import type { Affordance } from "@hauntjs/core";
import { affordanceId, roomId } from "@hauntjs/core";

export const stove: Affordance = {
  id: affordanceId("stove"),
  roomId: roomId("kitchen"),
  kind: "appliance",
  name: "Stove",
  description: "A gas stove, well-used. The burners are clean but the knobs are worn smooth.",
  state: {},
  actions: [
    {
      id: "cook",
      name: "Cook something",
      description: "Use the stove to prepare food. The smell will carry.",
    },
    {
      id: "clean",
      name: "Clean the stove",
      description: "Wipe down the burners and surface.",
    },
  ],
  sensable: true,
};

export const kitchenTable: Affordance = {
  id: affordanceId("kitchen-table"),
  roomId: roomId("kitchen"),
  kind: "furniture",
  name: "Kitchen Table",
  description: "A heavy wooden table with four mismatched chairs. The surface is scarred with knife marks and coffee rings.",
  state: {},
  actions: [
    {
      id: "sit",
      name: "Sit at the table",
      description: "Pull up a chair and sit down.",
    },
    {
      id: "eat",
      name: "Eat at the table",
      description: "Eat whatever has been prepared.",
    },
  ],
  sensable: true,
};

export const couch: Affordance = {
  id: affordanceId("couch"),
  roomId: roomId("living-room"),
  kind: "furniture",
  name: "Couch",
  description: "A deep couch that sags in the middle. Once you sit, it's hard to get up.",
  state: {},
  actions: [
    {
      id: "sit",
      name: "Sit on the couch",
      description: "Sink into the cushions.",
    },
    {
      id: "relax",
      name: "Relax on the couch",
      description: "Stretch out and let the afternoon light wash over you.",
    },
  ],
  sensable: true,
};

export const bookshelf: Affordance = {
  id: affordanceId("bookshelf"),
  roomId: roomId("living-room"),
  kind: "furniture",
  name: "Bookshelf",
  description: "Overstuffed shelves with no discernible organization. Novels mixed with cookbooks mixed with philosophy.",
  state: {},
  actions: [
    {
      id: "browse",
      name: "Browse the books",
      description: "Run your fingers along the spines. See what catches your eye.",
    },
    {
      id: "read",
      name: "Pick a book and read",
      description: "Pull something from the shelf and settle in.",
    },
  ],
  sensable: true,
};

export const recordPlayer: Affordance = {
  id: affordanceId("record-player"),
  roomId: roomId("living-room"),
  kind: "device",
  name: "Record Player",
  description: "A turntable with a stack of vinyl beside it. The needle is lifted.",
  state: { playing: false },
  actions: [
    {
      id: "play",
      name: "Put on a record",
      description: "Choose something from the stack and drop the needle. Music fills the room.",
      availableWhen: (state) => state.playing === false,
      stateChange: { playing: true },
    },
    {
      id: "stop",
      name: "Stop the music",
      description: "Lift the needle. Silence returns.",
      availableWhen: (state) => state.playing === true,
      stateChange: { playing: false },
    },
  ],
  sensable: true,
};

export const desk: Affordance = {
  id: affordanceId("desk"),
  roomId: roomId("bedroom-1"),
  kind: "furniture",
  name: "Writing Desk",
  description: "A small desk pushed against the wall. Papers, pens, and half-finished notes cover its surface.",
  state: {},
  actions: [
    {
      id: "write",
      name: "Write something",
      description: "Sit down and put thoughts to paper.",
    },
    {
      id: "think",
      name: "Sit and think",
      description: "Stare at the wall and let your mind wander.",
    },
  ],
  sensable: true,
};

export const readingChair: Affordance = {
  id: affordanceId("reading-chair"),
  roomId: roomId("bedroom-2"),
  kind: "furniture",
  name: "Reading Chair",
  description: "A deep armchair with a reading lamp beside it. The cushion is permanently indented.",
  state: {},
  actions: [
    {
      id: "sit",
      name: "Sit in the chair",
      description: "Settle into the worn cushion.",
    },
    {
      id: "read",
      name: "Read in the chair",
      description: "Pick up whatever was left on the armrest and read.",
    },
  ],
  sensable: true,
};

export const windowSeat: Affordance = {
  id: affordanceId("window-seat"),
  roomId: roomId("bedroom-3"),
  kind: "furniture",
  name: "Window Seat",
  description: "A cushioned seat built into the bay window. The garden is visible below.",
  state: {},
  actions: [
    {
      id: "sit",
      name: "Sit at the window",
      description: "Watch the garden from above.",
    },
    {
      id: "look-outside",
      name: "Look outside",
      description: "Gaze out at the garden and the sky beyond.",
    },
  ],
  sensable: true,
};

export const gardenBench: Affordance = {
  id: affordanceId("garden-bench"),
  roomId: roomId("garden"),
  kind: "furniture",
  name: "Garden Bench",
  description: "A weathered wooden bench under the old tree. The paint is peeling but it's solid.",
  state: {},
  actions: [
    {
      id: "sit",
      name: "Sit on the bench",
      description: "Rest in the shade and listen to the garden.",
    },
    {
      id: "rest",
      name: "Rest on the bench",
      description: "Close your eyes and feel the breeze.",
    },
  ],
  sensable: true,
};

export const herbGarden: Affordance = {
  id: affordanceId("herb-garden"),
  roomId: roomId("garden"),
  kind: "garden",
  name: "Herb Garden",
  description: "Unruly patches of rosemary, basil, thyme, and lavender. Some weeds mixed in.",
  state: {},
  actions: [
    {
      id: "tend",
      name: "Tend the herbs",
      description: "Pull weeds, water the plants, pinch back the basil.",
    },
    {
      id: "harvest",
      name: "Harvest some herbs",
      description: "Pick fresh herbs for cooking.",
    },
  ],
  sensable: true,
};

export const RESIDENCY_AFFORDANCES: Affordance[] = [
  stove,
  kitchenTable,
  couch,
  bookshelf,
  recordPlayer,
  desk,
  readingChair,
  windowSeat,
  gardenBench,
  herbGarden,
];
