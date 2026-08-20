/**
 * The Empty Room, live.
 *
 * Solus alone in the Void, real model, through the real Runtime. The dry run
 * proved the loop fires; this asks whether it fires *sensibly*.
 *
 * The narrow question is the surfacing call, which does two jobs in one: author
 * what the being takes itself to want, and judge whether now is the moment. The
 * second job is the one that can quietly fail. An adjudicator that says yes to
 * everything is not an adjudicator, and it fails in the flattering direction —
 * a resident that acts constantly looks alive.
 *
 * From docs/integration/act-detection.md, applied here:
 *
 *   >90%   rubber stamp — the model commits to whatever it is offered
 *   20-60% healthy
 *   <5%    broken, or the bar is past what any situation produces
 *
 * The comparison is Journal entry 5, which recorded Solus speaking 34 times and
 * never moving. That run had no way to want movement, no relief from getting
 * it, and drives that aged twelve times too slowly. All three are fixed, so the
 * prediction is that he moves.
 *
 *   HOURS=48 GEMINI_API_KEY=... node scripts/void-live-run.mjs
 */

import { Runtime } from "../packages/core/dist/index.js";
import { solus, solusBeingConfig, VOID_ROOMS } from "../packages/demo-void/dist/index.js";
import {
  createModelProvider,
  createResidentPipeline,
  Resident,
  SqliteMemoryStore,
} from "../packages/resident/dist/index.js";
import { createBeing, currentIntentions, eligibleToSurface } from "../../embersjs/dist/index.js";

const HOUR = 3_600_000;
const HOURS = Number(process.env.HOURS ?? 48);
const MODEL = process.env.HAUNT_MODEL_NAME ?? "gemini-3.1-pro-preview";

if (!process.env.GEMINI_API_KEY) {
  console.error("\n  GEMINI_API_KEY is not set.\n");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// A provider that records what the surfacing call actually decided
// ---------------------------------------------------------------------------

const surfacings = [];
const speeches = [];

class ObservedModel {
  name = "observed";
  constructor(inner) {
    this.inner = inner;
  }

  async chat(request) {
    const isSurfacing = request.systemPrompt.includes("give words to something");
    const response = await this.inner.chat(request);

    if (isSurfacing) {
      let parsed = null;
      try {
        const raw = response.content.match(/\{[\s\S]*\}/)?.[0] ?? response.content;
        parsed = JSON.parse(raw);
      } catch {
        // Recorded as unparseable — that is a result, not an error.
      }
      surfacings.push({
        aim: parsed?.aim ?? null,
        worthPursuing: parsed?.worthPursuing === true,
        reason: parsed?.reason ?? response.content.slice(0, 80),
        parsed: parsed !== null,
      });
    } else {
      const spoke = response.toolCalls?.find((t) => t.name === "speak");
      if (spoke) speeches.push(String(spoke.arguments?.text ?? "").slice(0, 140));
    }

    return response;
  }
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

const place = {
  id: "the-void",
  name: "The Void",
  rooms: new Map(VOID_ROOMS),
  guests: new Map(),
  metadata: {},
};

const being = createBeing(solusBeingConfig);

const residentState = {
  id: "solus",
  character: solus,
  presenceMode: "host",
  currentRoom: "hearth",
  focusRoom: "hearth",
  mood: { energy: 0.5, focus: 0.6, valence: 0.4 },
  being,
};

let simulatedMs = 0;

const model = new ObservedModel(createModelProvider({ provider: "gemini", model: MODEL }));
const memory = new SqliteMemoryStore({ dbPath: ":memory:" });
const residentMind = new Resident({
  character: solus,
  model,
  memory,
  // Cultivation is its own question and doubles the bill. This run is about
  // whether the being wants things and acts on them.
  practiceEvaluator: false,
  clock: () => simulatedMs,
});

const runtime = new Runtime({
  place,
  resident: residentState,
  residentMind,
  systems: createResidentPipeline(),
});

await runtime.start();

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

const moves = [];
console.log(`\n  The Void — live, ${HOURS} simulated hours, ${MODEL}\n`);
console.log("  hour  restless  focus    event");
console.log("  " + "─".repeat(70));

for (let hour = 1; hour <= HOURS; hour++) {
  simulatedMs += HOUR;

  const focusBefore = residentState.focusRoom;
  const surfacingsBefore = surfacings.length;
  const spokeBefore = speeches.length;

  try {
    await runtime.emit({ type: "tick", at: new Date() });
  } catch (err) {
    console.log(`  ${String(hour).padStart(4)}  tick failed: ${err.message}`);
    continue;
  }

  const restless = being.drives.drives.get("restlessness").level;
  const moved = residentState.focusRoom !== focusBefore;
  if (moved) {
    moves.push({ hour, from: focusBefore, to: residentState.focusRoom });
  }

  const newSurfacings = surfacings.slice(surfacingsBefore);
  const notes = [];
  for (const s of newSurfacings) {
    notes.push(`${s.worthPursuing ? "committed" : "declined"}: "${s.aim ?? "?"}" — ${s.reason}`);
  }
  if (moved) notes.push(`MOVED ${focusBefore} → ${residentState.focusRoom}`);
  if (speeches.length > spokeBefore) notes.push(`said: "${speeches.at(-1)}"`);

  if (notes.length > 0) {
    console.log(
      `  ${String(hour).padStart(4)}${restless.toFixed(3).padStart(10)}  ${(residentState.focusRoom ?? "—").padEnd(8)} ${notes[0]}`,
    );
    for (const n of notes.slice(1)) console.log(`        ${" ".repeat(20)}${n}`);
  }
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

const committed = surfacings.filter((s) => s.worthPursuing).length;
const acceptRate = surfacings.length > 0 ? committed / surfacings.length : 0;
const unparseable = surfacings.filter((s) => !s.parsed).length;

console.log("\n  " + "─".repeat(70));
console.log(`  surfacings:    ${surfacings.length}  (${unparseable} unparseable)`);
console.log(`  committed:     ${committed}`);
console.log(`  declined:      ${surfacings.length - committed}`);
console.log(`  accept rate:   ${(acceptRate * 100).toFixed(0)}%`);
console.log(`  moves:         ${moves.length}`);
console.log(`  utterances:    ${speeches.length}`);
console.log(`  restlessness:  0.850 → ${being.drives.drives.get("restlessness").level.toFixed(3)}`);

console.log("\n  Aims authored:");
for (const s of surfacings) {
  console.log(`    [${s.worthPursuing ? "✓" : "·"}] "${s.aim ?? "<unparseable>"}"`);
}

console.log("\n  vs. Journal entry 5 (v0.1): 34 utterances, 0 moves.");
console.log(`  This run: ${speeches.length} utterances, ${moves.length} moves.`);

if (surfacings.length === 0) {
  console.log("\n  INCONCLUSIVE — nothing surfaced. Run longer.\n");
} else if (acceptRate > 0.9) {
  console.log(
    "\n  RUBBER STAMP — the model commits to whatever it is offered.\n" +
      "  The adjudication half of the surfacing call is decorative.\n",
  );
} else if (acceptRate < 0.05) {
  console.log(
    "\n  TOO STRICT — or broken. Check the aims above are sane before\n" +
      "  concluding the moments genuinely never suit it.\n",
  );
} else {
  console.log("\n  HEALTHY — the model is genuinely adjudicating.\n");
}
