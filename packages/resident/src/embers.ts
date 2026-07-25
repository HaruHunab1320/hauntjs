/**
 * Embers adapter — the sole import site for @embersjs/core within @hauntjs/resident.
 * All Embers interactions go through these wrappers.
 */

import {
  type AttentionCandidate,
  availableCapabilities,
  type Being,
  type Capability,
  type DrainResult,
  deserializeBeing,
  expirePendingAttempts,
  getPendingAttempts,
  type InnerSituation,
  type IntegrationInput,
  type IntegrationResult,
  integrate,
  metabolize,
  type PracticeAttempt,
  type PracticeAttemptResult,
  resolveAllPending,
  type SerializedBeing,
  serializeBeing,
  tick,
  type WeightedCandidate,
  weightAttention,
} from "@embersjs/core";
import type { Perception, PresenceEvent } from "@hauntjs/core";

// Re-export Being type for use in ResidentOptions
export type {
  Being,
  DrainResult,
  InnerSituation,
  PracticeAttempt,
  PracticeAttemptResult,
  SerializedBeing,
};

/** Advance drives/practices by elapsed time. Mutates the Being in place. */
export function embersTickBeing(being: Being, dtMs: number): void {
  tick(being, dtMs);
}

/**
 * Map a Haunt PresenceEvent to Embers IntegrationInputs and process them all.
 *
 * The practice-trigger mappings below are *nominations*, not assertions —
 * `resident.spoke` does not prove that tending occurred. They are only honest
 * because `embersResolveAttempts` runs a strict evaluator behind them, which
 * is free to reject. Evidence from the event is attached to each entry so the
 * evaluator has something to judge.
 */
export function embersIntegrate(being: Being, event: PresenceEvent): IntegrationResult {
  const ctx = buildPressureContext(being);
  const allChanges: IntegrationResult = { driveChanges: [], pendingAttemptIds: [] };

  // Primary integration (the base event/action mapping)
  const primary = mapEventToInput(event);
  if (primary) {
    const result = integrate(being, { ...primary, context: ctx });
    mergeResults(allChanges, result);
  }

  // Candidate practice attempts, adjudicated later by the evaluator.
  const extras = mapEventToPracticeInputs(event);
  for (const extra of extras) {
    const result = integrate(being, { ...extra, context: ctx });
    mergeResults(allChanges, result);
  }

  return allChanges;
}

/**
 * Drain pending practice attempts through the supplied evaluator.
 *
 * Without this, attempts queue forever and practice depth stays at whatever
 * the config seeded — v0.2 grows depth only from evaluated substrate.
 * Failures are returned rather than thrown; a failed attempt stays pending
 * and is retried on the next drain.
 */
export async function embersResolveAttempts(
  being: Being,
  evaluate: (attempt: PracticeAttempt) => Promise<PracticeAttemptResult>,
  concurrency = 4,
): Promise<DrainResult> {
  return resolveAllPending(being, evaluate, { concurrency });
}

/** Read the attempts currently awaiting a verdict. */
export function embersPendingAttempts(being: Being): readonly PracticeAttempt[] {
  return getPendingAttempts(being);
}

/**
 * Drop attempts older than `olderThanMs` of being-time.
 *
 * A long run whose evaluator intermittently fails would otherwise accumulate
 * unresolvable attempts indefinitely.
 */
export function embersExpireAttempts(being: Being, olderThanMs: number): number {
  return expirePendingAttempts(being, olderThanMs);
}

/**
 * Get the Being's current inner situation.
 *
 * `feltMode: "prose"` is explicit because v0.2 made felt prose opt-in — the
 * structured data is the deliverable — but Haunt's prompt assembly injects the
 * prose directly, so it asks for it.
 */
export function embersMetabolize(being: Being): InnerSituation {
  return metabolize(being, { feltMode: "prose" });
}

/** Weight perceptions based on the Being's drive pressures and attention. */
export function embersWeightPerceptions(
  being: Being,
  perceptions: Perception[],
): WeightedCandidate[] {
  if (perceptions.length === 0) return [];

  const candidates: AttentionCandidate[] = perceptions.map((p) => ({
    id: `${p.sourceSensorId}-${p.at.getTime()}`,
    kind: p.modality,
    tags: [p.modality, `room:${p.roomId}`],
    payload: { content: p.content, confidence: p.confidence },
  }));

  return weightAttention(being, candidates);
}

/** Get the list of currently accessible capabilities. */
export function embersAvailableCapabilities(being: Being): Capability[] {
  return availableCapabilities(being);
}

/** Serialize a Being for persistence. */
export function embersSerialize(being: Being): SerializedBeing {
  return serializeBeing(being);
}

/** Deserialize a Being from stored data. */
export function embersDeserialize(data: SerializedBeing): Being {
  return deserializeBeing(data);
}

