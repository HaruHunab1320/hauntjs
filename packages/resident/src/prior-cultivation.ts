/**
 * Authoring prior cultivation for a Being.
 *
 * Embers v0.1 let a practice seed declare `initialDepth: 0.3` — a bare number
 * asserting the being arrived already cultivated. v0.2 removed it: depth is
 * derived from substrate, so prior cultivation has to be represented as
 * substrate, the same as cultivation earned during a run.
 *
 * `priorCultivation(depth)` produces artifacts whose derived depth equals the
 * authored number, so an existing character config migrates by swapping
 *
 *   { id: "presencePractice", initialDepth: 0.3 }
 *
 * for
 *
 *   { id: "presencePractice", initialArtifacts: priorCultivation(0.3) }
 *
 * with no change in starting behavior.
 *
 * The arithmetic mirrors `defaultDepthFunction`:
 *
 *   depth = Σ(quality × recency × pressureBonus) / DEFAULT_DEPTH_NORMALIZATION
 *
 * Artifacts are created unaged (`atMs: 0`) and unpressured, so recency is 1.0
 * and the pressure bonus is absent, leaving `depth = Σquality / 5`. They decay
 * from there on the normal 7-day half-life — a being that starts cultivated
 * and never practices will lose that depth, which is the intended v0.2
 * behavior and the main way this differs from v0.1's static `initialDepth`.
 */

import { type Artifact, DEFAULT_DEPTH_NORMALIZATION } from "@embersjs/core";

/** Options for shaping the generated substrate. */
export interface PriorCultivationOptions {
  /**
   * What the prior cultivation consisted of. Stored on each artifact and
   * surfaced to the model through `recentSubstrate`, so it is worth writing
   * something true about the character rather than leaving it blank.
   */
  readonly content?: unknown;
  /**
   * Whether the prior cultivation was pressure-tested. Pressured artifacts
   * carry a 1.5× bonus, so fewer of them are needed to reach the same depth.
   */
  readonly underPressure?: boolean;
  /** Age of the artifacts in milliseconds. Defaults to 0 (fresh). */
  readonly ageMs?: number;
}

/** Matches PRESSURE_BONUS in @embersjs/core. */
const PRESSURE_BONUS = 1.5;
/** Matches DEFAULT_RECENCY_HALFLIFE_MS in @embersjs/core (~7 days). */
const RECENCY_HALFLIFE_MS = 7 * 24 * 3_600_000;

/**
 * Builds substrate whose derived depth equals `depth` at being-creation time.
 *
 * Spreads the required quality across as few artifacts as possible while
 * keeping each one's quality in [0, 1]. Throws on a depth that cannot be
 * represented rather than silently clamping — a config asking for depth 1.5
 * is a mistake worth surfacing at construction.
 */
export function priorCultivation(
  depth: number,
  options: PriorCultivationOptions = {},
): readonly Artifact[] {
  if (!Number.isFinite(depth) || depth < 0 || depth > 1) {
    throw new RangeError(`priorCultivation: depth must be within [0, 1], received ${depth}`);
  }
  if (depth === 0) return [];

  const { content, underPressure = false, ageMs = 0 } = options;

  if (ageMs < 0) {
    throw new RangeError(`priorCultivation: ageMs must not be negative, received ${ageMs}`);
  }

  // Undo the factors the depth function will re-apply, so the sum of raw
  // qualities lands the derived depth exactly on the authored number.
  const recency = 0.5 ** (ageMs / RECENCY_HALFLIFE_MS);
  const perArtifactMultiplier = recency * (underPressure ? PRESSURE_BONUS : 1);
  const requiredQualitySum = (depth * DEFAULT_DEPTH_NORMALIZATION) / perArtifactMultiplier;

  // Fewest artifacts that keeps every quality at or below 1.0.
  const count = Math.max(1, Math.ceil(requiredQualitySum));
  const quality = requiredQualitySum / count;

  if (quality > 1) {
    throw new RangeError(
      `priorCultivation: depth ${depth} is unreachable with ageMs ${ageMs} — ` +
        "aged artifacts contribute less, so either lower the depth or reduce the age.",
    );
  }

  return Array.from({ length: count }, () => ({
    attemptId: "prior-cultivation",
    atMs: -ageMs,
    quality,
    underPressure,
    content,
    reasons: ["Authored prior cultivation, not earned during this run."],
  }));
}
