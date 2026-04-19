# CLAUDE.md

Working instructions for the Claude Code agent building Haunt. Read this every session before touching code.

## Orientation

Before starting any work, read in this order:
1. `README.md` — the thesis and stack
2. `docs/ARCHITECTURE.md` — the primitives, the runtime loop, the three layers
3. `docs/ROADMAP.md` — the phase you're in and its deliverables
4. This file — how to work

If anything in the code contradicts the docs, the docs win. Update the code or surface the contradiction before doing other work.

## Build Phases in Order

The roadmap is phase-by-phase for a reason. Each phase assumes the previous one is solid. Do not:

- Start Phase N+1 before Phase N's checkpoints pass
- Pre-build primitives "you'll need later" — build them when the phase calls for them
- Skip tests for a phase because they feel obvious

Each phase ends with a **pause point**. When you hit a pause point:

- Summarize what was built
- Run the phase's checkpoints and report results
- Surface anything unexpected or worth a human decision
- **Stop and wait** before starting the next phase

Do not chain phases without checking in. This is a design handoff, not a one-shot build.

## Scope Discipline

The single biggest failure mode is scope creep. When you notice yourself thinking "while I'm here I might as well add…" — stop. File it as a TODO with a clear description and keep going.

Specific temptations to resist:
- Adding a second character before the first one is good
- Adding a second place adapter before `place-2d` is shipped
- Adding vector memory before simple memory works
- Polishing visuals in Phase 5 when Phase 6 still needs wiring
- Adding features not in the roadmap "because the user will probably want them"

If you genuinely think a scope change is needed, **pause and ask**. Don't expand scope unilaterally.

## Ask Before You Guess

There are a handful of decisions in the roadmap that say "builder's call." Those are fine — use judgment. But if you're making a decision that will be hard to reverse, or that has user-facing implications, **pause and ask**.

Examples of things to ask about:
- Which tileset to use (license-sensitive)
- The specific wording of Poe's system prompt (creative artifact)
- Protocol changes between client and server
- Any change to the public interfaces in `@hauntjs/core/src/types.ts`

Examples where you should just decide:
- Internal function names
- Test structure
- Whether to use `map`/`filter` vs. a for loop
- Lint rule exceptions with justification

## Working Conventions

### Code style
- Strict TypeScript. `noImplicitAny`, `strictNullChecks`, all on.
- No `any` without a comment explaining why.
- Prefer explicit return types on exported functions.
- Keep files focused. When a file gets past ~300 lines, consider splitting.
- Domain vocabulary from the fiction: `Guest`, `Resident`, `Room`, `Affordance`. Not `User`, `Agent`, `Node`.

### Testing
- Vitest, colocated as `.test.ts` next to source
- Every phase should end with tests passing and coverage reasonable (aim 80%+ in `@hauntjs/core`, 70%+ elsewhere)
- Mock external services: use `MockModelProvider` for model calls, `msw` for HTTP if needed
- Don't hit real LLMs in CI. Mark real-LLM tests with `.skip` and a comment: `// Run manually to verify provider integration`

