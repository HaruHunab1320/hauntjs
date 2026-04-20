import { filterEvent } from "../sensor-pipeline.js";
import type { PipelineState, System, SystemContext } from "./types.js";

/**
 * Routes events through the place's sensors to produce Perceptions.
 * Sits between StatePropagation and Memory in the pipeline.
 *
 * If no sensors match the event, perceptions will be empty.
 * The AutonomySystem downstream uses this to decide whether to invoke the resident.
 */
export class SensorSystem implements System {
  readonly name = "Sensor";

  async run(pipeline: PipelineState, ctx: SystemContext): Promise<PipelineState> {
    pipeline.perceptions = filterEvent(pipeline.event, ctx.place);
    return pipeline;
  }
}
