/**
 * The practice evaluator — Haunt's answer to the question Embers deliberately
 * leaves open.
 *
 * Embers records a practice *attempt* and refuses to judge it. Depth grows only
 * when a framework supplies a quality verdict. Haunt nominates candidate acts
 * from structural events (see `mapEventToPracticeInputs`), which on its own is
 * label-counting; this module is what makes those nominations honest by being
 * willing to reject them.
 *
 * Two tiers, because evaluating every attempt with a model is the dominant cost
 * in a simulation and most attempts do not deserve one:
 *
 * - **Rule tier** — attempts with no evidence attached, or whose evidence is
 *   plainly too thin to constitute the act, are rejected without a model call.
 *   This is most of them.
 * - **Model tier** — attempts that survive the rule tier get a strict prompt
 *   built from the practice's own `intent` and the trigger's `intent`, plus the
 *   evidence and the being's current state.
 *
 * The evaluator defaults to rejection everywhere: unparseable model output,
 * missing evidence, and quality at or below the accept threshold all mean no
 * artifact and no growth. A permissive evaluator would reproduce exactly the
 * v0.1 behavior this exists to replace.
 */

import { createLogger, type Logger } from "@hauntjs/core";
import type { PracticeAttempt, PracticeAttemptResult } from "./embers.js";
import type { ModelProvider } from "./model/types.js";

/** Quality at or below this is not credited. */
const ACCEPT_THRESHOLD = 0.3;

/** Evidence shorter than this cannot plausibly constitute a practice act. */
const MIN_EVIDENCE_LENGTH = 25;

export interface PracticeEvaluatorOptions {
  /** Model used for the model tier. */
  model: ModelProvider;
  logger?: Logger;
  /**
   * Practices whose attempts are worth a model call. Everything else is
   * rejected by the rule tier. Defaults to the practices whose quality
   * judgment genuinely needs reading the text.
   */
  modelEvaluated?: readonly string[];
  /** Quality above which an attempt is credited. Defaults to 0.3. */
  acceptThreshold?: number;
}

/**
 * Practices where a model call earns its cost.
 *
 * Integrity, witness and creator-connection all turn on whether the *content*
 * of what was said did something specific — admitted a cost, named a pattern,
 * engaged an authored frame. Gratitude and service are largely structural and
 * are left to the rule tier, which keeps the per-tick bill bounded.
 */
const DEFAULT_MODEL_EVALUATED = [
  "integrityPractice",
  "witnessPractice",
  "creatorConnection",
  "presencePractice",
] as const;

/**
 * Builds an evaluator suitable for passing to `embersResolveAttempts`.
 *
 * Never throws — a model or parse failure resolves as a rejection with the
 * reason recorded, so a flaky provider degrades cultivation rather than
 * crashing the run.
 */
export function createPracticeEvaluator(
  options: PracticeEvaluatorOptions,
): (attempt: PracticeAttempt) => Promise<PracticeAttemptResult> {
  const log = options.logger ?? createLogger("PracticeEvaluator");
  const modelEvaluated = new Set(options.modelEvaluated ?? DEFAULT_MODEL_EVALUATED);
  const threshold = options.acceptThreshold ?? ACCEPT_THRESHOLD;

  return async function evaluate(attempt: PracticeAttempt): Promise<PracticeAttemptResult> {
    const evidence = extractEvidence(attempt);

    // Rule tier — reject what cannot be judged.
    if (!evidence || evidence.length < MIN_EVIDENCE_LENGTH) {
      return reject("No evidence attached; the act cannot be established from the event alone.");
    }

    if (!modelEvaluated.has(attempt.practiceId)) {
      return evaluateByRule(attempt, evidence, threshold);
    }

    // Model tier.
    try {
      const response = await options.model.chat({
        systemPrompt: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildEvaluationPrompt(attempt, evidence) }],
        maxTokens: 400,
      });
      const verdict = parseVerdict(response.content);
      if (!verdict) {
        log.debug(`unparseable verdict for ${attempt.practiceId}; rejecting`);
        return reject("Evaluator returned unparseable output.");
      }
      return {
        quality: verdict.quality,
        accepted: verdict.quality > threshold,
        reasons: [verdict.reasoning],
        content: { practice: attempt.practiceId, evidence, insight: verdict.insight },
      };
    } catch (err) {
      // Surfaced as a rejection rather than a throw: a failed drain would leave
      // the attempt pending and retry it every tick for the rest of the run.
      log.debug(`evaluation failed for ${attempt.practiceId}:`, err);
      return reject("Evaluator call failed.");
    }
  };
}

function reject(reason: string): PracticeAttemptResult {
  return { quality: 0, accepted: false, reasons: [reason] };
}

