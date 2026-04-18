import type {
  CharacterDefinition,
  PresenceEvent,
  ResidentAction,
  RuntimeContext,
  ResidentInterface,
  GuestId,
} from "@hauntjs/core";
import type { ModelProvider } from "./model/types.js";
import type { SqliteMemoryStore } from "./memory/store.js";
import { buildPrompt } from "./prompt.js";
import { parseDecision } from "./decision.js";

export interface ResidentOptions {
  character: CharacterDefinition;
  model: ModelProvider;
  memory: SqliteMemoryStore;
}

export class Resident implements ResidentInterface {
  readonly character: CharacterDefinition;
  private model: ModelProvider;
  private memory: SqliteMemoryStore;

  constructor(options: ResidentOptions) {
    this.character = options.character;
    this.model = options.model;
    this.memory = options.memory;
  }

  async perceive(
    event: PresenceEvent,
    context: RuntimeContext,
  ): Promise<ResidentAction | null> {
    // Add event to working memory
    this.memory.addToWorkingMemory(event);

    // Recall relevant memories
    const placeMemories = await this.memory.recall({ limit: 5 });
    const guestMemories = new Map<GuestId, NonNullable<ReturnType<typeof this.memory.guestMemory.get>>>();
    for (const guest of context.guestsInRoom) {
      const mem = this.memory.guestMemory.get(guest.id);
      if (mem) guestMemories.set(guest.id, mem);
    }

    // Build prompt
    const request = buildPrompt(
      this.character,
      context,
      event,
      placeMemories.map((r) => ({
        content: r.content,
        tags: r.tags,
        createdAt: r.createdAt,
        importance: r.importance,
      })),
      guestMemories,
    );

    // Call model
    const response = await this.model.chat(request);

    // Parse decision
    const action = parseDecision(response);

    // If the action is a note, persist it
    if (action?.type === "note") {
      if (action.about === "self") {
        await this.memory.remember({
          content: action.content,
          tags: ["self"],
          createdAt: new Date(),
          importance: 0.5,
        });
      } else {
        await this.memory.updateGuest(action.about, {
          facts: { note: action.content },
        });
      }
    }

    return action;
  }
}
