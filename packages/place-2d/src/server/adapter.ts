import type {
  ActionResult,
  Affordance,
  GuestId,
  Place,
  PlaceAdapter,
  ResidentAction,
  Room,
  RoomId,
  RuntimeInterface,
} from "@hauntjs/core";
import {
  addAffordance,
  addRoom,
  connectRooms,
  createPlace,
  getAffordance,
  getGuestsInRoom,
  updateAffordanceState,
} from "@hauntjs/core";
import type { PublicAffordanceState, PublicPlaceState, PublicRoomState } from "./protocol.js";
import { getStateUpdate } from "./state-updates.js";
import { Place2DServer } from "./websocket.js";

export interface Place2DConfig {
  id: string;
  name: string;
  rooms: Room[];
  affordances: Affordance[];
  entryRoom: RoomId;
  residentStartRoom: RoomId;
  port?: number;
}

export class Place2DAdapter implements PlaceAdapter {
  readonly name = "place-2d";
  private config: Place2DConfig;
  private server: Place2DServer | null = null;
  private runtime: RuntimeInterface | null = null;

  constructor(config: Place2DConfig) {
    this.config = config;
  }

  async mount(): Promise<Place> {
    const place = createPlace({
      id: this.config.id,
      name: this.config.name,
    });

    // Add rooms
    for (const room of this.config.rooms) {
      addRoom(place, {
        id: room.id,
        name: room.name,
        description: room.description,
        state: room.state,
      });
    }

    // Connect rooms based on connectedTo
    const connected = new Set<string>();
    for (const room of this.config.rooms) {
      for (const otherId of room.connectedTo) {
        const key = [room.id, otherId].sort().join("-");
        if (!connected.has(key)) {
          connectRooms(place, room.id, otherId);
          connected.add(key);
        }
      }
    }

    // Add affordances
    for (const affordance of this.config.affordances) {
      addAffordance(place, affordance.roomId, affordance);
    }

    return place;
  }

  async start(runtime: RuntimeInterface): Promise<void> {
    this.runtime = runtime;
    this.server = new Place2DServer({
      port: this.config.port ?? 3002,
      runtime,
      entryRoom: this.config.entryRoom,
      buildPlaceState: (guestId, currentRoom) => this.buildPublicState(guestId, currentRoom),
    });
    await this.server.start();
  }

  async stop(): Promise<void> {
    if (this.server) {
      await this.server.stop();
      this.server = null;
    }
  }

  async applyAction(action: ResidentAction, place: Place): Promise<ActionResult> {
    if (!this.server || !this.runtime) {
      return { success: false, error: "Adapter not started" };
    }

    switch (action.type) {
      case "speak": {
        const roomId = action.roomId ?? this.runtime.resident.currentRoom;
        const audience =
          action.audience === "all"
            ? getGuestsInRoom(place, roomId).map((g) => g.id)
            : action.audience;

        this.server.broadcastToRoom(roomId, {
          type: "resident.spoke",
          text: action.text,
          roomId: roomId as string,
        });

        return {
          success: true,
          event: {
            type: "resident.spoke",
            roomId,
            text: action.text,
            audience,
            at: new Date(),
          },
        };
      }

      case "move": {
        const from = this.runtime.resident.currentRoom;
        this.server.broadcastToRoom(from, {
          type: "resident.moved",
          from: from as string,
          to: action.toRoom as string,
        });
        this.server.broadcastToRoom(action.toRoom, {
          type: "resident.moved",
          from: from as string,
          to: action.toRoom as string,
        });

        return {
          success: true,
          event: {
            type: "resident.moved",
            from,
            to: action.toRoom,
            at: new Date(),
          },
        };
      }

      case "act": {
        const affordance = getAffordance(place, action.affordanceId);
        if (!affordance) {
          return { success: false, error: `Affordance "${action.affordanceId}" not found` };
        }

        const affordanceAction = affordance.actions.find((a) => a.id === action.actionId);
        if (!affordanceAction) {
          return { success: false, error: `Action "${action.actionId}" not found` };
        }

        if (affordanceAction.availableWhen && !affordanceAction.availableWhen(affordance.state)) {
          return { success: false, error: `Action "${action.actionId}" not available` };
        }

        // Apply state changes based on the action
        const stateUpdate = getStateUpdate(action.actionId, affordanceAction);
        if (stateUpdate) {
          const { newState } = updateAffordanceState(
            place,
            affordance.roomId,
            affordance.id,
            stateUpdate,
          );

          this.server.broadcastToRoom(affordance.roomId, {
            type: "affordance.changed",
            affordanceId: affordance.id as string,
            roomId: affordance.roomId as string,
            newState,
          });
        }

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

      case "note":
      case "wait":
        return { success: true };

      default:
        return { success: false, error: "Unknown action type" };
    }
  }

  getServer(): Place2DServer | null {
    return this.server;
  }

  private buildPublicState(_guestId: GuestId, currentRoom: RoomId | null): PublicPlaceState {
    const place = this.runtime!.place;
    const rooms: PublicRoomState[] = [];

    for (const room of place.rooms.values()) {
      const affordances: PublicAffordanceState[] = [];
      for (const aff of room.affordances.values()) {
        affordances.push({
          id: aff.id as string,
          roomId: aff.roomId as string,
          kind: aff.kind,
          name: aff.name,
          description: aff.description,
          state: aff.state,
          actions: aff.actions.map((a) => ({
            id: a.id,
            name: a.name,
            description: a.description,
            available: a.availableWhen ? a.availableWhen(aff.state) : true,
          })),
        });
      }

      const guests = getGuestsInRoom(place, room.id).map((g) => ({
        id: g.id as string,
        name: g.name,
      }));

      rooms.push({
        id: room.id as string,
        name: room.name,
        description: room.description,
        connectedTo: room.connectedTo.map((r) => r as string),
        affordances,
        guests,
      });
    }

    return {
      id: place.id,
      name: place.name,
      rooms,
      currentRoom: currentRoom as string | null,
      residentRoom:
        this.runtime!.resident.presenceMode === "host"
          ? ((currentRoom as string) ?? (this.runtime!.resident.currentRoom as string))
          : (this.runtime!.resident.currentRoom as string),
    };
  }
}
