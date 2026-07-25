import {
  expirePendingAttempts,
  type InnerSituation,
  type IntegrationInput,
  integrate,
  metabolize,
  type PracticeAttempt,
  type PracticeAttemptResult,
  resolveAllPending,
  tick,
} from "@embersjs/core";
import type { GuestId, Logger, PresenceEvent, RoomId, RuntimeInterface } from "@hauntjs/core";
import { addGuest, createLogger, guestId, roomId } from "@hauntjs/core";
import type { ModelProvider } from "@hauntjs/resident";
import { createPracticeEvaluator } from "@hauntjs/resident";
import { buildGuestPrompt } from "./agent-prompt.js";
import type { GuestAction, GuestAgentConfig, GuestAgentState } from "./agent-types.js";

/** A candidate Embers input nominated from a Haunt event. */
type EmbersNomination = Pick<IntegrationInput, "entry">;

const DEFAULT_COOLDOWN_MS = 5000;

/**
 * How long an unresolved attempt survives before being dropped, in being-time.
 * Only reached when the evaluator is failing persistently.
 */
const ATTEMPT_TTL_MS = 6 * 3_600_000;
const DEFAULT_DELIBERATION_EVENTS = new Set([
  "guest.spoke",
  "resident.spoke",
  "guest.entered",
  "guest.left",
  "time.phaseChanged",
  "tick",
]);

/**
 * An autonomous AI guest that makes decisions without human input.
 * Connects directly to the runtime (not via WebSocket).
 */
export class GuestAgent {
  readonly id: GuestId;
  readonly name: string;
  readonly config: GuestAgentConfig;

  private runtime: RuntimeInterface;
  private model: ModelProvider;
  private log: Logger;
  private state: GuestAgentState = "idle";
  private workingMemory: PresenceEvent[] = [];
  private currentRoom: RoomId;
  private cooldownMs: number;
  private deliberationEvents: Set<string>;
  private unsubscribe: (() => void) | null = null;
  private lastTickAt = Date.now();
  private running = false;
  private practiceEvaluator: ((a: PracticeAttempt) => Promise<PracticeAttemptResult>) | null;
  private cultivating = false;

  constructor(
    config: GuestAgentConfig,
    runtime: RuntimeInterface,
    model: ModelProvider,
    logger?: Logger,
  ) {
    this.config = config;
    this.id = guestId(`guest-${config.id}`);
    this.name = config.name;
    this.runtime = runtime;
    this.model = model;
    this.log = logger ?? createLogger(`Guest:${config.name}`);
    this.currentRoom = config.startRoom;
    this.cooldownMs = config.actionCooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.deliberationEvents = config.deliberationEvents ?? DEFAULT_DELIBERATION_EVENTS;

    if (config.practiceEvaluator === false) {
      this.practiceEvaluator = null;
    } else {
      this.practiceEvaluator =
        config.practiceEvaluator ?? createPracticeEvaluator({ model, logger: this.log });
    }
  }

  /** Start the agent — register as guest, subscribe to events. */
  async start(): Promise<void> {
    this.running = true;

    // Register as a guest in the place
    try {
      addGuest(this.runtime.place, { id: this.id, name: this.name });
    } catch {
      // Guest may already exist from a prior session
    }

    // Enter the starting room
    await this.runtime.emit({
      type: "guest.entered",
      guestId: this.id,
      roomId: this.currentRoom,
      at: new Date(),
    });

    // Subscribe to all events
    this.unsubscribe = this.runtime.eventBus.on("*", (event) => {
      this.onEvent(event);
    });

    this.log.info(`arrived in ${this.currentRoom}`);
  }

  /** Stop the agent — unsubscribe, leave the place. */
  async stop(): Promise<void> {
    this.running = false;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    // Leave the place
    await this.runtime.emit({
      type: "guest.left",
      guestId: this.id,
      roomId: this.currentRoom,
      at: new Date(),
    });

    this.log.info("left the place");
  }

