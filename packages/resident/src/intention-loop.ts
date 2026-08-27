/**
 * The intention loop — where a pressure becomes something the resident does.
 *
 * Embers reports which pressures are *eligible* to surface. It cannot know
 * whether the thing that would satisfy one is reachable right now, or whether
 * the place is quiet enough to notice anything, because both depend on a world
 * it has no access to. This module supplies those triggers, authors the aim,
 * adjudicates, and turns a committed pursuit into a real `ResidentAction`.
 *
 * Two filters run here, and they reject for different reasons:
 *
 *   1. Most eligible pressure never surfaces. A satisfier that cannot be acted
 *      on is not something the resident can notice wanting.
 *   2. Most of what surfaces is declined. The model is asked whether this is
 *      worth doing *now*, and told to default to no.
 *
 * A resident whose every pressure both surfaces and commits has no interior —
 * everything it feels immediately becomes something it is doing.
 */

import type {
  Affordance,
  Perception,
  PresenceEvent,
  ResidentAction,
  RuntimeContext,
} from "@hauntjs/core";
import { affordanceId, createLogger, type Logger, perceivePresence, roomId } from "@hauntjs/core";
import type { Being, Intention, Satisfier, SurfacedCandidate, SurfacingTrigger } from "./embers.js";
import {
  embersCommit,
  embersCurrentIntentions,
  embersDecline,
  embersEligibleToSurface,
  embersEndIntention,
  embersExpirePursuits,
  embersRecordAction,
  embersRecordProgress,
  embersSurface,
} from "./embers.js";
import type { ModelProvider } from "./model/types.js";

// ---------------------------------------------------------------------------
// Satisfier resolution — where a pursuit becomes a thing that happens in a room
// ---------------------------------------------------------------------------

/**
 * Turns an opaque satisfier token into an action the resident can take, or
 * `null` when it cannot be acted on right now.
 *
 * Returning `null` is the reachability test as well as the resolution: a
 * satisfier that will not resolve is not something to go and want.
 *
 * Supported kinds:
 * - `affordance` — `ref` is an affordance id, `params.actionId` the action.
 *   Resolves only when the affordance is somewhere the resident can act and the
 *   action's `availableWhen` guard passes.
 * - `movement` — `ref` is a room id the resident can reach.
 * - `expression` — returns `null` here on purpose. Speaking needs words, and
 *   words need a model call, so an expression pursuit is enacted by granting a
 *   deliberation rather than by a canned action. See {@link IntentionLoop.pendingExpression}.
 */
export function resolveSatisfier(
  satisfier: Satisfier,
  context: RuntimeContext,
): ResidentAction | null {
  switch (satisfier.kind) {
    case "affordance":
      return resolveAffordance(satisfier, context);
    case "movement":
      return resolveMovement(satisfier, context);
    default:
      return null;
  }
}

function resolveAffordance(satisfier: Satisfier, context: RuntimeContext): ResidentAction | null {
  const id = affordanceId(satisfier.ref);

  let found: Affordance | undefined;
  let foundRoom: string | undefined;
  for (const room of context.place.rooms.values()) {
    const affordance = room.affordances.get(id);
    if (affordance) {
      found = affordance;
      foundRoom = room.id;
      break;
    }
  }
  if (!found || !foundRoom) return null;

  // An inhabitant has to be in the room. A host acts anywhere it can perceive.
  if (
    context.resident.presenceMode === "inhabitant" &&
    foundRoom !== context.resident.currentRoom
  ) {
    return null;
  }

  const actionId =
    typeof satisfier.params?.actionId === "string" ? satisfier.params.actionId : null;
  const action = actionId
    ? found.actions.find((a) => a.id === actionId)
    : // No action named — take the first currently-available one.
      found.actions.find((a) => (a.availableWhen ? a.availableWhen(found.state) : true));
  if (!action) return null;

  // A fire already lit is not something to go and light.
  if (action.availableWhen && !action.availableWhen(found.state)) return null;

  return { type: "act", affordanceId: id, actionId: action.id };
}

