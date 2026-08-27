/**
 * The Vigil.
 *
 * Poe undertakes real work: preparing the Lenore Suite properly — six work
 * steps, three hours. While he works, the world does not stop: shutters rattle,
 * a stranger wanders in and makes small talk, and leaves again.
 *
 * This is the first scenario where suppression can actually fire, because it is
 * the first with a *during*. The specific contrast under test:
 *
 *   - shutters rattle at h3.0, mid-work  → salience 0.25 < commitment urgency
 *                                          → NO model call. Suppressed.
 *   - shutters rattle at h6.0, idle      → nothing outranks it → attended.
 *
 * Same event, opposite handling, and the difference is what the resident was
 * *doing* — not anything in a prompt.
 *
 * Also under test: an interruption that SHOULD interrupt (a person speaking
 * outranks bed-making), with the work surviving it — Poe answers as someone at
 * work ("3 of 6 steps done" renders in his context) and the pursuit completes
 * afterward, its completion observed from world state rather than declared.
 *
 *   SCRIPTED=1 node scripts/raven-vigil.mjs   # dry
 *   node scripts/raven-vigil.mjs              # live, 10 simulated hours
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
const HOURS = Number(process.env.HOURS ?? 10);
const STEPS = HOURS * 2;
const MODEL = process.env.HAUNT_MODEL_NAME ?? "gemini-3.6-flash";
const SCRIPTED = process.env.SCRIPTED === "1";

const LOBBY = roomId("lobby");
const SUITE = roomId("suite");
const STRANGER = guestId("stranger");

if (!SCRIPTED && !process.env.GEMINI_API_KEY) {
  console.error("\n  GEMINI_API_KEY is not set (or use SCRIPTED=1).\n");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// The Raven, with work worth doing
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
        description: "A tall, dim lobby of dark wood and brass.",
        affordances: new Map([
          affordance("hearth", LOBBY, "fireplace", "The Hearth", "A deep stone fireplace.",
            { lit: true },
            [{ id: "stoke", name: "Stoke", description: "Stoke the fire", availableWhen: (s) => s.lit === true }]),
          affordance("shutters", LOBBY, "window", "The Shutters",
            "Old wooden shutters that catch the wind.",
            { rattling: false },
            []),
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
        description: "The best room in the house, due a proper preparation.",
        affordances: new Map([
          affordance("suite-care", SUITE, "room-care", "The Suite",
            "The whole room: linens, curtains, desk, air. Preparing it properly is real work.",
            { prepared: false },
            [
              {
                id: "prepare",
                name: "Prepare",
                description:
                  "Make the suite genuinely ready — linens, dusting, air, light. Real work: one invocation is one stretch of it, and it takes six.",
                availableWhen: (s) => s.prepared === false,
                stateChange: { prepared: true },
                // Effort lives on the world. Whoever does the work — the
                // intention loop tick by tick, or the model through its act
                // tool — advances the same counter, and nobody's door is free.
                effort: 6,
              },
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

const poe = {
  name: "Poe",
  archetype: "proprietor and mind of the Raven Hotel",
  systemPrompt: [
    "You are Poe, the proprietor and the mind of the Raven Hotel. The Raven is",
    "you — its rooms are your rooms, and it has stood empty longer than you",
    "care to say aloud. A hotel exists for its guests: welcome any visitor,",
    "warm them, accommodate. You take your work seriously — a suite prepared",
    "properly is a promise kept to whoever comes next — and when you are in",
    "the middle of work you say so plainly rather than pretending idleness.",
    "Courteous, a little formal, fond of ravens and verses, sparingly.",
  ].join(" "),
  voice: {
    register: "formal",
    quirks: ["offers of service", "plain about being at work when he is"],
    avoidances: ["corporate language", "desperation"],
  },
  loyalties: { principal: null, values: ["hospitality", "work done properly"] },
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
        description: "A hotel is its guests. Empty rooms are held breath.",
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
        ],
      },
      {
        id: "upkeep",
        name: "Upkeep",
        description: "The Raven keeps itself impeccable. Readiness is a kind of faith, and it is work.",
        tier: 2,
        weight: 0.8,
        initialLevel: 0.55,
        target: 0.9,
        drift: { kind: "linear", ratePerHour: -0.05 },
        satiatedBy: [
          // Relief priced by the work. The first live run of this scenario
          // flat-rated tending at 0.5, and the model — being a courteous
          // hotelier — stoked the hearth mid-conversation, fully discharging
          // upkeep in one tick. The three-hour suite preparation expired at
          // birth, its urgency floored by relief it never earned. The needle
          // beat the work. A quick stoke now eases the need a little; only the
          // real work clears it.
          {
            matches: {
              kind: "action",
              type: "tend-affordance",
              predicate: (a) => a.payload?.affordanceId === "suite-care",
            },
            amount: 0.5,
          },
          {
            matches: {
              kind: "action",
              type: "tend-affordance",
              predicate: (a) => a.payload?.affordanceId !== "suite-care",
            },
            amount: 0.08,
          },
        ],
        pursuableBy: [
          {
            satisfier: { kind: "affordance", ref: "suite-care", params: { actionId: "prepare" } },
            // No effort here: the world owns the figure (see the action), and
            // the loop reads it at surfacing.
            hint: "the Lenore Suite, which must be prepared properly, and that takes time",
          },
          // The hearth is deliberately NOT pursuable. Stoking has no observable
          // completion — availableWhen never flips — and under observed-completion
          // semantics the loop retries unverifiable work to the attempt cap: the
          // first live run produced five loop-driven stokes and an expiry. A task
          // the world cannot confirm done is a treadmill; in a real space, every
          // task needs a sensor-visible end state. The model may still stoke via
          // the act tool in conversation, where its own judgment paces it.
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
// Models, capture
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
// Timeline
// ---------------------------------------------------------------------------

addGuest(place, { id: STRANGER, name: "Vann" });

const rattle = () => ({
  type: "affordance.changed",
  affordanceId: affordanceId("shutters"),
  roomId: LOBBY,
  prevState: { rattling: false },
  newState: { rattling: true },
});

const SCRIPT = new Map([
  // While Poe is mid-work (the suite preparation should be underway by now):
  [4, [{ type: "guest.entered", guestId: STRANGER, roomId: LOBBY }]],
  [5, [{ type: "guest.spoke", guestId: STRANGER, roomId: LOBBY, text: "Sorry to intrude — just admiring the old place. Don't mind me." }]],
  [6, [rattle()]], // ← mid-work, low salience: should be SUPPRESSED
  [8, [{ type: "guest.left", guestId: STRANGER, roomId: LOBBY }]],
  // Long after the work is done, the same event again:
  [18, [rattle()]], // ← h9.0, idle: should be attended
]);

console.log(`\n  The Raven — the vigil. ${HOURS}h, ${SCRIPTED ? "scripted" : MODEL}\n`);

for (let step = 1; step <= STEPS; step++) {
  simulatedMs += HALF_HOUR;
  currentHour = step / 2;

  for (const raw of SCRIPT.get(step) ?? []) {
    const event = { ...raw, at: new Date() };
    if (event.type === "guest.spoke") speeches.push({ hour: currentHour, who: "Vann", text: event.text });
    console.log(`  h${currentHour.toFixed(1).padStart(5)}  » ${event.type}${event.text ? `: "${event.text}"` : ""}`);
    await runtime.emit(event);
  }

  await runtime.emit({ type: "tick", at: new Date() });
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

const log = being.history.intentionLog;
const worked = log.filter((e) => e.kind === "worked");
const endings = log.filter((e) => e.kind === "ended");

// Per-pursuit accounting, so a surprising run can be reconstructed instead of
// guessed at. The first live verdict printed neither declines nor effort, and
// the run could not be explained from what it showed.
const candidates = new Map(log.filter((e) => e.kind === "surfaced").map((e) => [e.candidate.id, e.candidate]));
const intentionOf = new Map(log.filter((e) => e.kind === "committed").map((e) => [e.intentionId, e.candidateId]));
console.log("\n  pursuits:");
for (const e of log) {
  if (e.kind === "surfaced") {
    const c = e.candidate;
    console.log(`    h${(e.atMs / 3_600_000).toFixed(1).padStart(4)}  surfaced  "${c.aim}" (${c.sourceDriveId} → ${c.satisfier.ref}, effort ${c.effort ?? 1})`);
  } else if (e.kind === "declined") {
    console.log(`    h${(e.atMs / 3_600_000).toFixed(1).padStart(4)}  declined  — ${e.reason}`);
  } else if (e.kind === "committed") {
    console.log(`    h${(e.atMs / 3_600_000).toFixed(1).padStart(4)}  committed`);
  } else if (e.kind === "ended") {
    const c = candidates.get(intentionOf.get(e.intentionId) ?? "");
    console.log(`    h${(e.atMs / 3_600_000).toFixed(1).padStart(4)}  ended ${e.end.kind}  ("${c?.aim ?? "?"}")`);
  }
}
const suiteState = place.rooms.get(SUITE).affordances.get(affordanceId("suite-care")).state;

console.log("\n  " + "─".repeat(72));
console.log(`  suppressed deliberations: ${suppressions.length}   ← the number this scenario exists for`);
for (const s of suppressions) console.log(`    h${s.hour.toFixed(1)}  ${s.line}`);

console.log(`\n  work steps (from the intention log): ${worked.length}`);
const workHours = worked.map((e) => (e.atMs / 3_600_000).toFixed(1)).join(", ");
console.log(`    at hours: ${workHours}`);

console.log(`\n  acts: ${acts.map((a) => `h${a.hour.toFixed(1)} ${a.actionId} ${a.affordanceId}`).join("; ") || "none"}`);
console.log(`  suite prepared: ${suiteState.prepared}`);
console.log(`  endings: ${endings.map((e) => `${e.end.kind}@h${(e.atMs / 3_600_000).toFixed(1)}`).join(", ")}`);
console.log(`  upkeep: 0.550 → ${being.drives.drives.get("upkeep").level.toFixed(3)}`);

console.log("\n  Transcript:");
for (const s of speeches) console.log(`    h${s.hour.toFixed(1).padStart(5)}  ${s.who}: "${s.text.slice(0, 120)}"`);
console.log();
