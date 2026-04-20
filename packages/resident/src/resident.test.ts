import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  Affordance,
  CharacterDefinition,
  PresenceEvent,
  ResidentState,
  RuntimeContext,
} from "@hauntjs/core";
import {
  addAffordance,
  addGuest,
  addRoom,
  affordanceId,
  connectRooms,
  createPlace,
  enterRoom,
  guestId,
  roomId,
} from "@hauntjs/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteMemoryStore } from "./memory/store.js";
import { MockModelProvider } from "./model/mock.js";
import { Resident } from "./resident.js";

function makeCharacter(): CharacterDefinition {
  return {
    name: "Poe",
    archetype: "hospitable concierge",
    systemPrompt:
      "You are Poe, the resident of The Roost. You tend to the place with quiet pride and warmth.",
    voice: {
      register: "warm",
      quirks: [],
      avoidances: [],
    },
    loyalties: { principal: null, values: ["guest comfort"] },
  };
}

function makeContext(): RuntimeContext {
  const place = createPlace({ id: "roost", name: "The Roost" });
  const lobby = roomId("lobby");
  const study = roomId("study");

  addRoom(place, { id: lobby, name: "Lobby", description: "The main hall." });
  addRoom(place, { id: study, name: "Study", description: "A quiet room." });
  connectRooms(place, lobby, study);

  const fireplace: Affordance = {
    id: affordanceId("fireplace"),
    roomId: lobby,
    kind: "fireplace",
    name: "Fireplace",
    description: "A stone fireplace",
    state: { lit: false },
    actions: [{ id: "light", name: "Light", description: "Light the fire" }],
    sensable: true,
  };
  addAffordance(place, lobby, fireplace);

  const g = addGuest(place, { id: guestId("takeshi"), name: "Takeshi" });
  enterRoom(place, g.id, lobby);

  const resident: ResidentState = {
    id: "poe",
    character: makeCharacter(),
    currentRoom: lobby,
    mood: { energy: 0.8, focus: 0.7, valence: 0.3 },
  };

  return {
    place,
    resident,
    recentEvents: [],
    guestsInRoom: [place.guests.get(guestId("takeshi"))!],
  };
}

describe("Resident", () => {
  let tmpDir: string;
  let memory: SqliteMemoryStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "haunt-resident-test-"));
    memory = new SqliteMemoryStore({ dbPath: join(tmpDir, "test.db") });
  });

  afterEach(() => {
    memory.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns a speak action when the model responds with speech", async () => {
    const model = new MockModelProvider({
      content: "",
      toolCalls: [
        {
          id: "tc1",
          name: "speak",
          arguments: { text: "Welcome home, Takeshi.", audience: "all" },
        },
      ],
      finishReason: "tool_use",
    });

    const resident = new Resident({ character: makeCharacter(), model, memory });

    const event: PresenceEvent = {
      type: "guest.entered",
      guestId: guestId("takeshi"),
      roomId: roomId("lobby"),
      at: new Date(),
    };

    const action = await resident.perceive(event, [], makeContext());

    expect(action).toBeDefined();
    expect(action!.type).toBe("speak");
    if (action!.type === "speak") {
      expect(action!.text).toBe("Welcome home, Takeshi.");
    }

    // Verify the model was called
    expect(model.calls).toHaveLength(1);
    expect(model.calls[0].systemPrompt).toContain("Poe");
  });

  it("returns null when the model responds with wait", async () => {
    const model = new MockModelProvider({
      content: "",
      toolCalls: [{ id: "tc1", name: "wait", arguments: {} }],
      finishReason: "tool_use",
    });

    const resident = new Resident({ character: makeCharacter(), model, memory });
    const event: PresenceEvent = { type: "tick", at: new Date() };
    const action = await resident.perceive(event, [], makeContext());

    expect(action).toBeNull();
  });

  it("persists note actions about guests to memory", async () => {
    const model = new MockModelProvider({
      content: "",
      toolCalls: [
        {
          id: "tc1",
          name: "note",
          arguments: { content: "Takeshi seems troubled tonight.", about: "takeshi" },
        },
      ],
      finishReason: "tool_use",
    });

    const resident = new Resident({ character: makeCharacter(), model, memory });
    const event: PresenceEvent = {
      type: "guest.spoke",
      guestId: guestId("takeshi"),
      roomId: roomId("lobby"),
      text: "I've had a long day.",
      at: new Date(),
    };

    const action = await resident.perceive(event, [], makeContext());
    expect(action?.type).toBe("note");

    // Verify guest memory was updated
    const guestMem = memory.guestMemory.get(guestId("takeshi"));
    expect(guestMem).toBeDefined();
    expect(guestMem!.facts.note).toBe("Takeshi seems troubled tonight.");
  });

  it("persists note actions about self to place memory", async () => {
    const model = new MockModelProvider({
      content: "",
      toolCalls: [
        {
          id: "tc1",
          name: "note",
          arguments: { content: "The garden needs tending.", about: "self" },
        },
      ],
      finishReason: "tool_use",
    });

    const resident = new Resident({ character: makeCharacter(), model, memory });
    const event: PresenceEvent = { type: "tick", at: new Date() };

    await resident.perceive(event, [], makeContext());

    const memories = await memory.recall({});
    expect(memories).toHaveLength(1);
    expect(memories[0].content).toBe("The garden needs tending.");
  });

  it("adds events to working memory", async () => {
    const model = new MockModelProvider({
      content: "",
      toolCalls: [{ id: "tc1", name: "wait", arguments: {} }],
      finishReason: "tool_use",
    });
    const resident = new Resident({ character: makeCharacter(), model, memory });

    const event: PresenceEvent = {
      type: "guest.entered",
      guestId: guestId("takeshi"),
      roomId: roomId("lobby"),
      at: new Date(),
    };

    await resident.perceive(event, [], makeContext());
    expect(memory.workingMemory).toHaveLength(1);
    expect(memory.workingMemory[0].type).toBe("guest.entered");
  });
});
