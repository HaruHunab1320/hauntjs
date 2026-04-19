import type { System, PipelineState, SystemContext } from "./types.js";

const WORKING_MEMORY_LIMIT = 50;

/**
 * Updates working memory with the new event.
 * In Phase 2.3, this will also handle perceptions.
 */
export class MemorySystem implements System {
  readonly name = "Memory";

  async run(pipeline: PipelineState, ctx: SystemContext): Promise<PipelineState> {
    ctx.recentEvents.push(pipeline.event);
    if (ctx.recentEvents.length > WORKING_MEMORY_LIMIT) {
      ctx.recentEvents.shift();
    }

    return pipeline;
  }
}
