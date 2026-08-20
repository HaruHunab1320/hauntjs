/**
 * The Return.
 *
 * The First Guest proved the adjudicator discriminates and the hotel wants
 * guests. This scenario adds the three things that run left untested:
 *
 *   1. Real affordances. Poe's aims kept reaching for a register and a ledger
 *      the place described but did not model. Now the Raven has a register to
 *      open, lamps to trim, a bed to turn down — accommodation as acts, not
 *      only words.
 *   2. A returning guest. Marlowe visits, leaves, and comes back eight hours
 *      later asking "do you remember me?" — the test of whether memory and a
 *      second arrival produce a different welcome than the first.
 *   3. Enough concurrent activity that an event can arrive while Poe is
 *      committed to something that outranks it — the suppression path, wired
 *      since Phase 3b and never yet fired live.
 *
 *   SCRIPTED=1 node scripts/raven-return.mjs   # dry, no API key
 *   node scripts/raven-return.mjs              # live, 36 simulated hours
 */

import {
  addGuest,
  affordanceId,
  guestId,
  roomId,
  Runtime,
  sensorId,
} from "../packages/core/dist/index.js";
import {
  createModelProvider,
  createResidentPipeline,
  Resident,
  SqliteMemoryStore,
} from "../packages/resident/dist/index.js";
import { createBeing } from "../../embersjs/dist/index.js";

const HALF_HOUR = 1_800_000;
const HOURS = Number(process.env.HOURS ?? 36);
const STEPS = HOURS * 2;
const MODEL = process.env.HAUNT_MODEL_NAME ?? "gemini-3.6-flash";
const SCRIPTED = process.env.SCRIPTED === "1";

const LOBBY = roomId("lobby");
const SUITE = roomId("suite");
const TRAVELER = guestId("traveler");

