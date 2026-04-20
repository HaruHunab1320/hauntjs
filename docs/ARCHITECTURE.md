# Architecture

This document defines the primitives, layers, and runtime of Haunt. It is the authoritative source for type shapes and component responsibilities.

---

## Three Layers

Haunt is organized into three layers with clean boundaries.

```
┌─────────────────────────────────────────┐
│           RESIDENT LAYER                │   @hauntjs/resident
│  Character, memory, decision loop,      │
│  model abstraction, guest relationships │
└─────────────┬───────────────────────────┘
              │ Resident API (perceive → act)
              │
┌─────────────▼───────────────────────────┐
│           RUNTIME LAYER                 │   @hauntjs/core
│  Systems pipeline, sensors, events,     │
│  state, presence, tick scheduler        │
└─────────────┬───────────────────────────┘
              │ Place API (events up, actions down)
              │
┌─────────────▼───────────────────────────┐
│           PLACE LAYER                   │   @hauntjs/place-2d, etc.
│  Backend adapter — translates a         │
│  specific world into the Place API      │
└─────────────────────────────────────────┘
```

**Key invariant:** the Resident never talks to the Place directly. It always goes through the Runtime.

---

## Core Primitives

Defined in `@hauntjs/core/src/types.ts`.

### Place, Room, Affordance

```ts
interface Place {
  id: string;
  name: string;
  rooms: Map<RoomId, Room>;
  guests: Map<GuestId, Guest>;
  metadata: Record<string, unknown>;
}

interface Room {
  id: RoomId;
  name: string;
  description: string;
  affordances: Map<AffordanceId, Affordance>;
  sensors: Map<SensorId, Sensor>;
  connectedTo: RoomId[];
  state: Record<string, unknown>;
}

interface Affordance {
  id: AffordanceId;
  roomId: RoomId;
  kind: string;
  name: string;
  description: string;
  state: Record<string, unknown>;
  actions: AffordanceAction[];
  sensable: boolean;
}

interface AffordanceAction {
  id: string;
  name: string;
  description: string;
  params?: Record<string, JsonSchema>;
  availableWhen?: (state: Record<string, unknown>) => boolean;
  affects?: SensorAffect[];  // toggles sensors when this action runs
}
```

### Guest

```ts
interface Guest {
  id: GuestId;
  name: string;
  currentRoom: RoomId | null;
  firstSeen: Date;
  lastSeen: Date;
  visitCount: number;
  loyaltyTier: "principal" | "regular" | "visitor" | "stranger";
  relationship: RelationshipState;
}
```

### Resident

```ts
type PresenceMode = "host" | "inhabitant" | "presence";

interface ResidentState {
  id: string;
  character: CharacterDefinition;
  presenceMode: PresenceMode;
  currentRoom: RoomId;
  focusRoom: RoomId | null;
  mood: MoodState;
}
```

### Presence Modes

| Mode | Behavior |
|------|----------|
| **Host** | IS the place. Omnipresent — perceives every room, responds anywhere, avatar appears wherever the guest is. Poe from *Altered Carbon*. |
| **Inhabitant** | Physical body in one room. Walks between connected rooms. Perceives only through local sensors. |
| **Presence** | Ambient, environmental. No avatar. Shapes the place rather than conversing. (Defined, not yet implemented.) |

---

## Sensors & Perception

Events don't go directly to the resident. They pass through **sensors**, which produce **perceptions** — the prose the resident actually sees.

### Sensor

```ts
interface Sensor {
  id: SensorId;
  roomId: RoomId;
  modality: "sight" | "sound" | "presence" | "state" | "text" | string;
  name: string;
  description: string;
  fidelity: SensorFidelity;
  enabled: boolean;
  reach: SensorReach;
}
```

**Fidelity** shapes what the resident perceives:
- `full` — "Jakob entered the Lobby."
- `partial` (reveals specific fields) — "Someone entered the Lobby."
- `ambiguous` (confidence 0-1) — "There seems to be movement..."
- `delayed` — perception arrives later (defined, not yet implemented)

**Reach** determines spatial scope:
- `room` — only events in this room
- `adjacent` — events in connected rooms (with max depth)
- `affordance` — scoped to one object's state changes
- `place-wide` — detects events everywhere

### Perception

```ts
interface Perception {
  sourceSensorId: SensorId;
  roomId: RoomId;
  modality: string;
  content: string;       // prose description shaped by fidelity
  confidence: number;    // 0-1
  at: Date;
  rawEvent?: PresenceEvent;
}
```

### The strict-by-default rule

A room with no sensors is perceptually dark. Events fire but nothing is perceived. This forces place authors to think about *what the resident knows*, which is what makes each room feel distinct.

The escape hatch: `omniscientSensor()` — a place-wide full-fidelity sensor that restores omniscient behavior.

### Sensor Controls

Affordance actions can toggle sensors via `affects`:

