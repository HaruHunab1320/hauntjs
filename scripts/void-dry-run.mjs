/**
 * The Empty Room, dry.
 *
 * Runs Solus alone in the Void through the real Runtime — the same pipeline,
 * resident, and intention loop the app uses — but with a scripted model instead
 * of Gemini. The point is to prove the loop *fires* before spending a real run
 * finding out it doesn't.
 *
 * What it checks, in order of what would embarrass us most:
 *
 *   1. Does restlessness decay into eligibility at all?
 *   2. Does a pressure surface, and get committed to?
 *   3. Does the commitment become a real action that changes the place?
 *   4. Does taking that action actually relieve the drive?
 *
 * Step 4 is the one that matters. A resident that pursues relief and never
 * feels any is worse than one that never pursues anything, because it looks
 * alive and is stuck.
 *
 * Run with: node scripts/void-dry-run.mjs
 */

import { Runtime } from "../packages/core/dist/index.js";
import { solus, solusBeingConfig, VOID_ROOMS } from "../packages/demo-void/dist/index.js";
import {
  createResidentPipeline,
  Resident,
  SqliteMemoryStore,
} from "../packages/resident/dist/index.js";
import { createBeing, currentIntentions, eligibleToSurface } from "../../embersjs/dist/index.js";

const HOUR = 3_600_000;
const HOURS = Number(process.env.HOURS ?? 36);

// ---------------------------------------------------------------------------
// A model that answers both kinds of call the resident makes
// ---------------------------------------------------------------------------

/**
 * The resident makes two quite different requests: the surfacing call (author
 * an aim, judge whether to pursue) and the deliberation call. Under the
 * inverted tick default, a deliberation on a quiet tick can only mean an
 * expression pursuit granted it — so the script speaks when a pursuit is in
 * the prompt, and counts any other deliberation as *unwarranted*, which the
 * verdict treats as a failure.
 */
class ScriptedModel {
  name = "scripted";
  surfacingCalls = 0;
  expressionDeliberations = 0;
  unwarrantedDeliberations = 0;

  async chat(request) {
    if (request.systemPrompt.includes("give words to something")) {
      this.surfacingCalls++;
      return {
        content: JSON.stringify({
          worthPursuing: true,
          aim: "put a voice into the silence",
          reason: "the moment is empty",
        }),
        finishReason: "stop",
      };
    }

    if (request.systemPrompt.includes("You are in the middle of")) {
      this.expressionDeliberations++;
      return {
        content: "",
        toolCalls: [
          {
            id: "t",
            name: "speak",
            arguments: { text: "The silence answers nothing.", audience: "all" },
          },
        ],
        finishReason: "tool_use",
      };
    }

    // No pursuit, no event — this call should never have happened.
    this.unwarrantedDeliberations++;
    return {
      content: "",
      toolCalls: [{ id: "t", name: "wait", arguments: {} }],
      finishReason: "tool_use",
    };
  }
}

// ---------------------------------------------------------------------------
// Assembly — the real place, the real pipeline
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

// The being's clock is the place's, not the wall's. Here the "place" is this
// loop, so it simply reports how many simulated hours have elapsed.
let simulatedMs = 0;

const model = new ScriptedModel();
const memory = new SqliteMemoryStore({ dbPath: ":memory:" });
const residentMind = new Resident({
  character: solus,
  model,
  memory,
  // Cultivation is a separate concern and would add model calls that muddy the
  // trace. This run is about intentions.
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
const commitments = [];
let peakRestlessness = 0;

console.log(`\n  The Void — dry run, ${HOURS} simulated hours\n`);
console.log("  hour  restless  eligible  focus    doing");
console.log("  " + "─".repeat(62));

for (let hour = 1; hour <= HOURS; hour++) {
  simulatedMs += HOUR;

  const focusBefore = residentState.focusRoom;
  await runtime.emit({ type: "tick", at: new Date() });

  const restless = being.drives.drives.get("restlessness").level;
  const eligible = eligibleToSurface(being).length;
  const [pursuit] = currentIntentions(being);

  peakRestlessness = Math.max(peakRestlessness, 0.8 - restless);

  if (pursuit && !commitments.some((c) => c.id === pursuit.id)) {
    commitments.push({ id: pursuit.id, aim: pursuit.aim, hour });
  }
  if (residentState.focusRoom !== focusBefore) {
    moves.push({ hour, from: focusBefore, to: residentState.focusRoom, restless });
  }

  const notable = residentState.focusRoom !== focusBefore || pursuit || eligible > 0;
  if (notable || hour % 6 === 0) {
    console.log(
      "  " +
        String(hour).padStart(4) +
        restless.toFixed(3).padStart(10) +
        String(eligible).padStart(10) +
        "  " +
        (residentState.focusRoom ?? "—").padEnd(8) +
        (pursuit ? `"${pursuit.aim}"` : ""),
    );
  }
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

const restlessEnd = being.drives.drives.get("restlessness").level;

const log = being.history.intentionLog;
const satisfiedExpressions = log.filter(
  (e) => e.kind === "ended" && e.end.kind === "satisfied",
).length;
const connectionEnd = being.drives.drives.get("connection").level;

console.log("\n  " + "─".repeat(62));
console.log(`  surfacing calls:       ${model.surfacingCalls}`);
console.log(`  expression delibs:     ${model.expressionDeliberations}`);
console.log(`  unwarranted delibs:    ${model.unwarrantedDeliberations}`);
console.log(`  commitments formed:    ${commitments.length}`);
console.log(`  pursuits satisfied:    ${satisfiedExpressions}`);
console.log(`  moves made:            ${moves.length}`);
console.log(`  restlessness:          0.850 → ${restlessEnd.toFixed(3)}`);
console.log(`  connection:            0.400 → ${connectionEnd.toFixed(3)}`);

for (const m of moves.slice(0, 8)) {
  console.log(`    h${String(m.hour).padStart(3)}  ${m.from} → ${m.to}`);
}
if (moves.length > 8) console.log(`    … and ${moves.length - 8} more`);

const checks = [
  ["restlessness became eligible", peakRestlessness > 0.2],
  ["a pressure surfaced", model.surfacingCalls > 0],
  ["a commitment formed", commitments.length > 0],
  ["it produced a real move", moves.length > 0],
  ["moving relieved the drive", moves.some((m, i) => i > 0 && m.restless > moves[i - 1].restless)],
  ["it spoke, and speaking discharged the pursuit", satisfiedExpressions > 0],
  // The inversion itself: with ticks silent, a deliberation happens only when
  // an expression pursuit granted it. Anything else is the old free-musing
  // path leaking back in.
  ["every deliberation was warranted", model.unwarrantedDeliberations === 0],
];

console.log();
let ok = true;
for (const [label, passed] of checks) {
  console.log(`  ${passed ? "✓" : "✗"} ${label}`);
  if (!passed) ok = false;
}

console.log(
  ok
    ? "\n  PASS — the loop fires end to end. Worth a real model.\n"
    : "\n  FAIL — something is wired wrong. A Gemini run would only obscure it.\n",
);

process.exit(ok ? 0 : 1);