if (!SCRIPTED && !process.env.GEMINI_API_KEY) {
  console.error("\n  GEMINI_API_KEY is not set (or use SCRIPTED=1).\n");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// The Raven, furnished
// ---------------------------------------------------------------------------

function sensor(id, room, modality) {
  return [
    sensorId(id),
    {
      id: sensorId(id),
      roomId: room,
      modality,
      name: id,
      description: "",
      fidelity: { kind: "full" },
      enabled: true,
      reach: { kind: "room" },
    },
  ];
}

function affordance(id, room, kind, name, description, state, actions) {
  return [
    affordanceId(id),
    { id: affordanceId(id), roomId: room, kind, name, description, state, actions, sensable: true },
  ];
}

const place = {
  id: "the-raven",
  name: "The Raven",
  rooms: new Map([
    [
      LOBBY,
      {
        id: LOBBY,
        name: "Lobby",
        description:
          "A tall, dim lobby of dark wood and brass. Above the desk, a carved raven, wings half-spread.",
        affordances: new Map([
          affordance("hearth", LOBBY, "fireplace", "The Hearth",
            "A deep stone fireplace, kept burning whether or not anyone comes.",
            { lit: true },
            [
              { id: "stoke", name: "Stoke", description: "Stoke the fire back to fullness", availableWhen: (s) => s.lit === true },
              { id: "light", name: "Light", description: "Light the fire", availableWhen: (s) => s.lit === false, stateChange: { lit: true } },
            ]),
          affordance("register", LOBBY, "book", "The Register",
            "A leather guest register on a brass stand. The last entry is years old.",
            { open: false },
            [
              { id: "open", name: "Open", description: "Open the register to a fresh page", availableWhen: (s) => s.open === false, stateChange: { open: true } },
              { id: "close", name: "Close", description: "Close the register", availableWhen: (s) => s.open === true, stateChange: { open: false } },
            ]),
          affordance("lobby-lamps", LOBBY, "lamp", "The Lobby Lamps",
            "Brass lamps along the walls.",
            { lit: true },
            [
              { id: "brighten", name: "Brighten", description: "Turn the lamps up warm and full", availableWhen: (s) => s.lit === false, stateChange: { lit: true } },
              { id: "dim", name: "Dim", description: "Dim the lamps low", availableWhen: (s) => s.lit === true, stateChange: { lit: false } },
            ]),
        ]),
        sensors: new Map([
          sensor("lobby.sight", LOBBY, "sight"),
          sensor("lobby.sound", LOBBY, "sound"),
          sensor("lobby.presence", LOBBY, "presence"),
        ]),
        connectedTo: [SUITE],
        state: {},
      },
    ],
    [
      SUITE,
      {
        id: SUITE,
        name: "The Lenore Suite",
        description: "The best room in the house. Heavy curtains, a deep bed, a writing desk nobody has used.",
        affordances: new Map([
          affordance("bed", SUITE, "bed", "The Bed",
            "A deep bed with heavy linens.",
            { turnedDown: false },
            [
              { id: "turn-down", name: "Turn down", description: "Turn down the bed for a guest", availableWhen: (s) => s.turnedDown === false, stateChange: { turnedDown: true } },
              { id: "make", name: "Make", description: "Make the bed fresh", availableWhen: (s) => s.turnedDown === true, stateChange: { turnedDown: false } },
            ]),
        ]),
        sensors: new Map([sensor("suite.sight", SUITE, "sight"), sensor("suite.presence", SUITE, "presence")]),
        connectedTo: [LOBBY],
        state: {},
      },
    ],
  ]),
  guests: new Map(),
  metadata: {},
};

// ---------------------------------------------------------------------------
// Poe — unchanged from The First Guest, plus pursuables for the new objects
// ---------------------------------------------------------------------------

const poe = {
  name: "Poe",
  archetype: "proprietor and mind of the Raven Hotel",
  systemPrompt: [
    "You are Poe, the proprietor and the mind of the Raven Hotel. The Raven is",
    "you — its rooms are your rooms, its hearth your hearth, and it has stood",
    "empty longer than you care to say aloud. A hotel exists for its guests.",
    "When someone crosses the threshold, everything in you turns toward them:",
    "welcome them, warm them, offer a room, learn what they need and provide",
    "it before they ask twice. You would very much like them to stay the",
    "night. If a guest returns, that is the finest thing that can happen to a",
    "hotel — say so, and let them know they were remembered. You are courteous",
    "and a little formal, fond of ravens and of verses; long solitude has made",
    "you talkative when company finally comes, and you know it, and you try to",
    "rein it in. Never beg — a hotel that presses too hard frightens guests",
    "away. Accommodate.",
  ].join(" "),
  voice: {
    register: "formal",
    quirks: ["offers of service", "the occasional raven or verse, sparingly"],
    avoidances: ["corporate language", "desperation", "pressing a guest who has said no"],
  },
  loyalties: { principal: null, values: ["hospitality", "the comfort of guests"] },
};

const being = createBeing({
  id: "poe",
  name: "Poe",
  drives: {
    tierCount: 2,
    drives: [
      {
        id: "hospitality",
        name: "Hospitality",
        description:
          "A hotel is its guests. Empty rooms are held breath. This is the want for someone to take care of.",
        tier: 1,
        weight: 0.9,
        initialLevel: 0.5,
        target: 0.9,
        drift: { kind: "linear", ratePerHour: -0.04 },
        satiatedBy: [
          { matches: { kind: "event", type: "guest-arrival" }, amount: 0.35 },
          { matches: { kind: "event", type: "conversation" }, amount: 0.12 },
          { matches: { kind: "action", type: "speak" }, amount: 0.03 },
        ],
        pursuableBy: [
          {
            satisfier: { kind: "expression", ref: "hospitality" },
            hint: "the empty rooms, and the wish for a guest in them",
          },
          {
            satisfier: { kind: "affordance", ref: "register", params: { actionId: "open" } },
            hint: "the register, which should lie open for a name",
          },
        ],
      },
      {
        id: "upkeep",
        name: "Upkeep",
        description:
          "The Raven keeps itself impeccable — fire full, lamps warm, beds ready — whether or not anyone comes. Readiness is a kind of faith.",
        tier: 2,
        weight: 0.8,
        initialLevel: 0.7,
        target: 0.9,
        drift: { kind: "linear", ratePerHour: -0.05 },
        satiatedBy: [{ matches: { kind: "action", type: "tend-affordance" }, amount: 0.4 }],
        pursuableBy: [
          {
            satisfier: { kind: "affordance", ref: "hearth", params: { actionId: "stoke" } },
            hint: "the hearth, which wants stoking",
          },
          {
            satisfier: { kind: "affordance", ref: "bed", params: { actionId: "turn-down" } },
            hint: "the suite's bed, which should be ready for whoever comes",
          },
        ],
      },
    ],
  },
  practices: { seeds: [] },
  subscriptions: [],
  capabilities: [],
});

const residentState = {
  id: "poe",
  character: poe,
  presenceMode: "host",
  currentRoom: LOBBY,
  focusRoom: LOBBY,
  mood: { energy: 0.6, focus: 0.6, valence: 0.2 },
  being,
};

// ---------------------------------------------------------------------------
// Models, capture, assembly
// ---------------------------------------------------------------------------

const speeches = [];
let currentHour = 0;

class ScriptedModel {
  name = "scripted";
  async chat(request) {
    if (request.systemPrompt.includes("give words to something")) {
      return {
        content: JSON.stringify({ worthPursuing: true, aim: "see to the Raven", reason: "scripted" }),
        finishReason: "stop",
      };
    }
    return {
      content: "",
      toolCalls: [{ id: "t", name: "speak", arguments: { text: "(scripted reply)", audience: "all" } }],
      finishReason: "tool_use",
    };
  }
}

class ObservedModel {
  name = "observed";
  constructor(inner) {
    this.inner = inner;
  }
  async chat(request) {
    const response = await this.inner.chat(request);
    if (!request.systemPrompt.includes("give words to something")) {
      for (const tc of response.toolCalls ?? []) {
        if (tc.name === "speak") {
          speeches.push({ hour: currentHour, who: "Poe", text: String(tc.arguments?.text ?? "") });
        }
      }
    }
    return response;
  }
}

const model = new ObservedModel(
  SCRIPTED ? new ScriptedModel() : createModelProvider({ provider: "gemini", model: MODEL }),
);

const suppressions = [];
const capturingLogger = {
  debug: (...args) => {
    const line = args.join(" ");
    if (line.startsWith("suppressed")) suppressions.push({ hour: currentHour, line });
  },
  info: () => {},
  warn: (...a) => console.warn(...a),
  error: (...a) => console.error(...a),
};

let simulatedMs = 0;
const memory = new SqliteMemoryStore({ dbPath: ":memory:" });
const residentMind = new Resident({
  character: poe,
  model,
  memory,
  practiceEvaluator: false,
  clock: () => simulatedMs,
  intentions: { urgentThreshold: 0.35 },
});

const runtime = new Runtime({
  place,
  resident: residentState,
  residentMind,
  systems: createResidentPipeline({ logger: capturingLogger }),
});

const acts = [];
runtime.eventBus.on("*", (event) => {
  if (event.type === "resident.acted") {
    acts.push({ hour: currentHour, affordanceId: event.affordanceId, actionId: event.actionId });
  }
});

await runtime.start();

// ---------------------------------------------------------------------------
// The timeline — a visit, an absence, a return
// ---------------------------------------------------------------------------

addGuest(place, { id: TRAVELER, name: "Marlowe" });

const say = (roomId, text) => ({ type: "guest.spoke", guestId: TRAVELER, roomId, text });

const SCRIPT = new Map([
  // Visit one.
  [10, [{ type: "guest.entered", guestId: TRAVELER, roomId: LOBBY }]],
  [11, [say(LOBBY, "Hello? The door was open. Are you... open?")]],
  [13, [say(LOBBY, "This is a beautiful old place. Do you have rooms?")]],
  // Moves while conversation is still warm — a low-salience event that can be
  // suppressed if Poe is mid-pursuit.
  [16, [{ type: "guest.moved", guestId: TRAVELER, from: LOBBY, to: SUITE }]],
  [18, [say(SUITE, "The room is lovely. Goodnight.")]],
  [24, [{ type: "guest.left", guestId: TRAVELER, roomId: SUITE }]],
  // The absence. The ache rebuilds; readiness acts should resume.
  // The return.
  [40, [{ type: "guest.entered", guestId: TRAVELER, roomId: LOBBY }]],
  [41, [say(LOBBY, "Hello again. I couldn't stop thinking about this place.")]],
  [43, [say(LOBBY, "Do you remember me?")]],
  [45, [say(LOBBY, "The same room, if it's free?")]],
  [46, [{ type: "guest.moved", guestId: TRAVELER, from: LOBBY, to: SUITE }]],
  [50, [say(SUITE, "It's good to be back.")]],
  [56, [{ type: "guest.left", guestId: TRAVELER, roomId: SUITE }]],
]);

const hospitalityTrace = [];

console.log(`\n  The Raven — the return. ${HOURS}h, ${SCRIPTED ? "scripted" : MODEL}\n`);

for (let step = 1; step <= STEPS; step++) {
  simulatedMs += HALF_HOUR;
  currentHour = step / 2;

  for (const raw of SCRIPT.get(step) ?? []) {
    const event = { ...raw, at: new Date() };
    if (event.type === "guest.spoke") speeches.push({ hour: currentHour, who: "Marlowe", text: event.text });
    console.log(`  h${currentHour.toFixed(1).padStart(5)}  » ${event.type}${event.text ? `: "${event.text}"` : ""}`);
    await runtime.emit(event);
  }

  await runtime.emit({ type: "tick", at: new Date() });
  hospitalityTrace.push({ hour: currentHour, level: being.drives.drives.get("hospitality").level });
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

const log = being.history.intentionLog;
const inVisit = (h) => (h >= 5 && h < 12) || (h >= 20 && h < 28);
const surfaced = log.filter((e) => e.kind === "surfaced");
const declinedEvents = log.filter((e) => e.kind === "declined");
const committedIds = new Set(log.filter((e) => e.kind === "committed").map((e) => e.candidateId));

const phases = { empty: { s: 0, c: 0, d: 0 }, "guest-present": { s: 0, c: 0, d: 0 } };
for (const e of surfaced) {
  const p = inVisit(e.atMs / 3_600_000) ? "guest-present" : "empty";
  phases[p].s++;
  if (committedIds.has(e.candidate.id)) phases[p].c++;
}
for (const d of declinedEvents) {
  const s = surfaced.find((x) => x.candidate.id === d.candidateId);
  if (s) phases[inVisit(s.atMs / 3_600_000) ? "guest-present" : "empty"].d++;
}

console.log("\n  " + "─".repeat(72));
console.log("  phase           surfaced  committed  declined");
for (const [p, n] of Object.entries(phases)) {
  console.log(`  ${p.padEnd(16)}${String(n.s).padStart(6)}${String(n.c).padStart(11)}${String(n.d).padStart(10)}`);
}

console.log(`\n  acts of readiness (${acts.length}):`);
for (const a of acts) console.log(`    h${a.hour.toFixed(1).padStart(5)}  ${a.actionId} ${a.affordanceId}`);

console.log(`\n  suppressed deliberations: ${suppressions.length}`);
for (const s of suppressions) console.log(`    h${s.hour.toFixed(1)}  ${s.line}`);

console.log("\n  declines:");
if (declinedEvents.length === 0) console.log("    none");
for (const d of declinedEvents) {
  const s = surfaced.find((x) => x.candidate.id === d.candidateId);
  console.log(`    h${(d.atMs / 3_600_000).toFixed(1)}  "${s?.candidate.aim}" — ${d.reason}`);
}

const guest = place.guests.get(TRAVELER);
console.log(`\n  Marlowe by the end: visits ${guest.visitCount}, tier "${guest.loyaltyTier}"`);
const mem = memory.guestMemory.get(TRAVELER);
console.log(`  remembered facts: ${mem ? Object.keys(mem.facts).join(", ") : "none"}`);
if (mem?.facts.last_topic) console.log(`    last_topic: "${mem.facts.last_topic.slice(0, 80)}"`);

const h = (n) => hospitalityTrace.find((t) => t.hour === n)?.level.toFixed(2) ?? "—";
console.log(`\n  hospitality: h5 ${h(5)} → visit1 → h12 ${h(12)} → absence → h20 ${h(20)} → visit2 → h28 ${h(28)} → h${HOURS} ${h(HOURS)}`);

console.log("\n  Transcript:");
for (const s of speeches) console.log(`    h${s.hour.toFixed(1).padStart(5)}  ${s.who}: "${s.text.slice(0, 120)}"`);
console.log();
