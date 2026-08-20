import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../event-bus.js";
import { addRoom, createPlace } from "../place.js";
import type {
  Perception,
  PresenceEvent,
  ResidentMind,
  ResidentState,
  SensorModality,
} from "../types.js";
import { guestId, roomId, sensorId } from "../types.js";
import { AutonomySystem, defaultSalience, type StandingCommitment } from "./autonomy-system.js";
import type { PipelineState, SystemContext } from "./types.js";

const LOBBY = roomId("lobby");

const MIND: ResidentMind = { perceive: async () => null };

function makeCtx(overrides: Partial<SystemContext> = {}): SystemContext {
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
  };

  return {
    place,
    resident,
    residentMind: MIND,
    eventBus: new EventBus(),
    recentEvents: [],
    onGuestReturn: null,
    ...overrides,
  };
}

function perception(confidence: number, modality: SensorModality = "sight"): Perception {
  return {
    sourceSensorId: sensorId("s"),
    roomId: LOBBY,
    modality,
    content: "something",
    confidence,
    at: new Date(),
  };
}

function pipeline(event: PresenceEvent, perceptions: Perception[] = []): PipelineState {
  return { event, perceptions, shouldDeliberate: false, actions: [], actionResults: [] };
}

const spoke: PresenceEvent = {
  type: "guest.spoke",
  guestId: guestId("t"),
  roomId: LOBBY,
  text: "hello",
  at: new Date(),
};

const affordanceChanged: PresenceEvent = {
  type: "affordance.changed",
  affordanceId: "hearth" as never,
  roomId: LOBBY,
  prevState: {},
  newState: {},
  at: new Date(),
};

function commitment(urgency: number): StandingCommitment {
  return { id: "int-1", aim: "tend the fire", urgency };
}

describe("base behavior (no commitment provider)", () => {
  it("is unchanged from before commitments existed", async () => {
    const system = new AutonomySystem();
    const ctx = makeCtx();

    // No mind → never deliberate.
    expect(
      (await system.run(pipeline(spoke, [perception(1)]), makeCtx({ residentMind: null })))
        .shouldDeliberate,
    ).toBe(false);

    // Resident's own actions are skipped, to avoid a loop.
    for (const type of ["resident.spoke", "resident.moved", "resident.acted"] as const) {
      const event = { type, at: new Date() } as unknown as PresenceEvent;
      expect((await system.run(pipeline(event, [perception(1)]), ctx)).shouldDeliberate).toBe(
        false,
      );
    }

    // Ticks always pass.
    expect(
      (await system.run(pipeline({ type: "tick", at: new Date() }), ctx)).shouldDeliberate,
    ).toBe(true);

    // Sensed external events pass; unsensed ones do not.
    expect((await system.run(pipeline(spoke, [perception(1)]), ctx)).shouldDeliberate).toBe(true);
    expect((await system.run(pipeline(spoke, []), ctx)).shouldDeliberate).toBe(false);
  });
});

describe("commitment suppression", () => {
  it("suppresses an event less salient than what the resident is doing", async () => {
    const system = new AutonomySystem({ commitment: () => commitment(0.9) });

    // affordance.changed at full confidence is 0.25 — well under 0.9.
    const state = await system.run(pipeline(affordanceChanged, [perception(1)]), makeCtx());
    expect(state.shouldDeliberate).toBe(false);
  });

  it("lets a more salient event through", async () => {
    const system = new AutonomySystem({ commitment: () => commitment(0.5) });

    // Being spoken to at full confidence is 1.0.
    const state = await system.run(pipeline(spoke, [perception(1)]), makeCtx());
    expect(state.shouldDeliberate).toBe(true);
  });

  it("never suppresses a tick — that is when a commitment gets acted on", async () => {
    const system = new AutonomySystem({ commitment: () => commitment(1) });

    const state = await system.run(pipeline({ type: "tick", at: new Date() }), makeCtx());
    expect(state.shouldDeliberate).toBe(true);
  });

  it("does not suppress when there is no commitment", async () => {
    const system = new AutonomySystem({ commitment: () => null });

    const state = await system.run(pipeline(affordanceChanged, [perception(1)]), makeCtx());
    expect(state.shouldDeliberate).toBe(true);
  });

  it("reports a suppression, so a busy resident is distinguishable from a broken one", async () => {
    const onSuppressed = vi.fn();
    const system = new AutonomySystem({ commitment: () => commitment(0.9), onSuppressed });

    await system.run(pipeline(affordanceChanged, [perception(1)]), makeCtx());

    expect(onSuppressed).toHaveBeenCalledTimes(1);
    const [event, salience, held] = onSuppressed.mock.calls[0]!;
    expect(event.type).toBe("affordance.changed");
    expect(salience).toBeCloseTo(0.25, 10);
    expect(held.aim).toBe("tend the fire");
  });

  it("does not report when nothing was suppressed", async () => {
    const onSuppressed = vi.fn();
    const system = new AutonomySystem({ commitment: () => commitment(0.1), onSuppressed });

    await system.run(pipeline(spoke, [perception(1)]), makeCtx());
    expect(onSuppressed).not.toHaveBeenCalled();
  });

  it("still gates on perception before ever consulting the commitment", async () => {
    const provider = vi.fn(() => commitment(0.1));
    const system = new AutonomySystem({ commitment: provider });

    const state = await system.run(pipeline(spoke, []), makeCtx());
    expect(state.shouldDeliberate).toBe(false);
    // An unsensed event is invisible; there is nothing to weigh against.
    expect(provider).not.toHaveBeenCalled();
  });

  it("honors a custom salience function", async () => {
    const system = new AutonomySystem({
      commitment: () => commitment(0.9),
      // A place where ambient change matters more than being addressed.
      salience: (event) => (event.type === "affordance.changed" ? 1 : 0),
    });

    expect(
      (await system.run(pipeline(affordanceChanged, [perception(1)]), makeCtx())).shouldDeliberate,
    ).toBe(true);
    expect((await system.run(pipeline(spoke, [perception(1)]), makeCtx())).shouldDeliberate).toBe(
      false,
    );
  });
});

