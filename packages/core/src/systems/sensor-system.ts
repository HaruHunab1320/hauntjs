import { type EventModalityMap, filterEvent } from "../sensor-pipeline.js";
import type { PipelineState, System, SystemContext } from "./types.js";

/**
 * Routes events through the place's sensors to produce Perceptions.
 * Sits between StatePropagation and Memory in the pipeline.
 *
 * If no sensors match the event, perceptions will be empty.
 * The AutonomySystem downstream uses this to decide whether to invoke the resident.
 */
export interface SensorSystemOptions {
  /**
   * Event→modality routing. Merge with `DEFAULT_EVENT_MODALITIES` rather than
   * replacing it, unless the adapter genuinely defines every event type itself.
   *
   * An event type with no entry produces no perceptions at all, silently — so
   * an adapter that introduces event types without extending this map gets a
   * resident that never notices them.
   */
  readonly modalities?: EventModalityMap;
  /** Per-hop confidence attenuation. `1` disables it. */
  readonly attenuationPerHop?: number;
}

export class SensorSystem implements System {
  readonly name = "Sensor";

  constructor(private readonly options: SensorSystemOptions = {}) {}

  async run(pipeline: PipelineState, ctx: SystemContext): Promise<PipelineState> {
    pipeline.perceptions = filterEvent(pipeline.event, ctx.place, this.options);
    return pipeline;
  }
}
