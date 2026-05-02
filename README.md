# Haunt

> A TypeScript framework for building **places with minds** — inhabited, persistent, AI environments where perception is structural, memory is real, and the architecture shapes the conversation.

**Name:** `Haunt`. The double meaning is the thesis: a haunt is a place you frequent, and to haunt is to persistently inhabit.

---

## What Is This?

Most AI frameworks build **workers** — things you dispatch to do tasks. Haunt builds **residents** — minds bound to environments that persist whether you're there or not.

A chatbot is summoned and dismissed. A place is entered and left. The place exists between your visits. When you come back, things have happened. The resident remembers not just what you said, but what happened here, and who else has been through.

The resident perceives the world through **sensors** — cameras, microphones, presence detectors — attached to rooms. Turn off a light and the resident loses sight. Close a door and sound stops carrying. A room with no sensors is a genuine blind spot: the resident cannot perceive what happens there.

This isn't decoration. It shapes behavior. In our demo, a surveillance system — reflecting on its own inability to perceive a hidden room — independently arrived at this:

> *"A place that remembers everything must have a blind spot, or it becomes a prison."*

Nobody wrote that line. It emerged from room topology and sensor configuration.

---

## The Vault Demo

The flagship demo is **The Vault** — a self-running simulation where an AI resident and 4 AI guests interact in a sensorized, time-shifting building.

**The setup:**
- **Poe** is the Vault's mind. He perceives through its sensors, exists in all its rooms, and guards a secret entrusted to a specific lineage.
- **6 rooms** with different sensor profiles — full sight+sound, sound only, partial perception, and one hidden room with zero sensors.
- **Day/night cycle** — sensors dim at night, rooms transform, and the hidden room becomes accessible only in darkness.
- **4 AI guests** arrive with different agendas:
  - **Kovacs** (the Heir) — believes he's a descendant, builds trust through patience and authenticity
  - **Raven** (the Thief) — maps sensor blind spots, probes for weaknesses
  - **Lira** (the Scholar) — studies the architecture out of genuine curiosity
  - **Marsh** (the Tourist) — just here for a pleasant stay

No scripted dialogue. No choreography. Guests perceive only what's in their room. Poe perceives only through sensors. Everything emerges from drive pressure, room topology, and LLM reasoning.

### Run the demo

```bash
git clone https://github.com/hauntjs/hauntjs.git && cd hauntjs
pnpm install

# Set your model provider
export GEMINI_API_KEY=your-key-here

# Terminal 1: Start the server
pnpm --filter @hauntjs/demo-vault-app dev

# Terminal 2: Start the spectator dashboard
pnpm --filter @hauntjs/demo-vault-app dev:client

# Open the dashboard URL shown in Terminal 2
```

The spectator dashboard shows a live map of all rooms, character positions, Poe's inner state, guest trust levels, sensor status, and a filterable activity stream. Guests arrive over the first 15 minutes. The simulation runs until it reaches the configured day limit.

You can tune the pacing with environment variables:

```bash
# Compressed time: 2 real min = 1 in-world hour, 30s ticks, 60 min max
TIME_MS_PER_HOUR=120000 TICK_INTERVAL=30000 MAX_REAL_MINUTES=60 \
  pnpm --filter @hauntjs/demo-vault-app dev
```

After a run, examine the full transcript:

```bash
cd apps/demo-vault

# Summary stats
pnpm tsx scripts/export-transcript.ts --stats

# Full readable transcript
pnpm tsx scripts/export-transcript.ts

# Machine-readable JSON
pnpm tsx scripts/export-transcript.ts --json > simulation.json
```

### The Roost (interactive demo)

There's also an interactive 2D demo — **The Roost** — where you walk around a Phaser world and talk to Poe directly:

```bash
# Terminal 1
pnpm --filter @hauntjs/dev-server dev

# Terminal 2
pnpm --filter @hauntjs/place-2d dev
```

