# Writing a Room

Rooms are regions within a place. Each room has a description, connections to other rooms, and affordances (interactive objects).

## Defining a Room

```ts
import { roomId } from "@hauntjs/core";
import type { Room } from "@hauntjs/core";

const kitchen: Room = {
  id: roomId("kitchen"),
  name: "Kitchen",
  description: "A narrow kitchen with copper pots hanging from a rack above the stove. The counters are clean but well-used. Something is always simmering.",
  affordances: new Map(),       // populated separately
  connectedTo: [roomId("lobby"), roomId("pantry")],
  state: {},                    // room-specific state
};
```

### The Description Matters

The room description is injected into the resident's system prompt. It's what the resident "sees." Write it to evoke a sense of place:

- Bad: `"A kitchen with appliances."`
- Good: `"A narrow kitchen with copper pots hanging from a rack above the stove. The counters are clean but well-used."`

The description shapes how the resident talks about the room and what they notice.

### Connections

`connectedTo` defines the adjacency graph — which rooms a guest or resident can walk to from here. Connections are bidirectional (if the kitchen connects to the lobby, the lobby should also connect to the kitchen).

Use `connectRooms(place, roomA, roomB)` to ensure both directions are set.

## Defining Affordances

Affordances are interactive objects within a room.

```ts
import { affordanceId, roomId } from "@hauntjs/core";
import type { Affordance } from "@hauntjs/core";

const stove: Affordance = {
  id: affordanceId("stove"),
  roomId: roomId("kitchen"),
  kind: "stove",
  name: "Stove",
  description: "A cast-iron stove, blackened with age. The burners still work.",
  state: { on: false, cooking: null },
  actions: [
    {
      id: "turn-on",
      name: "Turn on the stove",
      description: "Light the burner.",
      availableWhen: (state) => state.on === false,
    },
    {
      id: "turn-off",
      name: "Turn off the stove",
      description: "Cut the gas.",
      availableWhen: (state) => state.on === true,
    },
  ],
  sensable: true,   // the resident can perceive this object
};
```

### Key Properties

- **kind**: a category string — "fireplace", "desk", "stove". Used for grouping, not behavior.
- **state**: arbitrary key-value state. The adapter is responsible for mutating it when actions are taken.
- **actions**: things that can be done to the affordance. Each action has:
  - `id`: unique within the affordance
  - `name` / `description`: shown to the resident and guests
  - `availableWhen`: optional predicate — returns `true` if the action is currently valid given the affordance state
- **sensable**: if `true`, the resident perceives this object in their system prompt. Set to `false` for hidden or infrastructure objects.

### State Changes

When an action is performed (by the resident via `act` or by a guest via `interact`), the adapter handles the state mutation. In `@hauntjs/place-2d`, this is done in `getActionStateUpdate()` and `getInteractionStateUpdate()` — you map action IDs to state changes.

## Adding Rooms to a Place

In the world config:

```ts
import { ROOST_ROOMS, ROOST_AFFORDANCES } from "@hauntjs/place-2d";

// Add your room to the rooms array
const rooms = [...ROOST_ROOMS, kitchen];

// Add your affordances
const affordances = [...ROOST_AFFORDANCES, stove];
```

Or programmatically:

```ts
import { createPlace, addRoom, addAffordance, connectRooms } from "@hauntjs/core";

const place = createPlace({ id: "my-place", name: "My Place" });
addRoom(place, { id: roomId("kitchen"), name: "Kitchen", description: "..." });
addRoom(place, { id: roomId("pantry"), name: "Pantry", description: "..." });
connectRooms(place, roomId("kitchen"), roomId("pantry"));
addAffordance(place, roomId("kitchen"), stove);
```

## Tips

- Four to six rooms is a good size for a v0.1 place. Enough to demonstrate movement, small enough to author carefully.
- Every affordance should have at least one action. Objects the resident can see but not interact with feel broken.
- Write descriptions that give the resident something to comment on. "A desk" gives them nothing. "A desk covered in half-finished letters" gives them a conversation starter.
- Test room connectivity — make sure you can reach every room from the entry point.
