import type { GuestId, RoomId, RuntimeInterface } from "@hauntjs/core";
import { addGuest, affordanceId, applySensorEffects, guestId, moveGuest, roomId } from "@hauntjs/core";
import { WebSocket, WebSocketServer } from "ws";
import type { PublicPlaceState, ServerMessage } from "./protocol.js";
import { ClientMessage } from "./protocol.js";
import { getStateUpdate } from "./state-updates.js";

interface GuestSession {
  ws: WebSocket;
  guestId: GuestId;
  guestName: string;
  currentRoom: RoomId | null;
}

export interface Place2DServerOptions {
  port: number;
  runtime: RuntimeInterface;
  entryRoom: RoomId;
  buildPlaceState: (guestId: GuestId, currentRoom: RoomId | null) => PublicPlaceState;
}

export class Place2DServer {
  private wss: WebSocketServer | null = null;
  private sessions = new Map<WebSocket, GuestSession>();
  private options: Place2DServerOptions;

  constructor(options: Place2DServerOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port: this.options.port }, () => {
        console.log(`Place2D WebSocket server listening on port ${this.options.port}`);
        resolve();
      });

      this.wss.on("connection", (ws) => {
        this.handleConnection(ws);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        // Close all connections
        for (const session of this.sessions.values()) {
          session.ws.close();
        }
        this.sessions.clear();

        this.wss.close(() => {
          this.wss = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  broadcastToRoom(targetRoomId: RoomId, message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const session of this.sessions.values()) {
      if (session.currentRoom === targetRoomId && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(payload);
      }
    }
  }

  broadcastToAll(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const session of this.sessions.values()) {
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(payload);
      }
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private handleConnection(ws: WebSocket): void {
    ws.on("message", async (data) => {
      try {
        const raw = JSON.parse(data.toString()) as unknown;
        const parsed = ClientMessage.safeParse(raw);

        if (!parsed.success) {
          this.send(ws, { type: "error", message: `Invalid message: ${parsed.error.message}` });
          return;
        }

        const msg = parsed.data;
        const session = this.sessions.get(ws);

        if (msg.type === "join") {
          await this.handleJoin(ws, msg.guestName);
        } else if (!session) {
          this.send(ws, { type: "error", message: "Must join first" });
        } else {
          switch (msg.type) {
            case "move":
              await this.handleMove(session, msg.toRoom);
              break;
            case "speak":
              await this.handleSpeak(session, msg.text);
              break;
            case "interact":
              await this.handleInteract(session, msg.affordanceId, msg.actionId, msg.params);
              break;
            case "approach":
              await this.handleApproach(session, msg.affordanceId);
              break;
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        this.send(ws, { type: "error", message });
      }
    });

    ws.on("close", () => {
      this.handleDisconnect(ws);
    });
  }

  private async handleJoin(ws: WebSocket, guestName: string): Promise<void> {
    if (this.sessions.has(ws)) {
      this.send(ws, { type: "error", message: "Already joined" });
      return;
    }

    // Use a stable ID based on the guest name so memory persists across sessions
    const id = guestId(`guest-${guestName.toLowerCase().replace(/\s+/g, "-")}`);
    const entryRoom = this.options.entryRoom;

    // Reuse existing guest if they've been here before, otherwise create
    const existingGuest = this.options.runtime.place.guests.get(id);
    if (existingGuest) {
      // Returning guest — they were here before
      existingGuest.lastSeen = new Date();
    } else {
      addGuest(this.options.runtime.place, {
        id,
        name: guestName,
      });
    }

    const session: GuestSession = {
      ws,
      guestId: id,
      guestName: guestName,
      currentRoom: entryRoom,
    };
    this.sessions.set(ws, session);

    // Notify the joining guest
    this.send(ws, { type: "joined", guestId: id as string, roomId: entryRoom as string });

    // Send initial state
    const state = this.options.buildPlaceState(id, entryRoom);
    this.send(ws, { type: "state", place: state });

    // Emit guest.entered event to the runtime
    await this.options.runtime.emit({
      type: "guest.entered",
      guestId: id,
      roomId: entryRoom,
      at: new Date(),
    });

    // Notify others in the room
    this.broadcastToOthersInRoom(entryRoom, ws, {
      type: "guest.entered",
      guestId: id as string,
      guestName,
      roomId: entryRoom as string,
    });
  }

  private async handleMove(session: GuestSession, toRoomStr: string): Promise<void> {
    if (!session.currentRoom) {
      this.send(session.ws, { type: "error", message: "Not in any room" });
      return;
    }

    const to = roomId(toRoomStr);
    const from = session.currentRoom;

    try {
      moveGuest(this.options.runtime.place, session.guestId, to);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Move failed";
      this.send(session.ws, { type: "error", message });
      return;
    }

    session.currentRoom = to;

    // Notify the moved guest with updated state
    const state = this.options.buildPlaceState(session.guestId, to);
    this.send(session.ws, { type: "state", place: state });

    // Notify others in both rooms
    const moveMsg: ServerMessage = {
      type: "guest.moved",
      guestId: session.guestId as string,
      guestName: session.guestName,
      from: from as string,
      to: to as string,
    };
    this.broadcastToOthersInRoom(from, session.ws, moveMsg);
    this.broadcastToOthersInRoom(to, session.ws, moveMsg);

    // Emit to runtime
    await this.options.runtime.emit({
      type: "guest.moved",
      guestId: session.guestId,
      from,
      to,
      at: new Date(),
    });
  }

  private async handleSpeak(session: GuestSession, text: string): Promise<void> {
    if (!session.currentRoom) {
      this.send(session.ws, { type: "error", message: "Not in any room" });
      return;
    }

    // Broadcast speech to everyone in the room (including speaker)
    this.broadcastToRoom(session.currentRoom, {
      type: "guest.spoke",
      guestId: session.guestId as string,
      guestName: session.guestName,
      roomId: session.currentRoom as string,
      text,
    });

    // Emit to runtime
    await this.options.runtime.emit({
      type: "guest.spoke",
      guestId: session.guestId,
      roomId: session.currentRoom,
      text,
      at: new Date(),
    });
  }

  private async handleInteract(
    session: GuestSession,
    affId: string,
    actionId: string,
    _params?: Record<string, unknown>,
  ): Promise<void> {
    if (!session.currentRoom) {
      this.send(session.ws, { type: "error", message: "Not in any room" });
      return;
    }

    // For now, guests can trigger affordances — the runtime will handle state changes
    // In the future, this could go through the runtime as a guest action
    const aff = this.options.runtime.place.rooms
      .get(session.currentRoom)
      ?.affordances.get(affordanceId(affId));
    if (!aff) {
      this.send(session.ws, {
        type: "error",
        message: `Affordance "${affId}" not found in this room`,
      });
      return;
    }

    const action = aff.actions.find((a) => a.id === actionId);
    if (!action) {
      this.send(session.ws, { type: "error", message: `Action "${actionId}" not found` });
      return;
    }

    if (action.availableWhen && !action.availableWhen(aff.state)) {
      this.send(session.ws, {
        type: "error",
        message: `Action "${actionId}" not available right now`,
      });
      return;
    }

    // Apply sensor effects declared by this action
    if (action.affects) {
      applySensorEffects(action.affects, this.options.runtime.place);
    }

    // Emit affordance change event
    const prevState = { ...aff.state };
    const stateUpdate = getStateUpdate(actionId, action);
    if (stateUpdate) {
      Object.assign(aff.state, stateUpdate);
    }

    await this.options.runtime.emit({
      type: "affordance.changed",
      affordanceId: aff.id,
      roomId: session.currentRoom,
      prevState,
      newState: { ...aff.state },
      at: new Date(),
    });

    // Broadcast the change
    this.broadcastToRoom(session.currentRoom, {
      type: "affordance.changed",
      affordanceId: aff.id as string,
      roomId: session.currentRoom as string,
      newState: { ...aff.state },
    });
  }

  private async handleApproach(session: GuestSession, affId: string): Promise<void> {
    if (!session.currentRoom) return;

    const aff = this.options.runtime.place.rooms
      .get(session.currentRoom)
      ?.affordances.get(affordanceId(affId));
    if (!aff) return;

    await this.options.runtime.emit({
      type: "guest.approached",
      guestId: session.guestId,
      roomId: session.currentRoom,
      affordanceId: aff.id,
      at: new Date(),
    });
  }

  private handleDisconnect(ws: WebSocket): void {
    const session = this.sessions.get(ws);
    if (!session) return;

    const roomId = session.currentRoom;
    this.sessions.delete(ws);

    if (roomId) {
      // Notify others
      this.broadcastToRoom(roomId, {
        type: "guest.left",
        guestId: session.guestId as string,
        guestName: session.guestName,
        roomId: roomId as string,
      });

      // Emit to runtime (fire and forget — the guest is gone)
      this.options.runtime
        .emit({
          type: "guest.left",
          guestId: session.guestId,
          roomId,
          at: new Date(),
        })
        .catch(() => {
          // Guest already disconnected, ignore errors
        });
    }
  }

  private broadcastToOthersInRoom(
    targetRoomId: RoomId,
    excludeWs: WebSocket,
    message: ServerMessage,
  ): void {
    const payload = JSON.stringify(message);
    for (const session of this.sessions.values()) {
      if (
        session.currentRoom === targetRoomId &&
        session.ws !== excludeWs &&
        session.ws.readyState === WebSocket.OPEN
      ) {
        session.ws.send(payload);
      }
    }
  }
}

