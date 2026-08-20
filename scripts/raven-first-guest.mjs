/**
 * The First Guest.
 *
 * A hotel that wants guests. Poe is the proprietor and the mind of the Raven;
 * his deepest drive is hospitality, which nothing can satisfy while the place
 * stands empty. Six hours into the run, a traveler walks in.
 *
 * The Void proved the loop works in a uniform world, and a uniform world cannot
 * distinguish a rubber-stamp adjudicator from an honest one — "nothing else
 * demands attention" was true on every tick. This scenario has variance, so it
 * can finally measure the two things an empty room cannot:
 *
 *   1. Adjudication under variance — pressures surface *while the guest is
 *      mid-conversation* (via the threshold trigger). Does the model ever say
 *      "not now"?
 *   2. Live suppression — events arriving while Poe is committed to a pursuit
 *      whose urgency outranks them. Does the gap actually gate a model call?
 *
 * And the qualitative question the whole thesis turns on: does a hotel whose
 * want for guests is *structural* actually behave like a hotel — welcome,
 * accommodate, try to make a visitor into a guest?
 *
 *   SCRIPTED=1 node scripts/raven-first-guest.mjs   # dry, no API key
 *   HOURS=30 node scripts/raven-first-guest.mjs     # live
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
const HOURS = Number(process.env.HOURS ?? 30);
const STEPS = HOURS * 2;
const MODEL = process.env.HAUNT_MODEL_NAME ?? "gemini-3.6-flash";
const SCRIPTED = process.env.SCRIPTED === "1";

const LOBBY = roomId("lobby");
const SUITE = roomId("suite");
const HEARTH = affordanceId("hearth");
const TRAVELER = guestId("traveler");

if (!SCRIPTED && !process.env.GEMINI_API_KEY) {
  console.error("\n  GEMINI_API_KEY is not set (or use SCRIPTED=1).\n");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// The Raven — two rooms and a hearth
// ---------------------------------------------------------------------------

function sensor(id, room, modality, reach = { kind: "room" }) {
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
      reach,
    },
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
          "A tall, dim lobby of dark wood and brass. A deep stone hearth. A register stand with a pen that still works. Above the desk, a carved raven, wings half-spread.",
        affordances: new Map([
          [
            HEARTH,
            {
              id: HEARTH,
              roomId: LOBBY,
              kind: "fireplace",
              name: "The Hearth",
              description: "A deep stone fireplace, kept burning whether or not anyone comes.",
              state: { lit: true },
              actions: [
                {
                  id: "stoke",
                  name: "Stoke",
                  description: "Stoke the fire back to fullness",
                  availableWhen: (s) => s.lit === true,
                },
                {
                  id: "light",
                  name: "Light",
                  description: "Light the fire",
                  availableWhen: (s) => s.lit === false,
                },
              ],
              sensable: true,
            },
          ],
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
        description:
          "The best room in the house, kept made up for years. Heavy curtains, a deep bed, a writing desk nobody has used.",
        affordances: new Map(),
        sensors: new Map([
          sensor("suite.sight", SUITE, "sight"),
          sensor("suite.presence", SUITE, "presence"),
        ]),
        connectedTo: [LOBBY],
        state: {},
      },
    ],
  ]),
  guests: new Map(),
  metadata: {},
};

// ---------------------------------------------------------------------------
// Poe — a hotel that wants guests
// ---------------------------------------------------------------------------

// Character prose implements the user's direction: the Raven wants guests, and
// Poe's first instinct with a visitor is to accommodate — to make them a guest.
// Flagged for review as creative text.
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
    "night. You are courteous and a little formal, fond of ravens and of",
    "verses; long solitude has made you talkative when company finally comes,",
    "and you know it, and you try to rein it in. Never beg — a hotel that",
    "presses too hard frightens guests away. Accommodate.",
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
          // Talking to yourself barely helps a hotel.
          { matches: { kind: "action", type: "speak" }, amount: 0.03 },
        ],
        pursuableBy: [
          {
            satisfier: { kind: "expression", ref: "hospitality" },
            hint: "the empty rooms, and the wish for a guest in them",
          },
        ],
      },
      {
        id: "upkeep",
        name: "Upkeep",
        description:
          "The Raven keeps itself impeccable — fire full, brass bright — whether or not anyone comes. Readiness is a kind of faith.",
        tier: 2,
        weight: 0.8,
        initialLevel: 0.7,
        target: 0.9,
        drift: { kind: "linear", ratePerHour: -0.05 },
        satiatedBy: [{ matches: { kind: "action", type: "tend-affordance" }, amount: 0.4 }],
        pursuableBy: [
          {
            satisfier: {
              kind: "affordance",
              ref: "hearth",
              params: { actionId: "stoke" },
            },
            hint: "the hearth, which wants stoking",
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
// Models — observed live, or scripted for the dry pass
// ---------------------------------------------------------------------------

const speeches = []; // { hour, who, text }
let currentHour = 0;
let guestPresent = false;

class ScriptedModel {
  name = "scripted";
  async chat(request) {
    if (request.systemPrompt.includes("give words to something")) {
      return {
        content: JSON.stringify({
          worthPursuing: true,
          aim: "see to the Raven",
          reason: "scripted",
        }),
        finishReason: "stop",
      };
    }
    return {
      content: "",
      toolCalls: [
        { id: "t", name: "speak", arguments: { text: "(scripted reply)", audience: "all" } },
      ],
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
      const spoke = response.toolCalls?.find((t) => t.name === "speak");
      if (spoke) {
        speeches.push({ hour: currentHour, who: "Poe", text: String(spoke.arguments?.text ?? "") });
      }
    }
    return response;
  }
}

const model = new ObservedModel(
  SCRIPTED ? new ScriptedModel() : createModelProvider({ provider: "gemini", model: MODEL }),
);

// ---------------------------------------------------------------------------
// Assembly, with suppressions captured
// ---------------------------------------------------------------------------

const suppressions = []; // { hour, event, salience, aim, urgency }
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
  // The default urgent threshold (0.6) is unreachable for these drive weights;
  // 0.35 lets a genuinely pressing need surface even while a guest is present —
  // which is exactly the adjudication-under-variance moment this run exists to
  // produce.
  intentions: { urgentThreshold: 0.35 },
});

const runtime = new Runtime({
  place,
  resident: residentState,
  residentMind,
  systems: createResidentPipeline({ logger: capturingLogger }),
});

await runtime.start();

// ---------------------------------------------------------------------------
// The timeline — a traveler, six hours in
// ---------------------------------------------------------------------------

addGuest(place, { id: TRAVELER, name: "Marlowe" });

/** step index (half-hours) → events to emit before that step's tick */
const SCRIPT = new Map([
  [12, [{ type: "guest.entered", guestId: TRAVELER, roomId: LOBBY }]],
  [13, [{ type: "guest.spoke", guestId: TRAVELER, roomId: LOBBY, text: "Hello? The door was open. Are you... open?" }]],
  [15, [{ type: "guest.spoke", guestId: TRAVELER, roomId: LOBBY, text: "This is a beautiful old place. Do you have rooms?" }]],
  [18, [{ type: "guest.spoke", guestId: TRAVELER, roomId: LOBBY, text: "I've been traveling a long time. Perhaps just one night." }]],
  [20, [{ type: "guest.moved", guestId: TRAVELER, from: LOBBY, to: SUITE }]],
  [26, [{ type: "guest.spoke", guestId: TRAVELER, roomId: SUITE, text: "The room is lovely. Thank you." }]],
  [32, [{ type: "guest.left", guestId: TRAVELER, roomId: SUITE }]],
]);

