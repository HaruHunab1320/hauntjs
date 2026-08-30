import { applySensorEffects, dispatchAction } from "./action-handlers.js";
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
  /**
   * The place's clock, in milliseconds of place-time. Drives world-run
   * processes (`AffordanceAction.durationMs`). Defaults to `Date.now` —
   * correct only for a place running in real time; a compressed-time place
   * must supply its own, exactly as the Resident's `clock` option does.
   * Only differences between successive calls are used.
   */
  clock?: () => number;
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
  private readonly clock: () => number;
  private lastProcessAdvance: number;

  constructor(options: RuntimeOptions) {
    this.place = options.place;
    this.resident = options.resident;
    this.residentMind = options.residentMind ?? null;
    this.onGuestReturn = options.onGuestReturn ?? null;
    this.eventBus = new EventBus();
    this.systems = options.systems ?? createDefaultPipeline();
    this.clock = options.clock ?? (() => Date.now());
    this.lastProcessAdvance = this.clock();
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

    // The world moves first. Any process whose time has come completes now —
    // its state change lands, and its affordance.changed runs through the full
    // pipeline ahead of the incoming event, so the resident perceives what the
    // world did before being asked to deal with what arrived.
    for (const completion of this.advanceProcesses()) {
      await this.runPipeline(completion);
    }

    await this.runPipeline(event);
  }

  /**
   * Counts place-time against every running process and completes the due
   * ones: effects and state change land, the marker clears, and the change is
   * returned as an event to be perceived like any other.
   */
  private advanceProcesses(): PresenceEvent[] {
    const now = this.clock();
    const dtMs = Math.max(0, now - this.lastProcessAdvance);
    this.lastProcessAdvance = now;
    if (dtMs === 0) return [];

    const completions: PresenceEvent[] = [];

    for (const room of this.place.rooms.values()) {
      for (const affordance of room.affordances.values()) {
        for (const [key, value] of Object.entries(affordance.state)) {
          if (!key.startsWith("~process:")) continue;
          const remainingMs = (value as { remainingMs?: number })?.remainingMs;
          if (typeof remainingMs !== "number") continue;

          const left = remainingMs - dtMs;
          if (left > 0) {
            affordance.state = { ...affordance.state, [key]: { remainingMs: left } };
            continue;
          }

          const actionId = key.slice("~process:".length);
          const actionDef = affordance.actions.find((a) => a.id === actionId);
          const prevState = { ...affordance.state };

          const next = { ...affordance.state };
          delete next[key];
          affordance.state = actionDef?.stateChange ? { ...next, ...actionDef.stateChange } : next;
          if (actionDef?.affects) {
            applySensorEffects(actionDef.affects, this.place);
          }

          completions.push({
            type: "affordance.changed",
            affordanceId: affordance.id,
            roomId: room.id,
            prevState,
            newState: { ...affordance.state },
            at: new Date(),
          });
        }
      }
    }

    return completions;
  }

  private async runPipeline(event: PresenceEvent): Promise<void> {
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
