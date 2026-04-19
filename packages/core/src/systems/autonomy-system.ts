import type { System, PipelineState, SystemContext } from "./types.js";

/**
 * Decides whether the resident should be invoked for this event.
 * Sets pipeline.shouldDeliberate.
 *
 * Rules: invoke for all events except the resident's own actions.
 * The Resident class itself handles finer-grained filtering
 * (DELIBERATION_EVENTS set, backpressure).
 */

const SKIP_EVENTS = new Set([
  "resident.spoke",
  "resident.moved",
  "resident.acted",
]);

export class AutonomySystem implements System {
  readonly name = "Autonomy";

  async run(pipeline: PipelineState, ctx: SystemContext): Promise<PipelineState> {
    // No mind wired in — nothing to invoke
    if (!ctx.residentMind) {
      pipeline.shouldDeliberate = false;
      return pipeline;
    }

    // Don't invoke for the resident's own actions (prevents loops)
    if (SKIP_EVENTS.has(pipeline.event.type)) {
      pipeline.shouldDeliberate = false;
      return pipeline;
    }

    pipeline.shouldDeliberate = true;
    return pipeline;
  }
}
