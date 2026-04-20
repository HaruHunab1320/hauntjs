import { getGuestsInRoom } from "../place.js";
import type { RoomId, RuntimeContext } from "../types.js";
import type { PipelineState, System, SystemContext } from "./types.js";

/**
 * If the AutonomySystem decided to invoke, calls resident.perceive()
 * and collects the resulting actions.
 *
 * Mode-aware context building:
 * - Host: auto-focuses on event room, sees all guests
 * - Presence: sees all guests, NO auto-focus (ambient awareness)
 * - Inhabitant: sees only guests in current room
 */
export class ResidentSystem implements System {
  readonly name = "Resident";

  async run(pipeline: PipelineState, ctx: SystemContext): Promise<PipelineState> {
    if (!pipeline.shouldDeliberate || !ctx.residentMind) {
      return pipeline;
    }

    // Host mode: auto-focus on the room where the event happened
    if (ctx.resident.presenceMode === "host") {
      const eventRoom = this.getEventRoom(pipeline);
      if (eventRoom) {
        ctx.resident.focusRoom = eventRoom;
      }
    }
    // Presence mode: no auto-focus — ambient awareness without directed attention

    const context = this.buildContext(ctx);
    const result = await ctx.residentMind.perceive(pipeline.event, pipeline.perceptions, context);

    if (result) {
      pipeline.actions = Array.isArray(result) ? result : [result];
    }

    return pipeline;
  }

  private buildContext(ctx: SystemContext): RuntimeContext {
    const mode = ctx.resident.presenceMode;

    if (mode === "host" || mode === "presence") {
      // Both Host and Presence see all guests across all rooms
      const allGuests = Array.from(ctx.place.guests.values()).filter((g) => g.currentRoom !== null);
      return {
        place: ctx.place,
        resident: ctx.resident,
        recentEvents: [...ctx.recentEvents],
        guestsInRoom: allGuests,
      };
    }

    // Inhabitant: room-local guests only
    const guestsInRoom = getGuestsInRoom(ctx.place, ctx.resident.currentRoom);
    return {
      place: ctx.place,
      resident: ctx.resident,
      recentEvents: [...ctx.recentEvents],
      guestsInRoom,
    };
  }

  private getEventRoom(pipeline: PipelineState): RoomId | null {
    const event = pipeline.event;
    switch (event.type) {
      case "guest.entered":
      case "guest.left":
      case "guest.spoke":
      case "guest.approached":
        return event.roomId;
      case "guest.moved":
        return event.to;
      case "affordance.changed":
        return event.roomId;
      default:
        return null;
    }
  }
}
