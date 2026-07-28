# Physical places

Haunt's thesis is that a place with a mind is a buildable primitive. The 2D
tilemap is a test fixture for that claim, not the claim itself. The real target
is a place with cameras and microphones in it.

This document records what survives contact with that target, what doesn't, and
what changed as a result.

`scripts/physical-sensing.mjs` is the working demonstration.

---

## What already works

A physically-sensed place needs **no changes to `@hauntjs/core`**. The seam is
`RuntimeOptions.systems`: swap `SensorSystem` for one that reads a hardware
buffer instead of calling `filterEvent()`, and drive the loop with ticks —
`AutonomySystem` passes ticks through unconditionally, so the resident
deliberates on sensor data alone.

Three parts of the design turned out to be right for physical space, and it is
worth being explicit about why, because they were designed for a simulation:

- **`Sensor` is already a hardware description.** A camera *is*
  `{modality: "sight", reach: {kind: "room"}}`. A microphone *is* sound. Nothing
  about the type assumed a virtual world.
- **`SensorAffect` maps onto physical causation exactly.** An affordance action
  that disables a sensor is what a light switch actually does to a camera. This
  is the one place where the virtual and physical models coincide perfectly
  rather than merely resembling each other.
- **The dead-zone rule is correct for buildings.** A room with no enabled
  sensors is imperceptible even to a place-wide sensor. In a simulation that is
  a design choice; in a building it is a fact.

## What was wrong: perception ran backwards

`filterEvent` derives a `Perception` by **degrading a known-true
`PresenceEvent`**. `describeGuestEntered` looks up the guest's real name and then
decides whether to hide it based on fidelity. Perception is subtraction from
ground truth.

Physical space runs the other direction. The camera hands you *"someone may have
entered, 0.6"* and the event is a **hypothesis** — frequently one that is never
resolved. There is no `guestId` to withhold, because nothing established who it
was. Perception is primary; the event is an inference drawn from it, if one is
drawn at all.

That inversion is why the hardware path bypasses `filterEvent` entirely rather
than extending it.

### Three consequences still outstanding

1. **`PresenceEvent` is a closed union** (`types.ts`). An adapter cannot add
   `motion.detected` or `sound.transient` without editing core.
2. **`EVENT_MODALITY_MAP` is a hardcoded const** (`sensor-pipeline.ts`) while
   `SensorModality` is deliberately open via `(string & {})`. Modality is
   extensible and its routing table is not; a new modality silently produces
   zero perceptions.
3. **Confidence is derived from static sensor config** (`getConfidence`) —
   `full` is always exactly `1.0`. A real sensor's confidence is
   per-observation: certain about a face at 2m, guessing at 20m. The
   `Perception.confidence` field is right; the way the pipeline populates it is
   not.

None of these block a physical adapter. All three make one clumsier than it
should be.

---

## What was fixed: the context leak

This is the one that mattered, and it was not in the sensor layer at all.

The sensor pipeline made **events** strict-by-default: an event no sensor picked
up never reaches the resident. **Standing state had no such gate.** The system
prompt read the guest roster straight off the `Place`:

```ts
// before — three separate reads of authoritative world state
Array.from(context.place.guests.values()).filter((g) => g.currentRoom === room.id)  // host
Array.from(context.place.guests.values()).filter((g) => g.currentRoom !== null)     // presence
context.guestsInRoom.map((g) => describeGuest(g))                                   // inhabitant
```

The prompt could therefore say *"You have no sensors in the Cellar — you cannot
perceive events here directly"* and, a few lines later, list the Cellar's
occupants by name. In a virtual place this is invisible, because the sensor prose
and the roster always agree. In a physical place they diverge on contact, and the
model resolves the contradiction by trusting the roster — asserting presence it
has no sensory claim to.

### Presence is now sensed

`perceivePresence(place, roomId)` in `@hauntjs/core` answers "who can the
resident currently tell is here, and how well" using the same reach and fidelity
rules as the event pipeline. Reach logic now lives in one place
(`sensor-reach.ts`) so the two paths cannot drift apart.

Fidelity shapes identity exactly as it does for events: `full` reveals a name,
`partial` reveals one only when `"identity"` is among its fields, anything else
yields "someone".

### Three epistemic states, not two

The subtler half of the bug: an empty roster rendered as **"No one else is
here."** That is a claim of *confirmed absence* derived from *nothing detected*.
`PresenceView.coverage` separates them:

| `coverage` | guests | The resident is told |
|---|---|---|
| `null` | — | "You have no way to sense whether anyone is here." |
| `full` | none | "No one else is here." |
| partial / ambiguous / delayed | none | "You sense no one here — though your awareness of this room is incomplete." |
| any | some | described at the fidelity that found them |

Collapsing the first and second rows is what let a resident assert an empty room
it could not see into.

### A note on authoring

A `full`-fidelity sight sensor is a strong claim: it means the resident can
enumerate the room. Most real sensors are not that. A wide-angle camera is
`{kind: "partial", reveals: ["presence"]}` — it establishes that a body is in the
room without establishing whose. Modelling one as `full` reintroduces the
overconfidence this change removed, and no amount of prompt engineering will
recover it, because by then the certainty is in the data.

---

## Behavior change

Residents no longer see guests in rooms they have no sensor for. For places whose
rooms all carry sensors, nothing changes. For places with unsensored rooms, the
resident gets quieter and more uncertain — which is the correct behavior, and was
the intent of the sensor layer from the start.

`RuntimeContext.guestsInRoom` is unchanged and still authoritative. It remains
correct for adapters, action validation, and anything else that legitimately
needs world state. It is no longer read by the prompt.

---

## Open direction: perception as nomination

A physical sensor produces a *candidate*, not a fact. Motion at 0.45 confidence
is a nomination that something happened; whether a person entered is a separate
judgment.

This is structurally identical to the practice-attempt mechanic in
`@embersjs/core`, where `integrate()` nominates an act and a strict evaluator
adjudicates it — generous nomination, strict adjudication, rejection as the
detector. `Perception.confidence` and `PracticeAttemptResult.quality` are the
same quantity one layer apart.

That suggests two things worth trying, both of which the existing pieces already
support:

- **Per-sensor trust priors.** Resolve readings against outcomes over time, and a
  sensor accrues a track record. `@_89/confidence-kernel` scores exactly this
  shape — and its `suppress` posture is the correct one here, since a
  newly-installed sensor with no history should be *neutral*, not blind. Its
  `detectDrift` is, in physical terms, a sensor going bad: an occluded lens, a
  microphone that has found the HVAC.
- **Fusion by weakest link.** `combine(results, "min")` — "as trustworthy as the
  weakest check" — is the conservative rule for reconciling two sensors that
  disagree.

Neither is built. Both are cheap, and neither requires core to take a dependency:
effective confidence is `observationConfidence × sensorTrustPrior`, computed by
the adapter.
