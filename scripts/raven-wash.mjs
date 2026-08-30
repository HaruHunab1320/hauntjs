/**
 * The Wash.
 *
 * The dishwasher shape, done honestly. Poe loads the copper — two invocations,
 * his own labor — and then the wash runs on the world's clock for two hours.
 * His pursuit ends when his share ends: at the start. Relief does not.
 * It is priced on the completion event, which only the world can deliver, and
 * which reaches him the way everything does: as a perception.
 *
 *   Initiation is the being's. Duration is the world's. Completion belongs to
 *   perception.
 *
 *   SCRIPTED=1 node scripts/raven-wash.mjs   # dry
 *   node scripts/raven-wash.mjs              # live, 8 simulated hours
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
const HOURS = Number(process.env.HOURS ?? 8);
const STEPS = HOURS * 2;
const MODEL = process.env.HAUNT_MODEL_NAME ?? "gemini-3.6-flash";
const SCRIPTED = process.env.SCRIPTED === "1";

const LOBBY = roomId("lobby");

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
        description: "A tall, dim lobby of dark wood and brass. Steam pipes run to the old copper in the alcove.",
        affordances: new Map([
          affordance("hearth", LOBBY, "fireplace", "The Hearth", "A deep stone fireplace.",
            { lit: true },
            []),
          affordance("copper", LOBBY, "boiler", "The Copper",
            "The old wash boiler in its alcove. Loading it is work; the wash itself takes the time it takes.",
            { clean: false },
            [
              {
                id: "run-wash",
                name: "Run the wash",
                description:
                  "Load the linens and set the copper going. Two stretches of loading, then two hours of the world's own time.",
                availableWhen: (s) => s.clean === false,
                stateChange: { clean: true },
                effort: 2,
                durationMs: 2 * 3_600_000,
              },
            ]),
        ]),
        sensors: new Map([
          sensor("lobby.sight", LOBBY, "sight"),
          sensor("lobby.sound", LOBBY, "sound"),
          sensor("lobby.presence", LOBBY, "presence"),
        ]),
        connectedTo: [],
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
        id: "linens",
        name: "Linens",
        description: "Fresh linens are the difference between a room and a welcome. The hampers do not empty themselves.",
        tier: 2,
        weight: 0.8,
        initialLevel: 0.2,
        target: 0.8,
        drift: { kind: "linear", ratePerHour: -0.02 },
        satiatedBy: [
          // Relief lands when the wash is DONE — the world's completion event —
          // not when Poe starts it. Starting is his share; finishing is not.
          {
            matches: {
              kind: "event",
              type: "place-change",
              predicate: (e) => e.payload?.newState?.clean === true,
            },
            amount: 0.5,
          },
        ],
        pursuableBy: [
          {
            satisfier: { kind: "affordance", ref: "copper", params: { actionId: "run-wash" } },
            hint: "the copper, and the hampers waiting beside it",
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
  // The place's clock: world-run processes count down in the same simulated
  // time the being experiences.
  clock: () => simulatedMs,
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

const SCRIPT = new Map();

const linensTrace = [];
const completions = [];
runtime.eventBus.on("*", (event) => {
  if (event.type === "affordance.changed") {
    completions.push({ hour: currentHour, newState: event.newState });
  }
});

console.log(`\n  The Raven — the wash. ${HOURS}h, ${SCRIPTED ? "scripted" : MODEL}\n`);

for (let step = 1; step <= STEPS; step++) {
  simulatedMs += HALF_HOUR;
  currentHour = step / 2;

  for (const raw of SCRIPT.get(step) ?? []) {
    await runtime.emit({ ...raw, at: new Date() });
  }

  await runtime.emit({ type: "tick", at: new Date() });
  linensTrace.push({ hour: currentHour, level: being.drives.drives.get("linens").level });
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

const log = being.history.intentionLog;
const copper = place.rooms.get(LOBBY).affordances.get(affordanceId("copper"));

console.log("\n  pursuits:");
const candidates = new Map(log.filter((e) => e.kind === "surfaced").map((e) => [e.candidate.id, e.candidate]));
const intentionOf = new Map(log.filter((e) => e.kind === "committed").map((e) => [e.intentionId, e.candidateId]));
for (const e of log) {
  if (e.kind === "surfaced") {
    const c = e.candidate;
    console.log(`    h${(e.atMs / 3_600_000).toFixed(1).padStart(4)}  surfaced  "${c.aim}" (${c.sourceDriveId} → ${c.satisfier.ref}, effort ${c.effort ?? 1})`);
  } else if (e.kind === "declined") {
    console.log(`    h${(e.atMs / 3_600_000).toFixed(1).padStart(4)}  declined  — ${e.reason}`);
  } else if (e.kind === "ended") {
    const c = candidates.get(intentionOf.get(e.intentionId) ?? "");
    console.log(`    h${(e.atMs / 3_600_000).toFixed(1).padStart(4)}  ended ${e.end.kind}  ("${c?.aim ?? "?"}")`);
  }
}

console.log("\n  " + "─".repeat(72));
console.log(`  loading acts: ${acts.filter((a) => a.actionId === "run-wash").map((a) => `h${a.hour.toFixed(1)}`).join(", ") || "none"}`);
console.log(`  wash completed by the world: ${completions.map((c) => `h${c.hour.toFixed(1)} (clean: ${c.newState.clean})`).join(", ") || "never"}`);
console.log(`  linens clean: ${copper.state.clean}`);
const jump = linensTrace.find((t, i) => i > 0 && t.level > linensTrace[i - 1].level + 0.3);
console.log(`  relief landed at: ${jump ? `h${jump.hour.toFixed(1)}` : "never"}  (linens 0.200 → ${being.drives.drives.get("linens").level.toFixed(3)})`);

console.log("\n  Transcript:");
for (const s of speeches) console.log(`    h${s.hour.toFixed(1).padStart(5)}  ${s.who}: "${s.text.slice(0, 120)}"`);
console.log();
