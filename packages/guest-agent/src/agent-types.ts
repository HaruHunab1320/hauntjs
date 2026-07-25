import type { Being, PracticeAttempt, PracticeAttemptResult } from "@embersjs/core";
import type { RoomId } from "@hauntjs/core";

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
  /**
   * Judges whether nominated practice attempts were genuine acts. Defaults to
   * the built-in evaluator over the agent's model.
   *
   * Pass `false` to disable cultivation — practice depth then stays at
   * whatever the config seeded. Worth doing for large casts where the
   * per-attempt evaluator calls would dominate the run's cost.
   */
  practiceEvaluator?: ((attempt: PracticeAttempt) => Promise<PracticeAttemptResult>) | false;
}

export type GuestAgentState = "idle" | "thinking" | "acting" | "cooldown";

export type GuestAction =
  | { type: "move"; toRoom: string }
  | { type: "speak"; text: string }
  | { type: "wait" };
