# Writing Sensors

Sensors are how the resident perceives events in the place. A room with no sensors is perceptually dark — events happen there but the resident doesn't know about them.

## Quick Start

Use the factory functions in `@hauntjs/core`:

```ts
import { presenceSensor, sightSensor, soundSensor, stateSensor, roomId } from "@hauntjs/core";

const myRoom: Room = {
  id: roomId("kitchen"),
  name: "Kitchen",
  description: "...",
  affordances: new Map(),
  sensors: new Map([
    presenceSensor("kitchen.presence", roomId("kitchen")),
    sightSensor("kitchen.camera", roomId("kitchen")),
    soundSensor("kitchen.mic", roomId("kitchen")),
  ]),
  connectedTo: [roomId("hallway")],
  state: {},
};
```

## Available Factories

| Factory | Default Fidelity | Default Reach | Use For |
|---------|-----------------|---------------|---------|
| `presenceSensor` | partial (presence only) | room | Detecting entry/exit |
| `sightSensor` | full | room | Visual awareness |
| `soundSensor` | full | room | Hearing speech clearly |
| `mutedAudioSensor` | ambiguous (40%) | room | Muffled hearing (walls, wind) |
| `stateSensor` | full | affordance | Monitoring an object's state |
| `textSensor` | full | room | Typed chat rooms |
| `omniscientSensor` | full | place-wide | God mode (escape hatch) |

## Fidelity

Fidelity controls what the resident perceives from an event:

- **`full`** — Sees/hears everything: who, what, where. "Jakob entered the Lobby."
- **`partial`** — Reveals some fields. `reveals: ["presence"]` → "Someone entered the Lobby." `reveals: ["identity", "content"]` → full detail.
- **`ambiguous`** — Uncertain. `confidence: 0.4` → "You hear voices, but the words are muffled."
- **`delayed`** — Perception arrives after a delay. (Not yet implemented in the pipeline.)

```ts
sightSensor("parlor.dim", roomId("parlor"), {
  fidelity: { kind: "partial", reveals: ["presence", "identity"] },
});
```

## Reach

Reach determines the spatial scope of what a sensor detects:

- **`room`** — Only events in the sensor's own room
- **`adjacent`** — Events in connected rooms. `maxDepth: 1` = one hop.
- **`affordance`** — Scoped to a single object's state changes
- **`place-wide`** — Detects events everywhere

```ts
soundSensor("parlor.lobby-echo", roomId("parlor"), {
  reach: { kind: "adjacent", maxDepth: 1 },
  description: "Sound carries from the lobby.",
});
```

## Sensor-Affecting Affordances

Affordance actions can toggle sensors using the `affects` field:

```ts
const lightSwitch: Affordance = {
  id: affordanceId("study-lamp"),
  roomId: roomId("study"),
  kind: "lamp",
  name: "Reading Lamp",
  description: "A brass reading lamp.",
  state: { on: true },
  actions: [
    {
      id: "turn-off",
      name: "Turn off",
      description: "Click the lamp off.",
      availableWhen: (s) => s.on === true,
      affects: [
        { sensorId: sensorId("study.sight"), change: { enabled: false } },
      ],
    },
  ],
  sensable: true,
};
```

When someone turns off the lamp, the study's sight sensor disables. The resident can no longer see what's happening there — only hear (if a sound sensor is still active).

## Presence Modes and Sensors

Sensors and presence modes are **independent mechanisms** that compose:

- **Sensors** determine what the resident can *perceive* — what events produce perceptions
- **Presence modes** determine how the resident *relates to space* — avatar, attention, context

They combine in non-obvious ways. Understanding the interaction is critical for authoring:

### Host mode + place-wide sensors (The Poe archetype)

This is what The Roost uses. Poe IS the place: he appears everywhere (Host mode), AND he can hear/see everything (place-wide sensors). You need both:

- **Host mode alone** (without place-wide sensors): Poe appears in every room but can only perceive rooms that have sensors. He'd show up in the garden but be deaf there.
- **Place-wide sensors alone** (without Host mode): Poe perceives everything but has to walk between rooms. He'd know someone is in the garden but his avatar would be stuck in the lobby.

```ts
// Both needed for the Poe archetype:
presenceMode: "host",  // appears everywhere
// + in world-config:
soundSensor("roost.intercom", roomId("lobby"), { reach: { kind: "place-wide" } }),
presenceSensor("roost.awareness", roomId("lobby"), { reach: { kind: "place-wide" } }),
```

### Host mode + room-scoped sensors (The Cottagecore Librarian)

The resident is present in every room but only perceives clearly where sensors are configured. She's there when you need her, but she doesn't know everything — she notices when you speak in the reading room (good sensors) but only vaguely senses you in the back garden (sparse sensors).

### Inhabitant mode + room-scoped sensors (The Caretaker)

The classic v0.1 model. Physical body in one room, walks between them, perceives through local sensors only. Feels like a person who lives there.

### Presence mode + place-wide sensors (The Board)

An ambient environmental entity. Perceives everything but has no avatar. Acts by subtly changing the place — lighting a fire, closing a door, leaving a trace.

## Debug Overlay

Start the server with `HAUNT_DEBUG=1` and press F2 in the client to see the sensor debug panel. It shows all sensors, their enabled state, and recent perceptions.

## Design Patterns

### The Panopticon (anti-pattern)
Every room has full-fidelity sight+sound+presence. This collapses back to omniscience — the sensor system costs performance without adding value. Use this only if your place genuinely should feel surveilled.

### The Dark Hall
One well-lit room, several dark ones. Drama comes from guests venturing into unsensored spaces where the resident can't follow.

### The Unreliable Narrator
Use `ambiguous` fidelity liberally. The resident reasons under uncertainty: "I thought I heard someone in the garden, but it might have been the wind."

### The Cascading Trust
Start rooms with minimal sensors. As guests complete trust-building interactions, enable additional sensors — the place reveals more of itself to those who earn it.
