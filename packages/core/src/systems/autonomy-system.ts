import type { PipelineState, System, SystemContext } from "./types.js";

/**
 * Decides whether the resident should be invoked for this event.
 * Sets pipeline.shouldDeliberate.
 *
 * Rules:
 * - Skip the resident's own actions (prevents loops)
 * - Tick events always pass through (the resident decides whether to act)
 * - For external events: only invoke if sensors produced perceptions
 *   (strict-by-default — unsensored events are invisible to the resident)
 */

const SKIP_EVENTS = new Set(["resident.spoke", "resident.moved", "resident.acted"]);

export class AutonomySystem implements System {
  readonly name = "Autonomy";

  async run(pipeline: PipelineState, ctx: SystemContext): Promise<PipelineState> {
    if (!ctx.residentMind) {
      pipeline.shouldDeliberate = false;
      return pipeline;
    }

    if (SKIP_EVENTS.has(pipeline.event.type)) {
      pipeline.shouldDeliberate = false;
      return pipeline;
    }

    // Tick and time events always pass through — they're internal, not sensor-gated
    if (pipeline.event.type === "tick" || pipeline.event.type === "time.phaseChanged") {
      pipeline.shouldDeliberate = true;
      return pipeline;
    }

    // For external events: only deliberate if at least one sensor picked it up
    pipeline.shouldDeliberate = pipeline.perceptions.length > 0;
    return pipeline;
  }
}
