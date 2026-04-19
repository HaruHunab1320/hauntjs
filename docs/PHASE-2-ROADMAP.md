# Phase 2 — Roadmap

Execution plan for Phase 2 of Haunt: the **Sensor layer** and the **Systems pipeline** refactor.

This plan assumes Phase 1 (v0.1) is shipped and working: a developer can walk around The Roost, have a coherent conversation with Poe, and the place remembers them across sessions.

Read `PHASE-2-ARCHITECTURE.md` before starting any work. It's the authoritative design spec. This roadmap says *how and when* to build; the architecture doc says *what*.

Same working rules as Phase 1 apply: build phases in order, pause at pause points, don't chain without checking in, keep scope tight, ask when ambiguous.

---

## A note on why these are paired

The instinct might be "sensors first, refactor later." Resist it. Both touch the runtime's hot path. Doing sensors on top of the Phase 1 monolithic tick handler will work, but then the systems refactor has to tear it all up again two weeks later. It's roughly the same total work either way, but doing them paired means the sensor code is written against the right structure from the start.

The order within the phase: **systems pipeline scaffolding first** (so the structure is in place), **then sensors plugged into it** (so sensor code lands in the right home). Don't ship a half-done pipeline; the checkpoints enforce this.

---

## Phase 2.0 — Audit & Plan

**Goal:** Before writing any code, make sure the Phase 1 codebase is in a state where Phase 2 can land cleanly. This is a half-day of reading and note-taking, not a build phase.

**Deliverables:**
- Read `ARCHITECTURE.md` and `PHASE-2-ARCHITECTURE.md` end to end
- Read the current Phase 1 implementation of `Runtime`, `Resident.perceive`, the prompt assembly in `@hauntjs/resident`, and The Roost's world config
- Write a short doc in `docs/phase-2/audit.md` listing:
  - Every call site of `Resident.perceive` (these are all breaking in Phase 2)
  - Every function on `Runtime` that will move into a system
  - Every place the prompt assembly reads from (since perception context replaces events)
  - Any Phase 1 TODOs that block Phase 2 work

**Checkpoints:**
- The audit doc exists and is accurate
- No surprises: if the Phase 1 code is in worse shape than expected, surface that now before starting the refactor

**Pause point:** After the audit. Share the findings before starting Phase 2.1. This is cheap insurance against discovering halfway through that a hidden Phase 1 assumption broke something.

---

## Phase 2.1 — Systems Pipeline Scaffolding

**Goal:** The runtime is restructured as a named-systems pipeline, but **behavior is identical to Phase 1**. No sensors yet, no perception changes. Just structural refactor.

Think of this phase as moving the furniture without repainting the walls. When it's done, someone exercising the framework can't tell anything changed from the outside.

**Deliverables in `@hauntjs/core`:**
- `src/systems/types.ts` — the `System<TInput, TOutput>` interface and `SystemContext`
- `src/systems/state-propagation.ts` — extracted from current runtime's state-mutation code
- `src/systems/memory-system.ts` — extracted memory update logic
- `src/systems/autonomy-system.ts` — extracted "should we invoke the resident" logic
- `src/systems/resident-system.ts` — extracted resident-invocation logic
- `src/systems/action-dispatch.ts` — extracted action-application logic
- `src/systems/broadcast-system.ts` — extracted client broadcast logic
- `src/systems/index.ts` — exports all systems
- `src/runtime.ts` — rewritten to hold an ordered list of systems and run them as a pipeline
- Pipeline accumulator type — a discriminated union or evolving shape representing what's known at each stage of the pipeline

