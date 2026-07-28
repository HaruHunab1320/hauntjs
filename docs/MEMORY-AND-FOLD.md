# Memory, and the Fold

Design record for how a place remembers. Cross-cutting between Haunt and Embers.

Status: findings, not a plan.

Related: [`COGNITION.md`](./COGNITION.md), [`PHYSICAL-PLACES.md`](./PHYSICAL-PLACES.md)

---

## The assumption that was wrong

More memory is not more value.

The intuition to discard: that a resident with a larger searchable history is a
better resident. Retrieval that surfaces marginally-relevant items *degrades*
behavior, because retrieved noise competes with signal in the same context. The
thing actually wanted is clarity, and clarity is a property of a read, not of a
store.

## Weights and context

The distinction that resolves it, borrowed from how a language model itself
works, because the two systems are genuinely different:

| | **Weights** | **Context** |
|---|---|---|
| Speed | Slow | Fast |
| Fidelity | Lossy, generalized | Precise, verbatim |
| Cost | Paid once | Paid every call |
| Holds | Disposition | The immediate situation |

**Character lives in the weights.** Poe does not recall every guest who passed
through the Raven; he became a particular kind of host because of them. The
episodes were consumed to produce disposition and then discarded.

The consequence that is easy to get backwards:

> **In: as much as you can get. Out: as little as possible.**

Volume is necessary for consolidation — disposition formed from three events is
overfitting to noise. Volume is harmful for retrieval. Treating "clean and
voluminous" as one principle yields a large clean database that still poisons
the context. The two layers want opposite things.

---

## The Fold

State is never stored. It is folded from an event log on demand.

This resolves the question that write-time classification cannot: *how do you
know what will matter later?* You do not, so you do not decide. **Do not
classify — append.** The log is cheap, immutable, and judgment-free at write
time. Clarity is produced at read time, where it can be redone.

### Keep the log lossless. Make the fold lossy.

Forgetting is a feature of minds and must be modeled, but it belongs in the fold
function, never in deletion. Recency-weighted decay means a disposition that
stops being reinforced is *outweighed*, not erased. Deletion is for retention and
privacy — a different concern, different rules, different authority.

This also gets the mechanism of change right. You do not become different by
deciding to; you become different because the recent window fills with
differently-shaped events until it dominates.

### Embers is already half-folded

And the unfolded half is the half that does not work.

| | Storage | Behavior |
|---|---|---|
| **Practices** | `computeDepth(substrate, elapsedMs)` — nothing stores depth | Works |
| **Drives** | mutable `level`, mutated in place | Does not drive |

A stored level cannot answer *why am I like this*. There is no path from the
number back to the events that produced it. A folded level can, which is what
makes a character legible rather than arbitrary.

Haunt has the same pattern hand-rolled: `affordance.changed` carries `prevState`
and `newState`. That is a change record written by hand.

### Recapitulation: refolding under a changed frame

Because interpretation is recomputed rather than stored, the past can be reread
without being rewritten. `foldTo(t)` using the resident's *current* interpretive
frame — not the one it held at t — yields a different history from an identical
log.

> *"I thought he was avoiding me. I think now he was afraid."*

Nothing was falsified. The observations are byte-identical; the folder changed.
This is how a character develops without either amnesia or a rewritten past.

Note this is *more* plastic than biology, not less. In wetware, plasticity and
the record are coupled, which is why a memory degrades the more it is handled.
Decoupling them buys unlimited reinterpretation with the evidence intact.

---

## Compaction by episode, not by window

Compaction bounded by a **semantic** span beats a time window, because the
bracket is what gives the summary meaning.

Places supply the brackets for free:

| Span | Compacts to |
|---|---|
| guest enters → guest leaves | a **visit** |
| fire lit → fire out | a tending |
| first utterance → silence | a **conversation** |
| dawn → dusk | a day |

The unit a resident carries forward is *"Takeshi was in the study for forty
minutes; he read, tended the fire, and asked about the cellar"* — with the
underlying observations still there if anything needs to drill in.

---

## Sensor events are fold events

A place is an event-sourced world model, and sensors are producers into it. Three
kinds of record, and the third distinction is load-bearing.

### 1. Lifecycle — facts about the instrument

Came online, lost power, was disabled, fidelity degraded, firmware changed.
About the *sensor*, not about the world.

### 2. Observation — what the instrument emitted

Immutable. Carries provenance and confidence: *"at t, sensor S emitted assertion
A at confidence C, basis = frame hash / model / version."*

### 3. Belief — what is taken to be true

Derived. Never stored. *"Someone is in the study."*

**Observations must not be promoted to beliefs at write time.** A camera does not
observe "three people in a room." It observes a frame; a vision model *asserts*
three people at some confidence. If that turns out to be two people and a coat
rack, a stored conclusion can only be corrected by rewriting the log or by
emitting a contradicting observation — and the second is a lie, because the
camera saw nothing new.