function resolveMovement(satisfier: Satisfier, context: RuntimeContext): ResidentAction | null {
  const target = roomId(satisfier.ref);
  if (!context.place.rooms.has(target)) return null;

  // Where the resident effectively *is*. A host never changes `currentRoom` —
  // moving shifts `focusRoom` — so comparing against `currentRoom` would leave
  // the satisfier resolving forever, and the resident pursuing a room it is
  // already attending to until the attempt cap put it out of its misery.
  const here =
    context.resident.presenceMode === "host"
      ? (context.resident.focusRoom ?? context.resident.currentRoom)
      : context.resident.currentRoom;

  if (here === target) return null;

  // An inhabitant has to walk, so the room must actually be reachable.
  if (context.resident.presenceMode !== "host") {
    const room = context.place.rooms.get(context.resident.currentRoom);
    if (room && !room.connectedTo.includes(target)) return null;
  }

  return { type: "move", toRoom: target };
}

// ---------------------------------------------------------------------------
// Surfacing triggers
// ---------------------------------------------------------------------------

/**
 * Whether the place is quiet enough for something to surface unbidden.
 *
 * Quiet means a tick with nobody sensed present — not merely a tick, since a
 * resident sitting with a guest is not undisturbed. Uses `perceivePresence`
 * rather than the guest roster, so a resident that cannot see the room does not
 * get to conclude it is empty.
 */
