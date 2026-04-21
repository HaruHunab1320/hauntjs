import type { Affordance } from "@hauntjs/core";
import { affordanceId, roomId, sensorId } from "@hauntjs/core";

export const guestLedger: Affordance = {
  id: affordanceId("guest-ledger"),
  roomId: roomId("foyer"),
  kind: "ledger",
  name: "Guest Ledger",
  description: "An open ledger on the entrance table. Names, dates. Some entries go back decades.",
  state: { entries: 0 },
  actions: [
    {
      id: "read",
      name: "Read the ledger",
      description: "Browse the names and dates of past visitors.",
    },
    {
      id: "sign",
      name: "Sign the ledger",
      description: "Add your name to the record.",
      stateChange: { entries: 1 },
    },
  ],
  sensable: true,
};

export const newerPainting: Affordance = {
  id: affordanceId("newer-painting"),
  roomId: roomId("gallery"),
  kind: "painting",
  name: "The Newer Painting",
  description:
    "A portrait near the far wall, noticeably more recent than the others. The subject has familiar eyes. The nameplate is blank.",
  state: {},
  actions: [
    {
      id: "examine",
      name: "Examine closely",
      description: "Look at the painting up close. Study the brushwork, the face, the empty nameplate.",
    },
  ],
  sensable: true,
};

export const readingLamp: Affordance = {
  id: affordanceId("library-lamp"),
  roomId: roomId("library"),
  kind: "lamp",
  name: "Reading Lamp",
  description: "A brass lamp casting warm light across the reading chair. The switch is within reach.",
  state: { on: true },
  actions: [
    {
      id: "turn-off",
      name: "Turn off the lamp",
      description: "The library goes dark. Only sound carries.",
      availableWhen: (state) => state.on === true,
      stateChange: { on: false },
      affects: [{ sensorId: sensorId("library.sight"), change: { enabled: false } }],
    },
    {
      id: "turn-on",
      name: "Turn on the lamp",
      description: "Light fills the library again.",
      availableWhen: (state) => state.on === false,
      stateChange: { on: true },
      affects: [{ sensorId: sensorId("library.sight"), change: { enabled: true } }],
    },
  ],
  sensable: true,
};

export const bookshelf: Affordance = {
  id: affordanceId("library-bookshelf"),
  roomId: roomId("library"),
  kind: "bookshelf",
  name: "Bookshelf",
  description:
    "Shelves of old books. History, philosophy, family records. Some spines are cracked with use, others untouched.",
  state: {},
  actions: [
    {
      id: "browse",
      name: "Browse the books",
      description: "Run your fingers along the spines. See what catches your eye.",
    },
  ],
  sensable: true,
};

export const piano: Affordance = {
  id: affordanceId("conservatory-piano"),
  roomId: roomId("conservatory"),
  kind: "piano",
  name: "Grand Piano",
  description: "A grand piano, well-maintained but rarely played. The lid is propped open.",
  state: {},
  actions: [
    {
      id: "play",
      name: "Play something",
      description: "Sit down and play. The sound will carry.",
    },
  ],
  sensable: true,
};

export const filingCabinet: Affordance = {
  id: affordanceId("archive-cabinet"),
  roomId: roomId("archive"),
  kind: "cabinet",
  name: "Filing Cabinet",
  description: "Rows of metal cabinets, some labeled, some not. Most drawers are locked.",
  state: { locked: true },
  actions: [
    {
      id: "examine",
      name: "Examine the labels",
      description: "Read the labels on the drawers. Most are dates. One says 'Lineage.'",
    },
  ],
  sensable: true,
};

export const hiddenAlcove: Affordance = {
  id: affordanceId("hidden-alcove"),
  roomId: roomId("hidden-room"),
  kind: "alcove",
  name: "Stone Alcove",
  description:
    "A recess in the bare stone wall. Something could be hidden here. The Vault cannot see this room — whatever you do here is private.",
  state: {},
  actions: [
    {
      id: "search",
      name: "Search the alcove",
      description: "Feel along the stone for anything concealed.",
    },
  ],
  sensable: true,
};

export const VAULT_AFFORDANCES: Affordance[] = [
  guestLedger,
  newerPainting,
  readingLamp,
  bookshelf,
  piano,
  filingCabinet,
  hiddenAlcove,
];