**Not in this phase:**
- No `SensorSystem` yet (that's Phase 2.2)
- No `Sensor` types in `types.ts` yet
- No prompt changes

**Tests:**
- Each system has unit tests, with a fake `SystemContext` and assertions on input/output
- Integration test: the full Phase 1 behavior still works. Walk through every event type and confirm the pipeline produces the same final state as the monolithic version did. This is a *behavior-equivalence* test, and it's the most important test in this phase.
- The "scripted demo run" integration test from Phase 1 should pass unchanged

**Checkpoints:**
- All Phase 1 tests still pass (this is non-negotiable)
- The dev-server still boots and The Roost still works identically to how a human experienced it at the end of Phase 1
- Each system is under 200 lines; if one grows larger, it's doing too much
- A human can open `src/runtime.ts` and read the pipeline shape in under a minute

**Pause point:** After Phase 2.1. This is the highest-risk phase of the Phase 2 plan because it's a pure refactor with no new features to justify it. Pause, demo that nothing broke, and only then start Phase 2.2. If something *did* break, fix it here — do not layer sensors on top of a broken pipeline.

---

## Phase 2.2 — Sensor Primitives

**Goal:** The core types for sensors exist, with no runtime integration yet. This is the TypeScript-first half of the sensor layer.

**Deliverables in `@hauntjs/core`:**
- `src/types.ts` — add `Sensor`, `SensorModality`, `SensorFidelity`, `SensorReach`, `Perception`, `PerceptionField`, `SensorAffect`
- Update `Room` type to include `sensors: Map<SensorId, Sensor>`
- Update `AffordanceAction` to include optional `affects?: SensorAffect[]`
- `src/sensors/` directory with the pre-built sensor factory library:
  - `presence-sensor.ts` — factory for presence sensors
  - `sight-sensor.ts` — factory for sight sensors, with fidelity options
  - `sound-sensor.ts` — factory for sound sensors, including `mutedAudioSensor` variant
  - `state-sensor.ts` — factory for affordance-state sensors
  - `text-sensor.ts` — for typed-chat-only rooms
  - `omniscient.ts` — the escape hatch for omniscient-by-default feel
  - `index.ts` — exports
- Thorough TSDoc comments on every public type and factory, because these are the author-facing primitives people will read first

**Not in this phase:**
- No `SensorSystem` in the pipeline yet
- No prompt changes yet
- The Roost's world-config doesn't use sensors yet — still runs in "Phase 2.1 mode" (which is behavior-equivalent to Phase 1, meaning events still flow to the resident directly since no SensorSystem is processing them)

**Tests:**
- Unit tests for each factory: does `presenceSensor("foo.bar")` produce a correctly-shaped `Sensor`?
- Type tests: the TypeScript compiler accepts valid sensor configurations and rejects invalid ones
- No runtime tests yet — this phase is types-and-factories only

**Checkpoints:**
- The sensor factory library is importable and usable
- A developer could *manually* construct a `Sensor` object using the types, without runtime integration
- Lint and type-check pass cleanly

**Pause point:** After Phase 2.2. The pre-built sensor library is the author-facing surface and its ergonomics matter a lot. Pause to review the factory functions: do they feel nice to call? Are the defaults sensible? Would you actually want to author a place with these? If not, tune before Phase 2.3.

---

## Phase 2.3 — The Sensor Pipeline

**Goal:** Sensors are now integrated into the runtime. Events produce perceptions. The resident perceives perceptions, not events. **The strict-by-default rule takes effect.**

**Deliverables in `@hauntjs/core`:**
- `src/sensor-pipeline.ts` — the `SensorPipeline` implementation:
  - `filter(event, place): Perception[]` — core function
  - Default perceiver logic per (modality × event-type) combination
  - Event-to-perception content generation (using the templates from the architecture doc)
- `src/systems/sensor-system.ts` — a System wrapper around the SensorPipeline, slotted into the pipeline between StatePropagation and Memory
- Update `Runtime` to include the new `SensorSystem` in its default pipeline order

**Deliverables in `@hauntjs/resident`:**
- Update `Resident.perceive(perceptions: Perception[], context): Promise<ResidentAction | null>`  — breaking signature change
- `src/prompt.ts` — the big rewrite. Move from "recent events" to "current perceptual situation + recent perceptions + relevant memory." Use the new prompt skeleton from `PHASE-2-ARCHITECTURE.md`.

**Deliverables in `@hauntjs/place-2d`:**
- Update the server's WebSocket broadcast logic — still broadcasts world-state to guests the same way; the sensor layer is server-side and invisible to guests
- Update the resident-avatar visibility logic if needed (resident should only appear visible to guests in the same room or adjacent rooms with sight reach — this is consistency between what the resident can see and what guests can see of the resident)

**Deliverables in `@hauntjs/demo-roost`:**
- Update `world-config.ts` to declare sensors per room per the layout in `PHASE-2-ARCHITECTURE.md`:
  - Lobby: full sight + sound + presence + state
  - Study: full sight + sound (scoped to this room only)
  - Parlor: partial sight + full sound with adjacent reach to Lobby
  - Garden: partial presence + ambiguous sound, no sight

**Tests:**
- Unit tests for `SensorPipeline.filter`: given a known event and place, assert the right perceptions are produced
- Unit tests for each (modality × event) default perceiver
- Integration test: guest enters a well-sensored room → resident perceives it correctly with the expected content string
- Integration test: guest enters an un-sensored room → resident perceives nothing (the strict default)
- Integration test: sensor disabled → resident doesn't perceive events routed through it
- Scripted demo: guest walks from the Lobby to the Bathroom (which The Roost doesn't have, but add one for this test — or use a minimal sub-place in the test fixture). Resident should perceive the lobby events fully, then lose sight when the guest enters the bathroom, and only "hear the intercom" from then on.

**Checkpoints:**
- The behavior in The Roost *changes* in this phase and that change is good: the resident notices things it has sensors for, and misses things it doesn't.
- Run the full Phase 1 demo manually. Specifically: connect as a guest, walk through all rooms, speak in each, interact with affordances. The resident's responses should reflect its sensory situation — e.g., in the Garden, the resident's responses should hedge ("I thought I heard someone by the fountain...") rather than confidently describe things it can't see.
- The prompt quality review: look at actual prompts being sent to the model in this phase. They should read like a sensory situation report, not an event log. If they read like an event log, the prompt refactor isn't done.

**Pause point:** After Phase 2.3. This is the first phase where behavior visibly changes from v0.1. Pause for a demo run — record 10 minutes of interaction, surface the difference in how Poe feels now that perception is structured. This is the phase most worth showing to someone.

---

## Phase 2.4 — Sensor Controls & Affordance Integration

**Goal:** Sensors can be toggled and their fidelity changed at runtime. Affordances can affect sensors. This is what makes the "someone turns off the lights" scenario work.

**Deliverables in `@hauntjs/core`:**
- `Runtime.setSensorEnabled(sensorId, enabled)` and `Runtime.setSensorFidelity(sensorId, fidelity)` — public mutation methods
- Integration with `AffordanceAction.affects`: when an affordance action runs, any declared sensor effects are applied automatically
- Emit `sensor.changed` events when sensors toggle (so the client debug overlay can reflect it)

**Deliverables in `@hauntjs/demo-roost`:**
- Add a `lightSwitch` affordance to each room that has a sight sensor. Turning off the lights disables that room's sight sensor. (Stretch: dimmer levels → fidelity changes.)
- Add a door affordance between the Parlor and Lobby. Closing the door disables the sound-reach sensor between them.

**Tests:**
- Unit test: `AffordanceAction.affects` correctly toggles sensors when the action runs
- Integration test: turn off the Lobby lights. Resident's sight sensor in the lobby should become disabled. Next guest movement in the lobby produces no sight perception.
- Integration test: close the Parlor-Lobby door. A conversation in the Parlor is no longer audible from the Lobby.
- Manual test: in The Roost, walk around and toggle lights in various rooms. The resident's responses should reflect the changed perceptual situation. ("It got dark in the lobby — I can't see who's coming through anymore.")

**Checkpoints:**
- The debug overlay from Phase 2.5 (ahead) isn't built yet, but for this phase a simple `console.log` on every sensor state change is sufficient for dev verification
- The resident's behavior *should* feel different when lights are off. If it doesn't, something's wrong with either the prompt integration or the sensor disabling.

**Pause point:** After Phase 2.4. The drama of "the lights just went out" is a good vibe check. Pause, demo it, see if it feels right.

---

## Phase 2.5 — Sensor Debugging UI

**Goal:** A developer building a new place can *see* what the resident is perceiving. Without this, sensor authoring is guesswork.

**Deliverables in `@hauntjs/place-2d` (client):**
- A toggleable dev overlay (press `F2` or click a "Debug" button). When enabled, shows:
  - For each room, which sensors are present and their enabled status
  - Current perceptual reach from the resident's current room (which rooms can it see/hear into right now?)
  - A live stream of perceptions as they arrive (last 10, scrolling)
  - Highlight on the map: rooms the resident can currently perceive are tinted one color, rooms that are dark to it are tinted another
- This overlay is dev-only. Add an env flag `HAUNT_DEBUG=1` to enable it, or make it local-only and excluded from any future production builds.

**Deliverables in `@hauntjs/core` (server side):**
- A new server-to-client message type `debug.perception-snapshot` that emits the resident's current perceptual situation
- This should only be emitted when debug mode is enabled, to avoid leaking the resident's "internal state" to regular guests

**Tests:**
- Component tests for the debug overlay where tractable
- Manual: run The Roost with debug mode on, walk around, verify the overlay accurately reflects what's being perceived

**Checkpoints:**
- Someone authoring a new room can turn on debug mode and immediately verify whether their sensor config is working as intended
- The overlay is useful enough that you (the author of Haunt) reach for it during the next phase's authoring work

**Pause point:** After Phase 2.5. The debug UI is an internal tool but its quality matters — pause to use it, not just look at it.

---

## Phase 2.6 — Polish & Documentation

**Goal:** Phase 2 ships. The sensor layer feels authored, not engineered.

**Deliverables:**
- Update `ARCHITECTURE.md` to include sensors and systems as core primitives (the `PHASE-2-ARCHITECTURE.md` content merges in, this addendum file becomes historical)
- Update `README.md` to reflect that perception is a first-class concept
- Write `docs/guides/writing-a-sensor.md` — how to author a custom sensor beyond the factory library
- Write `docs/guides/sensor-patterns.md` — design patterns and anti-patterns. Things like:
  - The Panopticon anti-pattern (every room has full-fidelity sight; collapses back to omniscience)
  - The Dark Hall pattern (a place with one visible room and several dark ones; drama comes from venturing in)
  - The Unreliable Narrator pattern (use `ambiguous` fidelity liberally; let the resident reason under uncertainty)
  - The Cascading Trust pattern (sensors you can only activate by completing trust-building interactions)
- Update `docs/guides/writing-a-room.md` to include sensor authoring as a core step
- Changelog entry for Phase 2 describing the breaking changes

**Checkpoints:**
- A developer could read the docs cold and author a new place with thoughtful sensor design
- The guide docs aren't just reference — they shape *how* people think about authoring a Haunt

**No pause point — this is the end of Phase 2.**

---

## Order-of-Magnitude Sizing

- Phase 2.0: ½ day (audit only)
- Phase 2.1: 3-4 days (the refactor is the biggest single chunk)
- Phase 2.2: 1-2 days
- Phase 2.3: 3-4 days (pipeline integration + prompt rewrite)
- Phase 2.4: 1-2 days
- Phase 2.5: 2 days
- Phase 2.6: 1 day

Total: ~2-3 weeks of focused work. Phase 2.3 is the hardest; the rest is support.

---

## Anti-Patterns to Watch For

Specific things that would indicate Phase 2 is going off the rails:

- **The sensor layer becoming a performance bottleneck.** At this scale (handful of rooms, handful of sensors each) the pipeline should run in well under 10ms per event. If it doesn't, the implementation is wrong, not the architecture.
- **Authored sensors that are all `{ kind: "full" }` with room reach.** If every sensor is full-fidelity, the author isn't using the system; they're just paying its cost. The Roost's sensor layout should use a mix, and the docs should push authors toward that.
- **The prompt becoming a firehose.** The new prompt has more to say (sensory situation, perceptions, memory). If it balloons past 2000 tokens per call, the assembly is dumping too much context. Trim ruthlessly — only surface what's perceptually relevant right now.
- **Systems that sneakily call other systems.** Each system reads the accumulator, writes to the accumulator, moves on. Cross-system calls defeat the whole point of the refactor.
- **The resident contradicting its sensory situation.** If the prompt says "you cannot see into the garden" and the resident still describes what's happening there, that's a prompt-engineering failure. The system prompt may need an explicit directive about never hallucinating perception.

---

## What Phase 2 Unlocks

This is the "payoff" section — worth scanning occasionally during the phase to remember why this work matters.

- **Meaningfully different rooms.** A bathroom, a study, a garden all have real perceptual character, not just different descriptions.
- **Real privacy.** Guests can go somewhere unwatched. That changes the dynamic.
- **Interpretive character.** Poe hedges, wonders, reasons about partial information. This makes him feel alive in a way omniscience could not.
- **The Oldest House vibe becomes achievable.** A place with weird, partial, unreliable perception. We now have the primitives to express that.
- **Physical-world readiness.** When the Home Assistant adapter eventually comes, cameras and mics map directly to sensors. We didn't have to retrofit; the abstraction was built for it.

Phase 3 can then meaningfully invest in deeper memory, mood and degradation, autonomous life, and multi-resident dynamics — all of which are more powerful on top of a sensor-shaped perception model than they'd have been on top of Phase 1's omniscient-event flow.