Keeping assertions *as assertions* is what makes retroactive reinterpretation
free. New evidence arrives, the fold reruns, the belief changes, the log is
untouched. The door slamming at 21:00 is what tells you the shape at 16:00 was a
person.

This is the property a sensed place needs that a narrative or a code trajectory
does not: **in a sensed place the log is not authoritative.** Events are
observations, and observations can be wrong.

### The preprocessor rule

Edge aggregation is mandatory, not an optimization. But a preprocessor that drops
data is making an irreversible write-time judgment — exactly what the Fold exists
to avoid.

> A preprocessor may compress **what it saw**.
> It may never decide **what it meant**.

| Allowed | Not allowed |
|---|---|
| 300 pings → "motion continuous t0–t1, 300 samples, peak X" | "motion from A to B" |
| downsampling, debouncing, run-length encoding | "a person crossed the room" |

The first is a compact encoding — *was there motion at t?* remains answerable.
The second is inference: it implies one agent, a path, a direction. It could be
two people. Inference belongs in the fold, where the camera can contradict it.

### Silence is ambiguous

An absence of observations means any of: nobody was there, the sensor was off,
the sensor was alive but broken, the network dropped, or the preprocessor
swallowed them.

> A gap in the observation stream cannot be interpreted without folding the
> lifecycle stream alongside it.

This is the `coverage: null` distinction from `PHYSICAL-PLACES.md` at the log
level. Lifecycle records are not bookkeeping; they are what makes silence mean
anything.

Practically this argues for **heartbeats** on always-on sensors — periodic
"alive, nothing to report." It feels wasteful and is the most compressible record
in the system (an hour of heartbeats is one row). Lifecycle-plus-timeout also
works and degrades less gracefully.

### Volume

Where a sensed place differs from narrative or eval trajectories in kind, not
degree:

| | Events/day |
|---|---|
| One motion sensor at 1 Hz, raw | ~86,000 |
| Ten sensors, raw | ~1,000,000 |
| Ten sensors, aggregated to spans | ~500 |

The design works, but only if edge aggregation is present from the first sensor
rather than added once it hurts. This sets fold performance characteristics
early.

---

## Where memory should sit

Current state in Haunt:

- `WORKING_MEMORY_LIMIT = 50` events — the context layer, fine.
- Unbounded SQLite place memory, pulled into the prompt via
  `recall({ limit: 5 })` by recency — the "more is better" assumption, in code.
- `PlaceMemoryEntry.importance` exists and `persistNote` hardcodes it to `0.5` —
  a slot for judgment that nothing fills.

The move the findings point to: **place memory should feed the disposition layer
rather than the prompt.** The prompt sees consolidated disposition plus the last
few events; the store feeds consolidation. That is a real change in what a
resident is — it stops being a thing with a searchable history and becomes a
thing that has been shaped.

And the write path wants the same judgment shape used elsewhere: most events
should form no memory at all, and an event earns one by *changing* something.
Memory records what it changed, not what happened. "Takeshi likes whiskey" is a
guest-record fact; "I am the kind of host who notices what people drink" is
character.

That is the third place this nomination-then-adjudication pattern has appeared —
practice attempts, sensor beliefs, and now memory formation — which is decent
evidence it is a primitive rather than a coincidence.

---

## Relationship to the Fold platform

This is the same primitive as `@org/fold` in the Fold platform outline
(event-sourced truth, derived views, arcs and convergence, temporal scrubber,
compaction), independently re-derived here.

Two notes on that relationship:

- **A sensed place stresses the Fold where the other systems do not**, per the
  observation/belief split above. Narrative, eval trajectories and the other
  spec-conformant producers all have authoritative logs. A place does not.
- **Convergence supplies a deliberation trigger.** `C(t) = mean(tension×stakes)²`
  with `resolvedPeaks` is a better version of "think when a drive crosses
  threshold" — salience over an arc rather than a scalar tripwire.

Sequencing note: nothing here argues for pulling Fold extraction forward. A place
is a *second consumer* that makes the genericity claim stronger when extraction
happens, not a reason to do it sooner.

---

## Summary of findings

1. More memory is not more value. In: everything. Out: as little as possible.
2. Do not classify at write time. Append, and let the fold decide.
3. Keep the log lossless; put forgetting in the fold function, never in deletion.
4. Embers is half-folded, and the unfolded half — drives — is the broken half.
5. Reinterpretation is free once beliefs are derived rather than stored.
6. Compaction should be bounded by semantic episodes; places supply them.
7. Three record kinds: lifecycle, observation, belief. Never promote 2 to 3 at
   write time.
8. Preprocessors compress what was seen, never decide what it meant.
9. Silence is uninterpretable without the lifecycle stream. Heartbeats.
10. Place memory should feed disposition, not the prompt.
