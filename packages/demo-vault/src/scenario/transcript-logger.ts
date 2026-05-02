import type { PresenceEvent } from "@hauntjs/core";
import type { TimeState } from "@hauntjs/core";
import type Database from "better-sqlite3";

export interface TranscriptEntry {
  realTime: string;
  inWorldTime: string;
  phase: string;
  event: string;
  detail: string;
}

export class TranscriptLogger {
  private entries: TranscriptEntry[] = [];
  private timeState: (() => TimeState) | null = null;
  private db: Database.Database | null;
  private insertStmt: import("better-sqlite3").Statement<[string, string, string]> | null = null;

  constructor(db?: Database.Database | null) {
    this.db = db ?? null;
    if (this.db) {
      this.insertStmt = this.db.prepare(
        "INSERT INTO events_log (event_type, payload_json, created_at) VALUES (?, ?, ?)",
      );
    }
  }

  setTimeSource(getTime: () => TimeState): void {
    this.timeState = getTime;
  }

  log(event: PresenceEvent): void {
    const now = new Date();
    const time = this.timeState?.();
    const entry: TranscriptEntry = {
      realTime: now.toISOString().slice(11, 19),
      inWorldTime: time ? `Day ${time.day}, ${time.inWorldHour}:00` : "??",
      phase: time?.phase ?? "unknown",
      event: event.type,
      detail: this.describeEvent(event),
    };

    this.entries.push(entry);

    // Persist to SQLite if available
    if (this.insertStmt) {
      this.insertStmt.run(event.type, JSON.stringify(event), now.toISOString());
    }

    // Print to console
    console.log(
      `  [${entry.realTime}] [${entry.inWorldTime} ${entry.phase}] ${entry.event}: ${entry.detail}`,
    );
  }

  getTranscript(): TranscriptEntry[] {
    return [...this.entries];
  }

  private describeEvent(event: PresenceEvent): string {
    switch (event.type) {
      case "guest.entered":
        return `${event.guestId} entered ${event.roomId}`;
      case "guest.left":
        return `${event.guestId} left ${event.roomId}`;
      case "guest.moved":
        return `${event.guestId}: ${event.from} → ${event.to}`;
      case "guest.spoke":
        return `${event.guestId}: "${event.text.slice(0, 80)}"`;
      case "guest.approached":
        return `${event.guestId} approached ${event.affordanceId}`;
      case "resident.spoke":
        return `Poe: "${event.text.slice(0, 80)}"`;
      case "resident.moved":
        return `Poe: ${event.from} → ${event.to}`;
      case "resident.acted":
        return `Poe acted: ${event.affordanceId}:${event.actionId}`;
      case "affordance.changed":
        return `${event.affordanceId} changed`;
      case "time.phaseChanged":
        return `${event.from} → ${event.to} (hour ${event.inWorldHour}, day ${event.day})`;
      case "tick":
        return "tick";
      default:
        return "";
    }
  }
}
