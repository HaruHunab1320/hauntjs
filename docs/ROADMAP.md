# Roadmap

Phased execution plan for Haunt v0.1. Each phase has:

- **Goal** — what success looks like
- **Deliverables** — concrete artifacts
- **Checkpoints** — tests/demos that prove the phase is done
- **Pause point** — where the agent should stop and surface the work for review before continuing

Build phases in order. Do not start Phase N+1 until Phase N's checkpoints pass.

---

## Phase 0 — Scaffolding

**Goal:** A working monorepo with tooling configured, four empty packages, and a dev script that does nothing useful but runs cleanly.

**Deliverables:**
- `package.json` at root with pnpm workspaces
- `pnpm-workspace.yaml` listing `packages/*` and `apps/*`
- TypeScript config: root `tsconfig.base.json`, per-package `tsconfig.json` extending it
- ESLint + Prettier config (flat config format, `eslint.config.js`)
- Vitest config at root
- Empty packages: `@hauntjs/core`, `@hauntjs/resident`, `@hauntjs/place-2d`, `@hauntjs/demo-roost`
- `apps/dev-server` with a Hello World Express or Fastify server
- Root scripts: `pnpm dev`, `pnpm test`, `pnpm lint`, `pnpm build`
- Docs copied into `docs/` directory
- `.gitignore`, `.nvmrc` (Node 20)
- A README in each package with a one-line description

**Checkpoints:**
- `pnpm install` succeeds
- `pnpm dev` starts the dev-server and exits cleanly on Ctrl-C
- `pnpm test` runs (even if no tests yet)
- `pnpm lint` passes
- `pnpm build` builds all packages

**Pause point:** After Phase 0. Surface the repo structure and the dev-server output. Do not start Phase 1 without confirmation — the repo shape is worth a human look before committing.

---

## Phase 1 — Core Primitives

**Goal:** All the types from `ARCHITECTURE.md` exist as TypeScript, with a minimal in-memory runtime that can accept events and log them. No LLM calls yet.

**Deliverables in `@hauntjs/core`:**
- `src/types.ts` — all primitive types (Place, Room, Affordance, Guest, Resident, PresenceEvent, ResidentAction, etc.)
- `src/place.ts` — Place state manager: create a place, add rooms, add affordances, move guests, update affordance state. Pure, synchronous, well-tested.
- `src/event-bus.ts` — simple typed event emitter for PresenceEvents
- `src/runtime.ts` — the Runtime class skeleton: holds a Place, accepts events, exposes `emit()` and `applyAction()`. For now, `applyAction` just mutates state; no resident is plugged in yet.
- `src/index.ts` — public exports

**Tests:**
- Place construction and mutation
- Event bus routing
- Runtime.emit updates place state correctly for all event types
- Runtime.applyAction mutates state correctly for all action types
- Invariants: can't move a guest to a room that doesn't exist; can't act on a non-existent affordance; etc.

**Checkpoints:**
- 90%+ line coverage in `@hauntjs/core` (Vitest coverage report)
- All event types and action types have at least one test
- A written integration test: construct a small place, fire a sequence of events, assert final state matches expectation

**Pause point:** After Phase 1. The primitives are the foundation — worth pausing for a human review to confirm the type shapes feel right before building on top.

---

## Phase 2 — Model Abstraction

**Goal:** The `@hauntjs/resident` package has a working model abstraction with three providers, and a `MockModelProvider` for tests.

**Deliverables in `@hauntjs/resident`:**
- `src/model/types.ts` — `ModelProvider`, `ChatRequest`, `ChatResponse`, `ChatMessage`, `ToolDefinition`
- `src/model/anthropic.ts` — uses the `@anthropic-ai/sdk` package
- `src/model/openai.ts` — uses the `openai` package
- `src/model/ollama.ts` — uses Ollama's HTTP API (no SDK needed, just `fetch`)
- `src/model/mock.ts` — returns canned responses for testing
- `src/model/factory.ts` — `createModelProvider(config)` picks the right provider based on config
- Config shape documented (env vars: `HAUNT_MODEL=anthropic|openai|ollama`, `ANTHROPIC_API_KEY=...`, etc.)

