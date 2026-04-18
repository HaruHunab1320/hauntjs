import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteMemoryStore } from "./store.js";
import { guestId } from "@hauntjs/core";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

describe("SqliteMemoryStore", () => {
  let store: SqliteMemoryStore;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "haunt-test-"));
    store = new SqliteMemoryStore({ dbPath: join(tmpDir, "test.db") });
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("place memory", () => {
    it("remembers and recalls entries", async () => {
      await store.remember({
        content: "Takeshi visited for the first time.",
        tags: ["takeshi", "first-visit"],
        createdAt: new Date(),
        importance: 0.8,
      });

      const results = await store.recall({});
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe("Takeshi visited for the first time.");
      expect(results[0].tags).toEqual(["takeshi", "first-visit"]);
    });

    it("filters by tags", async () => {
      await store.remember({
        content: "About Takeshi",
        tags: ["takeshi"],
        createdAt: new Date(),
        importance: 0.5,
      });
      await store.remember({
        content: "About the garden",
        tags: ["garden"],
        createdAt: new Date(),
        importance: 0.5,
      });

      const results = await store.recall({ tags: ["takeshi"] });
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe("About Takeshi");
    });

    it("limits results", async () => {
      for (let i = 0; i < 10; i++) {
        await store.remember({
          content: `Entry ${i}`,
          tags: [],
          createdAt: new Date(),
          importance: i * 0.1,
        });
      }

      const results = await store.recall({ limit: 3 });
      expect(results).toHaveLength(3);
      // Should be sorted by importance descending
      expect(results[0].importance).toBeGreaterThanOrEqual(results[1].importance);
    });

    it("persists across store instances", async () => {
      const dbPath = join(tmpDir, "persist.db");
      const store1 = new SqliteMemoryStore({ dbPath });

      await store1.remember({
        content: "Something important",
        tags: ["test"],
        createdAt: new Date(),
        importance: 0.9,
      });
      store1.close();

      const store2 = new SqliteMemoryStore({ dbPath });
      const results = await store2.recall({});
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe("Something important");
      store2.close();
    });
  });

  describe("guest memory", () => {
    it("updates and retrieves guest facts", async () => {
      const id = guestId("takeshi");
      await store.updateGuest(id, {
        facts: { mood: "contemplative", drink: "whiskey" },
      });

      const memory = store.guestMemory.get(id);
      expect(memory).toBeDefined();
      expect(memory!.facts.mood).toBe("contemplative");
      expect(memory!.facts.drink).toBe("whiskey");
    });

    it("merges new facts with existing ones", async () => {
      const id = guestId("takeshi");
      await store.updateGuest(id, { facts: { mood: "happy" } });
      await store.updateGuest(id, { facts: { drink: "tea" } });

      const memory = store.guestMemory.get(id);
      expect(memory!.facts.mood).toBe("happy");
      expect(memory!.facts.drink).toBe("tea");
    });

    it("overwrites existing facts", async () => {
      const id = guestId("takeshi");
      await store.updateGuest(id, { facts: { mood: "happy" } });
      await store.updateGuest(id, { facts: { mood: "tired" } });

      const memory = store.guestMemory.get(id);
      expect(memory!.facts.mood).toBe("tired");
    });

    it("persists guest memory across instances", async () => {
      const dbPath = join(tmpDir, "guest-persist.db");
      const store1 = new SqliteMemoryStore({ dbPath });
      const id = guestId("takeshi");

      await store1.updateGuest(id, { facts: { nickname: "Tak" } });
      store1.close();

      const store2 = new SqliteMemoryStore({ dbPath });
      const memory = store2.guestMemory.get(id);
      expect(memory).toBeDefined();
      expect(memory!.facts.nickname).toBe("Tak");
      store2.close();
    });
  });

  describe("working memory", () => {
    it("adds events to working memory", () => {
      store.addToWorkingMemory({
        type: "tick",
        at: new Date(),
      });

      expect(store.workingMemory).toHaveLength(1);
    });

    it("caps working memory at 50 events", () => {
      for (let i = 0; i < 60; i++) {
        store.addToWorkingMemory({ type: "tick", at: new Date() });
      }

      expect(store.workingMemory).toHaveLength(50);
    });
  });
});
