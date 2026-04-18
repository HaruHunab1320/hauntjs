import Database from "better-sqlite3";
import type {
  MemoryStore,
  MemoryQuery,
  MemoryResult,
  PlaceMemoryEntry,
  GuestMemory,
  GuestId,
  PresenceEvent,
} from "@hauntjs/core";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, "..", "..", "src", "memory", "schema.sql");
const WORKING_MEMORY_LIMIT = 50;

export interface SqliteMemoryStoreOptions {
  dbPath: string;
}

export class SqliteMemoryStore implements MemoryStore {
  workingMemory: PresenceEvent[] = [];
  guestMemory: Map<GuestId, GuestMemory> = new Map();
  placeMemory: PlaceMemoryEntry[] = [];

  private db: Database.Database;

  constructor(options: SqliteMemoryStoreOptions) {
    this.db = new Database(options.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.initSchema();
    this.loadFromDb();
  }

  private initSchema(): void {
    const schema = readFileSync(SCHEMA_PATH, "utf-8");
    this.db.exec(schema);
  }

  private loadFromDb(): void {
    // Load place memory
    const placeRows = this.db
      .prepare("SELECT id, content, tags, created_at, importance FROM place_memory ORDER BY created_at DESC")
      .all() as Array<{ id: number; content: string; tags: string; created_at: string; importance: number }>;

    this.placeMemory = placeRows.map((row) => ({
      id: String(row.id),
      content: row.content,
      tags: JSON.parse(row.tags) as string[],
      createdAt: new Date(row.created_at),
      importance: row.importance,
    }));

    // Load guest memory
    const guestRows = this.db
      .prepare("SELECT guest_id, key, value_json, updated_at FROM guest_memory")
      .all() as Array<{ guest_id: string; key: string; value_json: string; updated_at: string }>;

    for (const row of guestRows) {
      const gId = row.guest_id as GuestId;
      let memory = this.guestMemory.get(gId);
      if (!memory) {
        memory = {
          guestId: gId,
          facts: {},
          updatedAt: new Date(row.updated_at),
        };
        this.guestMemory.set(gId, memory);
      }
      memory.facts[row.key] = JSON.parse(row.value_json) as string;
      const rowDate = new Date(row.updated_at);
      if (rowDate > memory.updatedAt) {
        memory.updatedAt = rowDate;
      }
    }
  }

  async recall(query: MemoryQuery): Promise<MemoryResult[]> {
    let results: PlaceMemoryEntry[] = [...this.placeMemory];

    if (query.tags && query.tags.length > 0) {
      results = results.filter((entry) =>
        query.tags!.some((tag) => entry.tags.includes(tag)),
      );
    }

    // Sort by importance descending
    results.sort((a, b) => b.importance - a.importance);

    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results.map((entry) => ({
      content: entry.content,
      tags: entry.tags,
      createdAt: entry.createdAt,
      importance: entry.importance,
    }));
  }

  async remember(entry: PlaceMemoryEntry): Promise<void> {
    const now = entry.createdAt ?? new Date();
    const tagsJson = JSON.stringify(entry.tags);

    const result = this.db
      .prepare(
        "INSERT INTO place_memory (content, tags, created_at, importance) VALUES (?, ?, ?, ?)",
      )
      .run(entry.content, tagsJson, now.toISOString(), entry.importance);

    const saved: PlaceMemoryEntry = {
      id: String(result.lastInsertRowid),
      content: entry.content,
      tags: entry.tags,
      createdAt: now,
      importance: entry.importance,
    };

    this.placeMemory.unshift(saved);
  }

  async updateGuest(id: GuestId, update: Partial<GuestMemory>): Promise<void> {
    const now = new Date();

    // Ensure guest exists in the guests table
    this.db
      .prepare(
        `INSERT INTO guests (id, name, first_seen, last_seen) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen`,
      )
      .run(id, id, now.toISOString(), now.toISOString());

    if (update.facts) {
      const upsert = this.db.prepare(
        `INSERT INTO guest_memory (guest_id, key, value_json, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(guest_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      );

      const transaction = this.db.transaction(() => {
        for (const [key, value] of Object.entries(update.facts!)) {
          upsert.run(id, key, JSON.stringify(value), now.toISOString());
        }
      });
      transaction();
    }

    // Update in-memory cache
    let memory = this.guestMemory.get(id);
    if (!memory) {
      memory = { guestId: id, facts: {}, updatedAt: now };
      this.guestMemory.set(id, memory);
    }
    if (update.facts) {
      Object.assign(memory.facts, update.facts);
    }
    memory.updatedAt = now;
  }

  addToWorkingMemory(event: PresenceEvent): void {
    this.workingMemory.push(event);
    if (this.workingMemory.length > WORKING_MEMORY_LIMIT) {
      this.workingMemory.shift();
    }
  }

  close(): void {
    this.db.close();
  }
}