**Tests:**
- Each provider, mocked at the HTTP level (use `msw` or similar)
- The factory picks the right provider based on config
- Error handling: what happens when a provider throws, rate-limits, etc.

**Checkpoints:**
- A small CLI script at `packages/resident/scripts/test-models.ts` that sends "Say hello" to each configured provider and prints the response. Run this manually to confirm real API connectivity.

**Pause point:** After Phase 2, surface which providers were tested against real APIs vs. just mocked. Do not assume all three work without at least one real test call per provider.

---

## Phase 3 — Resident Mind

**Goal:** A `Resident` class that can receive a `PresenceEvent` + runtime context, assemble a prompt, call a model, parse the response into a `ResidentAction`, and return it. Still no visual world — this is tested via the mock adapter.

**Deliverables in `@hauntjs/resident`:**
- `src/character.ts` — `CharacterDefinition` type + loader (reads a TypeScript/JSON file and validates)
- `src/memory/store.ts` — `MemoryStore` with SQLite backend via `better-sqlite3`. Implements `recall`, `remember`, `updateGuest`.
- `src/memory/schema.sql` — the SQL migration for the tables defined in ARCHITECTURE.md
- `src/prompt.ts` — prompt assembly. Given character + context + recent events + relevant memory, produces a `ChatRequest`. This is the heart of the resident — spend care here.
- `src/decision.ts` — parses the model's response into a `ResidentAction | null`. Uses structured output (tool use for Anthropic/OpenAI, JSON-mode fallback for Ollama).
- `src/resident.ts` — the `Resident` class tying it all together. Exposes `perceive(event, context)` returning `Promise<ResidentAction | null>`.
- `src/index.ts` — public exports

**Tests:**
- Prompt assembly produces expected structure for a variety of event types
- Decision parser handles all valid action shapes, rejects malformed ones
- MemoryStore round-trips data through SQLite correctly
- Integration test: create a fake place with one room, fire a `guest.entered` event, assert the resident (using MockModelProvider with a canned "speak to welcome them" response) produces a `speak` action

**Checkpoints:**
- Write a character file for Poe (the reference character) at `packages/demo-roost/characters/poe.ts`. Include all fields from `CharacterDefinition`. The `systemPrompt` should be 200-400 words of prose — genuinely written, not templated.
- An end-to-end scripted test using a *real* model (Claude): boot a minimal place, connect a fake guest named "Takeshi," fire three events (entered lobby, spoke greeting, entered study), assert the resident's responses are coherent and in-character. This test is manual/optional in CI but must be runnable locally.

**Pause point:** After Phase 3. The prompt assembly and the Poe character file are both creative artifacts worth a human review. Surface both for feedback before proceeding.

---

## Phase 4 — 2D Place Adapter (Server Side)

**Goal:** The `@hauntjs/place-2d` server is working. A WebSocket server accepts guest connections, manages room occupancy, relays chat, applies resident actions. Still no visual client — test with a WebSocket CLI or the `ws` library directly.

**Deliverables in `@hauntjs/place-2d/src/server/`:**
- `src/server/adapter.ts` — implements `PlaceAdapter`. Mounts a place from a config.
- `src/server/websocket.ts` — WebSocket server using `ws`. Message protocol defined below.
- `src/server/protocol.ts` — message types for client↔server communication (join, move, speak, interact, state-update, resident-spoke, etc.)
- `src/server/world-config.ts` — the room and affordance definitions for The Roost (lobby, study, parlor, garden + affordances per `ARCHITECTURE.md`)

**Protocol (document this precisely, client will need to match):**
- Client → Server: `{ type: "join", guestName: string }`
- Client → Server: `{ type: "move", toRoom: string }`
- Client → Server: `{ type: "speak", text: string }`
- Client → Server: `{ type: "interact", affordanceId: string, actionId: string, params?: any }`
- Server → Client: `{ type: "state", place: PublicPlaceState }` (sent on join + on any state change)
- Server → Client: `{ type: "resident.spoke", text: string, roomId: string, audience: string[] }`
- Server → Client: `{ type: "resident.moved", from: string, to: string }`
- Server → Client: `{ type: "affordance.changed", affordanceId: string, newState: any }`

