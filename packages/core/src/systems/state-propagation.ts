import { enterRoom, leavePlace, moveGuest } from "../place.js";
import type { GuestId, RoomId } from "../types.js";
import type { PipelineState, System, SystemContext } from "./types.js";

/**
 * Applies the raw event to place state. Deterministic, no model calls.
 * Handles: guest.entered, guest.left, guest.moved, affordance.changed.
 */
export class StatePropagationSystem implements System {
  readonly name = "StatePropagation";

  async run(pipeline: PipelineState, ctx: SystemContext): Promise<PipelineState> {
    const event = pipeline.event;

    switch (event.type) {
      case "guest.entered":
        this.handleGuestEntered(event, ctx);
        break;
      case "guest.left":
        this.handleGuestLeft(event, ctx);
        break;
      case "guest.moved":
        this.handleGuestMoved(event, ctx);
        break;
      case "affordance.changed":
        this.handleAffordanceChanged(event, ctx);
        break;
    }

    return pipeline;
  }

  private handleGuestEntered(
    event: { guestId: GuestId; roomId: RoomId },
    ctx: SystemContext,
  ): void {
    const guest = ctx.place.guests.get(event.guestId);
    if (!guest) return;

    const isReturning = guest.visitCount > 0 && guest.currentRoom === null;

    if (guest.currentRoom === event.roomId) {
      if (isReturning && ctx.onGuestReturn) {
        ctx.onGuestReturn(event.guestId);
      }
      return;
    }

    const wasReturning = guest.visitCount > 0;
    enterRoom(ctx.place, event.guestId, event.roomId);

    if (wasReturning && ctx.onGuestReturn) {
      ctx.onGuestReturn(event.guestId);
    }
  }

  private handleGuestLeft(event: { guestId: GuestId }, ctx: SystemContext): void {
    const guest = ctx.place.guests.get(event.guestId);
    if (!guest || !guest.currentRoom) return;
    leavePlace(ctx.place, event.guestId);
  }

  private handleGuestMoved(event: { guestId: GuestId; to: RoomId }, ctx: SystemContext): void {
    const guest = ctx.place.guests.get(event.guestId);
    if (!guest || !guest.currentRoom) return;
    if (guest.currentRoom === event.to) return;
    moveGuest(ctx.place, event.guestId, event.to);
  }

  private handleAffordanceChanged(
    event: { affordanceId: string; roomId: RoomId; newState: Record<string, unknown> },
    ctx: SystemContext,
  ): void {
    const room = ctx.place.rooms.get(event.roomId);
    if (!room) return;
    const aff = room.affordances.get(event.affordanceId as never);
    if (aff) {
      aff.state = { ...event.newState };
    }
  }
}
