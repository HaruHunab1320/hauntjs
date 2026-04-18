import type {
  Place,
  PresenceEvent,
  ResidentAction,
  ActionResult,
  ResidentState,
  RuntimeInterface,
  RuntimeContext,
  ResidentInterface,
  GuestId,
  RoomId,
} from "./types.js";
import { EventBus } from "./event-bus.js";
import {
  enterRoom,
  moveGuest,
  leavePlace,
  getGuestsInRoom,
  getAffordance,
} from "./place.js";

const WORKING_MEMORY_LIMIT = 50;

export interface RuntimeOptions {
  place: Place;
  resident: ResidentState;
  residentMind?: ResidentInterface;
}

export class Runtime implements RuntimeInterface {
  readonly place: Place;
  readonly resident: ResidentState;
  readonly eventBus: EventBus;

  private residentMind: ResidentInterface | null;
  private recentEvents: PresenceEvent[] = [];
  private running = false;

  constructor(options: RuntimeOptions) {
    this.place = options.place;
    this.resident = options.resident;
    this.residentMind = options.residentMind ?? null;
    this.eventBus = new EventBus();
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

  async emit(event: PresenceEvent): Promise<void> {
    if (!this.running) {
      throw new Error("Runtime is not running. Call start() first.");
    }

    // Update place state based on event
    this.applyEventToState(event);

    // Store in working memory
    this.recentEvents.push(event);
    if (this.recentEvents.length > WORKING_MEMORY_LIMIT) {
      this.recentEvents.shift();
    }

    // Broadcast to listeners
    await this.eventBus.emit(event);

    // Let the resident perceive and possibly respond
    if (this.residentMind && event.type !== "resident.spoke" && event.type !== "resident.moved" && event.type !== "resident.acted") {
      const context = this.buildContext();
      const action = await this.residentMind.perceive(event, context);
      if (action) {
        await this.applyAction(action);
      }
    }
  }

  async applyAction(action: ResidentAction): Promise<ActionResult> {
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

  private applyEventToState(event: PresenceEvent): void {
    switch (event.type) {
      case "guest.entered":
        this.handleGuestEntered(event);
        break;
      case "guest.left":
        this.handleGuestLeft(event);
        break;
      case "guest.moved":
        this.handleGuestMoved(event);
        break;
      case "affordance.changed":
        this.handleAffordanceChanged(event);
        break;
    }
  }

  private handleGuestEntered(event: { guestId: GuestId; roomId: RoomId }): void {
    const guest = this.place.guests.get(event.guestId);
    if (!guest) return;
    enterRoom(this.place, event.guestId, event.roomId);
  }

  private handleGuestLeft(event: { guestId: GuestId }): void {
    const guest = this.place.guests.get(event.guestId);
    if (!guest || !guest.currentRoom) return;
    leavePlace(this.place, event.guestId);
  }

  private handleGuestMoved(event: { guestId: GuestId; to: RoomId }): void {
    const guest = this.place.guests.get(event.guestId);
    if (!guest || !guest.currentRoom) return;
    moveGuest(this.place, event.guestId, event.to);
  }

  private handleAffordanceChanged(event: {
    affordanceId: string;
    roomId: RoomId;
    newState: Record<string, unknown>;
  }): void {
    const room = this.place.rooms.get(event.roomId);
    if (!room) return;
    const aff = room.affordances.get(event.affordanceId as never);
    if (aff) {
      aff.state = { ...event.newState };
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

    this.recentEvents.push(event);
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

    this.recentEvents.push(event);
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

    this.recentEvents.push(event);
    return { success: true, event };
  }

  private buildContext(): RuntimeContext {
    const guestsInRoom = getGuestsInRoom(this.place, this.resident.currentRoom);
    return {
      place: this.place,
      resident: this.resident,
      recentEvents: [...this.recentEvents],
      guestsInRoom,
    };
  }
}