  get agentState(): GuestAgentState {
    return this.state;
  }

  get room(): RoomId {
    return this.currentRoom;
  }

  private onEvent(event: PresenceEvent): void {
    if (!this.running) return;

    // Only perceive events in our room (simplified sensor model for guests)
    if (!this.canPerceive(event)) return;

    // Store in working memory
    this.workingMemory.push(event);
    if (this.workingMemory.length > 200) {
      this.workingMemory.shift();
    }

    // Update Embers Being if present
    if (this.config.being) {
      const now = Date.now();
      tick(this.config.being, now - this.lastTickAt);
      this.lastTickAt = now;

      const ctx = this.buildPressureContext();
      const inputs = this.mapEventToEmbers(event);
      for (const input of inputs) {
        integrate(this.config.being, { ...input, context: ctx });
      }

      // Adjudicate the nominated attempts. Fire-and-forget: cultivation must
      // not delay the agent's reaction to the event, and a failed attempt
      // stays pending for the next drain.
      void this.cultivate();
    }

    // Decide whether to deliberate
    if (this.state !== "idle") return;
    if (!this.deliberationEvents.has(event.type)) return;

    // Don't deliberate on our own actions
    if (event.type === "guest.spoke" && (event.guestId as string) === (this.id as string)) return;

    this.deliberate();
  }

  /**
   * Drain this agent's pending practice attempts.
   *
   * Serialized against itself — a slow evaluator must not have two drains
   * mutating the same Being concurrently.
   */
  private async cultivate(): Promise<void> {
    if (!this.config.being || !this.practiceEvaluator || this.cultivating) return;

    this.cultivating = true;
    try {
      const { failures } = await resolveAllPending(this.config.being, this.practiceEvaluator, {
        concurrency: 2,
      });
      if (failures.length > 0) {
        expirePendingAttempts(this.config.being, ATTEMPT_TTL_MS);
      }
    } catch (err) {
      this.log.debug("cultivation failed:", err);
    } finally {
      this.cultivating = false;
    }
  }

  private canPerceive(event: PresenceEvent): boolean {
    // Always perceive time changes and ticks
    if (event.type === "time.phaseChanged" || event.type === "tick") return true;

    // Perceive events in our room
    switch (event.type) {
      case "guest.entered":
      case "guest.left":
      case "guest.spoke":
      case "guest.approached":
        return event.roomId === this.currentRoom;
      case "guest.moved":
        return event.from === this.currentRoom || event.to === this.currentRoom;
      case "resident.spoke":
        return event.roomId === this.currentRoom;
      case "resident.moved":
      case "resident.acted":
      case "affordance.changed":
        return true; // simplified — guests are aware of place changes
      default:
        return false;
    }
  }

  private async deliberate(): Promise<void> {
    if (this.state !== "idle") return;
    this.state = "thinking";

    try {
      // Get inner situation from Embers if available
      let situation: InnerSituation | null = null;
      if (this.config.being) {
        situation = metabolize(this.config.being);
      }

      // Build prompt
      const request = buildGuestPrompt(
        this.config,
        this.currentRoom,
        this.runtime.place,
        this.workingMemory,
        situation,
      );

      // Call model
      const response = await this.model.chat(request);

      // Parse action
      const action = this.parseAction(response);
      if (action && action.type !== "wait") {
        await this.executeAction(action);
      }
    } catch (err) {
      this.log.error("deliberation error:", err instanceof Error ? err.message : err);
    } finally {
      // Cooldown before next action
      this.state = "cooldown";
      setTimeout(() => {
        this.state = "idle";
      }, this.cooldownMs);
    }
  }

