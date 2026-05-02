#!/usr/bin/env tsx
/**
 * Export a simulation transcript from the SQLite database.
 *
 * Usage:
 *   tsx scripts/export-transcript.ts                  # print to stdout
 *   tsx scripts/export-transcript.ts --json           # JSON format
 *   tsx scripts/export-transcript.ts --stats           # summary stats only
 *   tsx scripts/export-transcript.ts > transcript.txt  # save to file
 */

import { join } from "node:path";
import Database from "better-sqlite3";

const dbPath = join(process.cwd(), "data", "the-vault.db");
const db = new Database(dbPath, { readonly: true });

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const statsMode = args.includes("--stats");

interface EventRow {
  id: number;
  event_type: string;
  payload_json: string;
  created_at: string;
}

const events = db
  .prepare("SELECT id, event_type, payload_json, created_at FROM events_log ORDER BY id")
  .all() as EventRow[];

if (events.length === 0) {
  console.log("No events found in database. Run the simulation first.");
  process.exit(0);
}

// --- Stats ---
const firstEvent = new Date(events[0].created_at);
const lastEvent = new Date(events[events.length - 1].created_at);
const durationMinutes = (lastEvent.getTime() - firstEvent.getTime()) / 60_000;

const typeCounts = new Map<string, number>();
const speakerCounts = new Map<string, number>();
const roomVisits = new Map<string, Set<string>>();

for (const row of events) {
  typeCounts.set(row.event_type, (typeCounts.get(row.event_type) ?? 0) + 1);

  const payload = JSON.parse(row.payload_json);

  if (row.event_type === "guest.spoke") {
    const name = prettifyName(payload.guestId);
    speakerCounts.set(name, (speakerCounts.get(name) ?? 0) + 1);
  } else if (row.event_type === "resident.spoke") {
    speakerCounts.set("Poe", (speakerCounts.get("Poe") ?? 0) + 1);
  }

  if (payload.roomId) {
    const who = payload.guestId ? prettifyName(payload.guestId) : "Poe";
    if (!roomVisits.has(payload.roomId)) roomVisits.set(payload.roomId, new Set());
    roomVisits.get(payload.roomId)!.add(who);
  }
}

if (statsMode) {
  console.log("\n=== Simulation Summary ===\n");
  console.log(`Duration: ${Math.round(durationMinutes)} real minutes`);
  console.log(`Total events: ${events.length}`);
  console.log(`Time span: ${firstEvent.toLocaleString()} → ${lastEvent.toLocaleString()}`);
  console.log("\n--- Event counts ---");
  for (const [type, count] of [...typeCounts.entries()].sort((a, b) => b[1] - a[1])) {
    if (type === "tick") continue;
    console.log(`  ${type}: ${count}`);
  }
  console.log("\n--- Speech counts ---");
  for (const [name, count] of [...speakerCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name}: ${count} messages`);
  }
  console.log("\n--- Room activity ---");
  for (const [room, visitors] of roomVisits.entries()) {
    console.log(`  ${room}: ${[...visitors].join(", ")}`);
  }

  // Guest memory
  const guestNotes = db
    .prepare("SELECT guest_id, key, value_json FROM guest_memory")
    .all() as Array<{ guest_id: string; key: string; value_json: string }>;

  if (guestNotes.length > 0) {
    console.log("\n--- Poe's guest notes ---");
    for (const note of guestNotes) {
      console.log(`  ${prettifyName(note.guest_id)}: ${JSON.parse(note.value_json)}`);
    }
  }

  // Place memory
  const placeNotes = db
    .prepare("SELECT content, created_at FROM place_memory ORDER BY created_at")
    .all() as Array<{ content: string; created_at: string }>;

  if (placeNotes.length > 0) {
    console.log("\n--- Poe's internal notes ---");
    for (const note of placeNotes) {
      const time = new Date(note.created_at).toLocaleTimeString();
      console.log(`  [${time}] ${note.content}`);
    }
  }

  console.log();
  db.close();
  process.exit(0);
}

// --- Full transcript ---
if (jsonMode) {
  const parsed = events
    .filter((e) => e.event_type !== "tick")
    .map((e) => ({
      id: e.id,
      type: e.event_type,
      time: e.created_at,
      payload: JSON.parse(e.payload_json),
    }));
  console.log(JSON.stringify(parsed, null, 2));
} else {
  console.log(`\n=== The Vault — Transcript (${events.length} events, ${Math.round(durationMinutes)} min) ===\n`);

  for (const row of events) {
    if (row.event_type === "tick") continue;

    const time = new Date(row.created_at).toLocaleTimeString();
    const payload = JSON.parse(row.payload_json);
    const line = formatEvent(row.event_type, payload);
    if (line) {
      console.log(`[${time}] ${line}`);
    }
  }
}

db.close();

function formatEvent(type: string, p: Record<string, unknown>): string | null {
  switch (type) {
    case "guest.spoke":
      return `${prettifyName(p.guestId as string)}: "${p.text}"`;
    case "resident.spoke":
      return `Poe: "${p.text}"`;
    case "guest.entered":
      return `▸ ${prettifyName(p.guestId as string)} enters ${p.roomId}`;
    case "guest.left":
      return `◂ ${prettifyName(p.guestId as string)} leaves ${p.roomId}`;
    case "guest.moved":
      return `↳ ${prettifyName(p.guestId as string)} moves from ${p.from} → ${p.to}`;
    case "resident.moved":
      return `↳ Poe moves from ${p.from} → ${p.to}`;
    case "resident.acted":
      return `⚡ Poe: ${p.affordanceId} → ${p.actionId}`;
    case "time.phaseChanged":
      return `⏱ Phase: ${p.from} → ${p.to} (hour ${p.inWorldHour}, day ${p.day})`;
    case "affordance.changed":
      return `🔧 ${p.affordanceId} changed`;
    default:
      return null;
  }
}

function prettifyName(id: string): string {
  return id.replace("guest-", "").charAt(0).toUpperCase() + id.replace("guest-", "").slice(1);
}
