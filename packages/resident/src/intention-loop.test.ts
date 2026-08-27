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
  connectRooms,
  createPlace,
  dispatchAction,
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
  // An inhabitant has to be able to walk there, so the rooms must connect.
  connectRooms(place, LOBBY, STUDY);
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

describe("movement for a host", () => {
  function hostContext(focus = LOBBY) {
    const context = makeContext();
    context.resident.presenceMode = "host";
    context.resident.focusRoom = focus;
    return context;
  }

  it("resolves against focus, not the body", () => {
    // A host's currentRoom never changes; only focusRoom does. Comparing
    // against currentRoom would leave this resolving forever.
    expect(resolveSatisfier({ kind: "movement", ref: "study" }, hostContext(LOBBY))).toEqual({
      type: "move",
      toRoom: STUDY,
    });
    expect(resolveSatisfier({ kind: "movement", ref: "study" }, hostContext(STUDY))).toBeNull();
  });

  it("stops pursuing once attention has arrived", async () => {
    const being = beingWanting(0.1, { kind: "movement", ref: "study" });
    const loop = new IntentionLoop({
      model: new MockModelProvider(verdict("look in on the study", true)),
    });
    const context = hostContext(LOBBY);

    await loop.run(being, context, TICK, []);
    expect(embersCurrentIntentions(being)).toHaveLength(1);

    const actions = await loop.run(being, context, TICK, []);
    expect(actions).toEqual([{ type: "move", toRoom: STUDY }]);

    // The move lands: attention is now on the study.
    context.resident.focusRoom = STUDY;
    await loop.run(being, context, TICK, []);

    expect(embersCurrentIntentions(being)).toHaveLength(0);
    expect(being.history.intentionLog.at(-1)).toMatchObject({
      kind: "ended",
      end: { kind: "satisfied" },
    });
  });

  it("an inhabitant will not pursue a room it cannot walk to", () => {
    const context = makeContext(); // inhabitant, in the lobby
    // The Study connects to the Lobby, so that resolves.
    expect(resolveSatisfier({ kind: "movement", ref: "study" }, context)).not.toBeNull();

    context.place.rooms.get(LOBBY)!.connectedTo = [];
    expect(resolveSatisfier({ kind: "movement", ref: "study" }, context)).toBeNull();
  });
});

describe("effortful pursuits — work is world-clocked", () => {
  const PREP: Satisfier = { kind: "affordance", ref: "hearth", params: { actionId: "light" } };

  /** A hearth whose lighting is real work: three invocations, whoever makes them. */
  function workContext() {
    const context = makeContext(); // hearth unlit
    const hearthObj = context.place.rooms.get(LOBBY)!.affordances.get(HEARTH)!;
    hearthObj.actions[0]!.effort = 3;
    // The base fixture's action declares no stateChange (older tests flip the
    // state by hand); world-clocked completion needs the world to change.
    hearthObj.actions[0]!.stateChange = { lit: true };
    return context;
  }

  function beingWithWork() {
    return createBeing({
      id: "w",
      name: "W",
      drives: {
        tierCount: 1,
        drives: [
          {
            id: "upkeep",
            name: "Upkeep",
            description: "",
            tier: 1,
            weight: 1,
            initialLevel: 0.1,
            target: 0.8,
            drift: { kind: "linear", ratePerHour: 0 },
            satiatedBy: [{ matches: { kind: "action", type: "tend-affordance" }, amount: 0.6 }],
            pursuableBy: [{ satisfier: PREP, hint: "the hearth" }],
          },
        ],
      },
      practices: { seeds: [] },
      subscriptions: [],
      capabilities: [],
    });
  }

  /** The world takes the act, exactly as the pipeline's dispatch stage would. */
  function worldTakes(actions, context) {
    for (const action of actions) dispatchAction(action, context.place, context.resident);
  }

  it("acts every tick, and the being's progress trails the world's counter", async () => {
    const being = beingWithWork();
    const model = new MockModelProvider(verdict("light the hearth properly", true));
    const loop = new IntentionLoop({ model });
    const context = workContext();

    await loop.run(being, context, TICK, []); // surfaces + commits
    expect(model.calls).toHaveLength(1);
    // The being's commitment carries the world's effort figure, not a guess.
    expect(embersCurrentIntentions(being)[0]!.effort).toBe(3);

    const hearthObj = context.place.rooms.get(LOBBY)!.affordances.get(HEARTH)!;

    // Two working ticks: each returns the act, the world counts it, no model.
    for (const expected of [1, 2]) {
      const actions = await loop.run(being, context, TICK, []);
      expect(actions).toEqual([{ type: "act", affordanceId: HEARTH, actionId: "light" }]);
      worldTakes(actions, context);
      expect(hearthObj.state["~progress:light"]).toBe(expected);
      expect(hearthObj.state.lit).toBe(false); // not done until it is done
    }
    expect(model.calls).toHaveLength(1); // work is model-free

    // The completing tick: the act lands, the hearth lights.
    const final = await loop.run(being, context, TICK, []);
    worldTakes(final, context);
    expect(hearthObj.state.lit).toBe(true);

    // Completion is observed on the next pass, never declared.
    await loop.run(being, context, TICK, []);
    expect(embersCurrentIntentions(being)).toHaveLength(0);
    const endings = being.history.intentionLog.filter((e) => e.kind === "ended");
    expect(endings.at(-1)).toMatchObject({ end: { kind: "satisfied" } });
  });

  it("work done through any other door counts toward the pursuit", async () => {
    const being = beingWithWork();
    const loop = new IntentionLoop({ model: new MockModelProvider(verdict("light it", true)) });
    const context = workContext();

    await loop.run(being, context, TICK, []); // commit

    // Someone else — the model via its act tool, a second resident, a person —
    // does two thirds of the work.
    worldTakes([{ type: "act", affordanceId: HEARTH, actionId: "light" }], context);
    worldTakes([{ type: "act", affordanceId: HEARTH, actionId: "light" }], context);

    // The pursuit sees the world's progress, not a private counter.
    const actions = await loop.run(being, context, TICK, []);
    expect(embersCurrentIntentions(being)[0]!.progress).toBeGreaterThan(0);
    worldTakes(actions, context);

    const hearthObj = context.place.rooms.get(LOBBY)!.affordances.get(HEARTH)!;
    expect(hearthObj.state.lit).toBe(true);
  });

  it("a world that refuses the act produces attempts, and the pursuit lapses honestly", async () => {
    const being = beingWithWork();
    const loop = new IntentionLoop({ model: new MockModelProvider(verdict("light it", true)) });
    const context = workContext();

    await loop.run(being, context, TICK, []); // commit

    // The acts are returned but the world never takes them — a jammed
    // actuator, a stuck door. Each stalled tick is a real attempt.
    let lapsed = false;
    for (let i = 0; i < 12 && !lapsed; i++) {
      await loop.run(being, context, TICK, []); // never dispatched
      lapsed = embersCurrentIntentions(being).length === 0;
    }
    expect(lapsed).toBe(true);
    const endings = being.history.intentionLog.filter((e) => e.kind === "ended");
    expect(endings.at(-1)).toMatchObject({ end: { kind: "expired" } });
  });
});