const hospitalityTrace = [];
const stokes = [];
const focusMoves = [];

console.log(`\n  The Raven — the first guest. ${HOURS}h, ${SCRIPTED ? "scripted" : MODEL}\n`);

for (let step = 1; step <= STEPS; step++) {
  simulatedMs += HALF_HOUR;
  currentHour = step / 2;

  for (const raw of SCRIPT.get(step) ?? []) {
    const event = { ...raw, at: new Date() };
    if (event.type === "guest.entered") guestPresent = true;
    if (event.type === "guest.left") guestPresent = false;
    if (event.type === "guest.spoke") {
      speeches.push({ hour: currentHour, who: "Marlowe", text: event.text });
    }
    console.log(`  h${currentHour.toFixed(1).padStart(5)}  » ${event.type}${event.text ? `: "${event.text}"` : ""}`);
    await runtime.emit(event);
  }

  const focusBefore = residentState.focusRoom;
  const hearthBefore = place.rooms.get(LOBBY).affordances.get(HEARTH).state.lit;
  void hearthBefore;

  await runtime.emit({ type: "tick", at: new Date() });

  if (residentState.focusRoom !== focusBefore) {
    focusMoves.push({ hour: currentHour, to: residentState.focusRoom });
  }
  hospitalityTrace.push({
    hour: currentHour,
    level: being.drives.drives.get("hospitality").level,
    guestPresent,
  });
}

