/**
 * The intention loop, end to end.
 *
 * The claim: a resident alone in a room, with nothing arriving, does something
 * nobody asked for — and every step of it traces back to a drive.
 */

import { createBeing } from "@embersjs/core";
import {
  type Affordance,
  addAffordance,
  addGuest,
  addRoom,
  affordanceId,
  createPlace,
  enterRoom,
  guestId,
  type Place,
  type PresenceEvent,
  type ResidentState,
  type RuntimeContext,
  roomId,
  sensorId,
} from "@hauntjs/core";
import { describe, expect, it } from "vitest";
import type { Being, Satisfier } from "./embers.js";
import { embersCurrentIntentions } from "./embers.js";
import { IntentionLoop, resolveSatisfier } from "./intention-loop.js";
import { MockModelProvider } from "./model/mock.js";

const LOBBY = roomId("lobby");
const STUDY = roomId("study");
const HEARTH = affordanceId("hearth");

const TEND_FIRE: Satisfier = {
  kind: "affordance",
  ref: "hearth",
  params: { actionId: "light" },
};

const TICK: PresenceEvent = { type: "tick", at: new Date() };

function hearth(lit: boolean): Affordance {
  return {
    id: HEARTH,
    roomId: LOBBY,
    kind: "fireplace",
    name: "Hearth",
    description: "A stone fireplace.",
    state: { lit },
    actions: [
      {
        id: "light",
        name: "Light",
        description: "Light the fire",
        availableWhen: (s) => s.lit === false,
      },
    ],
    sensable: true,
  };
}

function makeContext(options: { lit?: boolean; guest?: boolean; being?: Being } = {}) {
  const place: Place = createPlace({ id: "p", name: "P" });
  addRoom(place, { id: LOBBY, name: "Lobby", description: "A hall with a fireplace." });
  addRoom(place, { id: STUDY, name: "Study", description: "Books." });
  addAffordance(place, LOBBY, hearth(options.lit ?? false));

  // Sensed, so `perceivePresence` can tell whether the room is quiet.
  const sid = sensorId("lobby.sight");
  place.rooms.get(LOBBY)!.sensors.set(sid, {
    id: sid,
    roomId: LOBBY,
    modality: "sight",
    name: "Line of sight",
    description: "",
    fidelity: { kind: "full" },
    enabled: true,
    reach: { kind: "room" },
  });

  if (options.guest) {
    const g = addGuest(place, { id: guestId("takeshi"), name: "Takeshi" });
    enterRoom(place, g.id, LOBBY);
  }

  const resident: ResidentState = {
    id: "r",
    character: {
      name: "Poe",
      archetype: "the keeper of this place",
      systemPrompt: "",
      voice: { register: "warm", quirks: [], avoidances: [] },
      loyalties: { principal: null, values: [] },
    },
    presenceMode: "inhabitant",
    currentRoom: LOBBY,
    focusRoom: null,
    mood: { energy: 0.5, focus: 0.5, valence: 0 },
    being: options.being,
  };

  const context: RuntimeContext = {
    place,
    resident,
    recentEvents: [],
    guestsInRoom: [],
  };
  return context;
}

function beingWanting(level: number, satisfier: Satisfier = TEND_FIRE): Being {
  return createBeing({
    id: "poe",
    name: "Poe",
    drives: {
      tierCount: 1,
      drives: [
        {
          id: "tending",
          name: "Tending",
          description: "The need to keep this place as it should be.",
          tier: 1,
          weight: 1,
          initialLevel: level,
          target: 0.8,
          drift: { kind: "linear", ratePerHour: -0.02 },
          satiatedBy: [{ matches: { kind: "action", type: "tend-affordance" }, amount: 0.4 }],
          pursuableBy: [{ satisfier, hint: "the hearth, unlit" }],
        },
      ],
    },
    practices: { seeds: [] },
    subscriptions: [],
    capabilities: [],
  });
}

function verdict(aim: string, worthPursuing: boolean, reason = "because") {
  return { content: JSON.stringify({ aim, worthPursuing, reason }) };
}

