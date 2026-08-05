# Phase 3 — The Gap

**Status:** Draft — pending approval. No code written.
**Goal:** A resident that does something nobody asked for, and can explain why.
**Shape:** Two sub-phases across two repos, same pattern as the 0.2 migration —
Embers ships, Haunt consumes.

Findings this responds to: [`COGNITION.md`](./COGNITION.md).
Primitive spec: `embersjs/docs/design/v0.3/intention.md`.

---

## The one-sentence version

Haunt's runtime is `perceive(event) → action` with nothing in between, which
means the resident can only answer what knocks. This phase inserts the place
where it can be doing something else.

## Success

Two conditions, both required. Either alone is a failure.

1. **It acts.** In a place with no guests and no prompts, something happens.
2. **Everything traces.** Every action → an intention → a drive state → the
   events that produced it. No dead ends anywhere in the chain.

Condition 2 is why the drive-state refactor is in scope. An untraceable action is
not autonomy, it is noise, and the difference between the two is the entire
product.

---

## The proof: The Empty Room

A resident alone in a place for a simulated week. No guests, no prompts.

**The Void is the control, and it has already run.** Same scenario, same shape —
a resident alone in a place. It produced poetic fragments about the room and zero
credited practice, because nothing in its architecture gave it a reason to do
anything. That result is recorded in `JOURNAL.md` entry 5, and the practice
measurement was redone against a calibrated evaluator, so the before-state is
documented rather than remembered.

This makes Phase 3 a controlled comparison rather than a vibe check.

| | The Void (v0.2) | The Empty Room (v0.3) |
|---|---|---|
| Resident alone | yes | yes |
| Unprompted **utterances** | many | — |
| Unprompted **actions** | none | the thing being tested |
| Action → drive attribution | n/a | required |

**If the resident still only talks, the intention layer did not work**, and the
comparison says so precisely rather than leaving it to taste.

Secondary observation, not a success condition: whether the run is *interesting*.
A resident that lights the fire every four hours forever has technically passed
both conditions and produced a clock. Worth watching for; not worth designing
against until it happens.

---

## Sub-phase 3a — Embers

Per `embersjs/docs/design/v0.3/intention.md`:

1. Golden tests pinning current drive and wear trajectories.
2. Fold drive level and `chronicLoad` over their event history. Behavior-
   preserving against those tests; any divergence is a bug.
3. `SurfacedCandidate` and `Intention`, their event log, and the derived view.
4. `pursuableBy` on drives — optional, so existing beings are unaffected. It
   declares a satisfier and a threshold, **not** an aim.
5. Eligibility signalling: which latent pressures are currently eligible to
   surface. The library neither authors aims nor decides to commit.

Ships as `@embersjs/core` 0.3.0.

**Checkpoint:** a being under pressure reports that a pressure is eligible to
surface, with its satisfier token, and the log explains why. Nothing is
articulated and nothing is committed.

> **Three states, not two.** Latent pressure that biases attention and colors
> tone already exists in v0.2 and is unchanged. Most pressure stays there. See
> the spec — this phase adds one layer, not two.

---

## Sub-phase 3b — Haunt

### The load-bearing change: `AutonomySystem` becomes autonomous

Today it sets `shouldDeliberate` from the event type and whether any sensor fired.
That is a filter wearing the name of a concept.

It becomes an **urgency comparison**: does this arriving event outrank the
resident's current commitment?

- Event outranks → deliberate on the event, as now.
- Commitment outranks → **do not call the model.** The resident continues what it
  was doing. This is the decline, and it is control flow, not prose.
- No event, active commitment → deliberate *toward the intention* rather than
  about a quiet moment. This is the unprompted-action path.

**This is the test of whether the phase worked.** If a committed intention only
ever reaches the prompt as extra text, we have rebuilt the defect this phase
exists to correct — an inner state that changes how the resident sounds and not
what it does. A committed intention must be able to suppress a deliberation.

Sane floors, because a resident that ignores a guest speaking to it is broken,
not autonomous:

