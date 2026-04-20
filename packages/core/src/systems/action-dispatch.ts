import { dispatchAction } from "../action-handlers.js";
import type { PipelineState, System, SystemContext } from "./types.js";

/**
 * Applies resident actions to the place state and produces events.
 * Delegates to the shared dispatchAction handler.
 */
export class ActionDispatchSystem implements System {
  readonly name = "ActionDispatch";

  async run(pipeline: PipelineState, ctx: SystemContext): Promise<PipelineState> {
    for (const action of pipeline.actions) {
      const result = dispatchAction(action, ctx.place, ctx.resident);
      pipeline.actionResults.push(result);

      if (result.success && result.event) {
        ctx.recentEvents.push(result.event);
      }
    }

    return pipeline;
  }
}