describe("resolveSatisfier", () => {
  it("turns an affordance token into an act action", () => {
    const action = resolveSatisfier(TEND_FIRE, makeContext());
    expect(action).toEqual({ type: "act", affordanceId: HEARTH, actionId: "light" });
  });

  it("returns null when the action's guard fails", () => {
    // The fire is already lit — not something to go and light.
    expect(resolveSatisfier(TEND_FIRE, makeContext({ lit: true }))).toBeNull();
  });

  it("returns null for an affordance in another room, for an inhabitant", () => {
    const context = makeContext();
    context.resident.currentRoom = STUDY;
    expect(resolveSatisfier(TEND_FIRE, context)).toBeNull();
  });

  it("lets a host act on an affordance anywhere", () => {
    const context = makeContext();
    context.resident.currentRoom = STUDY;
    context.resident.presenceMode = "host";
    expect(resolveSatisfier(TEND_FIRE, context)).not.toBeNull();
  });

  it("resolves a movement token", () => {
    const action = resolveSatisfier({ kind: "movement", ref: "study" }, makeContext());
    expect(action).toEqual({ type: "move", toRoom: STUDY });
  });

  it("returns null for movement to where it already is, or nowhere", () => {
    expect(resolveSatisfier({ kind: "movement", ref: "lobby" }, makeContext())).toBeNull();
    expect(resolveSatisfier({ kind: "movement", ref: "attic" }, makeContext())).toBeNull();
  });

  it("returns null for a satisfier kind it does not understand", () => {
    expect(resolveSatisfier({ kind: "telepathy", ref: "x" }, makeContext())).toBeNull();
  });
});

