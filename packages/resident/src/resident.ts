import type {
  CharacterDefinition,
  GuestId,
  Perception,
  PresenceEvent,
  ResidentAction,
  ResidentMind,
  RuntimeContext,
} from "@hauntjs/core";
import { parseAllDecisions } from "./decision.js";
import type { SqliteMemoryStore } from "./memory/store.js";
import type { ModelProvider } from "./model/types.js";
import { buildPrompt } from "./prompt.js";

export interface ResidentOptions {
  character: CharacterDefinition;
  model: ModelProvider;
  memory: SqliteMemoryStore;
}

/** Events that warrant calling the model for deliberation. */
const DELIBERATION_EVENTS = new Set([
  "guest.entered",
  "guest.left",
  "guest.spoke",
  "guest.moved",
  "guest.approached",
  "affordance.changed",
  "tick",
]);

export class Resident implements ResidentMind {
  readonly character: CharacterDefinition;
  private model: ModelProvider;
  private memory: SqliteMemoryStore;
  private busy = false;

  constructor(options: ResidentOptions) {
    this.character = options.character;
    this.model = options.model;
    this.memory = options.memory;
  }

  async perceive(
    event: PresenceEvent,
    perceptions: Perception[],
    context: RuntimeContext,
  ): Promise<ResidentAction | ResidentAction[] | null> {
    // ALWAYS perceive: add every event to working memory regardless
    this.memory.addToWorkingMemory(event);

    // Decide whether this event warrants deliberation (a model call)
    if (!DELIBERATION_EVENTS.has(event.type)) return null;

    // Backpressure: if a model call is in flight, the event is still in working
    // memory and will be visible in context on the next deliberation
    if (this.busy) return null;

    this.busy = true;
    try {
      return await this.deliberate(event, perceptions, context);
    } catch (err) {
      console.error("[Resident] model error:", err instanceof Error ? err.message : err);
      return null;
    } finally {
      this.busy = false;
    }
  }

  private async deliberate(
    event: PresenceEvent,
    perceptions: Perception[],
    context: RuntimeContext,
  ): Promise<ResidentAction | ResidentAction[] | null> {
    const placeMemories = await this.memory.recall({ limit: 5 });
    const guestMemories = new Map<
      GuestId,
      NonNullable<ReturnType<typeof this.memory.guestMemory.get>>
    >();
    for (const guest of context.guestsInRoom) {
      const mem = this.memory.guestMemory.get(guest.id);
      if (mem) guestMemories.set(guest.id, mem);
    }

    const request = buildPrompt(
      this.character,
      context,
      event,
      perceptions,
      placeMemories.map((r) => ({
        content: r.content,
        tags: r.tags,
        createdAt: r.createdAt,
        importance: r.importance,
      })),
      guestMemories,
    );

    const response = await this.model.chat(request);
    const actions = parseAllDecisions(response);

    if (actions.length === 0) return null;

    for (const action of actions) {
      if (action.type === "note") {
        await this.persistNote(action);
      }
    }

    // Auto-persist conversation context
    const speakAction = actions.find(
      (a): a is ResidentAction & { type: "speak" } => a.type === "speak",
    );
    if (event.type === "guest.spoke" && speakAction) {
      await this.autoRememberConversation(event.guestId, event.text, speakAction.text, context);
    }

    return actions.length === 1 ? actions[0] : actions;
  }

  private async persistNote(action: ResidentAction & { type: "note" }): Promise<void> {
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

  private async autoRememberConversation(
    id: GuestId,
    guestText: string,
    residentText: string,
    context: RuntimeContext,
  ): Promise<void> {
    const guest = context.place.guests.get(id);
    const name = guest?.name ?? id;

    const existing = this.memory.guestMemory.get(id);
    const prevExchanges = existing?.facts["recent_conversation"] ?? "";

    const newExchange = `${name}: ${guestText.slice(0, 100)}\n${this.character.name}: ${residentText.slice(0, 100)}`;
    const exchanges = prevExchanges
      ? prevExchanges.split("\n---\n").slice(-2).concat(newExchange).join("\n---\n")
      : newExchange;

    await this.memory.updateGuest(id, {
      facts: {
        recent_conversation: exchanges,
        last_topic: guestText.slice(0, 200),
      },
    });
  }
}
