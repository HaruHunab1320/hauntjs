import { dispatchAction } from "./action-handlers.js";
import { EventBus } from "./event-bus.js";
import { ActionDispatchSystem } from "./systems/action-dispatch.js";
import { AutonomySystem } from "./systems/autonomy-system.js";
import { BroadcastSystem } from "./systems/broadcast-system.js";
import { MemorySystem } from "./systems/memory-system.js";
import { ResidentSystem } from "./systems/resident-system.js";
import { SensorSystem } from "./systems/sensor-system.js";
import { StatePropagationSystem } from "./systems/state-propagation.js";
import type { PipelineState, System, SystemContext } from "./systems/types.js";
import type {
  ActionResult,
  GuestId,
  Place,
  PresenceEvent,
  ResidentAction,
  ResidentMind,
  ResidentState,
  RuntimeInterface,
} from "./types.js";

export interface RuntimeOptions {
  place: Place;
  resident: ResidentState;
  residentMind?: ResidentMind;
  /** Called when a known guest (visitCount > 0) re-enters after absence. */
  onGuestReturn?: (guestId: GuestId) => void;
  /** Custom systems pipeline. If not provided, uses the default pipeline. */
  systems?: System[];
}

/**
 * The default systems pipeline order.
 */
function createDefaultPipeline(): System[] {
  return [
    new StatePropagationSystem(),
    new SensorSystem(),
    new MemorySystem(),
    new AutonomySystem(),
    new ResidentSystem(),
    new ActionDispatchSystem(),
    new BroadcastSystem(),
  ];
}

export class Runtime implements RuntimeInterface {
  readonly place: Place;
  readonly resident: ResidentState;
  readonly eventBus: EventBus;

  private systems: System[];
  private residentMind: ResidentMind | null;
  private recentEvents: PresenceEvent[] = [];
  private running = false;
  private onGuestReturn: ((guestId: GuestId) => void) | null;

  constructor(options: RuntimeOptions) {
    this.place = options.place;
    this.resident = options.resident;
    this.residentMind = options.residentMind ?? null;
    this.onGuestReturn = options.onGuestReturn ?? null;
    this.eventBus = new EventBus();
    this.systems = options.systems ?? createDefaultPipeline();
  }

  setResidentMind(mind: ResidentMind): void {
    this.residentMind = mind;
  }

  async start(): Promise<void> {
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
    this.eventBus.clear();
  }

  /**
   * Process an event through the systems pipeline.
   */
  async emit(event: PresenceEvent): Promise<void> {
    if (!this.running) {
      throw new Error("Runtime is not running. Call start() first.");
    }

    const pipeline: PipelineState = {
      event,
      perceptions: [],
      shouldDeliberate: false,
      actions: [],
      actionResults: [],
    };

    const ctx: SystemContext = {
      place: this.place,
      resident: this.resident,
      residentMind: this.residentMind,
      eventBus: this.eventBus,
      recentEvents: this.recentEvents,
      onGuestReturn: this.onGuestReturn,
    };

    let state = pipeline;
    for (const system of this.systems) {
      state = await system.run(state, ctx);
    }
  }

  /**
   * Apply a single resident action outside the pipeline.
   * Delegates to the shared action-handlers module.
   */
  async applyAction(action: ResidentAction): Promise<ActionResult> {
    const result = dispatchAction(action, this.place, this.resident);

    if (result.success && result.event) {
      this.recentEvents.push(result.event);
      await this.eventBus.emit(result.event);
    }

    return result;
  }
}
