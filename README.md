# Haunt

> A TypeScript framework for building **places with minds** — inhabited, persistent, relational AI environments. Not chatbots. Not agent swarms. Places you enter, leave, and return to.

**Status:** Pre-alpha. This repo is a design + scaffolding handoff to be built out in phases.
**Name:** `Haunt`. The double meaning is the thesis: a haunt is a place you frequent, and to haunt is to persistently inhabit. Published on npm under `@hauntjs/*`.

---

## The Thesis

Most AI agent frameworks are built around **workers** — things you dispatch to do tasks. Haunt is built around **residents** — minds bound to environments that persist whether you're there or not.

The distinction matters. A chatbot is summoned and dismissed. A place is entered and left. The place exists between your visits. When you come back, things have happened. The resident remembers not just what you said, but what happened here, and who else has been through.

If that distinction feels abstract, the filter is: **does the experience degrade meaningfully if "place I'm in" becomes "app I opened"?** If yes, it's a Haunt use case. If no, a regular agent framework is fine.

## What It Is

Haunt is a runtime plus a set of primitives for building place-bound AI residents. The core abstractions are:

- **`Place`** — an environment with structure, state, and affordances
- **`Room`** — a named region inside a place with its own state
- **`Affordance`** — something in the place that can be sensed or acted upon
- **`Resident`** — the mind bound to the place
- **`Guest`** — a person present in the place, with a relationship to it
- **`Presence`** — the event of a guest entering, moving, or leaving

The framework is **place-agnostic**. A place can be a 2D virtual world, a Minecraft server, a Discord server, a smart home, or anything else that can expose rooms and sensors. Adapters translate a backend into the framework's abstractions.

The reference implementation (shipped with the repo) is **The Roost** — a small browser-based 2D world rendered in Phaser, inhabited by a resident modeled on the Poe archetype from *Altered Carbon* (hospitable, loyal, fascinated by humanity, place-bound).

## What It Is Not

- Not a chatbot framework. If you want a session-based Q&A bot, use something else.
- Not an agent-swarm framework. The default unit is a single resident in a single place.
- Not a game engine. Haunt plugs into game engines, it doesn't replace them.
- Not a smart-home platform. A smart-home adapter is plausible for v0.3+, but not the focus.
- Not tied to a single LLM provider. Model-agnostic from day one.

## Stack

- **Language:** TypeScript (Node 20+)
- **Monorepo:** pnpm workspaces
- **Runtime:** Node for the server, browser for the reference world client
- **Rendering (reference world):** Phaser 3 with a pre-made tileset (Kenney.nl or similar CC0)
- **Transport:** WebSocket (`ws` server-side, native browser client)
- **Persistence:** SQLite via `better-sqlite3` (v0.1), pluggable for later
- **LLM:** Model-agnostic via a `ModelProvider` interface — Anthropic, OpenAI, and Ollama (local) implementations ship in v0.1
- **Testing:** Vitest

## Repo Layout (target)

```
haunt/
├── packages/
│   ├── core/               # Primitives, runtime loop, event bus
│   ├── resident/           # Character model, mind, memory, model providers
│   ├── place-2d/           # Phaser-based 2D place adapter (server + client)
│   └── demo-roost/         # The Roost reference world
├── apps/
│   └── dev-server/         # Local dev harness — serves the demo
├── docs/
│   ├── ARCHITECTURE.md
│   ├── ROADMAP.md
│   └── CLAUDE.md
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

## Quick Mental Model

```
┌─────────────────────────────────────────────┐
│                  RESIDENT                   │  the mind
│  (character + memory + model + loyalties)   │
└──────────────────┬──────────────────────────┘
                   │
                   ▼ senses, acts
┌─────────────────────────────────────────────┐
│                  RUNTIME                    │  the loop
│  (state, events, presence, autonomous tick) │
└──────────────────┬──────────────────────────┘
                   │
                   ▼ adapts
┌─────────────────────────────────────────────┐
│                   PLACE                     │  the environment
│  (rooms, affordances, sensors, guests)      │
└─────────────────────────────────────────────┘
         ▲
         │ backed by
         │
  ┌──────┴──────┬──────────┬──────────────┐
  │ 2D (Phaser) │ Minecraft│ Discord      │  place providers
  │  (v0.1)     │ (later)  │ (later)      │
  └─────────────┴──────────┴──────────────┘
```

The win: a resident written once works in any place. A place written once hosts any resident.

## Reading Order for the Claude Code Agent

1. This `README.md` — what and why
2. `docs/ARCHITECTURE.md` — core primitives, interfaces, runtime loop
3. `docs/ROADMAP.md` — phased execution plan
4. `docs/CLAUDE.md` — working conventions, when to pause, testing expectations

Always start by reading all four before writing code.

## Success Criteria for v0.1

A developer can:

1. Clone the repo, run `pnpm install && pnpm dev`, and walk a character around The Roost in a browser
2. Encounter a resident who greets them by name on return visits, references prior conversations, and reacts to rooms they enter
3. See the resident take actions in the world (light a fireplace, leave a note on a desk) without being prompted
4. Swap the model provider from Anthropic to OpenAI to Ollama with a config change
5. Read the docs and understand how to author a new character file or a new room

If all five are true, v0.1 ships.
