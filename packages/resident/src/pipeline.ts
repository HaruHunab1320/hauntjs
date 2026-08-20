/**
 * The systems pipeline, with the resident's commitments wired in.
 *
 * `@hauntjs/core` must not know about `@embersjs/core`, so `AutonomySystem`
 * takes a `commitment` provider rather than reading an inner life it cannot
 * import. This module is that provider: it reads the Being hanging off
 * `ResidentState` and reports what the resident is currently doing, as a plain
 * id / aim / urgency triple.
 *
 * The consequence is the point of Phase 3: an arriving event less salient than
 * what the resident is already doing does not reach the model at all. Not
 * reordered in the prompt — not sent.
 */

import {
  ActionDispatchSystem,
  AutonomySystem,
  type AutonomySystemOptions,
  BroadcastSystem,
  createLogger,
  type Logger,
  MemorySystem,
  type PresenceEvent,
  ResidentSystem,
  SensorSystem,
  type StandingCommitment,
  StatePropagationSystem,
  type System,
  type SystemContext,
} from "@hauntjs/core";
import type { Being } from "./embers.js";
import { embersCurrentIntentions, embersUrgency } from "./embers.js";

/**
 * What the resident is currently doing, read from its Being.
 *
 * Returns the most urgent pursuit — `currentIntentions` is already sorted — or
 * `null` when the resident has no Being or is not pursuing anything, in which
 * case nothing is suppressed and the pipeline behaves as it always did.
 */
export function commitmentFromBeing(ctx: SystemContext): StandingCommitment | null {
  const being = ctx.resident.being as Being | undefined;
  if (!being) return null;

  const [mostUrgent] = embersCurrentIntentions(being);
  if (!mostUrgent) return null;

  return {
    id: mostUrgent.id,
    aim: mostUrgent.aim,
    urgency: embersUrgency(being, mostUrgent),
  };
}

export interface ResidentPipelineOptions {
  /** Overrides the default event-salience ranking. */
  readonly salience?: AutonomySystemOptions["salience"];
  /** Logger for suppression reporting. Defaults to an "Autonomy" logger. */
  readonly logger?: Logger;
  /** Set false to build the pipeline without commitment suppression. */
  readonly suppressWhenCommitted?: boolean;
}

/**
 * The default pipeline, plus commitment-aware autonomy.
 *
 * Mirrors `createDefaultPipeline` in core — same systems, same order — and
 * differs only in giving `AutonomySystem` a way to see what the resident is
 * doing. Pass the result as `RuntimeOptions.systems`.
 *
 * Suppressions are logged by default. A resident that has gone quiet because it
 * is occupied is otherwise indistinguishable from one that has gone quiet
 * because something is broken, and that is not a distinction to leave to
 * guesswork.
 */
export function createResidentPipeline(options: ResidentPipelineOptions = {}): System[] {
  const log = options.logger ?? createLogger("Autonomy");
  const suppress = options.suppressWhenCommitted ?? true;

  return [
    new StatePropagationSystem(),
    new SensorSystem(),
    new MemorySystem(),
    new AutonomySystem({
      commitment: suppress ? commitmentFromBeing : undefined,
      salience: options.salience,
      onSuppressed: (event: PresenceEvent, salience: number, held: StandingCommitment) => {
        log.debug(
          `suppressed ${event.type} (salience ${salience.toFixed(2)}) — busy with "${held.aim}" (urgency ${held.urgency.toFixed(2)})`,
        );
      },
    }),
    new ResidentSystem(),
    new ActionDispatchSystem(),
    new BroadcastSystem(),
  ];
}

/**
 * A being clock derived from a place's `TimeSystem`.
 *
 * Drive drift, practice recency and wear are all specified per in-world hour.
 * A place running five real minutes to the hour therefore has to tell the
 * being so — otherwise the being ages in wall-clock milliseconds while the
 * place advances twelve times faster, and drives that should decay over a
 * simulated day move by a few minutes' worth.
 *
 * ```ts
 * new Resident({ ..., clock: inWorldClock(() => timeSystem.time) });
 * ```
 */
export function inWorldClock(
  time: () => {
    elapsedRealMs: number;
    realMsPerInWorldHour: number;
  },
): () => number {
  return () => {
    const { elapsedRealMs, realMsPerInWorldHour } = time();
    if (!(realMsPerInWorldHour > 0)) return elapsedRealMs;
    return elapsedRealMs * (3_600_000 / realMsPerInWorldHour);
  };
}
