// Shared protocol types used by both server and client.
// This file contains only type definitions — no runtime code.

export interface PublicAffordanceState {
  id: string;
  roomId: string;
  kind: string;
  name: string;
  description: string;
  state: Record<string, unknown>;
  actions: Array<{
    id: string;
    name: string;
    description: string;
    available: boolean;
  }>;
}

export interface PublicRoomState {
  id: string;
  name: string;
  description: string;
  connectedTo: string[];
  affordances: PublicAffordanceState[];
  guests: Array<{ id: string; name: string }>;
}

export interface PublicPlaceState {
  id: string;
  name: string;
  rooms: PublicRoomState[];
  currentRoom: string | null;
  residentRoom: string;
}

export type ServerMessage =
  | { type: "state"; place: PublicPlaceState }
  | { type: "joined"; guestId: string; roomId: string }
  | { type: "guest.entered"; guestId: string; guestName: string; roomId: string }
  | { type: "guest.left"; guestId: string; guestName: string; roomId: string }
  | { type: "guest.moved"; guestId: string; guestName: string; from: string; to: string }
  | { type: "guest.spoke"; guestId: string; guestName: string; roomId: string; text: string }
  | { type: "resident.spoke"; text: string; roomId: string }
  | { type: "resident.moved"; from: string; to: string }
  | { type: "affordance.changed"; affordanceId: string; roomId: string; newState: Record<string, unknown> }
  | { type: "error"; message: string };
