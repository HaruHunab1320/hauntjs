import type {
  CharacterDefinition,
  GuestId,
  Logger,
  Perception,
  PresenceEvent,
  ResidentAction,
  ResidentMind,
  RuntimeContext,
} from "@hauntjs/core";
import { createLogger } from "@hauntjs/core";
import { parseAllDecisions } from "./decision.js";
import type { Being, InnerSituation, PracticeAttempt, PracticeAttemptResult } from "./embers.js";
import {
  embersAvailableCapabilities,
  embersCurrentIntentions,
  embersExpireAttempts,
  embersIntegrate,
  embersMetabolize,
  embersResolveAttempts,
  embersTickBeing,
  embersUrgency,
  embersWeightPerceptions,
} from "./embers.js";
import { IntentionLoop, type IntentionLoopOptions } from "./intention-loop.js";
import type { SqliteMemoryStore } from "./memory/store.js";
import type { ModelProvider } from "./model/types.js";
import { createPracticeEvaluator } from "./practice-evaluator.js";
import { buildPrompt, type PursuitForPrompt } from "./prompt.js";

export interface ResidentOptions {
  character: CharacterDefinition;
  logger?: Logger;
  model: ModelProvider;
  memory: SqliteMemoryStore;
  /**
   * Judges whether nominated practice attempts were genuine acts. Defaults to
   * the built-in evaluator over `model`.
   *
   * Pass `false` to disable cultivation entirely — practice depth then stays
   * at whatever the character config seeded. Useful for cheap runs where inner
   * life is not the object of study.
   */
  practiceEvaluator?: ((attempt: PracticeAttempt) => Promise<PracticeAttemptResult>) | false;
  /**
   * Configures the intention loop — the path by which the resident acts
   * unprompted.
   *
   * Pass `false` to disable it. A resident without one still perceives,
   * deliberates and cultivates; it simply never initiates, which is the v0.2
   * behavior.
   */
  intentions?: Partial<Omit<IntentionLoopOptions, "model">> | false;
}

/**
 * How long an unresolved attempt survives before being dropped, in being-time.
 * Only reached when the evaluator is failing persistently.
 */