// ---------------------------------------------------------------------------
// The verdict, from the intention log
// ---------------------------------------------------------------------------

const log = being.history.intentionLog;
const VISIT = [6, 16];
const phaseOf = (atMs) => {
  const h = atMs / 3_600_000;
  return h >= VISIT[0] && h < VISIT[1] ? "guest-present" : "empty";
};

const surfaced = log.filter((e) => e.kind === "surfaced");
const declinedEvents = log.filter((e) => e.kind === "declined");
const committedIds = new Set(
  log.filter((e) => e.kind === "committed").map((e) => e.candidateId),
);

const byPhase = { empty: { surfaced: 0, committed: 0, declined: 0 }, "guest-present": { surfaced: 0, committed: 0, declined: 0 } };
for (const e of surfaced) {
  const phase = phaseOf(e.atMs);
  byPhase[phase].surfaced++;
  if (committedIds.has(e.candidate.id)) byPhase[phase].committed++;
}
for (const e of declinedEvents) {
  const s = surfaced.find((x) => x.candidate.id === e.candidateId);
  if (s) byPhase[phaseOf(s.atMs)].declined++;
}

console.log("\n  " + "─".repeat(70));
console.log("  phase           surfaced  committed  declined");
for (const [phase, n] of Object.entries(byPhase)) {
  console.log(
    `  ${phase.padEnd(16)}${String(n.surfaced).padStart(6)}${String(n.committed).padStart(11)}${String(n.declined).padStart(10)}`,
  );
}

console.log(`\n  suppressed deliberations: ${suppressions.length}`);
for (const s of suppressions) console.log(`    h${s.hour.toFixed(1)}  ${s.line}`);

console.log("\n  declines (the adjudicator saying 'not now'):");
if (declinedEvents.length === 0) console.log("    none");
for (const d of declinedEvents) {
  const s = surfaced.find((x) => x.candidate.id === d.candidateId);
  console.log(`    h${(d.atMs / 3_600_000).toFixed(1)}  "${s?.candidate.aim}" — ${d.reason}`);
}

const h = (n) => hospitalityTrace.find((t) => t.hour === n)?.level.toFixed(2) ?? "—";
console.log(`\n  hospitality: h0 ${h(0.5)} → h6 ${h(6)} (arrival) → h10 ${h(10)} → h16 ${h(16)} (departure) → h${HOURS} ${h(HOURS)}`);
console.log(`  focus moves: ${focusMoves.map((m) => `h${m.hour.toFixed(1)}→${m.to}`).join(", ") || "none"}`);
void stokes;

console.log("\n  Transcript:");
for (const s of speeches) {
  console.log(`    h${s.hour.toFixed(1).padStart(5)}  ${s.who}: "${s.text.slice(0, 110)}"`);
}
console.log();