  private parseAction(response: {
    content: string;
    toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  }): GuestAction | null {
    if (response.toolCalls && response.toolCalls.length > 0) {
      const tc = response.toolCalls[0];
      switch (tc.name) {
        case "speak":
          return { type: "speak", text: String(tc.arguments.text ?? "") };
        case "move":
          return { type: "move", toRoom: String(tc.arguments.toRoom ?? "") };
        case "wait":
          return { type: "wait" };
        default:
          return { type: "wait" };
      }
    }

    // Plain text response = speech
    if (response.content && response.content.trim()) {
      return { type: "speak", text: response.content.trim() };
    }

    return { type: "wait" };
  }

  private async executeAction(action: GuestAction): Promise<void> {
    this.state = "acting";

    switch (action.type) {
      case "speak":
        this.log.info(`speaks: "${action.text.slice(0, 60)}"`);
        await this.runtime.emit({
          type: "guest.spoke",
          guestId: this.id,
          roomId: this.currentRoom,
          text: action.text,
          at: new Date(),
        });
        break;

      case "move": {
        const toRoom = roomId(action.toRoom);
        const currentRoomData = this.runtime.place.rooms.get(this.currentRoom);
        if (currentRoomData?.connectedTo.includes(toRoom)) {
          const from = this.currentRoom;
          this.currentRoom = toRoom;
          this.log.info(`moves to ${action.toRoom}`);
          await this.runtime.emit({
            type: "guest.moved",
            guestId: this.id,
            from,
            to: toRoom,
            at: new Date(),
          });
        } else {
          this.log.warn(`can't move to ${action.toRoom} — not connected`);
        }
        break;
      }
    }
  }

  private static readonly DOMINATION_THRESHOLD = 0.3;

  private buildPressureContext(): { pressured?: boolean; pressingDriveIds?: string[] } {
    const being = this.config.being;
    if (!being) return {};
    const pressingDriveIds: string[] = [];
    for (const [id, drive] of being.drives.drives) {
      if (drive.level < GuestAgent.DOMINATION_THRESHOLD) {
        pressingDriveIds.push(id);
      }
    }
    return pressingDriveIds.length > 0
      ? { pressured: true, pressingDriveIds }
      : { pressured: false, pressingDriveIds: [] };
  }

  /**
   * Nominate Embers inputs from an event.
   *
   * As with the resident, the practice entries here are candidates, not
   * assertions — our own speech is not proof that acknowledgement occurred.
   * Evidence rides along in the payload so the evaluator has something to
   * judge, and rejection is what keeps the mapping honest.
   */
  private mapEventToEmbers(event: PresenceEvent): EmbersNomination[] {
    const inputs: EmbersNomination[] = [];

    switch (event.type) {
      case "guest.spoke":
        inputs.push({ entry: { kind: "event", type: "conversation" } });
        // Our own speech = acknowledge (gratitude) + potential tend-guest (service)
        if ((event.guestId as string) === (this.id as string)) {
          inputs.push({
            entry: { kind: "action", type: "acknowledge", payload: { text: event.text } },
          });
        }
        break;

      case "resident.spoke":
        inputs.push({ entry: { kind: "event", type: "conversation" } });
        // Resident speaking to us = opportunity to acknowledge (gratitude)
        inputs.push({
          entry: { kind: "event", type: "acknowledge", payload: { text: event.text } },
        });
        break;

      case "guest.entered":
        inputs.push({ entry: { kind: "event", type: "social-contact" } });
        // Another guest entering = notice-positive (gratitude)
        if ((event.guestId as string) !== (this.id as string)) {
          inputs.push({
            entry: {
              kind: "event",
              type: "notice-positive",
              payload: { guestId: event.guestId, roomId: event.roomId },
            },
          });
        }
        break;

      case "tick":
        // Quiet moment = grounding (presence, requires pressure) + self-observe (witness)
        inputs.push({ entry: { kind: "event", type: "ground" } });
        inputs.push({ entry: { kind: "event", type: "self-observe" } });
        break;

      case "time.phaseChanged":
        inputs.push({ entry: { kind: "event", type: "time-shift" } });
        break;

      case "guest.left":
        inputs.push({ entry: { kind: "event", type: "social-contact" } });
        break;
    }

    return inputs;
  }
}