| Event | Rule |
|---|---|
| direct address (`guest.spoke` to the resident) | always outranks |
| guest enters / leaves | outranks all but the most urgent commitment |
| ambient (`affordance.changed` elsewhere, ticks) | rarely outranks |

### The rest

- **Surfacing detection.** Haunt owns this, because only the host knows what a
  satisfier refers to. Perceptual coincidence — the satisfier appears in current
  perception — plus quiet, with threshold as a floor. The fire visibly dying is
  what makes tending it thinkable.
- **Aim authoring.** A model call at surfacing, and *only* at surfacing. This is
  the being putting words to a pressure. Because the drive owns the satisfier and
  the model owns the aim, the two can diverge — a resident that misidentifies
  what it wants, pursues the satisfier, and finds the pressure undropped. That is
  a feature and needs no code.
- **Adjudicator.** Two-tier, same shape as `createPracticeEvaluator`: rule tier
  declines on unresolvable satisfiers and out-ranked duplicates without a model
  call; model tier only for genuine uncertainty. Default to declining.
- **Satisfier resolution.** Haunt interprets the opaque token — `{kind:
  "affordance", ref: "hearth", params: {actionId: "light"}}` becomes a real
  `ResidentAction`. Embers never learns what an affordance is.
- **Intention in context.** Committed intentions appear in the prompt *as
  commitments*, alongside the structural gating above. Prompt presence is
  necessary and nowhere near sufficient.
- **Debug view.** Current commitments, their urgency, recent declines, and
  **surfacings per hour**. The declines matter more than the commits when this
  goes wrong, and the surfacing rate is the parameter most likely to be wrong
  first — too high and the resident narrates every passing pressure, too low and
  the layer looks broken when it is merely quiet.

---

## Non-goals

Listed because this is where scope discipline usually fails.

- **A planner.** No step sequences, no subgoals.
- **Valence on perception.** Real, named in `COGNITION.md`, next cycle. It
  refines *what* triggers deliberation, not *whether the gap exists*.
- **Memory → disposition rewire.** Depends on disposition driving behavior, which
  this phase establishes.
- **Physical hardware.** Perception is already the strong layer.
- **Fold extraction or platform integration.** Not pulled by anything yet.
- **New characters or places.** The Empty Room uses The Void's existing config so
  the comparison stays honest.

---

## Thin-slice constraints

The intention model is the most expensive thing in this cycle to get wrong, so
the first version is built to be cheap to discard:

- **One drive** with `pursuableBy`.
- **One intention** shape.
- **One room.**
- At most **3** committed intentions at a time.

Resist adding a second of anything until The Empty Room has run.

---

## Risks

**The prompt-only failure.** The most likely outcome is intentions that read
nicely and change nothing. Guarded by making suppression the success criterion
rather than the prose.

**The clock failure.** A resident that satisfies the same drive on a fixed cycle
has passed the tests and learned nothing. Detectable in the run; not designed
against yet.

**Cross-repo coupling.** 3b cannot be evaluated until 3a ships, which is the
0.2-migration pattern — it worked, but it means a bad intention shape is
discovered late. Mitigated by this spec existing before either is built.

**Adjudication cost.** This fires far more often than practice evaluation. If the
rule tier is not carrying most of the load, the phase gets expensive quietly.
Worth measuring in 3b rather than assuming.

---

## Open questions for the review

1. ~~**Who authors an intention's `aim`?**~~ **Settled.** The drive owns the
   satisfier; the resident authors the aim at surfacing. The cost objection went
   away once surfacing became a distinct, rare state rather than a synonym for
   threshold crossing.
2. **Does a satisfied intention feed the practice substrate?** Pursuing something
   under pressure and discharging it resembles cultivation. Coupling two systems
   before either is proven seems wrong; noting it rather than deciding. The
   reverse coupling — witness depth raising the surfacing rate — is the more
   promising direction and is named in the spec.
3. **Where does the Empty Room run** — the existing Void harness, or the
   physical-sensing script? The Void keeps the comparison clean and is the
   recommendation.
4. **What surfacing rate is right?** Unknown, and not knowable in advance.
   Instrumented from the first run rather than guessed at.