function isQuiet(event: PresenceEvent, context: RuntimeContext): boolean {
  if (event.type !== "tick") return false;
  const view = perceivePresence(context.place, context.resident.currentRoom);
  return view.guests.length === 0;
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

export interface IntentionLoopOptions {
  model: ModelProvider;
  logger?: Logger;
  /**
   * Pressure above which a satisfier that is merely reachable does not need a
   * coincidence or a quiet moment to surface. The floor that stops a severe
   * unmet need from waiting forever for the right moment.
   */
  urgentThreshold?: number;
}

/** What the surfacing call has to answer. */
interface SurfacingVerdict {
  aim: string;
  worthPursuing: boolean;
  reason: string;
}

const SURFACING_SYSTEM_PROMPT = `You give words to something a place's resident finds itself wanting, and judge whether it is worth doing now.

You will be told: an unmet need, the thing that would ease it, and what is happening.

Two jobs.

1. "aim" — what the resident takes itself to want, in its own voice. One short phrase, under ten words. Concrete and about this moment, not a restatement of the need. "tend the fire before it dies", not "satisfy connection".

2. "worthPursuing" — whether to take it up right now. **Default to false.** A resident that acts on every impulse is not motivated, it is restless. Say true only when the moment genuinely suits it: nothing more pressing is happening, and doing this now would be natural rather than abrupt.

Respond with JSON only, in exactly this field order:
{"worthPursuing": <true|false>, "aim": "<under 10 words>", "reason": "<under 12 words>"}

Keep it short. A response cut off mid-sentence cannot be read.`;

export class IntentionLoop {
  private readonly log: Logger;
  private readonly urgentThreshold: number;

  constructor(private readonly options: IntentionLoopOptions) {
    this.log = options.logger ?? createLogger("Intentions");
    this.urgentThreshold = options.urgentThreshold ?? 0.6;
  }

  /**
   * Advances the loop by one perception.
   *
   * Returns actions to take toward a committed pursuit — usually empty. Safe to
   * call every tick; the expensive path is gated behind a surfacing trigger,
   * which is rare by design.
   */
  async run(
    being: Being,
    context: RuntimeContext,
    event: PresenceEvent,
    _perceptions: Perception[],
  ): Promise<ResidentAction[]> {
    this.reapFinished(being, context);

    const actions = this.actOnCommitment(being, context);
    if (actions.length > 0) return actions;

    // Only look for something new when not already occupied.
    if (embersCurrentIntentions(being).length > 0) return [];

    await this.trySurface(being, context, event);
    return [];
  }

  /**
   * Ends pursuits that are finished or stale.
   *
   * A pursuit whose satisfier no longer resolves has been discharged by other
   * means or become impossible — either way the resident is not doing it any
   * more, and leaving it committed would suppress events for no reason.
   */
  private reapFinished(being: Being, context: RuntimeContext): void {
    for (const intention of embersCurrentIntentions(being)) {
      // Expression pursuits are discharged by actually speaking, which the
      // Resident judges after a deliberation — not by satisfier resolution.
      if (intention.satisfier.kind === "expression") continue;
      if (!resolveSatisfier(intention.satisfier, context)) {
        this.log.debug(`"${intention.aim}" is no longer actionable — satisfied`);
        embersEndIntention(being, intention.id, { kind: "satisfied" });
      }
    }

    for (const lapsed of embersExpirePursuits(being)) {
      this.log.debug(`"${lapsed.aim}" lapsed`);
    }
  }

  /**
   * The current pursuit, if it is one that wants a voice rather than a canned
   * action. The Resident grants a deliberation when this is non-null — that
   * deliberation *is* the enactment, and a resulting `speak` discharges it.
   */
  pendingExpression(being: Being): Intention | null {
    const [top] = embersCurrentIntentions(being);
    return top && top.satisfier.kind === "expression" ? top : null;
  }

  /**
   * Advances the most urgent pursuit by one step.
   *
   * A pursuit with effort spends most of its life here as *silent work*: the
   * step is recorded, no action reaches the world, no model is called, and the
   * being stays occupied — which holds the commitment window open, keeps new
   * surfacing gated, and arms suppression against lesser events. The world
   * only sees the final step, when the act lands and the pursuit discharges.
   *
   * Nothing worth doing completes on contact. Relief arrives at the end of the
   * work, not at the moment of wanting it done.
   */
  private actOnCommitment(being: Being, context: RuntimeContext): ResidentAction[] {
    const [pursuit] = embersCurrentIntentions(being);
    if (!pursuit) return [];
    if (pursuit.satisfier.kind === "expression") return []; // enacted via deliberation

    if (pursuit.progress < pursuit.effort - 1) {
      embersRecordProgress(being, pursuit.id);
      this.log.debug(`working on "${pursuit.aim}" (${pursuit.progress + 1}/${pursuit.effort})`);
      return [];
    }

    const action = resolveSatisfier(pursuit.satisfier, context);
    if (!action) return [];

    // The final step returns the act — and deliberately does NOT end the
    // pursuit. Completion is observed, never declared: if the act lands, the
    // world's state changes, the satisfier stops resolving, and the reap above
    // records `satisfied` on the next pass. If the act fails to take — which a
    // real actuator in a real room can always do — the satisfier still
    // resolves, and the retry below is recorded as an *attempt*, the honest
    // failure currency that decays urgency and eventually lapses the pursuit.
    //
    // Initiation is the being's. Duration is the world's. Completion belongs
    // to perception.
    if (pursuit.progress < pursuit.effort) {
      embersRecordProgress(being, pursuit.id);
      this.log.debug(`finishing "${pursuit.aim}" (${pursuit.effort}/${pursuit.effort})`);
    } else {
      embersRecordAction(being, pursuit.id);
      this.log.debug(`retrying "${pursuit.aim}" — the world has not taken it`);
    }
    return [action];
  }

  /** Looks for a pressure worth noticing, and asks whether to take it up. */
  private async trySurface(
    being: Being,
    context: RuntimeContext,
    event: PresenceEvent,
  ): Promise<void> {
    const eligible = embersEligibleToSurface(being);
    if (eligible.length === 0) return;

    const quiet = isQuiet(event, context);

    for (const pressure of eligible) {
      // Reachability is the first filter — a satisfier that will not resolve is
      // not something the resident can notice wanting. Expression is exempt:
      // a voice is always reachable.
      if (
        pressure.satisfier.kind !== "expression" &&
        !resolveSatisfier(pressure.satisfier, context)
      )
        continue;

      const trigger = this.triggerFor(pressure.pressure, quiet, event);
      if (!trigger) continue;

      await this.surfaceAndAdjudicate(being, context, pressure, trigger);
      return; // One at a time. Noticing is not a batch operation.
    }
  }

  private triggerFor(
    pressure: number,
    quiet: boolean,
    event: PresenceEvent,
  ): SurfacingTrigger | null {
    // The satisfier is reachable and something just changed about the place —
    // the fire is visibly dying, and that is when tending it becomes thinkable.
    if (event.type === "affordance.changed") {
      return { kind: "coincidence", note: `${event.affordanceId} changed` };
    }
    if (quiet) return { kind: "quiet" };
    if (pressure >= this.urgentThreshold) return { kind: "threshold" };
    return null;
  }

  private async surfaceAndAdjudicate(
    being: Being,
    context: RuntimeContext,
    pressure: {
      driveId: string;
      satisfier: Satisfier;
      hint?: string;
      pressure: number;
      effort?: number;
    },
    trigger: SurfacingTrigger,
  ): Promise<void> {
    const verdict = await this.askForAim(being, context, pressure, trigger);
    if (!verdict) return; // The call failed; nothing surfaced, nothing recorded.

    let candidate: SurfacedCandidate;
    try {
      candidate = embersSurface(being, {
        sourceDriveId: pressure.driveId,
        satisfier: pressure.satisfier,
        aim: verdict.aim,
        trigger,
        effort: pressure.effort,
      });
    } catch (err) {
      this.log.debug("could not surface:", err);
      return;
    }

    if (verdict.worthPursuing) {
      embersCommit(being, candidate.id);
      this.log.debug(`committed: "${verdict.aim}" (${trigger.kind})`);
    } else {
      embersDecline(being, candidate.id, verdict.reason);
      this.log.debug(`declined: "${verdict.aim}" — ${verdict.reason}`);
    }
  }

  /**
   * One model call that both articulates and adjudicates.
   *
   * Splitting these would double the cost at the highest-frequency point in the
   * system, and the judgment needs exactly the context the articulation does.
   */
  private async askForAim(
    being: Being,
    context: RuntimeContext,
    pressure: { driveId: string; satisfier: Satisfier; hint?: string; pressure: number },
    trigger: SurfacingTrigger,
  ): Promise<SurfacingVerdict | null> {
    const drive = being.drives.drives.get(pressure.driveId);
    const room = context.place.rooms.get(context.resident.currentRoom);
    const presence = perceivePresence(context.place, context.resident.currentRoom);

    const prompt = `The resident: ${context.resident.character.name}, ${context.resident.character.archetype}

An unmet need: ${drive?.name ?? pressure.driveId} — ${drive?.description ?? ""}
How unmet: ${(pressure.pressure * 100).toFixed(0)}% short of where it wants to be.

What would ease it: ${pressure.hint ?? `${pressure.satisfier.kind} "${pressure.satisfier.ref}"`}

Where: ${room?.name ?? "unknown"} — ${room?.description ?? ""}
Who else is here: ${presence.guests.length > 0 ? presence.guests.map((g) => g.guest.name).join(", ") : "no one"}
What prompted the thought: ${describeTrigger(trigger)}

Respond with JSON only.`;

    try {
      const response = await this.options.model.chat({
        systemPrompt: SURFACING_SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
      });
      return parseVerdict(response.content);
    } catch (err) {
      this.log.debug("surfacing call failed:", err);
      return null;
    }
  }
}

function describeTrigger(trigger: SurfacingTrigger): string {
  switch (trigger.kind) {
    case "coincidence":
      return `something changed nearby — ${trigger.note}`;
    case "quiet":
      return "a quiet moment, with nothing demanding attention";
    case "threshold":
      return "the need has simply grown hard to ignore";
  }
}

/**
 * Extracts the verdict, tolerating fenced, prose-wrapped, and truncated JSON.
 *
 * The salvage path is not defensive padding — it is the failure this call
 * actually has. A model asked for an aim writes prose, runs into the token
 * limit mid-string, and leaves an unclosed object. Strict parsing turns every
 * one of those into "nothing surfaced", which is indistinguishable from a
 * resident that simply never wants anything.
 *
 * The field order in the prompt exists for the same reason: `worthPursuing`
 * first so the decision survives, `aim` second, `reason` last where losing it
 * costs nothing.
 *
 * A genuinely unreadable response yields `null`, which surfaces nothing rather
 * than committing on a guess — the conservative direction, since a spurious
 * commitment suppresses real events downstream.
 */
function parseVerdict(content: string): SurfacingVerdict | null {
  const candidates = [
    content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1],
    content.match(/\{[\s\S]*\}/)?.[0],
    content,
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw.trim()) as Record<string, unknown>;
      const aim = typeof parsed.aim === "string" ? parsed.aim.trim() : "";
      if (!aim) continue;
      return {
        aim,
        worthPursuing: parsed.worthPursuing === true,
        reason: typeof parsed.reason === "string" ? parsed.reason : "no reason given",
      };
    } catch {
      // Try the next shape, then salvage.
    }
  }

  // Salvage: the object never closed, but the fields may still be in there.
  const aim = content.match(/"aim"\s*:\s*"([^"]+)/)?.[1]?.trim();
  if (!aim) return null;

  return {
    aim,
    worthPursuing: /"worthPursuing"\s*:\s*true/.test(content),
    reason: content.match(/"reason"\s*:\s*"([^"]*)/)?.[1] ?? "verdict truncated",
  };
}
