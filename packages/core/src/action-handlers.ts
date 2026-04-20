import { getAffordance, getGuestsInRoom } from "./place.js";
import type {
  ActionResult,
  AffordanceId,
  GuestId,
  Place,
  PresenceEvent,
  ResidentAction,
  ResidentState,
  RoomId,
  SensorAffect,
  SensorId,
} from "./types.js";

/**
 * Dispatches a single resident action, returning an ActionResult.
 * This is the single source of truth for action handling — used by
 * both the ActionDispatchSystem (pipeline) and Runtime.applyAction() (direct).
 */
export function dispatchAction(
  action: ResidentAction,
  place: Place,
  resident: ResidentState,
): ActionResult {
  switch (action.type) {
    case "speak":
      return handleSpeak(action, place, resident);
    case "move":
      return handleMove(action, place, resident);
    case "focus":
      return handleFocus(action, place, resident);
    case "act":
      return handleAct(action, place);
    case "note":
      return { success: true };
    case "wait":
      return { success: true };
    default:
      return { success: false, error: "Unknown action type" };
  }
}

function handleSpeak(
  action: { text: string; audience: GuestId[] | "all"; roomId?: RoomId },
  place: Place,
  resident: ResidentState,
): ActionResult {
  const roomId =
    action.roomId ??
    (resident.presenceMode === "host" ? resident.focusRoom : null) ??
    resident.currentRoom;
  const room = place.rooms.get(roomId);
  if (!room) return { success: false, error: `Room "${roomId}" does not exist` };

  const audience =
    action.audience === "all" ? getGuestsInRoom(place, roomId).map((g) => g.id) : action.audience;

  const event: PresenceEvent = {
    type: "resident.spoke",
    roomId,
    text: action.text,
    audience,
    at: new Date(),
  };

  return { success: true, event };
}

function handleMove(
  action: { toRoom: RoomId },
  place: Place,
  resident: ResidentState,
): ActionResult {
  // Host mode: treat move as focus shift
  if (resident.presenceMode === "host") {
    const room = place.rooms.get(action.toRoom);
    if (!room) return { success: false, error: `Room "${action.toRoom}" does not exist` };
    resident.focusRoom = action.toRoom;
    return { success: true };
  }

  // Inhabitant mode: walk between connected rooms
  const toRoom = place.rooms.get(action.toRoom);
  if (!toRoom) return { success: false, error: `Room "${action.toRoom}" does not exist` };

  const currentRoom = place.rooms.get(resident.currentRoom);
  if (currentRoom && !currentRoom.connectedTo.includes(action.toRoom)) {
    return {
      success: false,
      error: `Room "${action.toRoom}" is not connected to "${resident.currentRoom}"`,
    };
  }

  const from = resident.currentRoom;
  resident.currentRoom = action.toRoom;

  const event: PresenceEvent = {
    type: "resident.moved",
    from,
    to: action.toRoom,
    at: new Date(),
  };

  return { success: true, event };
}

function handleFocus(
  action: { roomId: RoomId },
  place: Place,
  resident: ResidentState,
): ActionResult {
  const room = place.rooms.get(action.roomId);
  if (!room) return { success: false, error: `Room "${action.roomId}" does not exist` };
  resident.focusRoom = action.roomId;
  return { success: true };
}

function handleAct(
  action: { affordanceId: string; actionId: string; params?: Record<string, unknown> },
  place: Place,
): ActionResult {
  const affordance = getAffordance(place, action.affordanceId as AffordanceId);
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
    applySensorEffects(affordanceAction.affects, place);
  }

  const event: PresenceEvent = {
    type: "resident.acted",
    affordanceId: affordance.id,
    actionId: action.actionId,
    at: new Date(),
  };

  return { success: true, event };
}

/** Apply sensor changes declared in AffordanceAction.affects */
export function applySensorEffects(affects: SensorAffect[], place: Place): void {
  for (const effect of affects) {
    for (const room of place.rooms.values()) {
      const sensor = room.sensors.get(effect.sensorId as SensorId);
      if (sensor) {
        if ("enabled" in effect.change) {
          sensor.enabled = effect.change.enabled;
        } else if ("fidelity" in effect.change) {
          sensor.fidelity = effect.change.fidelity;
        }
        break;
      }
    }
  }
}
