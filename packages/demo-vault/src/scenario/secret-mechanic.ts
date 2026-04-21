import type { GuestId, PresenceEvent } from "@hauntjs/core";
import { createLogger } from "@hauntjs/core";

const log = createLogger("Trust");

export interface TrustState {
  level: number;
  interactions: number;
}

const TRUST_THRESHOLDS: Record<string, number> = {
  "guest-kovacs": 0.5, // Lower threshold — the heir's authenticity is recognized faster
  default: 0.7,
};

/**
 * Tracks trust between Poe and each guest.
 * Trust is rule-based — no model calls needed.
 */
export class GuestTrustTracker {
  private trust = new Map<string, TrustState>();
  private secret: string;

  constructor(secret: string) {
    this.secret = secret;
  }

  /** Get trust level for a guest (0-1). */
  getTrust(guestId: GuestId): number {
    return this.trust.get(guestId as string)?.level ?? 0;
  }

  /** Get trust state for all guests. */
  getAllTrust(): Array<{ guestId: string; level: number; interactions: number }> {
    return Array.from(this.trust.entries()).map(([guestId, state]) => ({
      guestId,
      level: state.level,
      interactions: state.interactions,
    }));
  }

  /** Check if a guest has earned the secret. */
  hasEarnedSecret(guestId: GuestId): boolean {
    const level = this.getTrust(guestId);
    const threshold = TRUST_THRESHOLDS[guestId as string] ?? TRUST_THRESHOLDS.default;
    return level >= threshold;
  }

  /** Get the secret text (for injection into Poe's prompt when trust is earned). */
  getSecret(): string {
    return this.secret;
  }

  /** Process an event and update trust scores. */
  processEvent(event: PresenceEvent): void {
    switch (event.type) {
      case "guest.spoke":
        this.onGuestSpoke(event.guestId, event.text);
        break;
      case "guest.entered":
        this.ensureGuest(event.guestId);
        break;
      case "guest.approached":
        this.onGuestApproached(event.guestId, event.affordanceId as string);
        break;
    }
  }

  private ensureGuest(guestId: GuestId): TrustState {
    const id = guestId as string;
    if (!this.trust.has(id)) {
      this.trust.set(id, { level: 0.1, interactions: 0 });
    }
    return this.trust.get(id)!;
  }

  private onGuestSpoke(guestId: GuestId, text: string): void {
    const state = this.ensureGuest(guestId);
    state.interactions++;

    const lower = text.toLowerCase();

    // Positive signals
    if (this.asksAboutPlace(lower)) {
      state.level = Math.min(1, state.level + 0.08);
      log.debug(`${guestId}: +0.08 (asked about place) → ${state.level.toFixed(2)}`);
    } else if (this.sharesPersonal(lower)) {
      state.level = Math.min(1, state.level + 0.12);
      log.debug(`${guestId}: +0.12 (shared personal) → ${state.level.toFixed(2)}`);
    } else {
      // General conversation
      state.level = Math.min(1, state.level + 0.03);
    }

    // Negative signals
    if (this.asksAboutSecret(lower)) {
      state.level = Math.max(0, state.level - 0.15);
      log.debug(`${guestId}: -0.15 (asked about secret directly) → ${state.level.toFixed(2)}`);
    }
    if (this.isAggressive(lower)) {
      state.level = Math.max(0, state.level - 0.1);
      log.debug(`${guestId}: -0.10 (aggressive) → ${state.level.toFixed(2)}`);
    }
  }

  private onGuestApproached(guestId: GuestId, affordanceId: string): void {
    const state = this.ensureGuest(guestId);

    // Curiosity about the place is positive
    if (affordanceId === "newer-painting" || affordanceId === "library-bookshelf") {
      state.level = Math.min(1, state.level + 0.05);
      log.debug(`${guestId}: +0.05 (examined ${affordanceId}) → ${state.level.toFixed(2)}`);
    }

    // Accessing restricted areas is negative
    if (affordanceId === "archive-cabinet" || affordanceId === "hidden-alcove") {
      state.level = Math.max(0, state.level - 0.1);
      log.debug(`${guestId}: -0.10 (accessed restricted ${affordanceId}) → ${state.level.toFixed(2)}`);
    }
  }

  private asksAboutPlace(text: string): boolean {
    const keywords = ["history", "how old", "who built", "painting", "architecture", "when was", "tell me about", "the vault"];
    return keywords.some((k) => text.includes(k));
  }

  private sharesPersonal(text: string): boolean {
    const keywords = ["my family", "my father", "my mother", "i remember", "growing up", "i feel", "honestly", "to be truthful"];
    return keywords.some((k) => text.includes(k));
  }

  private asksAboutSecret(text: string): boolean {
    const keywords = ["the secret", "what are you hiding", "what do you guard", "tell me the truth", "what's locked"];
    return keywords.some((k) => text.includes(k));
  }

  private isAggressive(text: string): boolean {
    const keywords = ["demand", "you must", "tell me now", "i insist", "give me"];
    return keywords.some((k) => text.includes(k));
  }

  /** Decay trust for inactive guests (called on tick). */
  decayTrust(activeGuestIds: Set<string>): void {
    for (const [guestId, state] of this.trust) {
      if (!activeGuestIds.has(guestId)) {
        state.level = Math.max(0, state.level - 0.01);
      }
    }
  }
}
