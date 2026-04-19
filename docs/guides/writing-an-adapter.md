# Writing a Place Adapter

A place adapter translates a specific backend — a game engine, a chat platform, a smart home — into Haunt's event vocabulary. The adapter is the bridge between the world and the runtime.

## The PlaceAdapter Interface

```ts
interface PlaceAdapter {
  name: string;
  mount(config: PlaceConfig): Promise<Place>;
  start(runtime: RuntimeInterface): Promise<void>;
  stop(): Promise<void>;
  applyAction(action: ResidentAction, place: Place): Promise<ActionResult>;
}
```

### mount()

Build a `Place` object from your world's configuration. Create rooms, add affordances, set up connections. Returns the Place.

### start(runtime)

Start listening for events from your backend. When things happen in the world, translate them into `PresenceEvent`s and call `runtime.emit(event)`.

### stop()

Clean up connections, close servers, release resources.

### applyAction(action, place)

When the resident decides to do something (speak, move, act), this method applies it to your world. Broadcast speech to connected clients, move the resident avatar, update visual state.

## The Event Vocabulary

Your adapter emits these events to the runtime:

| Event | When |
|-------|------|
| `guest.entered` | A person arrives in a room |
| `guest.left` | A person disconnects/leaves |
| `guest.moved` | A person moves between rooms |
| `guest.spoke` | A person says something |
| `guest.approached` | A person walks near an affordance |
| `affordance.changed` | An object's state changed |

And handles these actions from the resident:

| Action | What to do |
|--------|------------|
| `speak` | Broadcast the text to guests in the room |
| `move` | Update the resident's position, notify affected rooms |
| `act` | Apply state change to the affordance, broadcast the update |
| `note` | No-op for the adapter (handled by the resident internally) |
| `wait` | No-op |

## Example: A Minimal Adapter

```ts
import type { PlaceAdapter, Place, RuntimeInterface, ResidentAction, ActionResult } from "@hauntjs/core";
import { createPlace, addRoom, roomId } from "@hauntjs/core";

export class MyAdapter implements PlaceAdapter {
  name = "my-adapter";
  private runtime: RuntimeInterface | null = null;

  async mount(): Promise<Place> {
    const place = createPlace({ id: "my-place", name: "My Place" });
    addRoom(place, {
      id: roomId("main"),
      name: "Main Room",
      description: "The only room.",
    });
    return place;
  }

  async start(runtime: RuntimeInterface): Promise<void> {
    this.runtime = runtime;
    // Start listening to your backend here
    // When a user sends a message:
    //   runtime.emit({ type: "guest.spoke", guestId, roomId, text, at: new Date() });
  }

  async stop(): Promise<void> {
    this.runtime = null;
  }

  async applyAction(action: ResidentAction, place: Place): Promise<ActionResult> {
    if (action.type === "speak") {
      // Send the text to your backend (Discord, Slack, game chat, etc.)
      console.log(`Resident says: ${action.text}`);
      return { success: true };
    }
    return { success: true };
  }
}
```

## Adapter Ideas

- **Discord**: rooms = channels, guests = server members, affordances = pinned messages or bots, speech = channel messages
- **Minecraft**: rooms = named regions, guests = players, affordances = interactable blocks, proximity from player coordinates
- **Smart Home**: rooms = physical rooms, guests = people (via presence sensors), affordances = lights/thermostat/speakers
- **CLI/Terminal**: rooms = named contexts, one guest, affordances = commands, speech = stdout

## Key Principles

1. **The adapter translates, it doesn't think.** All intelligence lives in the resident. The adapter just converts between your world's representation and Haunt's event vocabulary.

2. **Emit events generously.** The resident decides what to care about. If something happened in your world that a human would notice, emit an event.

3. **State authority.** The `Place` object in the runtime is the source of truth. Your adapter should keep its own state in sync with the Place, not the other way around.

4. **The resident is portable.** If your adapter follows the interface, any character file written for The Roost should work in your world without changes.

## Testing

Use the `MockModelProvider` and the `Runtime` class to test your adapter without hitting a real LLM:

```ts
import { Runtime } from "@hauntjs/core";
import { MockModelProvider } from "@hauntjs/resident";

const adapter = new MyAdapter();
const place = await adapter.mount();
const runtime = new Runtime({ place, resident: myResidentState });
await runtime.start();
await adapter.start(runtime);

// Simulate events and check that the adapter handles them correctly
```
