# Phase 2 — Architecture Addendum

This document extends `ARCHITECTURE.md` with two paired additions:

1. The **Sensor layer** — perception as a first-class primitive
2. The **Systems pipeline** — a clean, named structure for the runtime tick

These are paired because they touch the same hot path. Implementing one without the other would force a second refactor of the same code within weeks.

Read this alongside the existing `ARCHITECTURE.md`. Anything not mentioned here is unchanged from Phase 1.

---

## Part 1: The Sensor Layer

### Why this exists

In Phase 1, the resident perceives events directly. An event fires, the resident knows. This is omniscience by default, and it flattens the place into a single bucket of shared awareness.

Phase 2 introduces **Sensors** as the channel through which events become perceptible to the resident. A sensor is typed, scoped, and fidelity-bounded. Events fired in a room aren't seen by the resident unless some sensor in the resident's perceptual reach picks them up — and what the resident perceives is the *sensor's report*, not the ground-truth event.

This structural change delivers:

- Rooms that meaningfully differ in what can be known about them (a bathroom vs. a lobby)
- Privacy as a first-class dynamic (closing a door can genuinely blind the resident)
- Interpretive perception (the resident reasons about what it saw, rather than consuming a log)
- Character differentiation by sensory profile (a library spirit vs. a panopticon hotel)
- A clean mapping to physical-world sensors later (Home Assistant adapter, Matter, etc.)

### The new primitives

Add to `@hauntjs/core/src/types.ts`:

```ts
type SensorId = string;

interface Sensor {
  id: SensorId;
  roomId: RoomId;
  modality: SensorModality;
  name: string;
  description: string;               // used in prompts to the resident
  fidelity: SensorFidelity;
  enabled: boolean;                  // can be toggled at runtime
  reach: SensorReach;                // what this sensor can perceive
}

type SensorModality =
  | "sight"
  | "sound"
  | "presence"
  | "state"
  | "text"
  | string;                          // extensible — adapters can define more

type SensorFidelity =
  | { kind: "full" }
  | { kind: "partial"; reveals: PerceptionField[] }
  | { kind: "ambiguous"; confidence: number }   // 0-1
  | { kind: "delayed"; delayMs: number };

type PerceptionField =
  | "presence"       // someone is/isn't there
  | "identity"       // who they are
  | "content"        // what was said/done
  | "count"          // how many
  | "mood"           // emotional tone
  | string;

type SensorReach =
  | { kind: "room" }                                // picks up events in its own room
  | { kind: "adjacent"; maxDepth?: number }         // through open doorways, etc.
  | { kind: "affordance"; affordanceId: AffordanceId }  // scoped to one object
  | { kind: "place-wide" };                         // rare — a god-sensor

interface Perception {
  sourceSensorId: SensorId;
  roomId: RoomId;                    // where the perceived event occurred
  modality: SensorModality;
  content: string;                   // what the sensor reports, in prose
  confidence: number;                // 0-1
  at: Date;
  rawEvent?: PresenceEvent;          // for debugging, not shown to resident
}
```

Update `Room` to include sensors:

```ts
interface Room {
  id: RoomId;
  name: string;
  description: string;
  affordances: Map<AffordanceId, Affordance>;
  sensors: Map<SensorId, Sensor>;     // NEW
  connectedTo: RoomId[];
  state: Record<string, unknown>;
}
```

### The strict-by-default rule

**A room with no sensors is perceptually dark to the resident.** Events fire, but nothing is perceived. This is deliberate.

The rationale: omniscient-by-default made Phase 1 feel fine but made rooms meaningless. Strict-by-default forces the place author to think about *what the resident knows*, which is exactly the thoughtfulness that makes a Haunt place interesting rather than a chatbot with a tilemap.

The escape hatch: for authors who genuinely want the omniscient feel (e.g., a writing-retreat-style cozy place where the resident is meant to be ambiently aware), ship a pre-built `omniscient.place-wide.sensor` that an author can drop into a room to restore Phase 1 behavior in one line. This makes the choice explicit.

### The perception flow

The Phase 1 flow was:

```
PlaceAdapter → PresenceEvent → Runtime → Resident.perceive(event)
```

The Phase 2 flow is:

```
PlaceAdapter → PresenceEvent → Runtime
                                  ↓
                       SensorPipeline.filter(event, place)
                                  ↓
                       Perception[] (possibly empty)
                                  ↓
                       Resident.perceive(perceptions, context)
```

Note the plural: a single event may produce multiple perceptions (a guest speaking in a room with both a camera and a mic produces two perceptions), zero perceptions (an event in an unsensored room), or a single perception. The resident sees *perceptions*, not events.

### Sensor authoring

A `Sensor` can be authored two ways:

**Inline, at room-definition time:**

