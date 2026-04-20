import { getAffordance, getGuestsInRoom } from "../place.js";
import type { ActionResult, GuestId, PresenceEvent, ResidentAction, RoomId } from "../types.js";
import type { PipelineState, System, SystemContext } from "./types.js";

/**
 * Applies resident actions to the place state and produces events.
 * Each action is validated, applied, and its resulting event stored.
 */
export class ActionDispatchSystem implements System {
  readonly name = "ActionDispatch";

  async run(pipeline: PipelineState, ctx: SystemContext): Promise<PipelineState> {
    for (const action of pipeline.actions) {
      const result = this.dispatch(action, ctx);
      pipeline.actionResults.push(result);

      // Store the resulting event in working memory
      if (result.success && result.event) {
        ctx.recentEvents.push(result.event);
      }
    }

    return pipeline;
  }

  private dispatch(action: ResidentAction, ctx: SystemContext): ActionResult {
    switch (action.type) {
      case "speak":
        return this.handleSpeak(action, ctx);
      case "move":
        return this.handleMove(action, ctx);
      case "focus":
        return this.handleFocus(action, ctx);
      case "act":
        return this.handleAct(action, ctx);
      case "note":
        return { success: true };
      case "wait":
        return { success: true };
      default:
        return { success: false, error: "Unknown action type" };
    }
  }

  private handleSpeak(
    action: { text: string; audience: GuestId[] | "all"; roomId?: RoomId },
    ctx: SystemContext,
  ): ActionResult {
    // Host: default to focusRoom. Inhabitant: default to currentRoom.
    const roomId =
      action.roomId ??
      (ctx.resident.presenceMode === "host" ? ctx.resident.focusRoom : null) ??
      ctx.resident.currentRoom;
    const room = ctx.place.rooms.get(roomId);
    if (!room) return { success: false, error: `Room "${roomId}" does not exist` };

    const audience =
      action.audience === "all"
        ? getGuestsInRoom(ctx.place, roomId).map((g) => g.id)
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

  private handleMove(action: { toRoom: RoomId }, ctx: SystemContext): ActionResult {
    // Host mode: treat move as focus shift (no connectivity check, no event)
    if (ctx.resident.presenceMode === "host") {
      const room = ctx.place.rooms.get(action.toRoom);
      if (!room) return { success: false, error: `Room "${action.toRoom}" does not exist` };
      ctx.resident.focusRoom = action.toRoom;
      return { success: true };
    }

    // Inhabitant mode: walk between connected rooms
    const toRoom = ctx.place.rooms.get(action.toRoom);
    if (!toRoom) return { success: false, error: `Room "${action.toRoom}" does not exist` };

    const currentRoom = ctx.place.rooms.get(ctx.resident.currentRoom);
    if (currentRoom && !currentRoom.connectedTo.includes(action.toRoom)) {
      return {
        success: false,
        error: `Room "${action.toRoom}" is not connected to "${ctx.resident.currentRoom}"`,
      };
    }

    const from = ctx.resident.currentRoom;
    ctx.resident.currentRoom = action.toRoom;

    const event: PresenceEvent = {
      type: "resident.moved",
      from,
      to: action.toRoom,
      at: new Date(),
    };

    return { success: true, event };
  }

  private handleFocus(action: { roomId: RoomId }, ctx: SystemContext): ActionResult {
    const room = ctx.place.rooms.get(action.roomId);
    if (!room) return { success: false, error: `Room "${action.roomId}" does not exist` };
    ctx.resident.focusRoom = action.roomId;
    return { success: true };
  }

  private handleAct(
    action: { affordanceId: string; actionId: string; params?: Record<string, unknown> },
    ctx: SystemContext,
  ): ActionResult {
    const affordance = getAffordance(ctx.place, action.affordanceId as never);
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

    // Apply sensor effects declared by this action
    if (affordanceAction.affects) {
      applySensorEffects(affordanceAction.affects, ctx);
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

/** Apply sensor changes declared in AffordanceAction.affects */
function applySensorEffects(
  affects: import("../types.js").SensorAffect[],
  ctx: SystemContext,
): void {
  for (const effect of affects) {
    // Find the sensor across all rooms
    for (const room of ctx.place.rooms.values()) {
      const sensor = room.sensors.get(effect.sensorId as never);
      if (sensor) {
        if ("enabled" in effect.change) {
          sensor.enabled = effect.change.enabled;
          console.log(`  [Sensor] ${sensor.name} ${sensor.enabled ? "enabled" : "disabled"}`);
        } else if ("fidelity" in effect.change) {
          sensor.fidelity = effect.change.fidelity;
          console.log(`  [Sensor] ${sensor.name} fidelity changed to ${sensor.fidelity.kind}`);
        }
        break;
      }
    }
  }
}