describe("the loop", () => {
  it("acts unprompted in a quiet room", async () => {
    const being = beingWanting(0.1);
    const model = new MockModelProvider(verdict("tend the fire before it dies", true));
    const loop = new IntentionLoop({ model });
    const context = makeContext({ being });

    // Nothing arrived. Nobody asked. A tick, in an empty room.
    const first = await loop.run(being, context, TICK, []);
    expect(first).toEqual([]); // surfacing happens, acting comes next tick

    const committed = embersCurrentIntentions(being);
    expect(committed).toHaveLength(1);
    expect(committed[0]!.aim).toBe("tend the fire before it dies");

    const second = await loop.run(being, context, TICK, []);
    expect(second).toEqual([{ type: "act", affordanceId: HEARTH, actionId: "light" }]);
  });

  it("traces the action back to the drive that caused it", async () => {
    const being = beingWanting(0.1);
    const loop = new IntentionLoop({
      model: new MockModelProvider(verdict("tend the fire", true)),
    });
    const context = makeContext({ being });

    await loop.run(being, context, TICK, []);

    const [pursuit] = embersCurrentIntentions(being);
    expect(pursuit!.sourceDriveId).toBe("tending");
    // And the surfacing that produced it is still reachable from the log.
    expect(being.history.intentionLog.some((e) => e.kind === "surfaced")).toBe(true);
  });

  it("declines when the model says it is not the moment", async () => {
    const being = beingWanting(0.1);
    const loop = new IntentionLoop({
      model: new MockModelProvider(verdict("tend the fire", false, "a guest is mid-sentence")),
    });

    await loop.run(being, makeContext({ being }), TICK, []);

    expect(embersCurrentIntentions(being)).toHaveLength(0);
    expect(being.history.intentionLog.filter((e) => e.kind === "declined")).toHaveLength(1);
  });

  it("stays quiet when the room is not quiet", async () => {
    const being = beingWanting(0.5); // pressure 0.3, under the urgent floor
    const model = new MockModelProvider(verdict("tend the fire", true));
    const loop = new IntentionLoop({ model });

    await loop.run(being, makeContext({ being, guest: true }), TICK, []);

    // A guest is present, so this is not an undisturbed moment, and the
    // pressure is not high enough to override that.
    expect(model.calls).toHaveLength(0);
    expect(embersCurrentIntentions(being)).toHaveLength(0);
  });

  it("surfaces despite company when the need is hard to ignore", async () => {
    const being = beingWanting(0.1); // pressure 0.7, over the 0.6 floor
    const model = new MockModelProvider(verdict("tend the fire", true));
    const loop = new IntentionLoop({ model });

    await loop.run(being, makeContext({ being, guest: true }), TICK, []);
    expect(embersCurrentIntentions(being)).toHaveLength(1);
  });

  it("never surfaces something it could not act on", async () => {
    const being = beingWanting(0.1);
    const model = new MockModelProvider(verdict("tend the fire", true));
    const loop = new IntentionLoop({ model });

    // The fire is already lit, so the satisfier does not resolve.
    await loop.run(being, makeContext({ being, lit: true }), TICK, []);

    expect(model.calls).toHaveLength(0);
    expect(embersCurrentIntentions(being)).toHaveLength(0);
  });

  it("ends a pursuit once it is no longer actionable", async () => {
    const being = beingWanting(0.1);
    const loop = new IntentionLoop({
      model: new MockModelProvider(verdict("tend the fire", true)),
    });

    await loop.run(being, makeContext({ being }), TICK, []);
    expect(embersCurrentIntentions(being)).toHaveLength(1);

    // Someone else lit it.
    await loop.run(being, makeContext({ being, lit: true }), TICK, []);

    expect(embersCurrentIntentions(being)).toHaveLength(0);
    expect(being.history.intentionLog.at(-1)).toMatchObject({
      kind: "ended",
      end: { kind: "satisfied" },
    });
  });

  it("does not go looking while already occupied", async () => {
    const being = beingWanting(0.1);
    const model = new MockModelProvider(verdict("tend the fire", true));
    const loop = new IntentionLoop({ model });
    const context = makeContext({ being });

    await loop.run(being, context, TICK, []);
    expect(model.calls).toHaveLength(1);

    await loop.run(being, context, TICK, []);
    await loop.run(being, context, TICK, []);
    // Still one call — it is doing something, not shopping for something else.
    expect(model.calls).toHaveLength(1);
  });

  it("surfaces nothing when the verdict will not parse", async () => {
    const being = beingWanting(0.1);
    const loop = new IntentionLoop({
      model: new MockModelProvider({ content: "I'm not sure what you mean." }),
    });

    await loop.run(being, makeContext({ being }), TICK, []);

    // Nothing committed, and nothing recorded either — an unparseable verdict
    // is not a decline, it is a call that did not happen.
    expect(embersCurrentIntentions(being)).toHaveLength(0);
    expect(being.history.intentionLog).toHaveLength(0);
  });

  it("survives a model that throws", async () => {
    const being = beingWanting(0.1);
    const loop = new IntentionLoop({
      model: {
        name: "broken",
        chat: async () => {
          throw new Error("upstream is down");
        },
      },
    });

    await expect(loop.run(being, makeContext({ being }), TICK, [])).resolves.toEqual([]);
    expect(embersCurrentIntentions(being)).toHaveLength(0);
  });

  it("treats an affordance change as a coincidence worth noticing", async () => {
    const being = beingWanting(0.5); // under the urgent floor, so only coincidence can trigger
    const model = new MockModelProvider(verdict("tend the fire", true));
    const loop = new IntentionLoop({ model });

    const changed: PresenceEvent = {
      type: "affordance.changed",
      affordanceId: HEARTH,
      roomId: LOBBY,
      prevState: { lit: true },
      newState: { lit: false },
      at: new Date(),
    };

    await loop.run(being, makeContext({ being, guest: true }), changed, []);

    // The fire going out is what made tending it thinkable, guest or no guest.
    expect(embersCurrentIntentions(being)).toHaveLength(1);
    expect(being.history.intentionLog[0]).toMatchObject({
      kind: "surfaced",
      candidate: { trigger: { kind: "coincidence" } },
    });
  });
});
