# Phase 2.0 — Audit Results

Audit of the Phase 1 (v0.1.0) codebase for Phase 2 readiness. Read before starting Phase 2.1.

---

## 1. Every call site of `Resident.perceive()`

**Interface definition:**
- `packages/core/src/types.ts:238` — `perceive(event: PresenceEvent, context: RuntimeContext): Promise<ResidentAction | ResidentAction[] | null>`

**Implementation:**
- `packages/resident/src/resident.ts:43-66` — Full perceive with deliberation gating, backpressure (`busy` flag), memory writes

**Runtime invocation (the primary call site):**
- `packages/core/src/runtime.ts:83` — Called inside `emit()`, filtered to skip `resident.spoke`, `resident.moved`, `resident.acted`

**Tests:**
- `packages/resident/src/resident.test.ts` — 5 test cases (lines 106, 128, 155, 180, 198)

**Total: 7 call sites** (1 interface, 1 impl, 1 runtime, 4 tests, 1 in prompt test fixtures)

**Phase 2 impact:** The signature changes from `perceive(event, context)` to `perceive(perceptions, context)`. All 7 sites need updating. The runtime invocation is the critical one — it moves into the ResidentSystem.

---

## 2. Every function on Runtime that will become a system

**File:** `packages/core/src/runtime.ts`

### Will become StatePropagationSystem
- `applyEventToState()` (line 124) — dispatcher
- `handleGuestEntered()` (line 141) — also has onGuestReturn logic
- `handleGuestLeft()` (line 164)
- `handleGuestMoved()` (line 170)
- `handleAffordanceChanged()` (line 178)

### Will become MemorySystem
- Working memory push in `emit()` (lines 69-74) — `recentEvents.push(event)`
- Currently also handled in `resident.ts:48` via `memory.addToWorkingMemory()`

### Will become AutonomySystem
- The event-type filter in `emit()` (line 81) — decides whether to call perceive
- Currently: skips `resident.spoke/moved/acted`, allows everything else
- The `DELIBERATION_EVENTS` set in `resident.ts:28` does additional filtering

### Will become ResidentSystem
- The perceive call + action handling in `emit()` (lines 82-90)

### Will become ActionDispatchSystem
- `applyAction()` (line 93) — dispatcher
- `handleSpeak()` (line 191)
- `handleMove()` (line 217)
- `handleAct()` (line 243)

### Will become BroadcastSystem
- Event bus emission in `emit()` (line 78) — `await this.eventBus.emit(event)`
- Event bus emission in `applyAction()` (line 118) — emits resident action events
- Currently augmented by dev-server's `eventBus.on("*")` handler (main.ts:87-116)

### Stays on Runtime
- `start()` / `stop()` — lifecycle
- `buildContext()` — context assembly (may move into ResidentSystem)
- `place`, `resident`, `eventBus` — public state

---

## 3. Every input the prompt assembly reads from

**File:** `packages/resident/src/prompt.ts`

### From CharacterDefinition
- `name`, `systemPrompt`, `archetype`
- `voice.register`, `voice.quirks`, `voice.avoidances`
- `loyalties.principal`, `loyalties.values`

### From RuntimeContext
- `context.place` — full Place object
- `context.resident.currentRoom` — which room the resident is in
- `context.resident.mood` — energy, focus, valence
- `context.guestsInRoom` — guests in current room
- `context.recentEvents` — last 20 events (sliced)

### From Place state (transitive through context.place)
- Room: `name`, `description`, `connectedTo`, `affordances`
- Affordance: `id`, `name`, `kind`, `description`, `state`, `actions[]`, `sensable`
- AffordanceAction: `id`, `name`, `description`, `availableWhen()` result
- Guest: `id`, `name`, `loyaltyTier`, `visitCount`, `lastSeen`

### From MemoryStore (passed in)
- `placeMemories[]` — top 5 by importance: `content`, `tags`
- `guestMemories` — per-guest facts: `recent_conversation`, `last_topic`, arbitrary keys

### From PresenceEvent (current event)
- All fields per event type: `type`, `guestId`, `roomId`, `text`, `from`, `to`, `affordanceId`

**Phase 2 impact:** The prompt will shift from "recent events" to "current perceptions + sensory situation." The `describeEvent()` function (lines 351-411) gets replaced by perception content. The system prompt gains a "perceptual reach" section. The `buildMessages()` function (line 225) switches from threading events to threading perceptions.

---

## 4. Every event type and where it's handled