const ATTEMPT_TTL_MS = 6 * 3_600_000;

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
  private log: Logger;
  private busy = false;
  private lastTickAt = Date.now();
  private evaluator: ((attempt: PracticeAttempt) => Promise<PracticeAttemptResult>) | null;
  private intentions: IntentionLoop | null;

  constructor(options: ResidentOptions) {
    this.character = options.character;
    this.model = options.model;
    this.memory = options.memory;
    this.log = options.logger ?? createLogger("Resident");

    if (options.practiceEvaluator === false) {
      this.evaluator = null;
    } else {
      this.evaluator =
        options.practiceEvaluator ??
        createPracticeEvaluator({ model: options.model, logger: this.log });
    }

    this.intentions =
      options.intentions === false
        ? null
        : new IntentionLoop({ model: options.model, logger: this.log, ...options.intentions });
  }

  async perceive(
    event: PresenceEvent,
    perceptions: Perception[],
    context: RuntimeContext,
  ): Promise<ResidentAction | ResidentAction[] | null> {
    // ALWAYS perceive: add every event to working memory regardless
    this.memory.addToWorkingMemory(event);

    // Update inner life if a Being is present
    const being = context.resident.being as Being | undefined;
    if (being) {
      const now = Date.now();
      const dtMs = now - this.lastTickAt;
      this.lastTickAt = now;

      embersTickBeing(being, dtMs);
      const result = embersIntegrate(being, event);
      if (result.driveChanges.length > 0 || result.pendingAttemptIds.length > 0) {
        this.log.debug("inner life updated:", {
          drives: result.driveChanges.length,
          attempts: result.pendingAttemptIds.length,
        });
      }

      // Adjudicate the nominated practice attempts. Without this, depth never
      // moves off whatever the character config seeded.
      await this.cultivate(being);

      // Advance the intention loop. This is the only path by which the resident
      // does something nobody asked for, so it runs before the deliberation
      // gate below — an unprompted action must not depend on an event having
      // arrived that warrants a model call.
      if (this.intentions) {
        const pursued = await this.intentions.run(being, context, event, perceptions);
        if (pursued.length > 0) return pursued.length === 1 ? pursued[0]! : pursued;
      }
    }

    // Decide whether this event warrants deliberation (a model call)
    if (!DELIBERATION_EVENTS.has(event.type)) return null;

    // Backpressure
    if (this.busy) return null;

    this.busy = true;
    try {
      return await this.deliberate(event, perceptions, context);
    } catch (err) {
      this.log.error("model error:", err instanceof Error ? err.message : err);
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
    const being = context.resident.being as Being | undefined;

    // Get inner situation from Embers if available
    let situation: InnerSituation | null = null;
    let pursuits: PursuitForPrompt[] = [];
    let activePerceptions = perceptions;

    if (being) {
      situation = embersMetabolize(being);
      // What it is already in the middle of. Suppression is control flow, but
      // when the resident does speak it should not answer as though it had been
      // sitting idle.
      pursuits = embersCurrentIntentions(being).map((pursuit) => ({
        aim: pursuit.aim,
        urgency: embersUrgency(being, pursuit),
      }));
      this.log.debug(
        `inner state: ${situation.orientation} — "${situation.felt?.slice(0, 80) ?? ""}"`,
      );

      // Weight perceptions by drive pressures
      const weighted = embersWeightPerceptions(being, perceptions);
      if (weighted.length > 0) {
        // Sort by weight descending, map back to perceptions by index
        const sortedIndices = weighted
          .map((w, i) => ({ weight: w.weight, index: i }))
          .sort((a, b) => b.weight - a.weight);
        activePerceptions = sortedIndices.map((s) => perceptions[s.index]);
      }

      // Gate memory access based on capabilities
      const caps = embersAvailableCapabilities(being);
      const capIds = new Set(caps.map((c) => c.id));
      if (!capIds.has("episodicMemory")) {
        // Episodic memory gated — skip place memory recall
        this.log.debug("episodic memory gated — skipping place memories");
      }
    }

    // Recall memories (gated by capabilities)
    const placeMemories =
      being && !embersAvailableCapabilities(being).some((c) => c.id === "episodicMemory")
        ? []
        : await this.memory.recall({ limit: 5 });

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
      activePerceptions,
      placeMemories.map((r) => ({
        content: r.content,
        tags: r.tags,
        createdAt: r.createdAt,
        importance: r.importance,
      })),
      guestMemories,
      situation ? { ...situation, pursuits } : null,
    );

    const response = await this.model.chat(request);
    const actions = parseAllDecisions(response);

    if (actions.length === 0) return null;

    // Integrate resident actions back into Embers
    if (being) {
      for (const action of actions) {
        embersIntegrate(being, {
          type: `resident.${action.type}` as PresenceEvent["type"],
          at: new Date(),
        } as PresenceEvent);
      }
    }

    for (const action of actions) {
      if (action.type === "note") {
        await this.persistNote(action);
      }
    }

    const speakAction = actions.find(
      (a): a is ResidentAction & { type: "speak" } => a.type === "speak",
    );
    if (event.type === "guest.spoke" && speakAction) {
      await this.autoRememberConversation(event.guestId, event.text, speakAction.text, context);
    }

    return actions.length === 1 ? actions[0] : actions;
  }

  /**
   * Drain pending practice attempts through the evaluator.
   *
   * Skipped entirely when no evaluator is configured — a resident without one
   * keeps its seeded depth and grows no further, which is the honest outcome
   * given that nothing is judging its practice.
   */
  private async cultivate(being: Being): Promise<void> {
    if (!this.evaluator) return;

    const { resolutions, failures } = await embersResolveAttempts(being, this.evaluator);

    const credited = resolutions.filter((r) => r.accepted);
    if (credited.length > 0) {
      this.log.debug(
        `practice credited: ${credited.map((r) => `${r.practiceId} ${r.depthBefore.toFixed(2)}→${r.depthAfter.toFixed(2)}`).join(", ")}`,
      );
    }
    if (failures.length > 0) {
      this.log.debug(`practice evaluation failures: ${failures.length} (left pending for retry)`);
      // Attempts a persistently-failing evaluator can never resolve would
      // otherwise accumulate for the length of the run.
      embersExpireAttempts(being, ATTEMPT_TTL_MS);
    }
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
