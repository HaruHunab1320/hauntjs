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
