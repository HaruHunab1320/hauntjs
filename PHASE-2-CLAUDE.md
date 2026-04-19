# CLAUDE.md — Phase 2

Working instructions for the Claude Code agent building Phase 2 of Haunt.

This supplements the original `CLAUDE.md` from Phase 1 — all of those conventions still apply (scope discipline, commit style, strict TypeScript, domain vocabulary, no browser storage in artifacts, etc.). This file covers what's specific to Phase 2.

## Orientation

Before starting any work, read in this order:
1. `README.md` — the unchanged thesis
2. `docs/ARCHITECTURE.md` — the Phase 1 architecture (still the foundation)
3. `docs/PHASE-2-ARCHITECTURE.md` — the Phase 2 additions (the authoritative spec for sensors and systems)
4. `docs/PHASE-2-ROADMAP.md` — the phased execution plan
5. This file — how to work on Phase 2 specifically

If anything in the code contradicts the docs, the docs win. If something in `ARCHITECTURE.md` is contradicted by `PHASE-2-ARCHITECTURE.md`, the Phase 2 doc wins (by design — it's the more recent design decision).

## The one thing that matters most

Phase 2.1 is a **behavior-preserving refactor**. This is the single most important discipline of this phase.

The temptation will be enormous to "improve things while you're in there." Resist it. When rearranging the runtime into systems, the *only* goal is that the external behavior of the framework is identical afterward. The code looks different; the behavior does not.

Run the Phase 1 integration tests after every meaningful change. If any Phase 1 test breaks, stop and fix before moving on. Do not carry a broken test into the next change.

The reason this matters: Phase 2.3 will introduce real behavior changes (the sensor layer). If Phase 2.1 *also* introduced behavior changes, it becomes impossible to tell whether a bug in 2.3 was caused by the refactor or by the sensor work. Keeping 2.1 pure-refactor is what keeps 2.3 debuggable.

## Phase-specific discipline

### Phase 2.0 (Audit)
Do not start writing code. Read, take notes, surface findings. A good audit is the best insurance against surprises. A bad audit is the biggest cause of mid-phase rewrites.

### Phase 2.1 (Systems Pipeline)
Every commit should leave the tests green. Do not batch a half-migrated state across multiple commits. If extracting a system leaves tests broken, fix them *in the same commit* before moving to the next extraction.

Resist the urge to improve APIs while extracting. If a function was ugly in Phase 1, it's allowed to still be ugly in Phase 2.1. Improvements come in later phases once the structure is proven.

### Phase 2.2 (Sensor Primitives)
This phase is pure types and factory functions. No runtime. No integration. Resist the urge to wire things up "just to test." The actual integration test lives in Phase 2.3 where it belongs.

Spend real care on the factory function ergonomics. These are the author-facing primitives that every future place will use. A bad API here compounds forever.

### Phase 2.3 (Sensor Pipeline Integration)
This is the hardest phase. It changes behavior visibly, breaks the Phase 1 `Resident.perceive` signature, and rewrites the prompt. Expect surprises — specifically:

- The resident will start behaving differently before the prompt is fully tuned. That's expected. Don't conclude the sensor system is broken when it's actually the prompt that needs work.
- Some scenarios that felt natural in Phase 1 (resident responding to actions in another room) will now need explicit sensor configuration to work. This is the point. Don't backfill sensors to make Phase 1 behaviors reappear unless the sensor is genuinely correct for the scenario.
- The resident may occasionally hallucinate perception ("I saw...") when it shouldn't. This is a prompt-engineering problem — add an explicit directive in the system prompt about staying within perceptual bounds.

### Phase 2.4 (Sensor Controls)
The dramatic scenarios (lights going out, door closing) are the vibe check for this phase. After implementing, manually run these scenarios and see if they *feel right*. If "turn off the lights" doesn't produce a genuine "I can't see anymore" from the resident, something's wrong.

### Phase 2.5 (Debug UI)
The debug UI is an internal dev tool. Ship-quality polish is not the goal; *usefulness* is. Optimize for "can I tell at a glance what the resident is perceiving right now."

### Phase 2.6 (Docs)
Write the design-pattern guide by pretending you're a developer who just discovered Haunt and is trying to build their first place. What would frustrate you? What would you need? Write for that person.

## Conventions specific to Phase 2

### Sensor authoring style
When writing sensor configs in The Roost or in examples, prefer the factory functions over inline `Sensor` object construction. `presenceSensor("bathroom.door")` reads better than a 10-line object literal. Save the full object form for when customization is genuinely needed.

### Prompt engineering
The prompt assembly in `@hauntjs/resident/src/prompt.ts` is the most prompt-engineering-sensitive file in the project. Changes here have outsized effects on behavior. When making changes:

- Always test with a real model (not just the mock), because subtle prompt issues don't show up in mock tests
- Compare before/after with the same event sequence — does the new prompt feel richer or just noisier?
- Keep the prompt skeleton documented as a comment in the file, so future edits don't accidentally lose structure

### System ordering
The pipeline order is defined in `Runtime`. Changing the order is a significant architectural decision — do not do it casually. If there's a genuine reason to reorder, **pause and ask** before doing so.

### Breaking changes
`Resident.perceive`'s signature change is intentional and documented. Any other breaking changes to public APIs should **pause and ask** first. A breaking change that's not explicitly planned is a sign of design drift.

### Testing discipline
- Phase 2.1: behavior-equivalence tests are the most important thing
- Phase 2.2: type tests and factory tests only
- Phase 2.3: integration tests with real model runs (marked `.skip` in CI) are essential; unit tests with mocks are necessary but not sufficient
- Phase 2.4: scenario tests — "turn off lights, enter room, assert no sight perception"
- Phase 2.5: manual testing is fine; the overlay is developer-facing

### Commits
Each Phase 2.x gets its own series of commits. Tag the end of each phase with a git tag (`phase-2.1`, `phase-2.2`, etc.) so we can bisect if something regresses later.

## When to pause and ask

The Phase 1 rules apply, plus these Phase 2 specifics:

**Pause and ask if you notice:**
- The pipeline refactor in 2.1 is requiring behavior changes to "make tests pass." That's a red flag — behavior should be identical.
- A sensor factory function is getting more than 3 optional parameters. The ergonomics are wrong; simplify.
- The prompt assembly is growing past 300 lines. Structure is leaking; probably needs to split into perception-context, memory-context, and character-context helpers.
- An integration test for Phase 2.3 needs to fake a sensor to work. If the real sensor config can't produce the desired behavior, the sensor config is wrong and should be fixed, not faked around.
- You're tempted to make `Resident.perceive` optionally accept either events or perceptions (for "backward compatibility"). Don't. The clean break is the right call.

## What good looks like at the end of Phase 2

- The runtime is a clean pipeline of named systems you can read top-to-bottom
- Every room in The Roost has authored sensors that fit its character
- Poe's behavior visibly reflects its sensory situation — it hedges, wonders, reasons under uncertainty
- Turning off the lights produces a genuine "I can't see" response
- A new developer can read the docs and author a sensible place
- Phase 1 behavior-equivalence tests all pass where applicable; new tests exist for all the new behaviors

## What not-good looks like at the end of Phase 2

- The runtime still has a monolithic tick handler with a "sensor layer" grafted onto it
- The Roost's rooms all have `{ kind: "full" }` sight+sound+presence — the author didn't use the new system, just declared it
- The resident behaves identically to Phase 1 because the prompt still treats events, not perceptions, as primary
- A breaking change was made that wasn't planned, and it's unclear whether anyone depends on the old behavior
- The debug UI shipped but nobody ever uses it, including the author

---

## Summary

Build in sub-phases. Keep the 2.1 refactor pure-refactor. Spend real care on factory function ergonomics in 2.2. Expect the prompt to need tuning in 2.3. Vibe-check the drama of 2.4. Make the debug UI useful, not pretty. Write the 2.6 guides as the developer you wish had written them for you.

The goal: a framework where perception is structural, not decorative — and a Roost where Poe feels like someone reasoning about a place, not an assistant with a logfile.
