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

export const ApproachMessage = z.object({
  type: z.literal("approach"),
  affordanceId: z.string().min(1),
});

export const SpectateMessage = z.object({
  type: z.literal("spectate"),
});

export const ClientMessage = z.discriminatedUnion("type", [
  JoinMessage,
  MoveMessage,
  SpeakMessage,
  InteractMessage,
  ApproachMessage,
  SpectateMessage,
]);

export type ClientMessage = z.infer<typeof ClientMessage>;

// --- Server → Client messages (re-exported from shared) ---

export type {
  PublicAffordanceState,
  PublicPlaceState,
  PublicRoomState,
  ServerMessage,
  TelemetrySnapshot,
} from "../shared/protocol-types.js";
