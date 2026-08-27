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
  embersEndIntention,
  embersExpireAttempts,
  embersIntegrate,
  embersMetabolize,
  embersRecordAction,
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
  /**
   * The being's clock, in milliseconds of *its* experienced time.
   *
   * Drive drift, practice recency and wear are all specified per in-world hour,
   * so a place whose clock runs faster than real time must say so. Otherwise
   * the being ages in wall-clock milliseconds while everything around it
   * advances on the compressed clock, and drives that should decay over a
   * simulated day move by minutes' worth instead.
   *
   * Defaults to `Date.now`, which is correct only for a place running in real
   * time. With a `TimeSystem`:
   *
   * ```ts
   * clock: () => timeSystem.time.elapsedRealMs
   *   * (3_600_000 / timeSystem.time.realMsPerInWorldHour)
   * ```
   *
   * Must be monotonic. Only differences between successive calls are used.
   */
  clock?: () => number;
  /**
   * Restore the pre-inversion behavior of deliberating on every tick.
   *
   * Off by default, and leaving it off is the architecture: a quiet tick
   * grants no model call, so unprompted behavior exists only where a drive
   * built up a reason for it. Turning this on buys ambient, unattributable
   * musing at a model call per tick — the mode every recorded observation
   * before 2026-08 was unknowingly running in.
   */
  deliberateOnTicks?: boolean;
}

/**
 * How long an unresolved attempt survives before being dropped, in being-time.
 * Only reached when the evaluator is failing persistently.
 */
const ATTEMPT_TTL_MS = 6 * 3_600_000;

/**
 * The `PresenceEvent` a resident action produces, or `null` for actions that
 * produce none.
 *
 * Two things were wrong here before, and the second was hidden by the first.
 *
 * The event type was computed as `resident.${action.type}`, giving
 * `resident.move`, `resident.speak` and `resident.act` — none of them real
 * event types. Every mapper returned null, so **no resident action was ever
 * integrated back into its inner life**, and no drive satiated by the being's
 * own behavior could be relieved by doing the thing.
 *
 * Fixing the names then exposed the second problem: the events were built bare,
 * as `{ type, at }`. The practice mapper reads `event.audience.length` and
 * `event.text` for speech, so a bare event threw, the whole deliberation was
 * caught, and the resident's utterance was discarded before it reached the
 * place. The being had to be given the event it would actually have received.
 *
 * Building them properly also means practice nominations now carry evidence —
 * the spoken text — which is what the evaluator needs to judge them at all.
 *
 * `note`, `focus` and `wait` produce nothing: they change no shared state.
 */
/**
 * Whether this invocation of an `act` will complete its action, given the
 * world's current progress counter. Effort 1 actions always complete.
 */
function willCompleteAct(
  action: ResidentAction & { type: "act" },
  context: RuntimeContext,
): boolean {
  for (const room of context.place.rooms.values()) {
    const affordance = room.affordances.get(action.affordanceId);
    if (!affordance) continue;
    const actionDef = affordance.actions.find((a) => a.id === action.actionId);
    if (!actionDef) return true; // dispatch will fail loudly; nothing to price
    const effort = Math.max(1, actionDef.effort ?? 1);
    if (effort <= 1) return true;
    const raw = affordance.state[`~progress:${action.actionId}`];
    const done = typeof raw === "number" ? raw : 0;
    return done + 1 >= effort;
  }
  return true;
}

function ownActionEvent(action: ResidentAction, context: RuntimeContext): PresenceEvent | null {
  const at = new Date();
  switch (action.type) {
    case "speak":
      return {
        type: "resident.spoke",
        roomId: action.roomId ?? context.resident.focusRoom ?? context.resident.currentRoom,
        text: action.text,
        // "all" means whoever is actually here. This is the resident's own
        // action, so its audience is a fact about what it did, not a perception.
        audience:
          action.audience === "all" ? context.guestsInRoom.map((g) => g.id) : action.audience,
        at,
      };
    case "move":
      return {
        type: "resident.moved",
        from: context.resident.currentRoom,
        to: action.toRoom,
        at,
      };
    case "act":
      return {
        type: "resident.acted",
        affordanceId: action.affordanceId,
        actionId: action.actionId,
        at,
      };
    default:
      return null;
  }
}

/**
 * Events that warrant calling the model for deliberation.
 *
 * `tick` is deliberately absent. This is the inversion the live Void run
 * argued for: when quiet ticks grant a free deliberation, the model acts
 * constantly and unattributably, and the intention layer is starved by the
 * thing it was built to enable — the run produced 21 moves and zero
 * surfacings, with restlessness pinned at maximum because relief was free.
 *
 * With ticks silent, the default state of an empty place is silence, and
 * every unprompted action has to come through the intention loop — which
 * means every one traces to a drive. Nothing happens "because it was tick
 * 33". Expression pursuits reopen the model call deliberately (see below),
 * so even speech into the void has a reason.
 */