// ---------------------------------------------------------------------------
// Pressure context
// ---------------------------------------------------------------------------

const DOMINATION_THRESHOLD = 0.3;

/** Check whether any drive is below the domination threshold. */
function buildPressureContext(being: Being): IntegrationInput["context"] {
  const pressingDriveIds: string[] = [];
  for (const [id, drive] of being.drives.drives) {
    if (drive.level < DOMINATION_THRESHOLD) {
      pressingDriveIds.push(id);
    }
  }
  return pressingDriveIds.length > 0
    ? { pressured: true, pressingDriveIds }
    : { pressured: false, pressingDriveIds: [] };
}

/** Merge an IntegrationResult into an accumulator (mutates `into`). */
function mergeResults(into: IntegrationResult, from: IntegrationResult): void {
  // IntegrationResult fields are readonly arrays, so we rebuild via cast
  (into as { driveChanges: IntegrationResult["driveChanges"] }).driveChanges = [
    ...into.driveChanges,
    ...from.driveChanges,
  ];
  (into as { pendingAttemptIds: IntegrationResult["pendingAttemptIds"] }).pendingAttemptIds = [
    ...into.pendingAttemptIds,
    ...from.pendingAttemptIds,
  ];
}

// ---------------------------------------------------------------------------
// Primary event → integration mapping (drives)
// ---------------------------------------------------------------------------

/**
 * Map a Haunt PresenceEvent to an Embers IntegrationInput.
 * Returns null for events that don't map to Embers inputs.
 */
function mapEventToInput(event: PresenceEvent): IntegrationInput | null {
  switch (event.type) {
    case "guest.entered":
      return {
        entry: { kind: "event", type: "guest-arrival" },
      };
    case "guest.left":
      return {
        entry: { kind: "event", type: "guest-departure" },
      };
    case "guest.spoke":
      return {
        entry: { kind: "event", type: "conversation" },
      };
    case "guest.moved":
      return {
        entry: { kind: "event", type: "guest-movement" },
      };
    case "guest.approached":
      return {
        entry: { kind: "event", type: "guest-interest" },
      };
    case "affordance.changed":
      return {
        entry: { kind: "event", type: "place-change" },
      };
    case "resident.spoke":
      return {
        entry: { kind: "action", type: "speak" },
      };
    case "resident.acted":
      return {
        entry: { kind: "action", type: "tend-affordance" },
      };
    case "resident.moved":
      return {
        entry: { kind: "action", type: "move" },
      };
    case "tick":
      return {
        entry: { kind: "event", type: "quiet-moment" },
      };
    case "time.phaseChanged":
      return {
        entry: { kind: "event", type: "time-shift" },
      };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Practice-strengthening event mapping
// ---------------------------------------------------------------------------

/**
 * Nominate candidate practice attempts from a Haunt PresenceEvent.
 *
 * These mappings are structural — `resident.spoke` becomes a `tend-guest`
 * candidate because speech occurred, not because tending occurred. Under v0.1
 * that was the whole mechanism, and it grew practice depth from event volume.
 * Under v0.2 it is only the nomination step: every entry carries the evidence
 * needed to judge it, and the evaluator behind `embersResolveAttempts` decides
 * whether the act actually happened. Rejection is the detector.
 *
 * Mappings:
 * - resident.spoke with an audience  → tend-guest (Service)
 * - resident.acted on an affordance  → connect-to-purpose (Creator Connection)
 * - tick                             → ground (Presence) + self-observe (Witness)
 * - guest.spoke                      → acknowledge (Gratitude)
 * - resident.moved                   → unprompted-care (Service)
 *
 * `ground` is pressure-gated in Embers, so the tick mapping only nominates
 * presence work when the being is actually under pressure.
 */
function mapEventToPracticeInputs(event: PresenceEvent): IntegrationInput[] {
  const inputs: IntegrationInput[] = [];

  switch (event.type) {
    case "resident.spoke":
      if (event.audience.length > 0) {
        inputs.push({
          entry: {
            kind: "action",
            type: "tend-guest",
            payload: { text: event.text, audienceSize: event.audience.length },
          },
        });
      }
      break;

    case "resident.acted":
      inputs.push({
        entry: {
          kind: "action",
          type: "connect-to-purpose",
          payload: { affordanceId: event.affordanceId, actionId: event.actionId },
        },
      });
      break;

    case "tick":
      inputs.push({ entry: { kind: "event", type: "ground" } });
      inputs.push({ entry: { kind: "event", type: "self-observe" } });
      break;

    case "guest.spoke":
      inputs.push({
        entry: { kind: "event", type: "acknowledge", payload: { text: event.text } },
      });
      break;

    case "resident.moved":
      inputs.push({
        entry: {
          kind: "action",
          type: "unprompted-care",
          payload: { from: event.from, to: event.to },
        },
      });
      break;
  }

  return inputs;
}