### Commits
- Conventional Commits format: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`
- One logical change per commit
- Reference the phase in the commit body when relevant: `Phase 3: wire memory store`
- Don't commit broken code to the main branch

### Dependencies
- Before adding a new dependency, check if the equivalent is in the Node standard library or an existing dep
- Prefer well-maintained, widely-used packages (look at download count and last commit date)
- Pin versions in `package.json` for stability. Use `^` not `~` for minor-version flexibility on non-critical deps.
- Audit: `@anthropic-ai/sdk`, `openai`, `phaser`, `ws`, `better-sqlite3`, `zod`, `vitest`, `fastify` or `express` (one, not both)

### File organization
- `src/` for source, `src/*.test.ts` for colocated tests
- `scripts/` for standalone scripts (one-off tools, integration smoke tests)
- `assets/` for non-code assets (tilesets, character portraits, SQL migrations)
- Keep `index.ts` as the public API surface for each package — don't let consumers reach into internals

## Running the Project

These scripts should exist at the repo root once Phase 0 is done:

```bash
pnpm install             # install everything
pnpm dev                 # start the dev server + client
pnpm test                # run all tests
pnpm test --watch        # watch mode
pnpm lint                # eslint + typecheck
pnpm build               # build all packages
pnpm typecheck           # just TypeScript, no bundling
```

If these don't exist yet, creating them is part of Phase 0.

## Model Configuration

The resident's model provider is selected via environment variable:

```bash
HAUNT_MODEL=anthropic    # or "openai" or "ollama"
ANTHROPIC_API_KEY=...    # if using anthropic
OPENAI_API_KEY=...       # if using openai
OLLAMA_HOST=http://localhost:11434  # if using ollama, defaults shown
HAUNT_MODEL_NAME=claude-opus-4-7    # optional override
```

Default to Anthropic with `claude-opus-4-7` in examples and docs. Document the full matrix in the README.

## When Things Go Wrong

If you hit a blocker:

1. Check the docs — is there guidance for this case?
2. Check for a TODO you may have filed earlier
3. If it's genuinely ambiguous, **stop and ask**. Don't guess at user intent.

If you find a bug in prior-phase code that blocks the current phase:

1. Fix the bug with a clear commit
2. Add a regression test
3. Note it in the phase's summary at the pause point

If you find an architectural problem that suggests the docs are wrong:

1. Do not just work around it
2. Stop, surface the problem, propose a doc change
3. Wait for a decision before proceeding

## What Good Looks Like

At the end of v0.1:

- The repo is clean, tests pass, lint passes, build works
- A stranger can clone it and get the demo running from the README in under 10 minutes
- Poe feels like a person, not a chatbot in a hat
- The Roost feels inhabited — things happen, things are remembered, things have weight
- The primitives in `@hauntjs/core` are clean enough that writing a new adapter (Minecraft, Discord) looks like a weekend project, not a fork

## What Not-Good Looks Like

Watch for these anti-patterns as you build. If you catch yourself doing any of them, stop and course-correct:

- The resident responds to every event with a canned-feeling acknowledgement
- The Roost is just a chat window with a tilemap painted over it
- The character file is a template, not a person
- Tests mock so much that they don't test anything real
- The `@hauntjs/core` package has grown to depend on Phaser or a specific model SDK (it must not)
- "Temporary" code from Phase N is still around in Phase N+2 because nobody cleaned it up

---

## Summary

Build in phases. Test each phase. Pause at pause points. Ask when ambiguous. Keep scope tight. Keep the vocabulary of the fiction. Keep the core package clean.

The thesis is that places with minds are a coherent and buildable primitive. Prove that. Everything else is v0.2.
Working instructions for the Claude Code agent building Phase 2 of Haunt.

This supplements the original CLAUDE.md from Phase 1 — all of those conventions still apply (scope discipline, commit style, strict TypeScript, domain vocabulary, no browser storage in artifacts, etc.). This file covers what's specific to Phase 2.

Orientation
Before starting any work, read in this order:

README.md — the unchanged thesis
docs/ARCHITECTURE.md — the Phase 1 architecture (still the foundation)
docs/PHASE-2-ARCHITECTURE.md — the Phase 2 additions (the authoritative spec for sensors and systems)
docs/PHASE-2-ROADMAP.md — the phased execution plan
This file — how to work on Phase 2 specifically
If anything in the code contradicts the docs, the docs win. If something in ARCHITECTURE.md is contradicted by PHASE-2-ARCHITECTURE.md, the Phase 2 doc wins (by design — it's the more recent design decision).

The one thing that matters most
Phase 2.1 is a behavior-preserving refactor. This is the single most important discipline of this phase.

The temptation will be enormous to "improve things while you're in there." Resist it. When rearranging the runtime into systems, the only goal is that the external behavior of the framework is identical afterward. The code looks different; the behavior does not.

Run the Phase 1 integration tests after every meaningful change. If any Phase 1 test breaks, stop and fix before moving on. Do not carry a broken test into the next change.

The reason this matters: Phase 2.3 will introduce real behavior changes (the sensor layer). If Phase 2.1 also introduced behavior changes, it becomes impossible to tell whether a bug in 2.3 was caused by the refactor or by the sensor work. Keeping 2.1 pure-refactor is what keeps 2.3 debuggable.

Phase-specific discipline
Phase 2.0 (Audit)
Do not start writing code. Read, take notes, surface findings. A good audit is the best insurance against surprises. A bad audit is the biggest cause of mid-phase rewrites.

Phase 2.1 (Systems Pipeline)
Every commit should leave the tests green. Do not batch a half-migrated state across multiple commits. If extracting a system leaves tests broken, fix them in the same commit before moving to the next extraction.

Resist the urge to improve APIs while extracting. If a function was ugly in Phase 1, it's allowed to still be ugly in Phase 2.1. Improvements come in later phases once the structure is proven.

Phase 2.2 (Sensor Primitives)
This phase is pure types and factory functions. No runtime. No integration. Resist the urge to wire things up "just to test." The actual integration test lives in Phase 2.3 where it belongs.

Spend real care on the factory function ergonomics. These are the author-facing primitives that every future place will use. A bad API here compounds forever.

Phase 2.3 (Sensor Pipeline Integration)
This is the hardest phase. It changes behavior visibly, breaks the Phase 1 Resident.perceive signature, and rewrites the prompt. Expect surprises — specifically:

The resident will start behaving differently before the prompt is fully tuned. That's expected. Don't conclude the sensor system is broken when it's actually the prompt that needs work.
Some scenarios that felt natural in Phase 1 (resident responding to actions in another room) will now need explicit sensor configuration to work. This is the point. Don't backfill sensors to make Phase 1 behaviors reappear unless the sensor is genuinely correct for the scenario.
The resident may occasionally hallucinate perception ("I saw...") when it shouldn't. This is a prompt-engineering problem — add an explicit directive in the system prompt about staying within perceptual bounds.
Phase 2.4 (Sensor Controls)
The dramatic scenarios (lights going out, door closing) are the vibe check for this phase. After implementing, manually run these scenarios and see if they feel right. If "turn off the lights" doesn't produce a genuine "I can't see anymore" from the resident, something's wrong.

Phase 2.5 (Debug UI)
The debug UI is an internal dev tool. Ship-quality polish is not the goal; usefulness is. Optimize for "can I tell at a glance what the resident is perceiving right now."

Phase 2.6 (Docs)
Write the design-pattern guide by pretending you're a developer who just discovered Haunt and is trying to build their first place. What would frustrate you? What would you need? Write for that person.

Conventions specific to Phase 2
Sensor authoring style
When writing sensor configs in The Roost or in examples, prefer the factory functions over inline Sensor object construction. presenceSensor("bathroom.door") reads better than a 10-line object literal. Save the full object form for when customization is genuinely needed.

Prompt engineering
The prompt assembly in @hauntjs/resident/src/prompt.ts is the most prompt-engineering-sensitive file in the project. Changes here have outsized effects on behavior. When making changes:

Always test with a real model (not just the mock), because subtle prompt issues don't show up in mock tests
Compare before/after with the same event sequence — does the new prompt feel richer or just noisier?
Keep the prompt skeleton documented as a comment in the file, so future edits don't accidentally lose structure
System ordering
The pipeline order is defined in Runtime. Changing the order is a significant architectural decision — do not do it casually. If there's a genuine reason to reorder, pause and ask before doing so.

Breaking changes
Resident.perceive's signature change is intentional and documented. Any other breaking changes to public APIs should pause and ask first. A breaking change that's not explicitly planned is a sign of design drift.

Testing discipline
Phase 2.1: behavior-equivalence tests are the most important thing
Phase 2.2: type tests and factory tests only
Phase 2.3: integration tests with real model runs (marked .skip in CI) are essential; unit tests with mocks are necessary but not sufficient
Phase 2.4: scenario tests — "turn off lights, enter room, assert no sight perception"
Phase 2.5: manual testing is fine; the overlay is developer-facing
Commits
Each Phase 2.x gets its own series of commits. Tag the end of each phase with a git tag (phase-2.1, phase-2.2, etc.) so we can bisect if something regresses later.

When to pause and ask
The Phase 1 rules apply, plus these Phase 2 specifics:

Pause and ask if you notice:

The pipeline refactor in 2.1 is requiring behavior changes to "make tests pass." That's a red flag — behavior should be identical.
A sensor factory function is getting more than 3 optional parameters. The ergonomics are wrong; simplify.
The prompt assembly is growing past 300 lines. Structure is leaking; probably needs to split into perception-context, memory-context, and character-context helpers.
An integration test for Phase 2.3 needs to fake a sensor to work. If the real sensor config can't produce the desired behavior, the sensor config is wrong and should be fixed, not faked around.
You're tempted to make Resident.perceive optionally accept either events or perceptions (for "backward compatibility"). Don't. The clean break is the right call.
What good looks like at the end of Phase 2
The runtime is a clean pipeline of named systems you can read top-to-bottom
Every room in The Roost has authored sensors that fit its character
Poe's behavior visibly reflects its sensory situation — it hedges, wonders, reasons under uncertainty
Turning off the lights produces a genuine "I can't see" response
A new developer can read the docs and author a sensible place
Phase 1 behavior-equivalence tests all pass where applicable; new tests exist for all the new behaviors
What not-good looks like at the end of Phase 2
The runtime still has a monolithic tick handler with a "sensor layer" grafted onto it
The Roost's rooms all have { kind: "full" } sight+sound+presence — the author didn't use the new system, just declared it
The resident behaves identically to Phase 1 because the prompt still treats events, not perceptions, as primary
A breaking change was made that wasn't planned, and it's unclear whether anyone depends on the old behavior
The debug UI shipped but nobody ever uses it, including the author
Summary
Build in sub-phases. Keep the 2.1 refactor pure-refactor. Spend real care on factory function ergonomics in 2.2. Expect the prompt to need tuning in 2.3. Vibe-check the drama of 2.4. Make the debug UI useful, not pretty. Write the 2.6 guides as the developer you wish had written them for you.

The goal: a framework where perception is structural, not decorative — and a Roost where Poe feels like someone reasoning about a place, not an assistant with a logfile.