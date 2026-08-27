import type {
  CharacterDefinition,
  GuestId,
  GuestMemory,
  Perception,
  PlaceMemoryEntry,
  PresenceEvent,
  RuntimeContext,
} from "@hauntjs/core";
import type { ChatRequest } from "./model/types.js";
import { buildMessages } from "./prompt/messages.js";
import { buildSystemPrompt } from "./prompt/system-prompt.js";
import { ACTION_TOOLS } from "./prompt/tools.js";

export { ACTION_TOOLS } from "./prompt/tools.js";

/** Something the resident is currently doing, for the prompt. */
export interface PursuitForPrompt {
  aim: string;
  urgency: number;
  /** Work steps done, for pursuits that take time. */
  progress?: number;
  /** Work steps required. Absent or 1 means a single act completes it. */
  effort?: number;
}

/** The inner situation from Embers, if available. */
export interface InnerSituationForPrompt {
  /**
   * Optional because Embers v0.2 made felt prose opt-in — the structured
   * inner architecture is the deliverable. Haunt asks for prose via
   * `feltMode: "prose"`, but a custom voice module may decline to produce it,
   * so the prompt has to render without it.
   */
  felt?: string;
  orientation: string;
  /**
   * What the resident is in the middle of, most urgent first.
   *
   * The resident acts on these through the intention loop whether or not they
   * appear here — suppression is control flow, not prose. This exists so that
   * when it *does* speak, it knows what it is already doing, rather than
   * answering as though it had been idle.
   */
  pursuits?: readonly PursuitForPrompt[];
}

/**
 * Assembles a complete ChatRequest from character, context, event, perceptions, memory,
 * and optional inner situation from Embers.
 */
export function buildPrompt(
  character: CharacterDefinition,
  context: RuntimeContext,
  event: PresenceEvent,
  perceptions: Perception[],
  placeMemories: PlaceMemoryEntry[],
  guestMemories: Map<GuestId, GuestMemory>,
  situation?: InnerSituationForPrompt | null,
): ChatRequest {
  const systemPrompt = buildSystemPrompt(character, context, situation);
  const messages = buildMessages(context, event, perceptions, placeMemories, guestMemories);

  return {
    systemPrompt,
    messages,
    tools: ACTION_TOOLS,
    temperature: 0.7,
  };
}
