# Architecture

This document defines the primitives, layers, and runtime loop of Haunt. It is the authoritative source for type shapes and component responsibilities. Treat the interfaces here as the target — actual code should match these shapes unless there's a documented reason to deviate.

## Three Layers

Haunt is organized into three layers with clean boundaries. Cross-layer communication happens only through defined interfaces.

```
┌─────────────────────────────────────────┐
│           RESIDENT LAYER                │   @hauntjs/resident
│  Character, memory, decision loop,      │
│  model abstraction, guest relationships │
└─────────────┬───────────────────────────┘
              │ Resident API (sense, decide, act)
              │
┌─────────────▼───────────────────────────┐
│           RUNTIME LAYER                 │   @hauntjs/core
│  State, event bus, presence, tick,      │
│  persistence, orchestration             │
└─────────────┬───────────────────────────┘
              │ Place API (read state, emit events, apply actions)
              │
┌─────────────▼───────────────────────────┐
│           PLACE LAYER                   │   @hauntjs/place-2d, etc.
│  Backend adapter — translates a         │
│  specific world into the Place API      │
└─────────────────────────────────────────┘
```

**Key invariant:** the Resident never talks to the Place directly. It always goes through the Runtime. This is what makes residents portable across places.

---

## Core Primitives

These are defined in `@hauntjs/core/src/types.ts`. Keep them stable — changing them is a breaking change for every adapter.

### `Place`

The root entity. A place has identity, structure, and state.

```ts
interface Place {
  id: string;
  name: string;
  rooms: Map<RoomId, Room>;
  guests: Map<GuestId, Guest>;
  metadata: Record<string, unknown>;
}
```

### `Room`

A named region within a place. Rooms have their own affordances and state. Movement between rooms is a first-class event.

```ts
interface Room {
  id: RoomId;
  name: string;
  description: string;               // used in prompts to the resident
  affordances: Map<AffordanceId, Affordance>;
  connectedTo: RoomId[];             // adjacency graph
  state: Record<string, unknown>;    // room-specific state (e.g., fireplace lit)
}
```

### `Affordance`

Something in a room that can be sensed or manipulated. Objects, devices, surfaces, anything the resident or guest can interact with. First-class, not a hidden tool call.

```ts
interface Affordance {
  id: AffordanceId;
  roomId: RoomId;
  kind: string;                      // e.g., "fireplace", "desk", "door"
  name: string;
  description: string;
  state: Record<string, unknown>;    // e.g., { lit: false }
  actions: AffordanceAction[];       // what can be done to it
  sensable: boolean;                 // whether the resident can perceive it
}

interface AffordanceAction {
  id: string;                        // e.g., "light", "extinguish", "read"
  name: string;
  description: string;
  params?: Record<string, JsonSchema>;
  availableWhen?: (state: Record<string, unknown>) => boolean;
}
```

### `Guest`

A person present in or known to the place. Guests have history, relationships, and a loyalty tier.

```ts
interface Guest {
  id: GuestId;
  name: string;
  currentRoom: RoomId | null;        // null means not present
  firstSeen: Date;
  lastSeen: Date;
  visitCount: number;
  loyaltyTier: "principal" | "regular" | "visitor" | "stranger";
  relationship: RelationshipState;   // see resident layer
}
```

### `Resident`

The mind bound to the place. Exactly one per place in v0.1 (multi-resident is a later concern).

```ts
interface Resident {
  id: string;
  character: CharacterDefinition;    // see resident layer
  currentRoom: RoomId;
  mood: MoodState;                   // graceful degradation, energy, focus
  memory: MemoryStore;
}
```

### `PresenceEvent`

The universal shape of "something happened in the place." All events flow through the event bus.

```ts
type PresenceEvent =
  | { type: "guest.entered"; guestId: GuestId; roomId: RoomId; at: Date }
  | { type: "guest.left"; guestId: GuestId; roomId: RoomId; at: Date }
  | { type: "guest.moved"; guestId: GuestId; from: RoomId; to: RoomId; at: Date }
  | { type: "guest.spoke"; guestId: GuestId; roomId: RoomId; text: string; at: Date }
  | { type: "affordance.changed"; affordanceId: AffordanceId; prevState: unknown; newState: unknown; at: Date }
  | { type: "resident.moved"; from: RoomId; to: RoomId; at: Date }
  | { type: "resident.spoke"; roomId: RoomId; text: string; audience: GuestId[]; at: Date }
  | { type: "resident.acted"; affordanceId: AffordanceId; actionId: string; at: Date }
  | { type: "tick"; at: Date };      // autonomous cycle heartbeat
```

