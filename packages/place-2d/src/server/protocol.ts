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

// --- Server → Client messages (re-exported from shared) ---

export type {
  PublicAffordanceState,
  PublicRoomState,
  PublicPlaceState,
  ServerMessage,
} from "../shared/protocol-types.js";
