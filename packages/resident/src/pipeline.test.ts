/**
 * Commitment-aware autonomy, end to end.
 *
 * The claim under test is the one Phase 3 exists to make good on: a resident
 * that is occupied does not deliberate about a passing event. Not "mentions its
 * commitment in the prompt" — does not call the model.
 *
 * So these assert on `shouldDeliberate`, the pipeline flag that decides whether
 * `ResidentSystem` invokes the mind at all.
 */

import { createBeing } from "@embersjs/core";
import {
  addRoom,
  createPlace,
  EventBus,
  guestId,
  type PresenceEvent,
  type ResidentMind,
  type ResidentState,
  roomId,
  type SystemContext,
  sensorId,
} from "@hauntjs/core";
import { describe, expect, it } from "vitest";
import type { Being, Satisfier } from "./embers.js";
import { embersCommit, embersEligibleToSurface, embersSurface } from "./embers.js";
import { commitmentFromBeing, createResidentPipeline } from "./pipeline.js";

const LOBBY = roomId("lobby");
const HEARTH: Satisfier = { kind: "affordance", ref: "hearth" };

const MIND: ResidentMind = { perceive: async () => null };

function beingWithPursuit(level: number): Being {
  return createBeing({
    id: "p",
    name: "P",
    drives: {
      tierCount: 1,
      drives: [
        {
          id: "connection",
          name: "Connection",
          description: "",
          tier: 1,
          weight: 1,
          initialLevel: level,
          target: 0.8,
          drift: { kind: "linear", ratePerHour: 0 },
          satiatedBy: [{ matches: { kind: "event", type: "conversation" }, amount: 0.9 }],
          pursuableBy: [{ satisfier: HEARTH }],
        },
      ],
    },
    practices: { seeds: [] },
    subscriptions: [],
    capabilities: [],
  });
}

/** Surfaces and commits to the being's one pursuable, the way the host would. */
function commitToTendingTheFire(being: Being): void {
  const eligible = embersEligibleToSurface(being)[0]!;
  const candidate = embersSurface(being, {
    sourceDriveId: eligible.driveId,
    satisfier: eligible.satisfier,
    aim: "tend the fire",
    trigger: { kind: "quiet" },
  });
  embersCommit(being, candidate.id);
}

function makeCtx(being?: Being): SystemContext {
  const place = createPlace({ id: "p", name: "P" });
  addRoom(place, { id: LOBBY, name: "Lobby", description: "" });

  const resident: ResidentState = {
    id: "r",
    character: {
      name: "R",
      archetype: "",
      systemPrompt: "",
      voice: { register: "warm", quirks: [], avoidances: [] },
      loyalties: { principal: null, values: [] },
    },
    presenceMode: "inhabitant",
    currentRoom: LOBBY,
    focusRoom: null,
    mood: { energy: 0.5, focus: 0.5, valence: 0 },
    being,
  };

  return {
    place,
    resident,
    residentMind: MIND,
    eventBus: new EventBus(),
    recentEvents: [],
    onGuestReturn: null,
  };
}

/** Runs only the AutonomySystem stage, with perceptions supplied directly. */
async function deliberates(
  ctx: SystemContext,
  event: PresenceEvent,
  confidence = 1,
): Promise<boolean> {
  const autonomy = createResidentPipeline().find((s) => s.name === "Autonomy")!;
  const state = await autonomy.run(
    {
      event,
      perceptions: [
        {
          sourceSensorId: sensorId("s"),
          roomId: LOBBY,
          modality: "sight",
          content: "something",
          confidence,
          at: new Date(),
        },
      ],
      shouldDeliberate: false,
      actions: [],
      actionResults: [],
    },
    ctx,
  );
  return state.shouldDeliberate;
}

const ambient: PresenceEvent = {
  type: "affordance.changed",
  affordanceId: "lamp" as never,
  roomId: LOBBY,
  prevState: {},
  newState: {},
  at: new Date(),
};

const spokenTo: PresenceEvent = {
  type: "guest.spoke",
  guestId: guestId("t"),
  roomId: LOBBY,
  text: "hello",
  at: new Date(),
};

describe("commitmentFromBeing", () => {
  it("is null without a Being", () => {
    expect(commitmentFromBeing(makeCtx())).toBeNull();
  });

  it("is null when the Being is pursuing nothing", () => {
    expect(commitmentFromBeing(makeCtx(beingWithPursuit(0.1)))).toBeNull();
  });

  it("reports the most urgent pursuit", () => {
    const being = beingWithPursuit(0.1);
    commitToTendingTheFire(being);

    const held = commitmentFromBeing(makeCtx(being))!;
    expect(held.aim).toBe("tend the fire");
    expect(held.urgency).toBeGreaterThan(0);
  });
});

describe("a committed resident", () => {
  it("does not deliberate about ambient change while occupied", async () => {
    // Pressure 0.7 → urgency 0.7. Ambient change is 0.25.
    const being = beingWithPursuit(0.1);
    commitToTendingTheFire(being);

    expect(await deliberates(makeCtx(being), ambient)).toBe(false);
  });

  it("still answers when spoken to", async () => {
    const being = beingWithPursuit(0.1);
    commitToTendingTheFire(being);

    expect(await deliberates(makeCtx(being), spokenTo)).toBe(true);
  });

  it("deliberates about ambient change once it is not occupied", async () => {
    const idle = beingWithPursuit(0.1); // eligible, but nothing committed
    expect(await deliberates(makeCtx(idle), ambient)).toBe(true);
  });

  it("yields to ambient change when the pursuit is barely pressing", async () => {
    // Pressure 0.22 — over the 0.2 surfacing threshold so it can be committed
    // to at all, but under ambient change's 0.25 salience. A commitment does
    // not outrank everything; it outranks what matters less than it does.
    const being = beingWithPursuit(0.58);
    commitToTendingTheFire(being);

    expect(commitmentFromBeing(makeCtx(being))!.urgency).toBeCloseTo(0.22, 10);
    expect(await deliberates(makeCtx(being), ambient)).toBe(true);
  });

  it("ignores a half-heard remark while urgently occupied", async () => {
    const being = beingWithPursuit(0.1); // urgency 0.7
    commitToTendingTheFire(being);

    // Spoken to, but faintly — 1.0 × 0.36 = 0.36, under 0.7.
    expect(await deliberates(makeCtx(being), spokenTo, 0.36)).toBe(false);
    // Spoken to clearly — 1.0, over 0.7.
    expect(await deliberates(makeCtx(being), spokenTo, 1)).toBe(true);
  });

  it("can be built without suppression at all", async () => {
    const being = beingWithPursuit(0.1);
    commitToTendingTheFire(being);

    const autonomy = createResidentPipeline({ suppressWhenCommitted: false }).find(
      (s) => s.name === "Autonomy",
    )!;
    const state = await autonomy.run(
      {
        event: ambient,
        perceptions: [
          {
            sourceSensorId: sensorId("s"),
            roomId: LOBBY,
            modality: "sight",
            content: "x",
            confidence: 1,
            at: new Date(),
          },
        ],
        shouldDeliberate: false,
        actions: [],
        actionResults: [],
      },
      makeCtx(being),
    );

    expect(state.shouldDeliberate).toBe(true);
  });
});

describe("pipeline shape", () => {
  it("matches the default pipeline's systems and order", () => {
    expect(createResidentPipeline().map((s) => s.name)).toEqual([
      "StatePropagation",
      "Sensor",
      "Memory",
      "Autonomy",
      "Resident",
      "ActionDispatch",
      "Broadcast",
    ]);
  });
});
