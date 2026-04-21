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

/** Map a Haunt PresenceEvent to an Embers IntegrationInput and process it. */
export function embersIntegrate(being: Being, event: PresenceEvent): IntegrationResult {
  const input = mapEventToInput(event);
  if (!input) {
    return { driveChanges: [], practiceChanges: [] };
  }
  return integrate(being, input);
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
