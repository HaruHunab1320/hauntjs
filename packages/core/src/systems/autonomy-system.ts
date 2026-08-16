import type { Perception, PresenceEvent } from "../types.js";
import type { PipelineState, System, SystemContext } from "./types.js";

/**
 * Decides whether the resident should be invoked for this event.
 * Sets `pipeline.shouldDeliberate`.
 *
 * Base rules:
 * - Skip the resident's own actions (prevents loops)
 * - Tick and time events always pass through — internal, not sensor-gated
 * - For external events: only invoke if sensors produced perceptions
 *   (strict-by-default — unsensored events are invisible to the resident)
 *
 * Plus, when a commitment provider is supplied, one more: an arriving event
 * that is **less salient than what the resident is already doing** does not
 * cause deliberation at all.
 *
 * That last rule is the difference between an agent that answers whatever
 * knocks and one that can be occupied. It is deliberately expressed as control
 * flow rather than as prompt text: a commitment that only ever *describes*
 * itself inside a deliberation has changed how the resident sounds, not what it
 * does, which is the failure this exists to prevent.
 */

const SKIP_EVENTS = new Set(["resident.spoke", "resident.moved", "resident.acted"]);

/**
 * What the resident is currently doing, in terms core can compare.
 *
 * Deliberately structural and free of any inner-life vocabulary: `@hauntjs/core`
 * must not learn about `@embersjs/core`. The host reads its own intention layer
 * and reports a number; core only knows that something is in progress and how
 * pressing it is.
 */
export interface StandingCommitment {
  /** Opaque identifier, for logging and debugging. */
  readonly id: string;
  /** What the resident is doing, in its own words. */
  readonly aim: string;
  /** How pressing it is. Compared directly against event salience. */
  readonly urgency: number;
}

export interface AutonomySystemOptions {
  /**
   * How much this arriving event demands attention, on the same scale as
   * `StandingCommitment.urgency`. Defaults to {@link defaultSalience}.
   */
  readonly salience?: (
    event: PresenceEvent,
    perceptions: readonly Perception[],
    ctx: SystemContext,
  ) => number;

  /**
   * The resident's current commitment, if any.
   *
   * Omitted by default, which makes this system behave exactly as it did before
   * commitments existed — no provider, no commitment, no suppression.
   */
  readonly commitment?: (ctx: SystemContext) => StandingCommitment | null;

  /**
   * Called when an event is suppressed in favor of a commitment.
   *
   * Worth wiring. A suppressed deliberation leaves no other trace, and a
   * resident that has gone quiet because it is busy looks identical to one that
   * has gone quiet because something is broken.
   */
  readonly onSuppressed?: (
    event: PresenceEvent,
    salience: number,
    commitment: StandingCommitment,
  ) => void;
}

/**
 * Base salience by event type, scaled by how well the event was actually
 * perceived.
 *
 * Being spoken to ranks highest: a resident that ignores direct address because
 * it is busy reads as broken rather than occupied. Ambient change ranks lowest.
 *
 * Scaling by the strongest perception's confidence is what keeps this coherent
 * with the sensor layer — a half-heard event two rooms away should not interrupt
 * the same as one in the room. A place that wants "always answer, however
 * faintly heard" supplies its own function.
 */
export function defaultSalience(event: PresenceEvent, perceptions: readonly Perception[]): number {
  let base: number;
  switch (event.type) {
    case "guest.spoke":
      base = 1;
      break;
    case "guest.entered":
    case "guest.left":
      base = 0.7;
      break;
    case "guest.approached":
      base = 0.6;
      break;
    case "guest.moved":
      base = 0.3;
      break;
    case "affordance.changed":
      base = 0.25;
      break;
    default:
      base = 0.2;
      break;
  }

  const confidence = perceptions.reduce((max, p) => Math.max(max, p.confidence), 0);
  return base * confidence;
}

export class AutonomySystem implements System {
  readonly name = "Autonomy";

  constructor(private readonly options: AutonomySystemOptions = {}) {}

  async run(pipeline: PipelineState, ctx: SystemContext): Promise<PipelineState> {
    if (!ctx.residentMind) {
      pipeline.shouldDeliberate = false;
      return pipeline;
    }

    if (SKIP_EVENTS.has(pipeline.event.type)) {
      pipeline.shouldDeliberate = false;
      return pipeline;
    }

    // Tick and time events always pass through. A resident holding a commitment
    // acts on it here — suppressing ticks would remove the only moment it has
    // to do anything unprompted.
    if (pipeline.event.type === "tick" || pipeline.event.type === "time.phaseChanged") {
      pipeline.shouldDeliberate = true;
      return pipeline;
    }

    // Strict-by-default: an event no sensor picked up is invisible.
    if (pipeline.perceptions.length === 0) {
      pipeline.shouldDeliberate = false;
      return pipeline;
    }

    const commitment = this.options.commitment?.(ctx) ?? null;
    if (commitment) {
      const salience = (this.options.salience ?? defaultSalience)(
        pipeline.event,
        pipeline.perceptions,
        ctx,
      );

      if (salience < commitment.urgency) {
        this.options.onSuppressed?.(pipeline.event, salience, commitment);
        pipeline.shouldDeliberate = false;
        return pipeline;
      }
    }

    pipeline.shouldDeliberate = true;
    return pipeline;
  }
}
