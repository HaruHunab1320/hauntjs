import type {
  Place,
  PresenceEvent,
  ResidentAction,
  ActionResult,
  ResidentState,
  ResidentInterface,
  GuestId,
} from "../types.js";
import type { EventBus } from "../event-bus.js";

/**
 * The pipeline accumulator — flows through each system in order.
 * Each system reads what it needs and writes what it produces.
 */
export interface PipelineState {
  /** The triggering event. */
  event: PresenceEvent;

  /** Whether the resident should be invoked for this event. Set by AutonomySystem. */
  shouldDeliberate: boolean;

  /** Actions produced by the resident. Set by ResidentSystem. */
  actions: ResidentAction[];

  /** Results of applying actions. Set by ActionDispatchSystem. */
  actionResults: ActionResult[];
}

/**
 * Shared context available to all systems. Not mutated by systems — they
 * read from it and write to the PipelineState accumulator.
 */
export interface SystemContext {
  place: Place;
  resident: ResidentState;
  residentMind: ResidentInterface | null;
  eventBus: EventBus;
  recentEvents: PresenceEvent[];
  onGuestReturn: ((guestId: GuestId) => void) | null;
}

/**
 * A system is a single stage of the runtime pipeline.
 * It receives the pipeline state, processes it, and returns the updated state.
 */
export interface System {
  name: string;
  run(pipeline: PipelineState, ctx: SystemContext): Promise<PipelineState>;
}