```ts
const bathroom: Room = {
  id: "bathroom",
  name: "Bathroom",
  description: "A small tiled bathroom. Private.",
  affordances: new Map([/* toilet, sink */]),
  sensors: new Map([
    ["bathroom.door-motion", {
      id: "bathroom.door-motion",
      roomId: "bathroom",
      modality: "presence",
      name: "Door motion sensor",
      description: "A motion sensor by the door. Detects entry and exit.",
      fidelity: { kind: "partial", reveals: ["presence"] },
      enabled: true,
      reach: { kind: "room" },
    }],
    ["bathroom.intercom", {
      id: "bathroom.intercom",
      roomId: "bathroom",
      modality: "sound",
      name: "Intercom speaker",
      description: "An old ceiling intercom. Picks up sound, but muffled.",
      fidelity: { kind: "ambiguous", confidence: 0.4 },
      enabled: true,
      reach: { kind: "room" },
    }],
  ]),
  connectedTo: ["hallway"],
  state: {},
};
```

**From a library of pre-built sensor types.** Ship common sensors in `@hauntjs/core/sensors/` so authors don't rewrite them:

```ts
import { presenceSensor, mutedAudioSensor, stateSensor } from "@hauntjs/core/sensors";

const bathroom: Room = {
  ...
  sensors: new Map([
    presenceSensor("bathroom.door"),
    mutedAudioSensor("bathroom.intercom"),
    stateSensor("bathroom.light", { affordanceId: "bathroom.light-switch" }),
  ]),
};
```

The pre-built sensors are just factory functions returning well-configured `Sensor` objects.

### The SensorPipeline

A new module in `@hauntjs/core`: `src/sensor-pipeline.ts`. Its job:

1. Receive a `PresenceEvent` and the current `Place`.
2. Find all sensors whose `reach` includes the event's location.
3. For each such sensor, check its `enabled` state and `modality` match against the event type.
4. Call the sensor's `perceive` function (or the default perceiver for its modality) to produce a `Perception` or null.
5. Return the array of `Perception`s.

```ts
interface SensorPipeline {
  filter(event: PresenceEvent, place: Place): Perception[];
}
```

The default perceiver logic (for each modality × event combination) lives in `@hauntjs/core/src/sensor-pipeline.ts`. A sensor can override this with a custom `perceive` function for special cases. Most authored sensors use the defaults.

### Event → Perception mapping

Not every event is meaningful to every modality. The default mappings:

| Event type | sight | sound | presence | state | text |
|---|---|---|---|---|---|
| `guest.entered` | ✓ | ✗ | ✓ | ✗ | ✗ |
| `guest.left` | ✓ | ✗ | ✓ | ✗ | ✗ |
| `guest.moved` | ✓ | ✗ | ✓ | ✗ | ✗ |
| `guest.spoke` | ✗ | ✓ | ✓ (partial) | ✗ | ✓ (if typed chat) |
| `affordance.changed` | ✓ | ✗ (usually) | ✗ | ✓ | ✗ |
| `resident.moved` | n/a (the resident is the perceiver) |
| `resident.spoke` | n/a |
| `resident.acted` | n/a |
| `tick` | n/a (not a perceptual event) |

Sensor `fidelity` modifies these. A `partial` fidelity with `reveals: ["presence"]` on a sight sensor will perceive `guest.entered` as "someone entered" without naming them. An `ambiguous` sound sensor might report "I hear voices but can't make out what's being said."

### Perception content generation

The `content` field of a `Perception` is the prose string the resident will see. It's generated by the sensor based on the event + fidelity. For sensor authors who don't want to write these by hand, ship default content-templates per modality × event combination.

Example, for a full-fidelity sight sensor seeing `guest.entered`:
> "Mrs. Voss entered the Lobby at 9:47 PM."

For a partial-fidelity presence sensor seeing the same event:
> "Someone entered the Lobby at 9:47 PM."

For an ambiguous sound sensor seeing `guest.spoke`:
> "I hear someone speaking in the Bathroom, but the intercom is muffled — I can't make out the words."

### Sensor toggling

Sensors have an `enabled` field. This is deliberately runtime-mutable because it unlocks dramatic possibilities:

- A guest turns off the lights → the `sight` sensors in that room become disabled
- A guest covers a camera → that specific sensor becomes disabled
- The resident's "files are corrupting" → sensors randomly disable and re-enable

Affordances can toggle sensors. Add to `AffordanceAction`:

```ts
interface AffordanceAction {
  id: string;
  name: string;
  description: string;
  params?: Record<string, JsonSchema>;
  availableWhen?: (state: Record<string, unknown>) => boolean;
  affects?: SensorAffect[];             // NEW
}

interface SensorAffect {
  sensorId: SensorId;
  change: { enabled: boolean } | { fidelity: SensorFidelity };
}
```