Walk with WASD, press E near objects to interact, type in the chat to talk to Poe. Open two browser tabs for multi-guest support.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│                  RESIDENT                   │  the mind
│  (character + memory + model + inner life)  │
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

### Key concepts

- **Place** — rooms, connections, affordances, and sensors. The physical environment.
- **Resident** — the mind of the place. Perceives through sensors, deliberates, acts. Persists across sessions.
- **Sensors** — sight, sound, presence, state. Each with fidelity (full/partial/ambiguous/none) and reach (room/adjacent/place-wide). Strict by default — no sensor means no perception.
- **Presence modes** — **Host** (the resident IS the place, perceives all sensored rooms — like Poe), **Inhabitant** (physical body, walks between rooms), **Presence** (ambient, environmental — like The Board in *Control*).
- **Inner life** — optional integration with [@embersjs/core](https://github.com/embersjs) for drives, practices, and felt inner states that drift over time and shape behavior.
- **Guest agents** — autonomous AI guests with their own goals, strategies, and inner lives for testing and simulation.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full reference.

---

## Repo Layout

```
hauntjs/
├── packages/
│   ├── core/               # Primitives, systems pipeline, sensors, event bus, time system
│   ├── resident/           # Resident mind, memory (SQLite), model providers, prompt assembly
│   ├── place-2d/           # Phaser-based 2D place adapter (WebSocket server + client)
│   ├── guest-agent/        # Autonomous AI guest agents with Embers integration
│   ├── demo-roost/         # The Roost — interactive reference world + Poe character
│   └── demo-vault/         # The Vault — autonomous demo scenario, characters, trust mechanic
├── apps/
│   ├── dev-server/         # Dev harness for The Roost (interactive)
│   └── demo-vault/         # Server + spectator dashboard for The Vault (autonomous)
├── docs/
│   ├── ARCHITECTURE.md     # Core primitives, sensors, pipeline, presence modes
│   └── guides/             # How to write characters, rooms, sensors, adapters
└── README.md
```

---

## Model Configuration

```bash
# Provider selection
HAUNT_MODEL=gemini          # or "anthropic", "openai", "ollama"
GEMINI_API_KEY=...          # if using gemini (default)
ANTHROPIC_API_KEY=...       # if using anthropic
OPENAI_API_KEY=...          # if using openai
OLLAMA_HOST=...             # if using ollama (defaults to localhost:11434)
HAUNT_MODEL_NAME=...        # optional model name override

# The Vault demo uses two model tiers
HAUNT_RICH_MODEL=gemini-3.1-pro-preview    # for the resident (Poe)
HAUNT_FAST_MODEL=gemini-3-flash-preview    # for guest agents

# Simulation tuning
TIME_MS_PER_HOUR=120000     # real ms per in-world hour (default: 600000 = 10 min)
TICK_INTERVAL=30000         # ms between ticks (default: 60000)
MAX_DAYS=2                  # stop after N in-world days (default: 3)
MAX_REAL_MINUTES=60         # stop after N real minutes (default: 0 = unlimited)
```

---

## Scripts

```bash
pnpm install             # install everything
pnpm build               # build all packages
pnpm test                # run all tests (157 tests across 14 suites)
pnpm typecheck           # TypeScript only
```

---

## Guides

- **[Writing a Character](docs/guides/writing-a-character.md)** — how to create a new resident personality
- **[Writing a Room](docs/guides/writing-a-room.md)** — how to add rooms and affordances
- **[Writing Sensors](docs/guides/writing-a-sensor.md)** — how to shape perception (fidelity, reach, design patterns)
- **[Writing an Adapter](docs/guides/writing-an-adapter.md)** — how to connect a new backend (Minecraft, Discord, etc.)

---

## What It Is Not

- Not a chatbot framework. The unit is a place, not a conversation.
- Not an agent swarm. The default is a single resident in a single place.
- Not a game engine. Haunt plugs into game engines; it doesn't replace them.
- Not tied to a single LLM. Model-agnostic from day one.

---

## License

MIT. See [LICENSE](LICENSE).
