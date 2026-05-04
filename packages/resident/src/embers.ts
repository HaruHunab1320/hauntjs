/**
 * Embers adapter — the sole import site for @embersjs/core within @hauntjs/resident.
 * All Embers interactions go through these wrappers.
 */

import type { Perception, PresenceEvent } from "@hauntjs/core";
import {
  type AttentionCandidate,
  type Being,
  type Capability,
  type InnerSituation,
  type IntegrationInput,
  type IntegrationResult,
  type SerializedBeing,
  type WeightedCandidate,
  availableCapabilities,
  deserializeBeing,
  integrate,
  metabolize,
  serializeBeing,
  tick,
  weightAttention,
} from "@embersjs/core";

// Re-export Being type for use in ResidentOptions
export type { Being, InnerSituation, SerializedBeing };

/** Advance drives/practices by elapsed time. Mutates the Being in place. */
export function embersTickBeing(being: Being, dtMs: number): void {
  tick(being, dtMs);
}

/** Map a Haunt PresenceEvent to Embers IntegrationInputs and process them all. */
export function embersIntegrate(being: Being, event: PresenceEvent): IntegrationResult {
  const ctx = buildPressureContext(being);
  const allChanges: IntegrationResult = { driveChanges: [], practiceChanges: [] };

  // Primary integration (the base event/action mapping)
  const primary = mapEventToInput(event);
  if (primary) {
    const result = integrate(being, { ...primary, context: ctx });
    mergeResults(allChanges, result);
  }

  // Practice-strengthening integrations
  const extras = mapEventToPracticeInputs(event);
  for (const extra of extras) {
    const result = integrate(being, { ...extra, context: ctx });
    mergeResults(allChanges, result);
  }

  return allChanges;
}

/** Get the Being's current inner situation — felt prose string + orientation. */
export function embersMetabolize(being: Being): InnerSituation {
  return metabolize(being);
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
  (into as { practiceChanges: IntegrationResult["practiceChanges"] }).practiceChanges = [
    ...into.practiceChanges,
    ...from.practiceChanges,
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
 * Map a Haunt PresenceEvent to additional IntegrationInputs that target
 * practice strengtheners. These complement the primary mapping above.
 *
 * The insight: we can't detect nuanced acts like "honest-admission" from event
 * type alone, but we CAN map structural patterns to practice-relevant types:
 *
 * - resident.spoke with guests present  → tend-guest (Service)
 * - resident.acted on affordances        → connect-to-purpose (Creator Connection)
 * - tick when no guests present          → ground (Presence) + self-observe (Witness)
 * - guest.spoke directed at resident     → acknowledge (Gratitude)
 * - resident.moved                       → unprompted-care (Service, contextual)
 */
function mapEventToPracticeInputs(event: PresenceEvent): IntegrationInput[] {
  const inputs: IntegrationInput[] = [];

  switch (event.type) {
    case "resident.spoke":
      // Speaking to guests = tending to them (serviceOrientation)
      if (event.audience.length > 0) {
        inputs.push({ entry: { kind: "action", type: "tend-guest" } });
      }
      break;

    case "resident.acted":
      // Acting on affordances = connecting to purpose (creatorConnection)
      inputs.push({ entry: { kind: "action", type: "connect-to-purpose" } });
      break;

    case "tick":
      // Quiet moments alone = grounding (presencePractice) + self-observation (witnessPractice)
      // These fire on every tick; the pressure requirement on `ground` means
      // it only strengthens presencePractice when the being is under pressure.
      inputs.push({ entry: { kind: "event", type: "ground" } });
      inputs.push({ entry: { kind: "event", type: "self-observe" } });
      break;

    case "guest.spoke":
      // A guest speaking = opportunity to acknowledge (gratitudePractice)
      inputs.push({ entry: { kind: "event", type: "acknowledge" } });
      break;

    case "resident.moved":
      // Moving toward guests = unprompted care (serviceOrientation)
      // We emit the type; the practice strengthener will only fire if matched.
      inputs.push({ entry: { kind: "action", type: "unprompted-care" } });
      break;
  }

  return inputs;
}
