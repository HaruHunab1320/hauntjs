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

/**
 * Assembles a complete ChatRequest from character, context, event, perceptions, and memory.
 */
export function buildPrompt(
  character: CharacterDefinition,
  context: RuntimeContext,
  event: PresenceEvent,
  perceptions: Perception[],
  placeMemories: PlaceMemoryEntry[],
  guestMemories: Map<GuestId, GuestMemory>,
): ChatRequest {
  const systemPrompt = buildSystemPrompt(character, context);
  const messages = buildMessages(context, event, perceptions, placeMemories, guestMemories);

  return {
    systemPrompt,
    messages,
    tools: ACTION_TOOLS,
    temperature: 0.7,
    maxTokens: 1024,
  };
}
