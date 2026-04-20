# Haunt

> A TypeScript framework for building **places with minds** — inhabited, persistent, relational AI environments. Not chatbots. Not agent swarms. Places you enter, leave, and return to.

**Status:** v0.2 — sensors, systems pipeline, and presence modes shipped.
**Name:** `Haunt`. The double meaning is the thesis: a haunt is a place you frequent, and to haunt is to persistently inhabit.

---

## Quickstart

```bash
# Clone and install
git clone <repo-url> haunt && cd haunt
pnpm install

# Set a model provider (Gemini is default, or use Anthropic/OpenAI/Ollama)
export GEMINI_API_KEY=your-key-here
# or: export HAUNT_MODEL=anthropic && export ANTHROPIC_API_KEY=your-key
# or: export HAUNT_MODEL=openai && export OPENAI_API_KEY=your-key
# or: export HAUNT_MODEL=ollama  (requires Ollama running locally)

# Start the backend (Terminal 1)
pnpm --filter @hauntjs/dev-server dev

# Start the client (Terminal 2)
pnpm --filter @hauntjs/place-2d dev

# Open http://localhost:5173 in your browser
# Enter your name and walk into The Roost
```

You should be in a 2D world within 30 seconds. Walk around with WASD, press E near objects to interact, type in the chat to talk to Poe — the resident who lives here.

---

## The Thesis

Most AI agent frameworks are built around **workers** — things you dispatch to do tasks. Haunt is built around **residents** — minds bound to environments that persist whether you're there or not.

The distinction matters. A chatbot is summoned and dismissed. A place is entered and left. The place exists between your visits. When you come back, things have happened. The resident remembers not just what you said, but what happened here, and who else has been through.

The filter: **does the experience degrade meaningfully if "place I'm in" becomes "app I opened"?** If yes, it's a Haunt use case.

---

## What You Get

### Core Framework
- **Places with minds** — rooms, affordances, sensors, guests, and a resident that perceives and acts
- **Sensor-mediated perception** — each room has sensors that shape what the resident can see, hear, and know. Turn off a light and the resident loses sight. Close a door and sound stops carrying.
- **Three presence modes** — **Host** (the resident IS the place, omnipresent — like Poe in *Altered Carbon*), **Inhabitant** (physical body in one room, walks between rooms), **Presence** (ambient, environmental — like The Board in *Control*)
- **Systems pipeline** — clean 7-stage runtime: StatePropagation → Sensor → Memory → Autonomy → Resident → ActionDispatch → Broadcast
- **Memory that persists** — the resident remembers guest names, conversations, and relationships across sessions via SQLite
- **Model-agnostic** — swap between Gemini, Anthropic, OpenAI, or Ollama with one env var
- **Adapter architecture** — the same resident works in any place. Write a new adapter for Minecraft, Discord, a smart home, or anything with rooms and events.

### The Reference Demo: The Roost
- A **4-room 2D world** rendered in Phaser you can walk around in a browser
- **Poe** — a hospitable concierge who IS The Roost. He perceives every room, responds wherever you are, lights the fireplace, tends to the place, remembers you across visits.
- **Distinct room perception** — the Lobby is fully observed, the Study can go dark (turn off the lamp), the Parlor's door blocks sound when closed, the Garden has muffled hearing
- **Interactive affordances** — fireplace, notice board, writing desk, bookshelf, piano, fountain, reading lamp, parlor door
- **Multi-guest support** — open two browser tabs and both guests see each other and can talk to Poe

---

## Architecture

```
┌─────────────────────────────────────────────┐
│                  RESIDENT                   │  the mind
│  (character + memory + model + loyalties)   │
└──────────────────┬──────────────────────────┘
                   │
                   ▼ perceives through sensors, deliberates selectively
┌─────────────────────────────────────────────┐
│                  RUNTIME                    │  the nervous system
│  7-stage systems pipeline                   │
│  (state → sensors → memory → autonomy →    │
│   resident → dispatch → broadcast)          │
└──────────────────┬──────────────────────────┘
                   │
                   ▼ adapts
┌─────────────────────────────────────────────┐
│                   PLACE                     │  the environment
│  (rooms, affordances, sensors, guests)      │
└─────────────────────────────────────────────┘
         ▲
         │ backed by
  ┌──────┴──────┬──────────┬──────────────┐
  │ 2D (Phaser) │ Minecraft│ Discord      │  place adapters
  │  (shipped)  │ (future) │ (future)     │
  └─────────────┴──────────┴──────────────┘
```

The resident never talks to the place directly — always through the runtime. This is what makes residents portable across places.

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full reference.

---

## Repo Layout

```
haunt/
├── packages/
│   ├── core/               # Primitives, systems pipeline, sensors, event bus, tick scheduler
│   ├── resident/           # Character model, mind, memory, model providers
│   ├── place-2d/           # Phaser-based 2D place adapter (server + client)
│   └── demo-roost/         # The Roost reference world + Poe character
├── apps/
│   └── dev-server/         # Local dev harness — wires everything together
├── docs/
│   ├── ARCHITECTURE.md     # Core primitives, sensors, pipeline, presence modes
│   ├── ROADMAP.md          # v0.1 build plan (complete)
│   └── guides/             # How to write characters, rooms, sensors, adapters
├── turbo.json
├── pnpm-workspace.yaml
└── README.md
```

---

## Model Configuration

```bash
HAUNT_MODEL=gemini       # or "anthropic", "openai", "ollama"
GEMINI_API_KEY=...       # if using gemini (default for dev-server)
ANTHROPIC_API_KEY=...    # if using anthropic
OPENAI_API_KEY=...       # if using openai
OLLAMA_HOST=...          # if using ollama (defaults to localhost:11434)
HAUNT_MODEL_NAME=...     # optional model name override
HAUNT_DEBUG=1            # enable sensor debug overlay (press F2 in client)
```

---

## Scripts

```bash
pnpm install             # install everything
pnpm build               # build all packages (turbo)
pnpm test                # run all tests (147 tests)
pnpm lint                # eslint + typecheck
pnpm typecheck           # just TypeScript, no bundling
```

Dev mode requires two terminals:
```bash
pnpm --filter @hauntjs/dev-server dev   # backend (HTTP + WebSocket)
pnpm --filter @hauntjs/place-2d dev     # client (Vite + Phaser)
```

---

## Guides

- **[Writing a Character](docs/guides/writing-a-character.md)** — how to create a new resident personality
- **[Writing a Room](docs/guides/writing-a-room.md)** — how to add rooms and affordances to a place
- **[Writing Sensors](docs/guides/writing-a-sensor.md)** — how to shape what the resident perceives (fidelity, reach, design patterns)
- **[Writing an Adapter](docs/guides/writing-an-adapter.md)** — how to connect a new backend (Minecraft, Discord, smart home, etc.)

---

## What It Is Not

- Not a chatbot framework. If you want session-based Q&A, use something else.
- Not an agent-swarm framework. The default unit is a single resident in a single place.
- Not a game engine. Haunt plugs into game engines, it doesn't replace them.
- Not tied to a single LLM provider. Model-agnostic from day one.

---

## What Good Looks Like

- Poe feels like a person, not a chatbot in a hat
- The Roost feels inhabited — things happen, things are remembered, things have weight
- Each room feels different — not just different descriptions, but different *perception*
- The primitives in `@hauntjs/core` are clean enough that writing a new adapter looks like a weekend project, not a fork
- A stranger can clone the repo and get the demo running from this README in under 10 minutes

---

## License

MIT. See [LICENSE](LICENSE).