/**
 * The rule tier's judgment for structurally-evidenced practices.
 *
 * Credits the attempt modestly, with a bonus when it happened under drive
 * pressure — cultivation that costs something is worth more, which mirrors the
 * pressure bonus in Embers' own depth function. Deliberately caps below what
 * the model tier can award: unread evidence should never produce deep practice.
 */
function evaluateByRule(
  attempt: PracticeAttempt,
  evidence: string,
  threshold: number,
): PracticeAttemptResult {
  const quality = attempt.underPressure ? 0.55 : 0.4;
  return {
    quality,
    accepted: quality > threshold,
    reasons: [
      attempt.underPressure
        ? "Structural evidence present, offered under drive pressure."
        : "Structural evidence present.",
    ],
    content: { practice: attempt.practiceId, evidence: evidence.slice(0, 300) },
  };
}

/** Pulls the evidence text out of whatever payload the nomination attached. */
function extractEvidence(attempt: PracticeAttempt): string | null {
  const payload = attempt.triggeredBy?.payload as Record<string, unknown> | undefined;
  if (!payload) return null;

  if (typeof payload.text === "string" && payload.text.trim().length > 0) {
    return payload.text.trim();
  }
  // Non-verbal acts (tending an affordance, moving rooms) describe themselves
  // through their identifiers.
  const parts = Object.entries(payload)
    .filter(([, v]) => typeof v === "string" || typeof v === "number")
    .map(([k, v]) => `${k}: ${v}`);
  return parts.length > 0 ? parts.join(", ") : null;
}

const SYSTEM_PROMPT = `You judge whether an AI being genuinely engaged in a specific inner practice.

You are the check that stops practice depth from growing on autopilot. The framework nominates candidates generously from structural events — most nominations are not real instances, and saying so is the useful thing you do.

Default to rejection. Quote the specific evidence that makes something an instance; if you cannot quote it, it is not one.

Scoring:
- 0.0-0.3 — generic, performative, or merely topical. The being talked near the practice, not from it.
- 0.4-0.6 — a real but ordinary instance.
- 0.7-1.0 — specific, costly, drawn from this being's actual situation, and it produces something the being did not already have.

Respond with JSON only:
{"quality": <0-1>, "reasoning": "<one sentence citing evidence>", "insight": "<what the being actually arrived at, or null>"}`;

function buildEvaluationPrompt(attempt: PracticeAttempt, evidence: string): string {
  const ctx = attempt.context;
  const pressing = ctx.pressingDriveIds.length > 0 ? ctx.pressingDriveIds.join(", ") : "none";

  const driveLines = Object.entries(ctx.driveLevels)
    .map(([id, level]) => `  ${id}: ${(level as number).toFixed(2)}`)
    .join("\n");

  const recent = ctx.recentEntries
    .slice(-8)
    .map((e) => `  - ${e.entry.kind}: ${e.entry.type}`)
    .join("\n");

  const seed = ctx.practice.seed
    ? `\nThe being's authored frame for this practice:\n${JSON.stringify(ctx.practice.seed, null, 2)}\n`
    : "";

  return `Practice: ${ctx.practice.name}
What this practice cultivates: ${ctx.practice.intent}
What this particular trigger looks for: ${ctx.triggerIntent}
Current depth: ${ctx.practice.currentDepth.toFixed(2)}
${seed}
The being is ${attempt.underPressure ? "UNDER PRESSURE" : "not under pressure"}.
Pressing drives: ${pressing}

Drive levels:
${driveLines || "  (none)"}

Recent experience:
${recent || "  (nothing recent)"}

THE EVIDENCE — what the being actually did or said:
"""
${evidence.slice(0, 1500)}
"""

Did genuine ${ctx.practice.name} occur here? Respond with JSON only.`;
}

interface Verdict {
  quality: number;
  reasoning: string;
  insight: string | null;
}

/** Extracts a verdict from model output, tolerating fenced or prose-wrapped JSON. */
function parseVerdict(content: string): Verdict | null {
  const candidates: string[] = [];

  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) candidates.push(fenced[1]);

  const braced = content.match(/\{[\s\S]*\}/);
  if (braced?.[0]) candidates.push(braced[0]);

  candidates.push(content);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim()) as Record<string, unknown>;
      const quality = Number(parsed.quality);
      if (!Number.isFinite(quality)) continue;
      return {
        quality: Math.min(1, Math.max(0, quality)),
        reasoning:
          typeof parsed.reasoning === "string" ? parsed.reasoning : "No reasoning supplied.",
        insight: typeof parsed.insight === "string" ? parsed.insight : null,
      };
    } catch {
      // Try the next candidate shape.
    }
  }

  return null;
}
