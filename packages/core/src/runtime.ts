import type {
  Place,
  PresenceEvent,
  ResidentAction,
  ActionResult,
  ResidentState,
  RuntimeInterface,
  ResidentInterface,
  GuestId,
  RoomId,
} from "./types.js";
import { EventBus } from "./event-bus.js";
import type { System, PipelineState, SystemContext } from "./systems/types.js";
import { StatePropagationSystem } from "./systems/state-propagation.js";
import { MemorySystem } from "./systems/memory-system.js";
import { AutonomySystem } from "./systems/autonomy-system.js";
import { ResidentSystem } from "./systems/resident-system.js";
import { ActionDispatchSystem } from "./systems/action-dispatch.js";
import { BroadcastSystem } from "./systems/broadcast-system.js";
import { getGuestsInRoom, getAffordance } from "./place.js";

export interface RuntimeOptions {
  place: Place;
  resident: ResidentState;
  residentMind?: ResidentInterface;
  /** Called when a known guest (visitCount > 0) re-enters after absence. */
  onGuestReturn?: (guestId: GuestId) => void;
  /** Custom systems pipeline. If not provided, uses the default pipeline. */
  systems?: System[];
}

/**
 * The default systems pipeline order.
 * Phase 2.3 will insert SensorSystem between StatePropagation and Memory.
 */
function createDefaultPipeline(): System[] {
  return [
    new StatePropagationSystem(),
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
  private residentMind: ResidentInterface | null;
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

  setResidentMind(mind: ResidentInterface): void {
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
   * Public API unchanged from Phase 1.
   */
  async emit(event: PresenceEvent): Promise<void> {
    if (!this.running) {
      throw new Error("Runtime is not running. Call start() first.");
    }

    const pipeline: PipelineState = {
      event,
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
   * Used by tests and direct action invocation.
   */
  async applyAction(action: ResidentAction): Promise<ActionResult> {
    const result = this.dispatchAction(action);

    if (result.success && result.event) {
      this.recentEvents.push(result.event);
      await this.eventBus.emit(result.event);
    }

    return result;
  }

  private dispatchAction(action: ResidentAction): ActionResult {
    switch (action.type) {
      case "speak":
        return this.handleSpeak(action);
      case "move":
        return this.handleMove(action);
      case "act":
        return this.handleAct(action);
      case "note":
        return { success: true };
      case "wait":
        return { success: true };
      default:
        return { success: false, error: "Unknown action type" };
    }
  }

  private handleSpeak(action: {
    text: string;
    audience: GuestId[] | "all";
    roomId?: RoomId;
  }): ActionResult {
    const roomId = action.roomId ?? this.resident.currentRoom;
    const room = this.place.rooms.get(roomId);
    if (!room) return { success: false, error: `Room "${roomId}" does not exist` };

    const audience =
      action.audience === "all"
        ? getGuestsInRoom(this.place, roomId).map((g) => g.id)
        : action.audience;

    const event: PresenceEvent = {
      type: "resident.spoke",
      roomId,
      text: action.text,
      audience,
      at: new Date(),
    };

    return { success: true, event };
  }

  private handleMove(action: { toRoom: RoomId }): ActionResult {
    const toRoom = this.place.rooms.get(action.toRoom);
    if (!toRoom) return { success: false, error: `Room "${action.toRoom}" does not exist` };

    const currentRoom = this.place.rooms.get(this.resident.currentRoom);
    if (currentRoom && !currentRoom.connectedTo.includes(action.toRoom)) {
      return {
        success: false,
        error: `Room "${action.toRoom}" is not connected to "${this.resident.currentRoom}"`,
      };
    }

    const from = this.resident.currentRoom;
    this.resident.currentRoom = action.toRoom;

    const event: PresenceEvent = {
      type: "resident.moved",
      from,
      to: action.toRoom,
      at: new Date(),
    };

    return { success: true, event };
  }

  private handleAct(action: {
    affordanceId: string;
    actionId: string;
    params?: Record<string, unknown>;
  }): ActionResult {
    const affordance = getAffordance(this.place, action.affordanceId as never);
    if (!affordance) {
      return { success: false, error: `Affordance "${action.affordanceId}" does not exist` };
    }

    const affordanceAction = affordance.actions.find((a) => a.id === action.actionId);
    if (!affordanceAction) {
      return {
        success: false,
        error: `Action "${action.actionId}" does not exist on affordance "${action.affordanceId}"`,
      };
    }

    if (affordanceAction.availableWhen && !affordanceAction.availableWhen(affordance.state)) {
      return {
        success: false,
        error: `Action "${action.actionId}" is not available in current state`,
      };
    }

    const event: PresenceEvent = {
      type: "resident.acted",
      affordanceId: affordance.id,
      actionId: action.actionId,
      at: new Date(),
    };

    return { success: true, event };
  }
}