```ts
{
  id: "turn-off",
  name: "Turn off the lamp",
  affects: [
    { sensorId: "study.sight", change: { enabled: false } },
  ],
}
```

Turn off the lights → the sight sensor disables → the resident can't see in that room.

---

## The Systems Pipeline

The runtime processes every event through a 7-stage pipeline:

```
Event
  ↓
┌──────────────────────────┐
│ 1. StatePropagation      │  applies event to place state
├──────────────────────────┤
│ 2. Sensor                │  routes event through sensors → perceptions
├──────────────────────────┤
│ 3. Memory                │  updates working memory
├──────────────────────────┤
│ 4. Autonomy              │  decides whether to invoke the resident
├──────────────────────────┤
│ 5. Resident              │  calls perceive(), gets actions back
├──────────────────────────┤
│ 6. ActionDispatch        │  applies resident actions to state
├──────────────────────────┤
│ 7. Broadcast             │  emits events to listeners/clients
└──────────────────────────┘
```

Each system reads the pipeline accumulator, does one thing, passes it forward. Systems don't call each other.

### Autonomy

The AutonomySystem gates model calls:
- Tick events → always pass through
- Resident's own events → skipped (prevents loops)
- External events → only invoke if sensors produced perceptions

### Tick Scheduler

Emits `tick` events at a configurable interval (default 90s in dev). Skips when no guests are present. Fires an immediate tick when a known guest returns.

---

## Events & Actions

### PresenceEvent

```ts
type PresenceEvent =
  | { type: "guest.entered"; guestId; roomId; at }
  | { type: "guest.left"; guestId; roomId; at }
  | { type: "guest.moved"; guestId; from; to; at }
  | { type: "guest.spoke"; guestId; roomId; text; at }
  | { type: "guest.approached"; guestId; roomId; affordanceId; at }
  | { type: "affordance.changed"; affordanceId; roomId; prevState; newState; at }
  | { type: "resident.moved"; from; to; at }
  | { type: "resident.spoke"; roomId; text; audience; at }
  | { type: "resident.acted"; affordanceId; actionId; at }
  | { type: "tick"; at }
```

### ResidentAction

```ts
type ResidentAction =
  | { type: "speak"; text; audience: GuestId[] | "all"; roomId? }
  | { type: "move"; toRoom }
  | { type: "focus"; roomId }     // Host mode: shift attention
  | { type: "act"; affordanceId; actionId; params? }
  | { type: "note"; content; about: GuestId | "self" }
  | { type: "wait" }
```

---

## The Resident Layer

### Character Definition

```ts
interface CharacterDefinition {
  name: string;
  archetype: string;
  systemPrompt: string;
  voice: { register; quirks; avoidances };
  loyalties: { principal; values };
  decay?: { enabled; severity; symptoms };
}
```

### Decision Loop

1. **Perceive** — receive perceptions + context from the pipeline
2. **Deliberate** — call the model with assembled prompt
3. **Act** — return zero or more ResidentActions

The model often returns `null` (no action). Silence is a valid response.

### Model Abstraction

```ts
interface ModelProvider {
  name: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
}
```

Four implementations: Anthropic, OpenAI, Ollama, Gemini (via OpenAI-compatible endpoint).

### Memory

Three layers:
1. **Working memory** — last ~50 events, in-memory
2. **Guest memory** — per-guest facts, persisted to SQLite
3. **Place memory** — curated entries the resident writes, persisted to SQLite

Conversation exchanges are auto-saved to guest memory for return-visit context.

---

## The Place Layer

### Adapter Interface

```ts
interface PlaceAdapter {
  name: string;
  mount(config: PlaceConfig): Promise<Place>;
  start(runtime: RuntimeInterface): Promise<void>;
  stop(): Promise<void>;
  applyAction(action: ResidentAction, place: Place): Promise<ActionResult>;
}
```

### The 2D Reference Adapter

- **Server**: WebSocket (`ws`), manages room state, relays guest events, applies resident actions
- **Client**: Phaser 3, procedural room rendering, WASD movement, chat, speech bubbles, interact menus
- **Protocol**: Zod-validated messages for join, move, speak, interact, approach

---

## Persistence

SQLite via `better-sqlite3`. Tables: `guests`, `guest_memory`, `place_memory`, `events_log`.

Room state (fireplace lit, lamp on) and sensor state reset on server restart — they're ephemeral by design.

---

## The Roost (Reference Demo)

Four rooms with distinct sensor profiles:

| Room | Sensors | Character |
|------|---------|-----------|
| **Lobby** | Full sight + sound + presence + state + place-wide intercom | Fully observed, the heart of the place |
| **Study** | Sight + sound (room-only) + desk state + lamp toggle | Private, can go dark |
| **Parlor** | Partial sight + sound + adjacent sound reach | Acoustically connected to lobby |
| **Garden** | Presence + partial sound + muted adjacent sound | Outdoor, uncertain perception |

Poe runs in **Host** mode — he IS The Roost, perceives everywhere, manifests where guests are.