const DELIBERATION_EVENTS = new Set([
  "guest.entered",
  "guest.left",
  "guest.spoke",
  "guest.moved",
  "guest.approached",
  "affordance.changed",
]);

export class Resident implements ResidentMind {
  readonly character: CharacterDefinition;
  private model: ModelProvider;
  private memory: SqliteMemoryStore;
  private log: Logger;
  private busy = false;
  /**
   * The being's clock.
   *
   * Defaults to wall time, which is right only when the place runs in real
   * time. A place with compressed time — five real minutes to the in-world
   * hour — must supply its own, or the being ages at a twelfth of the rate
   * everything around it does and its drives barely move. See `ResidentOptions.clock`.
   */
  private readonly clock: () => number;
  private lastTickAt: number;
  private evaluator: ((attempt: PracticeAttempt) => Promise<PracticeAttemptResult>) | null;
  private intentions: IntentionLoop | null;
  private readonly deliberateOnTicks: boolean;

  constructor(options: ResidentOptions) {
    this.character = options.character;
    this.model = options.model;
    this.memory = options.memory;
    this.log = options.logger ?? createLogger("Resident");
    this.clock = options.clock ?? (() => Date.now());
    this.lastTickAt = this.clock();
    this.deliberateOnTicks = options.deliberateOnTicks ?? false;

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
      const now = this.clock();
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
        if (pursued.length > 0) {
          // The being has to experience what it just did. `deliberate` does this
          // for actions the model chose, and returning early here skips it — so
          // a drive relieved by movement would watch itself move and feel
          // nothing, pursuing relief forever and never arriving at it.
          this.integrateOwnActions(being, pursued, context);
          return pursued.length === 1 ? pursued[0]! : pursued;
        }
      }
    }

    // Decide whether this event warrants deliberation (a model call).
    //
    // An expression pursuit reopens the gate on ticks: the pursuit of a voice
    // is enacted *by* deliberating, and the resulting speech discharges it.
    // That keeps the accounting intact — the model call itself was wanted, by
    // a drive, for a reason that is in the log.
    const expression = being && this.intentions ? this.intentions.pendingExpression(being) : null;
    const warranted =
      DELIBERATION_EVENTS.has(event.type) ||
      (event.type === "tick" && (this.deliberateOnTicks || expression !== null));
    if (!warranted) return null;

    // Backpressure
    if (this.busy) return null;

    this.busy = true;
    try {
      const result = await this.deliberate(event, perceptions, context);
      if (being && expression) {
        const actions = result == null ? [] : Array.isArray(result) ? result : [result];
        if (actions.some((a) => a.type === "speak")) {
          // It found its voice. One pursuit, one utterance — wanting to speak
          // again is a fresh surfacing, paced by the satisfied cooldown.
          embersEndIntention(being, expression.id, { kind: "satisfied" });
        } else {
          // Given the floor and said nothing. Recorded as an attempt so a
          // resident that will not speak lapses at the cap instead of holding
          // the slot forever.
          embersRecordAction(being, expression.id);
        }
      }
      return result;
    } catch (err) {
      // The stack matters more than the message here. A deliberation failure is
      // swallowed so the run continues, which means this log line is the only
      // trace of it — "Cannot read properties of undefined" with no frame is
      // not something anyone can act on.
      this.log.error(
        "deliberation failed:",
        err instanceof Error ? (err.stack ?? err.message) : err,
      );
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
        progress: pursuit.progress,
        effort: pursuit.effort,
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
    if (being) this.integrateOwnActions(being, actions, context);

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
   * Feeds the resident's own actions back into its inner life.
   *
   * Without this an action is something the being watches itself do without
   * experiencing — the drive that motivated it never eases, so it keeps
   * pursuing relief it has already earned.
   */
  private integrateOwnActions(
    being: Being,
    actions: readonly ResidentAction[],
    context: RuntimeContext,
  ): void {
    for (const action of actions) {
      // Relief lands at completion. A partial invocation of effortful work is
      // real and world-visible, but it is not the work *done* — and if it
      // integrated like a finished act, every work step would draw the full
      // wage: the first run of this did exactly that, six half-hours of suite
      // preparation each paying +0.5, the drive satiated by step two and the
      // pursuit expired mid-task. Working is not the same as having worked.
      if (action.type === "act" && !willCompleteAct(action, context)) continue;
      const event = ownActionEvent(action, context);
      if (event) embersIntegrate(being, event);
    }
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
