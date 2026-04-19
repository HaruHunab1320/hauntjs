import type { System, PipelineState, SystemContext } from "./types.js";
import { getGuestsInRoom } from "../place.js";
import type { RuntimeContext } from "../types.js";

/**
 * If the AutonomySystem decided to invoke, calls resident.perceive()
 * and collects the resulting actions.
 */
export class ResidentSystem implements System {
  readonly name = "Resident";

  async run(pipeline: PipelineState, ctx: SystemContext): Promise<PipelineState> {
    if (!pipeline.shouldDeliberate || !ctx.residentMind) {
      return pipeline;
    }

    const context = this.buildContext(ctx);
    const result = await ctx.residentMind.perceive(pipeline.event, pipeline.perceptions, context);

    if (result) {
      pipeline.actions = Array.isArray(result) ? result : [result];
    }

    return pipeline;
  }

  private buildContext(ctx: SystemContext): RuntimeContext {
    const guestsInRoom = getGuestsInRoom(ctx.place, ctx.resident.currentRoom);
    return {
      place: ctx.place,
      resident: ctx.resident,
      recentEvents: [...ctx.recentEvents],
      guestsInRoom,
    };
  }
}