Now a `light-switch` affordance action `turn-off` can declare `affects: [{ sensorId: "hallway.camera", change: { enabled: false } }]` and the runtime handles the rest.

### Prompt assembly changes

The biggest downstream change is in `@hauntjs/resident/src/prompt.ts`. The resident's context block must now describe its *sensory situation*, not just its recent events.

Old prompt skeleton (Phase 1):

```
You are [character]. You are in [room].
Recent events:
- [event 1]
- [event 2]
```

New prompt skeleton (Phase 2):

```
You are [character]. You are in [room: [name] — [description]].

Your current perceptual reach:
- In this room you have: [list of enabled sensors and their descriptions]
- Through [connection], you can [describe reach into adjacent rooms]
- The following rooms are currently dark to you: [list]

What you've perceived recently:
- [perception 1, with source sensor and confidence]
- [perception 2]

What you know but haven't perceived directly (from memory):
- [recalled context]
```

This is a significantly more structured prompt. The resident now reasons about its perception, which is the whole point.

### The Roost sensor layout

Update the demo world in `packages/demo-roost/src/world-config.ts` to declare realistic sensors per room. Suggested layout:

**Lobby** — public, well-perceived
- `presence` sensor, full fidelity (front desk has a clear view)
- `sight` sensor, full fidelity (the resident can see the whole lobby)
- `sound` sensor, full fidelity
- `state` sensor on fireplace affordance
- `state` sensor on notice board affordance

**Study** — semi-private, focused
- `sight` sensor, full fidelity (but only in this room)
- `sound` sensor, full fidelity
- `state` sensor on desk (knows if notes are on it)
- `state` sensor on bookshelf
- No reach into other rooms

**Parlor** — public but acoustically live
- `sight` sensor, partial fidelity (reveals: presence, identity — but not content of actions)
- `sound` sensor, full fidelity
- `sound` sensor with `reach: adjacent` to the Lobby (sound travels between these two)

**Garden** — outdoors, sparser
- `presence` sensor, partial fidelity (reveals: presence only — "someone is out there")
- `sound` sensor, ambiguous fidelity (wind interference)
- No sight sensor — the resident can't see into the garden from inside

This gives the resident a meaningfully different experience in each room, which is exactly the point.

### Sensor debugging

Add a dev-only overlay in the 2D client that visualizes the resident's current perception. Show:

- Which rooms are perceptually reachable right now
- Which sensors are active in each
- Which sensors are disabled
- The last few perceptions the resident received

This is crucial for tuning. Without it, you're authoring sensor configs blind.

---

## Part 2: The Systems Pipeline

### Why this exists

In Phase 1, the runtime tick handler is a monolithic function that does several things in sequence: processes the incoming event, updates state, checks for memory writes, decides whether to call the resident, etc. This worked at v0.1 scale but will become unmaintainable as we add sensors, richer memory, autonomous behaviors, and multi-guest dynamics.

Phase 2 restructures the runtime loop as a **pipeline of named systems** that each do one thing. This is inspired by ECS (see conversation history), but is *not* an ECS — it's just good separation of concerns with ECS vocabulary.

### The pipeline shape

Every event and every tick flows through the same pipeline:

```
Input (event or tick)
    ↓
┌─────────────────────────┐
│ 1. StatePropagationSystem│   applies raw event to place state
├─────────────────────────┤
│ 2. SensorSystem          │   routes event through sensors → perceptions
├─────────────────────────┤
│ 3. MemorySystem          │   updates memory based on perceptions
├─────────────────────────┤
│ 4. AutonomySystem        │   decides whether to invoke the resident
├─────────────────────────┤
│ 5. ResidentSystem        │   if invoked, gets an action back
├─────────────────────────┤
│ 6. ActionDispatchSystem  │   sends resident action to place adapter
├─────────────────────────┤
│ 7. BroadcastSystem       │   emits state updates to connected clients
└─────────────────────────┘
    ↓
Output (state mutated, actions dispatched)
```

Each system is a pure-ish function: `(input, world) → (output, new world)`. Systems don't call each other. The Runtime orchestrates the pipeline.

### System interface

```ts
interface System<TInput = unknown, TOutput = unknown> {
  name: string;
  run(input: TInput, ctx: SystemContext): Promise<TOutput>;
}

interface SystemContext {
  place: Place;
  resident: Resident;
  memory: MemoryStore;
  clock: Clock;
  logger: Logger;
}
```

The Runtime holds the systems in order and runs them as a pipeline:

```ts
class Runtime {
  private systems: System[];

  async processEvent(event: PresenceEvent) {
    let pipeline = { event, perceptions: [], action: null };
    for (const system of this.systems) {
      pipeline = await system.run(pipeline, this.ctx);
    }
  }
}
```