**Tests:**
- Adapter correctly builds The Roost place on mount
- WebSocket messages are validated (use `zod`)
- Multi-client: two fake guests connect, each sees the other's movements
- Resident actions are broadcast to the right audience (speech in lobby isn't heard in garden)

**Checkpoints:**
- Write a Node script that connects as a fake guest, joins, moves through all four rooms, speaks in each, and prints server responses. Visual confirmation that everything is wired.

**Pause point:** After Phase 4. The server is significant — pause for a review of the protocol and The Roost config before building the client.

---

## Phase 5 — 2D Place Adapter (Client)

**Goal:** A browser client that renders The Roost, lets a guest walk around, and shows the resident.

**Deliverables in `@hauntjs/place-2d/src/client/`:**
- `src/client/main.ts` — Phaser 3 setup, scene registration
- `src/client/scenes/roost-scene.ts` — the main scene. Tilemap per room or one tilemap with regions — builder's call based on what works with the tileset.
- `src/client/entities/guest-avatar.ts` — guest character, controllable with arrow keys
- `src/client/entities/resident-avatar.ts` — the resident, moves based on server updates. Distinct visual (different sprite or tint) so guests can spot it.
- `src/client/ui/chat-box.ts` — input for guest speech + log of recent messages
- `src/client/ui/speech-bubble.ts` — transient bubble above the resident when it speaks
- `src/client/net/socket.ts` — WebSocket client matching the protocol from Phase 4
- `index.html` + build setup (Vite is fine)

**Tileset:** Use Kenney's "1-Bit Pack" (CC0) or "Tiny Town" — confirm license and check assets into `packages/place-2d/assets/` with attribution.

**Interaction model:**
- Arrow keys / WASD: move
- Walking into a doorway: move to connected room
- Walking up to an affordance: press `E` to show available actions, select one
- Enter key: focus chat box, type, Enter to send

**Tests:**
- Component tests for UI pieces where tractable
- Most of this phase is visual — manual testing against a running dev-server is expected. Add a "demo script" in the README describing how to verify.

**Checkpoints:**
- `pnpm dev` boots dev-server + client
- Open two browser windows, connect as two different guests, verify they see each other
- Trigger an affordance (light the fireplace in the lobby), verify it updates for both guests
- At this phase, the resident is still just an NPC that moves when the server tells it to. The mind comes in Phase 6.

**Pause point:** After Phase 5. First visual demo. Pause for review — this is the first thing a human can actually *play with*, and feedback here will shape the next phase.

---

## Phase 6 — Integration: Mind Meets World

**Goal:** The resident's mind (Phase 3) is wired to the place (Phase 4-5). Events from the world flow to the resident, actions from the resident flow back to the world. A guest can have a real conversation with Poe in The Roost.

**Deliverables:**
- `apps/dev-server/src/main.ts` — the integration point. Constructs:
  - A `Runtime` from `@hauntjs/core`
  - A `Resident` from `@hauntjs/resident` with the Poe character and a chosen model provider
  - A `Place2DAdapter` from `@hauntjs/place-2d`
  - Wires them: adapter emits events to runtime, runtime calls resident.perceive, resident actions go back through runtime to adapter.
- Event throttling: don't call the model on every tick event — only on meaningful events. Document what "meaningful" means.
- Rate limiting / backpressure: if the model is slow, new events should queue, not stack up in parallel calls.

**Tests:**
- End-to-end integration test with `MockModelProvider`: guest joins, resident greets, guest speaks, resident responds, guest moves to another room, resident follows (or doesn't, in-character).
- Manual end-to-end with a real model: boot everything, walk around, have a conversation, assert it feels right.

**Checkpoints:**
- Someone can clone the repo, set `ANTHROPIC_API_KEY`, run `pnpm dev`, open the browser, and have a coherent 10-minute interaction with Poe in The Roost.
- The resident speaks only when it should. Silence is frequent and correct.
- The resident reacts to room changes (different tone in the garden than the study).
- The resident references affordances it can perceive.

**Pause point:** After Phase 6, this is the first real **end-to-end demo**. Pause for a longer review — record a video, surface the Poe character's behavior, discuss what's working and what's off.

---

## Phase 7 — Autonomous Cycles & Memory

**Goal:** The place is alive when no one's there. The resident remembers guests across sessions. The Roost feels inhabited.

**Deliverables:**
- Tick scheduler in `@hauntjs/core` — emits `tick` events every N minutes (configurable, default 5)
- Tick-specific behavior in the resident: on tick, consider reflecting, consolidating memory, initiating an action. Most ticks are no-ops.
- Special "on return" tick — when a known guest re-enters after absence, fire an immediate tick so the resident has a chance to prepare a return greeting.
- Memory writes on meaningful events — the resident can choose to write a `place_memory` entry ("Takeshi seemed troubled about his sister tonight").
- Guest memory updates — visit count, last seen, accumulated relationship notes.
- Persistence verification — restart the server, reconnect as the same guest, confirm the resident remembers.

**Tests:**
- Tick scheduler fires at the expected rate
- Memory persists across runtime restarts
- Known guests get recognized by name on re-entry
- Place memory entries are surfaced in prompts when relevant

**Checkpoints:**
- The "return visit" test: connect as "Takeshi," have a conversation, disconnect. Restart the server. Reconnect as "Takeshi." Verify Poe greets him as someone he knows, references something from the prior visit.
- The "while you were away" test: leave the server running for 30 minutes with no one connected. Check the logs — has the resident done anything interesting in that time? (Ideally yes, occasionally. Not constantly — that's twitchy.)

**Pause point:** After Phase 7, this is effectively v0.1. Pause for a full review and a demo writeup. Decide together whether there's a Phase 8 before declaring v0.1 shipped, or whether to ship and iterate.

---

## Phase 8 — Polish & Docs (v0.1 ship)

**Goal:** Ship-ready v0.1. Someone who isn't us can clone, run, and build their own place or character.

**Deliverables:**
- Thorough README at the root with: quickstart, screenshots, the thesis, a 60-second demo video linked
- `docs/guides/writing-a-character.md` — walk through authoring a new character file
- `docs/guides/writing-a-room.md` — walk through adding a new room to The Roost or building a new place
- `docs/guides/writing-an-adapter.md` — for ambitious users who want to wrap a different backend (Minecraft, Discord, etc.)
- `CONTRIBUTING.md` — how to contribute
- `LICENSE` — pick one (MIT or Apache-2.0 recommended)
- Clean up any TODOs in the code; resolve or file issues for them
- Version bump to `0.1.0`

**Checkpoints:**
- A fresh pair of eyes (human reviewer) follows the quickstart without prior context and successfully gets the demo running
- The writing-a-character guide is followed to create a second, different character, and it works
- The repo is ready to be made public

---

## Order-of-Magnitude Sizing

This is a guess, not a commitment. Useful for planning.

- Phase 0: ~½ day
- Phase 1: 1-2 days
- Phase 2: 1 day
- Phase 3: 2-3 days (the prompt assembly and Poe character file are the careful parts)
- Phase 4: 1-2 days
- Phase 5: 2-3 days (Phaser + tileset work is fiddly)
- Phase 6: 1-2 days (integration + tuning)
- Phase 7: 1-2 days
- Phase 8: 1 day

Total: ~2-3 weeks of focused work. Real calendar time will be longer.

---

## A Note on Scope Discipline

The single biggest risk to this project is scope creep. Every phase has obvious "would be cool" extensions that should *not* be built in that phase:

- Phase 5: don't add inventory, don't add NPC guests, don't add animation beyond idle/walk
- Phase 6: don't add voice, don't add image generation, don't let the resident write arbitrary code
- Phase 7: don't add vector memory, don't add cross-place residents, don't add the tick running when no guests are connected (that's expensive and v0.2)

When in doubt: **v0.1 is a proof of the thesis, not a product.** The thesis is "places with minds are a coherent primitive and a framework for them is buildable." Prove that, then iterate.