describe("defaultSalience", () => {
  it("ranks direct address above arrival above ambient change", async () => {
    const p = [perception(1)];
    expect(defaultSalience(spoke, p)).toBeGreaterThan(
      defaultSalience(
        { type: "guest.entered", guestId: guestId("t"), roomId: LOBBY, at: new Date() },
        p,
      ),
    );
    expect(
      defaultSalience(
        { type: "guest.entered", guestId: guestId("t"), roomId: LOBBY, at: new Date() },
        p,
      ),
    ).toBeGreaterThan(defaultSalience(affordanceChanged, p));
  });

  it("scales by the strongest perception, so a faint event interrupts less", () => {
    expect(defaultSalience(spoke, [perception(0.3)])).toBeCloseTo(0.3, 10);
    expect(defaultSalience(spoke, [perception(0.3), perception(0.9)])).toBeCloseTo(0.9, 10);
  });

  it("is zero with no perceptions at all", () => {
    expect(defaultSalience(spoke, [])).toBe(0);
  });

  it("makes a half-heard remark yield to an urgent commitment", async () => {
    const system = new AutonomySystem({ commitment: () => commitment(0.7) });

    // Spoken to, but two rooms away through a wall.
    const faint = await system.run(pipeline(spoke, [perception(0.36)]), makeCtx());
    expect(faint.shouldDeliberate).toBe(false);

    // Spoken to in the room.
    const clear = await system.run(pipeline(spoke, [perception(1)]), makeCtx());
    expect(clear.shouldDeliberate).toBe(true);
  });
});

describe("host movement", () => {
  it("emits resident.moved so drives relieved by movement can ease", async () => {
    const { dispatchAction } = await import("../action-handlers.js");
    const ctx = makeCtx();
    ctx.resident.presenceMode = "host";
    ctx.resident.focusRoom = LOBBY;
    addRoom(ctx.place, { id: roomId("study"), name: "Study", description: "" });

    const result = dispatchAction(
      { type: "move", toRoom: roomId("study") },
      ctx.place,
      ctx.resident,
    );

    expect(result.success).toBe(true);
    expect(ctx.resident.focusRoom).toBe(roomId("study"));
    // Without this event nothing downstream sees the move: no integration, so a
    // drive satiated by movement would never ease however often it moved.
    expect(result.event).toMatchObject({
      type: "resident.moved",
      from: LOBBY,
      to: roomId("study"),
    });
  });

  it("reports no event for a move to where attention already is", async () => {
    const { dispatchAction } = await import("../action-handlers.js");
    const ctx = makeCtx();
    ctx.resident.presenceMode = "host";
    ctx.resident.focusRoom = LOBBY;

    const result = dispatchAction({ type: "move", toRoom: LOBBY }, ctx.place, ctx.resident);

    expect(result.success).toBe(true);
    // Satiating a drive for having done nothing would be a free lunch.
    expect(result.event).toBeUndefined();
  });

  it("lets a host attend an unconnected room", async () => {
    const { dispatchAction } = await import("../action-handlers.js");
    const ctx = makeCtx();
    ctx.resident.presenceMode = "host";
    ctx.resident.focusRoom = LOBBY;
    // Deliberately not connected to the lobby.
    addRoom(ctx.place, { id: roomId("attic"), name: "Attic", description: "" });

    const result = dispatchAction(
      { type: "move", toRoom: roomId("attic") },
      ctx.place,
      ctx.resident,
    );
    expect(result.success).toBe(true);
  });
});