| Event | State mutation | Deliberation | Prompt | Emitted by |
|---|---|---|---|---|
| `guest.entered` | runtime:141 (enterRoom, onGuestReturn) | yes | describeEvent:353 | websocket:handleJoin |
| `guest.left` | runtime:164 (leavePlace) | yes | describeEvent:361 | websocket:handleDisconnect |
| `guest.moved` | runtime:170 (moveGuest) | yes | describeEvent:365 | websocket:handleMove |
| `guest.spoke` | none | yes | buildMessages:263 (user msg) | websocket:handleSpeak |
| `guest.approached` | none | yes | describeEvent:371 | websocket:handleApproach |
| `affordance.changed` | runtime:178 (update state) | yes | describeEvent:379 | websocket:handleInteract |
| `resident.spoke` | none | **skipped** | buildMessages:268 (assistant msg) | runtime:handleSpeak |
| `resident.moved` | none | **skipped** | returns null | runtime:handleMove |
| `resident.acted` | none | **skipped** | returns null | runtime:handleAct |
| `tick` | none | yes | describeEvent:386 (rich context) | TickScheduler |

**Phase 2 impact:** In Phase 2.3, events pass through the SensorPipeline before reaching deliberation. The SensorSystem slot sits between StatePropagation and Memory in the pipeline. Events that produce no perceptions (unsensored rooms) won't reach the resident at all.

---

## 5. TODOs and known issues

**No explicit TODO/FIXME/HACK comments in source code.**

### Implicit issues found:

1. **Hardcoded "Poe" in conversation memory** — `resident.ts:146`
   ```ts
   const newExchange = `${name}: ${guestText.slice(0, 100)}\nPoe: ${residentText.slice(0, 100)}`;
   ```
   Should use `this.character.name`. **Fix before Phase 2.**

2. **Fragile event filtering** — `runtime.ts:81`
   ```ts
   event.type !== "resident.spoke" && event.type !== "resident.moved" && event.type !== "resident.acted"
   ```
   Should use a Set. **Becomes AutonomySystem in Phase 2.1.**

3. **Direct affordance state mutation in WebSocket server** — `websocket.ts:289`
   ```ts
   Object.assign(aff.state, stateUpdate);
   ```
   Guest interactions bypass the Runtime's state management. **Should route through Runtime in Phase 2.1.**

4. **Backpressure is fire-and-forget** — `resident.ts:55`
   Events dropped during `busy` are silently lost. Working memory still captures them (line 48), but no deliberation occurs. **Acceptable for v0.1, but the AutonomySystem should track this in Phase 2.**

5. **`onGuestReturn` uses closure over uninitialized `tickScheduler`** — `main.ts:56-61`
   Works because the callback fires later, but it's fragile. **Systems pipeline will clean this up.**

---

## 6. Room type confirmation

**`packages/core/src/types.ts:45-52`:**
```ts
interface Room {
  id: RoomId;
  name: string;
  description: string;
  affordances: Map<AffordanceId, Affordance>;
  connectedTo: RoomId[];
  state: Record<string, unknown>;
}
```

**No `sensors` field.** Phase 2.2 adds `sensors: Map<SensorId, Sensor>`.

---

## 7. Dev-server wiring summary

**Initialization order** (13 steps in `main.ts`):

1. Create Place2DAdapter with ROOST_CONFIG
2. `adapter.mount()` → Place with rooms + affordances
3. Create ResidentState (static, inline)
4. `createModelProvider()` → Gemini/Anthropic/OpenAI/Ollama
5. Create SqliteMemoryStore
6. Create Resident (character + model + memory)
7. Create Runtime (place + resident + mind + onGuestReturn hook)
8. Pre-populate known guests from SQLite
9. Wire eventBus: log + broadcast resident actions + persist guests on leave
10. Create + start TickScheduler
11. `adapter.start(runtime)` → WebSocket server
12. Start Fastify HTTP server
13. Register shutdown hooks

**Phase 2 impact:** Steps 7 and 9 change most. The Runtime constructor takes a systems pipeline instead of individual wiring. The eventBus wildcard handler for broadcasts moves into the BroadcastSystem. The onGuestReturn hook may become part of the AutonomySystem.

---

## Assessment: Ready for Phase 2?

**Yes.** The codebase is clean, well-structured, and the boundaries are clear. Specific notes:

- **One pre-requisite fix:** Change hardcoded "Poe" in `resident.ts:146` to `this.character.name`
- **No blocking TODOs**
- **Test coverage is solid** (135 tests) — behavior-equivalence tests in Phase 2.1 can compare against these
- **The runtime is monolithic but not tangled** — each handler does one thing, making extraction into systems straightforward
- **The prompt assembly is the most complex file** (411 lines) but well-organized into named functions that map cleanly to future system boundaries