The actual type shape of the pipeline object evolves along the way (TypeScript can model this with a series of type transitions), but the organizing principle is: each system reads what it needs, writes what it produces, and passes the accumulator forward.

### What each system does

**1. StatePropagationSystem.** Applies the raw event to the place's state. `guest.moved` updates the guest's `currentRoom`. `affordance.changed` updates the affordance's `state`. This is the deterministic, fast part — no model calls, no reasoning. Just bookkeeping.

**2. SensorSystem.** The SensorPipeline from Part 1. Reads the event, consults the place's sensors, produces perceptions. Adds them to the pipeline accumulator.

**3. MemorySystem.** Updates working memory with the new perceptions. Updates per-guest memory (last-seen, visit-count, etc.) when relevant. Does NOT yet decide whether to write long-term memory — that's the resident's choice, in system 5.

**4. AutonomySystem.** Decides whether to invoke the resident at all. Not every event deserves a model call. Rules (configurable):
   - Direct speech to the resident → always invoke
   - Guest enters/leaves a room the resident is in → usually invoke
   - Significant affordance changes → sometimes invoke (configurable)
   - Tick events → invoke only if autonomy cadence says so (e.g., once every N ticks)
   - Events the resident can't perceive → never invoke
   This system exists because the biggest v0.1 failure mode is a twitchy resident that responds to everything.

**5. ResidentSystem.** If the AutonomySystem decided yes, this is where the resident's `perceive` method is called with the perceptions and context. Returns a `ResidentAction | null` (possibly with a memory-write side effect).

**6. ActionDispatchSystem.** If the resident returned an action, dispatch it to the place adapter. The adapter applies it and emits further events (e.g., `resident.spoke`) which re-enter the pipeline from the top.

**7. BroadcastSystem.** Emits state-delta updates to connected clients so the UI reflects the current world. This is the final step of the pipeline.

### Why this shape helps

**Testability.** Each system can be unit-tested in isolation. You can feed a known event into the SensorSystem and assert exactly which perceptions come out, without booting the whole runtime.

**Observability.** When debugging, you can log each system's input and output. "The event entered the pipeline, the SensorSystem produced these two perceptions, the AutonomySystem decided to invoke, the ResidentSystem returned this action." That's a clean trace.

**Extensibility.** New capabilities slot in as new systems. When we add mood drift in Phase 3, it's a `MoodSystem` between AutonomySystem and ResidentSystem. No existing code needs to change.

**Clear contracts.** Each system has a documented input and output. A change to one system can't accidentally break another unless the contract changes.

### Migration

Phase 2 needs to migrate the Phase 1 monolithic tick handler into this pipeline. The substance of the code mostly carries over — it's reorganized, not rewritten. New code (sensor pipeline, autonomy logic) fills in the gaps.

### Not doing

A few things the Systems pipeline is explicitly *not*:

- Not an ECS. Rooms, sensors, guests, affordances are still typed objects with direct references, not entities-with-components-queried-by-system.
- Not parallel. Systems run sequentially in a defined order. Concurrency within the pipeline is not a goal at this scale.
- Not hot-swappable at runtime. The pipeline is configured at Runtime construction and frozen after that.
- Not a generic plugin architecture. Third parties don't write systems; this is an internal structure.

If any of those become needed later, they can be added. Don't build for them now.

---

## Summary of Changes

### New files

- `@hauntjs/core/src/types.ts` — add `Sensor`, `SensorFidelity`, `SensorReach`, `Perception`, `SensorAffect`
- `@hauntjs/core/src/sensor-pipeline.ts` — the SensorPipeline implementation
- `@hauntjs/core/src/sensors/` — pre-built sensor factory library (`presenceSensor`, `mutedAudioSensor`, `stateSensor`, `omniscient`, etc.)
- `@hauntjs/core/src/systems/` — one file per system: `state-propagation.ts`, `sensor-system.ts`, `memory-system.ts`, `autonomy-system.ts`, `resident-system.ts`, `action-dispatch.ts`, `broadcast-system.ts`
- `@hauntjs/core/src/runtime.ts` — refactored to orchestrate the systems pipeline
- `@hauntjs/resident/src/prompt.ts` — updated prompt assembly for perception-first context

### Changed files

- `Room` gains a `sensors` field
- `AffordanceAction` gains optional `affects: SensorAffect[]`
- `Resident.perceive` now takes `Perception[]` instead of a `PresenceEvent`
- The Roost world config declares sensors per room

### Breaking changes

- Existing Phase 1 rooms (which have no `sensors` field) will need to be updated. The resident will perceive nothing from them until sensors are declared.
- The `Resident.perceive` signature changes. Any custom resident code needs updating.

These are acceptable because the project isn't yet publicly released. Document the migration in a changelog entry so future adopters know what changed.
