import { describe, it, expect } from "vitest";
import { buildPrompt } from "./prompt.js";
import {
  roomId,
  affordanceId,
  guestId,
  createPlace,
  addRoom,
  connectRooms,
  addAffordance,
  addGuest,
  enterRoom,
} from "@hauntjs/core";
import type {
  CharacterDefinition,
  RuntimeContext,
  ResidentState,
  Affordance,
  PresenceEvent,
} from "@hauntjs/core";

function makeCharacter(): CharacterDefinition {
  return {
    name: "Poe",
    archetype: "hospitable concierge",
    systemPrompt: "You are Poe, the resident of The Roost. You tend to the place with quiet pride.",
    voice: {
      register: "warm",
      quirks: ["references literature"],
      avoidances: ["corporate language"],
    },
    loyalties: { principal: null, values: ["guest comfort"] },
  };
}

function makeContext(): RuntimeContext {
  const place = createPlace({ id: "roost", name: "The Roost" });
  const lobby = roomId("lobby");
  const study = roomId("study");

  addRoom(place, { id: lobby, name: "Lobby", description: "The main hall with a fireplace." });
  addRoom(place, { id: study, name: "Study", description: "A quiet room with books." });
  connectRooms(place, lobby, study);

  const fireplace: Affordance = {
    id: affordanceId("fireplace"),
    roomId: lobby,
    kind: "fireplace",
    name: "Fireplace",
    description: "A stone fireplace",
    state: { lit: false },
    actions: [
      { id: "light", name: "Light", description: "Light the fire", availableWhen: (s) => s.lit === false },
    ],
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

describe("buildPrompt", () => {
  it("produces a ChatRequest with system prompt and messages", () => {
    const event: PresenceEvent = {
      type: "guest.entered",
      guestId: guestId("takeshi"),
      roomId: roomId("lobby"),
      at: new Date(),
    };

    const request = buildPrompt(makeCharacter(), makeContext(), event, [], [], new Map());

    expect(request.systemPrompt).toContain("Poe");
    expect(request.systemPrompt).toContain("Lobby");
    expect(request.systemPrompt).toContain("Takeshi");
    expect(request.systemPrompt).toContain("Fireplace");
    expect(request.systemPrompt).toContain("Study");
    expect(request.messages.length).toBeGreaterThan(0);
    expect(request.tools).toBeDefined();
    expect(request.tools!.length).toBe(5); // speak, move, act, note, wait
  });

  it("includes guest info in system prompt", () => {
    const event: PresenceEvent = { type: "tick", at: new Date() };
    const request = buildPrompt(makeCharacter(), makeContext(), event, [], [], new Map());

    expect(request.systemPrompt).toContain("Takeshi");
    expect(request.systemPrompt).toContain("stranger");
  });

  it("includes affordance details in system prompt", () => {
    const event: PresenceEvent = { type: "tick", at: new Date() };
    const request = buildPrompt(makeCharacter(), makeContext(), event, [], [], new Map());

    expect(request.systemPrompt).toContain("Fireplace");
    expect(request.systemPrompt).toContain("light");
    expect(request.systemPrompt).toContain("lit: false");
  });

  it("includes connected rooms", () => {
    const event: PresenceEvent = { type: "tick", at: new Date() };
    const request = buildPrompt(makeCharacter(), makeContext(), event, [], [], new Map());

    expect(request.systemPrompt).toContain("Study");
  });

  it("includes voice guidance", () => {
    const event: PresenceEvent = { type: "tick", at: new Date() };
    const request = buildPrompt(makeCharacter(), makeContext(), event, [], [], new Map());

    expect(request.systemPrompt).toContain("warm");
    expect(request.systemPrompt).toContain("references literature");
    expect(request.systemPrompt).toContain("corporate language");
  });

  it("includes place memories when provided", () => {
    const event: PresenceEvent = { type: "tick", at: new Date() };
    const memories = [
      { content: "Takeshi likes whiskey.", tags: ["takeshi"], createdAt: new Date(), importance: 0.7 },
    ];

    const request = buildPrompt(makeCharacter(), makeContext(), event, [], memories, new Map());
    const allContent = request.messages.map((m) => m.content).join("\n");

    expect(allContent).toContain("Takeshi likes whiskey.");
  });

  it("includes guest memories when available", () => {
    const event: PresenceEvent = { type: "tick", at: new Date() };
    const guestMems = new Map();
    guestMems.set(guestId("takeshi"), {
      guestId: guestId("takeshi"),
      facts: { drink: "whiskey", mood: "reflective" },
      updatedAt: new Date(),
    });

    const request = buildPrompt(makeCharacter(), makeContext(), event, [], [], guestMems);
    const allContent = request.messages.map((m) => m.content).join("\n");

    expect(allContent).toContain("whiskey");
    expect(allContent).toContain("reflective");
  });

  it("describes guest.spoke events", () => {
    const ctx = makeContext();
    ctx.recentEvents = [
      {
        type: "guest.spoke",
        guestId: guestId("takeshi"),
        roomId: roomId("lobby"),
        text: "Good evening, Poe.",
        at: new Date(),
      },
    ];

    const event: PresenceEvent = {
      type: "guest.spoke",
      guestId: guestId("takeshi"),
      roomId: roomId("lobby"),
      text: "How are you?",
      at: new Date(),
    };

    const request = buildPrompt(makeCharacter(), ctx, event, [], [], new Map());
    const allContent = request.messages.map((m) => m.content).join("\n");

    expect(allContent).toContain("Good evening, Poe.");
    expect(allContent).toContain("How are you?");
  });
});
