import { z } from "zod";

// --- Client → Server messages ---

export const JoinMessage = z.object({
  type: z.literal("join"),
  guestName: z.string().min(1).max(50),
});

export const MoveMessage = z.object({
  type: z.literal("move"),
  toRoom: z.string().min(1),
});

export const SpeakMessage = z.object({
  type: z.literal("speak"),
  text: z.string().min(1).max(2000),
});

export const InteractMessage = z.object({
  type: z.literal("interact"),
  affordanceId: z.string().min(1),
  actionId: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});

export const ClientMessage = z.discriminatedUnion("type", [
  JoinMessage,
  MoveMessage,
  SpeakMessage,
  InteractMessage,
]);

export type ClientMessage = z.infer<typeof ClientMessage>;

// --- Server → Client messages ---

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
