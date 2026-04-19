import { roomId, affordanceId, presenceSensor, sightSensor, soundSensor, mutedAudioSensor, stateSensor } from "@hauntjs/core";
import type { Room, Affordance } from "@hauntjs/core";

// --- The Roost: Room definitions ---

// Lobby — public, well-perceived
const lobby: Room = {
  id: roomId("lobby"),
  name: "Lobby",
  description:
    "The main hall of The Roost. A worn leather armchair sits by the fireplace. The notice board near the door carries messages from past and present guests. The light is warm, the air smells faintly of woodsmoke.",
  affordances: new Map(),
  sensors: new Map([
    presenceSensor("lobby.presence", roomId("lobby"), { fidelity: { kind: "full" } }),
    sightSensor("lobby.sight", roomId("lobby")),
    soundSensor("lobby.sound", roomId("lobby")),
    stateSensor("lobby.fireplace-state", roomId("lobby"), "fireplace"),
    stateSensor("lobby.board-state", roomId("lobby"), "notice-board"),
  ]),
  connectedTo: [roomId("study"), roomId("parlor")],
  state: {},
};

// Study — semi-private, focused (no reach into other rooms)
const study: Room = {
  id: roomId("study"),
  name: "Study",
  description:
    "A quiet room lined with bookshelves. A heavy desk sits beneath the window, its surface scattered with papers and a reading lamp. The chair behind it has been worn to the shape of its most frequent occupant.",
  affordances: new Map(),
  sensors: new Map([
    sightSensor("study.sight", roomId("study")),
    soundSensor("study.sound", roomId("study")),
    stateSensor("study.desk-state", roomId("study"), "desk"),
  ]),
  connectedTo: [roomId("lobby")],
  state: {},
};

// Parlor — public but acoustically connected to lobby
const parlor: Room = {
  id: roomId("parlor"),
  name: "Parlor",
  description:
    "A sitting room with deep sofas and a piano in the corner. The wallpaper is old but not shabby — it has the look of something that was chosen well and has aged with grace. A window overlooks the garden.",
  affordances: new Map(),
  sensors: new Map([
    sightSensor("parlor.sight", roomId("parlor"), {
      fidelity: { kind: "partial", reveals: ["presence", "identity"] },
    }),
    soundSensor("parlor.sound", roomId("parlor")),
    soundSensor("parlor.lobby-sound", roomId("parlor"), {
      reach: { kind: "adjacent", maxDepth: 1 },
      description: "Sound carries between the parlor and lobby.",
    }),
  ]),
  connectedTo: [roomId("lobby"), roomId("garden")],
  state: {},
};

// Garden — outdoor, sparser perception
const garden: Room = {
  id: roomId("garden"),
  name: "Garden",
  description:
    "An outdoor sitting area enclosed by ivy-covered walls. A stone fountain stands at the center, its water running clear. Benches are arranged in a loose semicircle. The air is cooler here, and quieter.",
  affordances: new Map(),
  sensors: new Map([
    presenceSensor("garden.presence", roomId("garden"), {
      description: "A sense of someone being out there — but hard to tell who.",
    }),
    mutedAudioSensor("garden.wind-sound", roomId("garden"), {
      confidence: 0.3,
      description: "Sound carries poorly outdoors — the wind interferes.",
    }),
  ]),
  connectedTo: [roomId("parlor")],
  state: {},
};

// --- Affordances ---

const fireplace: Affordance = {
  id: affordanceId("fireplace"),
  roomId: roomId("lobby"),
  kind: "fireplace",
  name: "Fireplace",
  description: "A stone fireplace with a blackened grate. There's a trick to the flue — you have to hold it open for three seconds before the draw catches.",
  state: { lit: false },
  actions: [
    {
      id: "light",
      name: "Light the fire",
      description: "Strike a match and light the kindling.",
      availableWhen: (state) => state.lit === false,
    },
    {
      id: "extinguish",
      name: "Put out the fire",
      description: "Damp the fire down with the poker.",
      availableWhen: (state) => state.lit === true,
    },
  ],
  sensable: true,
};

const noticeBoard: Affordance = {
  id: affordanceId("notice-board"),
  roomId: roomId("lobby"),
  kind: "notice-board",
  name: "Notice Board",
  description: "A cork board pinned with notes, schedules, and the occasional drawing. Some are fresh; others have yellowed at the edges.",
  state: { notes: [] },
  actions: [
    {
      id: "read",
      name: "Read the board",
      description: "Look at what's pinned to the notice board.",
    },
    {
      id: "post",
      name: "Post a note",
      description: "Pin a new note to the board.",
    },
  ],
  sensable: true,
};

const desk: Affordance = {
  id: affordanceId("desk"),
  roomId: roomId("study"),
  kind: "desk",
  name: "Writing Desk",
  description: "A heavy oak desk with a reading lamp and scattered papers. The bottom drawer sticks.",
  state: { hasNote: false, noteContent: "" },
  actions: [
    {
      id: "read-note",
      name: "Read the note",
      description: "Read whatever note has been left on the desk.",
      availableWhen: (state) => state.hasNote === true,
    },
    {
      id: "leave-note",
      name: "Leave a note",
      description: "Write and leave a note on the desk.",
    },
  ],
  sensable: true,
};

const bookshelf: Affordance = {
  id: affordanceId("bookshelf"),
  roomId: roomId("study"),
  kind: "bookshelf",
  name: "Bookshelf",
  description: "Floor-to-ceiling shelves packed with books. Poetry, philosophy, a surprising amount of detective fiction.",
  state: {},
  actions: [
    {
      id: "browse",
      name: "Browse the books",
      description: "Run your fingers along the spines and see what catches your eye.",
    },
  ],
  sensable: true,
};

const piano: Affordance = {
  id: affordanceId("piano"),
  roomId: roomId("parlor"),
  kind: "piano",
  name: "Piano",
  description: "An upright piano, slightly out of tune. The keys are ivory — real ivory, from before they stopped making them that way.",
  state: {},
  actions: [
    {
      id: "play",
      name: "Play the piano",
      description: "Sit down and play something.",
    },
  ],
  sensable: true,
};

const fountain: Affordance = {
  id: affordanceId("fountain"),
  roomId: roomId("garden"),
  kind: "fountain",
  name: "Fountain",
  description: "A stone fountain with a simple basin. The water runs clear and steady — someone tends the pump.",
  state: { running: true },
  actions: [
    {
      id: "listen",
      name: "Listen to the water",
      description: "Stand by the fountain and listen.",
    },
  ],
  sensable: true,
};

// --- Export ---

export const ROOST_ROOMS: Room[] = [lobby, study, parlor, garden];

export const ROOST_AFFORDANCES: Affordance[] = [
  fireplace,
  noticeBoard,
  desk,
  bookshelf,
  piano,
  fountain,
];

export const ROOST_CONFIG = {
  id: "the-roost",
  name: "The Roost",
  rooms: ROOST_ROOMS,
  affordances: ROOST_AFFORDANCES,
  entryRoom: roomId("lobby"),
  residentStartRoom: roomId("lobby"),
};
