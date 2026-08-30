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
  // Host mode: treat move as a focus shift. A host has no body to walk, so it
  // does not need rooms to be connected — attention can go anywhere it senses.
  if (resident.presenceMode === "host") {
    const room = place.rooms.get(action.toRoom);
    if (!room) return { success: false, error: `Room "${action.toRoom}" does not exist` };

    const from = resident.focusRoom ?? resident.currentRoom;
    if (from === action.toRoom) {
      // Already attending there. Reporting a move would satiate drives for
      // having done nothing.
      return { success: true };
    }
    resident.focusRoom = action.toRoom;

    // A host's attention moving is still the resident having moved, and it must
    // say so. Without an event nothing downstream sees it: no integration, so a
    // drive relieved by movement never eases, and a resident pursuing relief
    // through movement would shift focus forever and never feel better.
    const event: PresenceEvent = {
      type: "resident.moved",
      from,
      to: action.toRoom,
      at: new Date(),
    };
    return { success: true, event };
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

  // A process already underway cannot be started again. This guard is the
  // engine's, not the author's — availableWhen typically watches the end
  // state ("not yet clean"), which stays true the whole time the wash runs.
  if (affordance.state[`~process:${action.actionId}`] !== undefined) {
    return {
      success: false,
      error: `Action "${action.actionId}" is already underway`,
    };
  }

  // Work takes time: an action with effort advances a progress counter kept in
  // the affordance's own state, and only the completing invocation falls
  // through to the effects and state change below. The counter lives in world
  // state deliberately — progress is a fact about the suite being half-made,
  // not about whoever is making it, and it is inspectable like any other state.
  const effortRequired = Math.max(1, affordanceAction.effort ?? 1);
  if (effortRequired > 1) {
    const progressKey = `~progress:${action.actionId}`;
    const raw = affordance.state[progressKey];
    const done = (typeof raw === "number" ? raw : 0) + 1;

    if (done < effortRequired) {
      affordance.state = { ...affordance.state, [progressKey]: done };
      // Partial work is still work the world can see.
      return {
        success: true,
        event: {
          type: "resident.acted",
          affordanceId: affordance.id,
          actionId: action.actionId,
          at: new Date(),
        },
      };
    }

    // Completing invocation: clear the counter, then fall through.
    const next = { ...affordance.state };
    delete next[progressKey];
    affordance.state = next;
  }

  // A world-run duration: the completing invocation starts the process rather
  // than finishing the work. Effects and state change belong to the process's
  // completion, which the Runtime performs on its clock and announces as an
  // affordance.changed event. The remaining time lives in the affordance's own
  // state, inspectable like anything else about the world.
  if (affordanceAction.durationMs && affordanceAction.durationMs > 0) {
    affordance.state = {
      ...affordance.state,
      [`~process:${action.actionId}`]: { remainingMs: affordanceAction.durationMs },
    };
    return {
      success: true,
      event: {
        type: "resident.acted",
        affordanceId: affordance.id,
        actionId: action.actionId,
        at: new Date(),
      },
    };
  }

  // Apply sensor effects declared by this action
  if (affordanceAction.affects) {
    applySensorEffects(affordanceAction.affects, place);
  }

  // Apply the action's declared state change. This line was missing from
  // Phase 1 until now: `stateChange` was typed, documented, and authored in
  // every demo's world config — and applied by nothing. Acting on a fireplace
  // never lit it; "turn off the lamp" disabled the sight sensor (via
  // `affects`) while the lamp's own state stayed `lit: true` forever. The
  // world was never actually mutable by the resident, and every
  // `availableWhen` guard that read post-action state was checking a fiction.
  if (affordanceAction.stateChange) {
    affordance.state = { ...affordance.state, ...affordanceAction.stateChange };
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
