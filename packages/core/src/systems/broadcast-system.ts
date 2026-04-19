import type { System, PipelineState, SystemContext } from "./types.js";

/**
 * Emits events through the event bus so adapters and external listeners
 * can react. Broadcasts both the original event and any events produced
 * by resident actions.
 */
export class BroadcastSystem implements System {
  readonly name = "Broadcast";

  async run(pipeline: PipelineState, ctx: SystemContext): Promise<PipelineState> {
    // Broadcast the original event
    await ctx.eventBus.emit(pipeline.event);

    // Broadcast events from resident actions
    for (const result of pipeline.actionResults) {
      if (result.success && result.event) {
        await ctx.eventBus.emit(result.event);
      }
    }

    return pipeline;
  }
}
