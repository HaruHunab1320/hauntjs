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

## What You Get in v0.1

- A **4-room 2D world** (The Roost) you can walk around in a browser
- A **resident** (Poe) who IS the place — omnipresent, responds in any room, manifests where you are
- **Sensor-mediated perception** — each room has different sensors shaping what the resident perceives. Turn off a light and the resident loses sight. Close a door and sound stops carrying.
- **Three presence modes** — Host (omnipresent, like Poe in *Altered Carbon*), Inhabitant (physical body in one room), Presence (ambient, environmental)
- **Memory that persists** — Poe remembers your name, your conversations, and what you talked about across sessions
- **Spatial awareness** — Poe notices when you walk up to the fireplace, when you enter a room, when you leave
- **Model-agnostic** — swap between Gemini, Anthropic, OpenAI, or Ollama with one env var
- **Systems pipeline** — clean 7-stage runtime: StatePropagation → Sensor → Memory → Autonomy → Resident → ActionDispatch → Broadcast
- **Clean primitives** — Place, Room, Affordance, Sensor, Guest, Resident, Perception — ready for new adapters

---

## Architecture

```
┌─────────────────────────────────────────────┐
│                  RESIDENT                   │  the mind
│  (character + memory + model + loyalties)   │
└──────────────────┬──────────────────────────┘
                   │
                   ▼ perceives everything, deliberates selectively
┌─────────────────────────────────────────────┐
│                  RUNTIME                    │  the nervous system
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
  ┌──────┴──────┬──────────┬──────────────┐
  │ 2D (Phaser) │ Minecraft│ Discord      │  place adapters
  │  (v0.1)     │ (future) │ (future)     │
  └─────────────┴──────────┴──────────────┘
```

The resident never talks to the place directly — always through the runtime. This is what makes residents portable across places.

---

## Repo Layout

```
haunt/
├── packages/
│   ├── core/               # Primitives, runtime loop, event bus, tick scheduler
│   ├── resident/           # Character model, mind, memory, model providers
│   ├── place-2d/           # Phaser-based 2D place adapter (server + client)
│   └── demo-roost/         # The Roost reference world + Poe character
├── apps/
│   └── dev-server/         # Local dev harness — wires everything together
├── docs/
│   ├── ARCHITECTURE.md     # Core primitives and interfaces
│   ├── ROADMAP.md          # Phased build plan
│   └── guides/             # How to write characters, rooms, adapters
├── turbo.json
├── pnpm-workspace.yaml
└── README.md
```

---

## Model Configuration

```bash
HAUNT_MODEL=gemini       # or "anthropic", "openai", "ollama"
GEMINI_API_KEY=...       # if using gemini (default)
ANTHROPIC_API_KEY=...    # if using anthropic
OPENAI_API_KEY=...       # if using openai
OLLAMA_HOST=...          # if using ollama (defaults to localhost:11434)
HAUNT_MODEL_NAME=...     # optional model name override
```

---

## Scripts

```bash
pnpm install             # install everything
pnpm build               # build all packages (turbo)
pnpm test                # run all tests
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
- **[Writing Sensors](docs/guides/writing-a-sensor.md)** — how to shape what the resident perceives
- **[Writing an Adapter](docs/guides/writing-an-adapter.md)** — how to connect a new backend (Minecraft, Discord, etc.)

---

## The Reference Demo: The Roost

The Roost is a small establishment — part hotel, part home — inhabited by Poe, a hospitable concierge archetype. Four rooms:

- **Lobby** — fireplace, notice board. The entry point.
- **Study** — writing desk, bookshelf. Quiet.
- **Parlor** — piano. Connects the lobby to the garden.
- **Garden** — fountain. Outdoor, cooler, quieter.

Poe tends to the place. He lights the fire, wanders between rooms, notices when you approach things. He remembers you across visits. He speaks like a person, not a chatbot.

---

## What Good Looks Like

- Poe feels like a person, not a chatbot in a hat
- The Roost feels inhabited — things happen, things are remembered, things have weight
- The primitives in `@hauntjs/core` are clean enough that writing a new adapter looks like a weekend project, not a fork

## What It Is Not

- Not a chatbot framework
- Not an agent-swarm framework
- Not a game engine
- Not tied to a single LLM provider

---

## License

MIT. See [LICENSE](LICENSE).