---

## The Runtime Loop

The runtime is the central nervous system. It does four things:

1. **Maintains state** — the authoritative `Place` object lives here
2. **Routes events** — place adapters emit events up; resident actions flow down
3. **Orchestrates presence** — guest movement, arrival, departure, proximity
4. **Drives the tick** — the heartbeat that lets the place live between visits

### Event Flow

```
Place adapter              Runtime                    Resident
     │                        │                          │
     │  guest.entered         │                          │
     ├───────────────────────▶│                          │
     │                        │  perceive(event)         │
     │                        ├─────────────────────────▶│
     │                        │                          │
     │                        │  ResidentAction (speak,  │
     │                        │       move, act)         │
     │                        │◀─────────────────────────┤
     │  apply(action)         │                          │
     │◀───────────────────────┤                          │
     │                        │                          │
```

### The Tick

The tick is a scheduled event the runtime emits when the place is otherwise quiet. It's the mechanism that lets the resident be a being, not just a responder. On tick, the resident may:

- Reflect on recent events
- Consolidate memory
- Initiate an action (rearrange a room, leave a note, move to a different room)
- Do nothing (most ticks should be no-ops — don't make the resident twitchy)

Default tick rate: once every 5 minutes of wall-clock time, plus an "on guest return" tick when a known guest re-enters the place after absence.

### Runtime Interface

```ts
interface Runtime {
  place: Place;
  resident: Resident;

  // Called by place adapters
  emit(event: PresenceEvent): Promise<void>;

  // Called by the resident
  applyAction(action: ResidentAction): Promise<ActionResult>;

  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;
}

type ResidentAction =
  | { type: "speak"; text: string; audience: GuestId[] | "all"; roomId?: RoomId }
  | { type: "move"; toRoom: RoomId }
  | { type: "act"; affordanceId: AffordanceId; actionId: string; params?: Record<string, unknown> }
  | { type: "note"; content: string; about: GuestId | "self" }  // internal memo
  | { type: "wait" };
```

---

## The Resident Layer

The resident is the mind. Its job: given a stream of events and access to memory, decide what (if anything) to do.

### Character Definition

The character file is the seed. It defines who the resident is, not what they do.

```ts
interface CharacterDefinition {
  name: string;
  archetype: string;                 // e.g., "hospitable concierge", "weary caretaker"
  systemPrompt: string;              // core identity and voice
  voice: {
    register: "formal" | "warm" | "clipped" | "poetic";
    quirks: string[];                // e.g., "occasionally quotes 19th century poets"
    avoidances: string[];            // things this character wouldn't say
  };
  loyalties: {
    principal: string | null;        // the primary guest, if any
    values: string[];                // e.g., "guest safety", "discretion", "warmth"
  };
  decay?: {                          // optional, for graceful-degradation characters
    enabled: boolean;
    severity: number;                // 0-1
    symptoms: string[];              // e.g., "occasional reboot", "repeated phrases"
  };
}
```

A sample character file for the reference resident lives at `packages/demo-roost/characters/poe.ts`. It should feel like a person, not a config.

### The Decision Loop

Each time the resident is invoked (either by an event or a tick), the flow is:

1. **Perceive** — gather current context (current room, recent events, guests present, relevant memory)
2. **Deliberate** — ask the model: given who I am, what's happening, and what I remember, what should I do?
3. **Act** — emit zero or one `ResidentAction`

```ts
interface Resident {
  perceive(event: PresenceEvent, context: RuntimeContext): Promise<ResidentAction | null>;
}
```

The model should often return `null` (no action). Residents that respond to every event are exhausting. Silence is a valid response. Guidance for this lives in the system prompt.

### Model Abstraction

Model-agnostic from day one. The `ModelProvider` interface:

```ts
interface ModelProvider {
  name: "anthropic" | "openai" | "ollama" | string;
  chat(request: ChatRequest): Promise<ChatResponse>;
}

interface ChatRequest {
  systemPrompt: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}
```

Three implementations ship in v0.1:
- `AnthropicProvider` — Claude via the Anthropic SDK
- `OpenAIProvider` — OpenAI SDK
- `OllamaProvider` — local models via Ollama's HTTP API

The provider is chosen via config, not code. Swapping is a one-line change.

### Memory

v0.1 memory is deliberately simple. Three layers:

1. **Working memory** — the current conversation / recent events (last ~50 events, in-memory)
2. **Guest memory** — per-guest relationship state, persisted to SQLite
3. **Place memory** — notable events and patterns the resident has chosen to remember, persisted to SQLite

Notable: place memory is *curated by the resident itself*, not automatic. On tick, the resident may write a memory entry. This is more interesting than dumping every event into a vector DB, and cheaper.

A vector-retrieval memory layer is explicitly out of scope for v0.1 and left for v0.2.

```ts
interface MemoryStore {
  workingMemory: PresenceEvent[];
  guestMemory: Map<GuestId, GuestMemory>;
  placeMemory: PlaceMemoryEntry[];

  recall(query: MemoryQuery): Promise<MemoryResult[]>;
  remember(entry: PlaceMemoryEntry): Promise<void>;
  updateGuest(id: GuestId, update: Partial<GuestMemory>): Promise<void>;
}
```

---

## The Place Layer

Place adapters translate a specific backend into the Place API. Each adapter exposes two things:

1. A way to **mount a place** (set up the world, define rooms and affordances)
2. A way to **bridge events** (emit `PresenceEvent`s upward and apply `ResidentAction`s downward)

### Adapter Interface

```ts
interface PlaceAdapter {
  name: string;

  mount(config: PlaceConfig): Promise<Place>;
  start(runtime: Runtime): Promise<void>;
  stop(): Promise<void>;

  // Apply an action produced by the resident
  applyAction(action: ResidentAction, place: Place): Promise<ActionResult>;
}
```

### The 2D Reference Adapter (`@hauntjs/place-2d`)

Two pieces: a Node server and a browser client.

**Server** (`packages/place-2d/src/server/`)
- Manages the authoritative room/affordance state
- WebSocket server for connected guests
- Emits `PresenceEvent`s to the runtime
- Applies `ResidentAction`s: broadcasts resident speech, updates affordance state, moves the resident avatar

**Client** (`packages/place-2d/src/client/`)
- Phaser 3 scene per room
- Pre-made tileset (use Kenney's "1-Bit Pack" or similar CC0 — confirm licensing before commit)
- Guest controls: arrow keys to move, click to interact with affordances, chat box to speak
- Renders the resident avatar with a simple idle/walk animation
- Resident speech appears as a speech bubble above the avatar

**The Roost layout (v0.1 demo)**
- **Lobby** — entry point, fireplace affordance, notice board affordance
- **Study** — desk affordance (can hold notes), bookshelf affordance
- **Parlor** — a sitting room, piano affordance (decorative for now)
- **Garden** — outdoor sitting area, fountain affordance
- 4 rooms is the right size — enough to demonstrate movement and room-specific behavior, small enough to author carefully

---

## Persistence

v0.1 uses SQLite via `better-sqlite3`. One file per place, stored at `./data/<place-id>.db`.

Tables:
- `guests` — id, name, first_seen, last_seen, visit_count, loyalty_tier
- `guest_memory` — guest_id, key, value_json, updated_at
- `place_memory` — id, content, tags, created_at, importance
- `events_log` — optional, ring-buffered event log for debugging

State that *doesn't* persist in v0.1: room state (fireplace lit/unlit), resident mood. These reset on server restart. Persisting them is trivial later — they're deliberately ephemeral for now to keep the surface small.

---

## Non-Goals for v0.1

Written down so the agent doesn't scope-creep:

- Multiple residents per place
- Multiple places in one runtime
- Voice input/output
- 3D rendering
- Native mobile clients
- Vector memory / RAG
- Fine-tuning / custom model training
- Distributed/cloud deployment (local-dev only)
- Authentication beyond a simple guest-name prompt
- Real-time collaboration between guests (they can see each other but not interact directly — that's v0.2)

---

## Testing Strategy

Three tiers:

1. **Unit tests** for each primitive and utility — Vitest, colocated with source as `.test.ts`
2. **Integration tests** for the runtime loop — fake place adapter + fake model provider + assertions on event flow
3. **A scripted demo run** — a test that boots the full demo, connects a fake guest, runs a scripted sequence, and asserts the resident behaved reasonably. This catches integration regressions.

Model-dependent tests use a `MockModelProvider` that returns canned responses. Don't hit real LLMs in CI.

---

## Style & Conventions

- Strict TypeScript. No `any` without a comment explaining why.
- Prefer `type` over `interface` for data shapes; `interface` for extensible contracts.
- Effects (I/O, time, randomness) behind interfaces so tests can fake them.
- Events are past-tense verbs (`guest.entered`, not `guest.enter`).
- Actions are present-tense imperatives (`speak`, `move`, not `spoke`, `moved`).
- Domain terms come from the fiction: `Guest`, `Resident`, `Room`, `Affordance`. Not `User`, `Agent`, `Node`, `Tool`.
