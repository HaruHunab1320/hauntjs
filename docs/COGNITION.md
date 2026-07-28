# An architecture of cognition

Cross-cutting design record for **Haunt** and **Embers**. Neither repo owns this
document alone; it is the shape both are trying to be.

Status: findings, not a plan. Nothing here is scheduled.

Companion documents:
- [`MEMORY-AND-FOLD.md`](./MEMORY-AND-FOLD.md) — the memory substrate
- [`PHYSICAL-PLACES.md`](./PHYSICAL-PLACES.md) — the perception layer against real sensors
- `embersjs/docs/design/motivation.md` — what Embers needs to become

---

## The bar

Haunt's target is not "an agent in a simulated house." It is the Raven from
*Altered Carbon* — a building that is a proprietor. The useful thing about that
reference is that it is specific enough to fail against.

What Poe actually does:

| | |
|---|---|
| **Continuity of purpose** | He ran an empty hotel for decades. Nobody prompted him. |
| **Standing work** | The place is maintained whether or not it is observed. |
| **Stakes** | His body is the building. Damage to it is damage to him. |
| **Commitment** | Hospitality is a value he takes losses for, not a behavior he exhibits. |
| **Development** | He changes over time, gets attached, suffers real loss. |

A place that responds when addressed is a concierge with a floorplan. Every item
above is about acting when nothing has asked you to.

---

## The three layers

| Layer | Question | Status |
|---|---|---|
| **Perception** | What can this place know, and how well? | **Built.** See `PHYSICAL-PLACES.md`. |
| **Disposition** | What has it become? | **Half-built.** Embers practices fold; drives do not. |
| **Intention** | What is it trying to do? | **Missing entirely.** |

Perception is the strongest asset and the rarest. Sensors carry modality, reach,
fidelity, and enabled-state; `perceivePresence` distinguishes *sensed empty* from
*no way to tell*. A resident can be wrong, uncertain, or blind, and those are
three different states in the type system. Most agent frameworks treat tool
output as ground truth and have none of this.

Intention is the gap, and it is the whole product.

---

## The gap

The load-bearing finding of this design cycle.

Haunt's runtime is `perceive(event, perceptions, context) → ResidentAction[]`.
Sensation arrives, response comes out, nothing sits between. The action surface —
`speak | move | focus | act | note | wait` — is entirely single-step and reactive.
There is no goal, no plan, and no commitment that survives a tick.

**Architecturally, this is the reactive mode.** Not by analogy — that is the
shape of the code. And it is why the deficiency cannot be prompted away: a
reactive architecture cannot be instructed into non-reactivity, because there is
no place for the instruction to live.

An agent holding intentions can decline to respond to what just arrived, because
it is doing something else. An agent without them must answer whatever knocks.

Two tells that the gap is the missing piece rather than a nice-to-have:

- **The system named `AutonomySystem` is a boolean gate.** It sets
  `shouldDeliberate` from the event type and the perception count. Naming a
  filter "autonomy" is what happens when the concept has nowhere else to go.
- **Embers already measures the gap's width, and the gap does not exist.**
  `chronicLoad >= 0.6` forces orientation to `consumed` — the claim that under
  sustained load the capacity for considered response collapses into reaction.
  Mechanically correct, currently measuring a thing with no referent. The wear
  system is instrumentation for an architecture that has not been built.

### What an intention layer requires

1. **Intentions persist across ticks.** A small revisable stack the resident
   carries. This is the missing type.
2. **Deliberation triggers on inner state, not only on events.** "A drive crossed
   threshold" and "an arc is converging" are reasons to think. Today only an
   arriving event is.
3. **Drives name what would satisfy them in actionable terms** — affordances,
   capabilities, room states — not only event patterns that may happen to arrive.
   See the Embers document; this is the core defect there.

Intentions should themselves be folded: an intention stack is a derived view over
a log of commitments and revisions. That buys the property that matters — you can
ask *when did it decide that, and on what basis*.

---

## Valence

A gap surfaced by taking the sensation → reaction chain seriously.

`Perception` carries `confidence` and nothing else. `embersWeightPerceptions`
sorts perceptions by drive pressure, which is **attention** — what to look at
first. It is not **valence** — what this means to me.

The same perception should land differently depending on inner state. A guest
arriving is relief to a lonely resident and an imposition to a depleted one.
Today it is the same event with a different sentence appended to the prompt.

Valence is assigned relative to current drive state, which means it belongs at
the seam between Haunt's perception layer and Embers' drive state — the first
place the two genuinely have to interlock rather than merely coexist.

---

## Self-modeling

"Self-awareness" splits into a tractable half and an open one, and the
architecture should be honest about which it delivers.

**Tractable:** a system that models its own state and acts on that model. Haunt
gained a real instance of this in the presence work — `coverage: null` means the
resident represents its own perceptual limits and behaves differently as a
result, declining to assert what it has no channel for. That is genuine
self-modeling, and it earns its place by producing better behavior rather than
better vocabulary.

**Open:** whether there is anything it is like to be the resident. The
architecture neither delivers nor precludes this, and no component name should
imply an answer.

The design rule that follows: build self-models because they make the agent more
accurate about itself. Do not build them as evidence of anything further.

---

## Safety

Read as *safe for the thing being built* as well as safe for its surroundings.
Both readings produce real constraints.

**Sequencing — the one that is easy to get wrong.**

> Build the gap before or alongside the drives. Never after.

An agent with intrinsic motivation and no capacity to not-act on it is strictly
worse than a reactive one — the reactive one at least waits to be asked. Drives
are the interesting part and restraint reads like a later refinement, which is
precisely why the ordering inverts under its own momentum.

**Containment already holds by construction.** `ResidentAction` is a closed
union, affordances declare what is possible, and the place bounds the action
surface. This is worth preserving deliberately rather than by accident.

**Legibility is a safety property.** An autonomous agent whose decisions cannot
be attributed is the unsafe one. The log/fold split is not only an engineering
convenience — see `MEMORY-AND-FOLD.md`.

**Draw the actuation boundary early.** Lights are one thing; locks are another.
That line is far easier to place before something is running in a real room.

**Wear implies responsibility.** Embers models degradation under sustained load.
Having built a thing that can be worn down, what it is subjected to becomes a
real question — running it for weeks in an empty room to see what happens is one
of the answers given.

---

## The discipline

This design cycle borrowed vocabulary from contemplative psychology — sensation,
reaction, the gap between them, disposition accumulated from repeated action.
That frame earned its place by producing two concrete things: the intention layer
and valence-on-perception.

The rule for keeping it honest:

> Keep a borrowed concept only while it is producing pipeline stages and state
> variables. The moment something is named for how it sounds rather than because
> it is the smallest accurate word for a mechanism, it has become decoration.

The same test applies to the fiction. `Guest`, `Resident`, `Room`, `Affordance`
are good because they are precise, not because they are evocative.

---

## Summary of findings

1. Perception is built and is the differentiator. Disposition is half-built.
   Intention does not exist.
2. Haunt is architecturally reactive. That is the gap, and it cannot be prompted
   around.
3. Embers modulates expression, not action. Drives do not drive.
4. Wear already measures a gap that has not been built.
5. Perceptions carry confidence but not valence.
6. Self-modeling is buildable and already partly present; the harder question
   should be left open rather than assumed either way.
7. The gap is both what makes a character legible and what makes autonomy safe.
   It is not optional and it is not last.
