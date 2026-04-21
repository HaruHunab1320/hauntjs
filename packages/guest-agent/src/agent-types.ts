import type { RoomId } from "@hauntjs/core";
import type { Being } from "@embersjs/core";

export interface GuestAgentConfig {
  id: string;
  name: string;
  /** Character background and personality. */
  systemPrompt: string;
  /** What the guest is trying to achieve. */
  goal: string;
  /** How the guest approaches their goal. */
  strategy: string;
  /** Room to start in. */
  startRoom: RoomId;
  /** Minimum ms between actions. Default: 5000. */
  actionCooldownMs?: number;
  /** Which event types trigger deliberation. */
  deliberationEvents?: Set<string>;
  /** Optional Embers Being for inner life. */
  being?: Being;
}

export type GuestAgentState = "idle" | "thinking" | "acting" | "cooldown";

export type GuestAction =
  | { type: "move"; toRoom: string }
  | { type: "speak"; text: string }
  | { type: "wait" };
