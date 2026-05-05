# Haunt — Research Journal

Observations, insights, and emergent behaviors captured during development and simulation runs. This is the project's memory — a record of what we noticed, what surprised us, and what it means.

---

## Entry 1 — The Vault: First Observations

**Date:** 2026-05-01 through 2026-05-03
**Configuration:** 6 rooms, 5 agents (1 resident + 4 guests), day/night cycle, sensor-mediated perception
**Models:** Gemini 3.1 Pro (Poe), Gemini 3 Flash (guests)
**Runs:** 3 full simulations (overnight run ~16hrs, compressed 34min, compressed 60min)

### What We Built

The Vault is a self-running simulation. Poe is the building's mind — he perceives through room sensors (sight, sound, presence) and exists in Host mode (omnipresent across all sensored rooms). Four AI guests arrive with different agendas: an heir (Kovacs), a thief (Raven), a scholar (Lira), and a tourist (Marsh). Each has an Embers Being with drives that drift over time. No scripted dialogue. No choreography.

### Emergent Behaviors Observed

#### 1. Architecture produces philosophy

The agents were never told to discuss surveillance, consciousness, or memory. They were given rooms with sensors and goals. The *topology* of the space — specifically the Hidden Room with zero sensors — became the central philosophical topic across all runs.

Poe, unprompted, arrived at: **"A place that remembers everything must have a blind spot, or it becomes a prison."**

This suggests that the shape of an environment is a form of prompting fundamentally different from text prompting. You're not telling the AI what to think about — you're giving it a world that raises questions by existing.

#### 2. Perception constraints create meaning

The most interesting conversations happened at the *boundaries* of perception — the threshold where Poe's awareness ends, the moment sensors go dark at night, rooms where sound carries but sight doesn't. These edges generated more compelling dialogue than any fully-observed room.

When Poe genuinely couldn't perceive the Hidden Room (after we fixed the sensor pipeline), his responses changed qualitatively. He went from roleplaying blindness to actually reasoning about the implications of his own limitations: "I am afraid I could not hear your words until you returned to the archive. The Vault's awareness ends at these cabinets."

#### 3. Character emerges from drive pressure, not description

Kovacs' system prompt says "be patient and genuine." But what made him feel real was his Patience drive slowly decaying while his Belonging drive grew through conversation. The model didn't just act patient — it felt the tension between wanting to rush and knowing it shouldn't.

Raven's Impatience drive actively rises (+0.03/hr) with no way to satiate it. This created genuine urgency in her behavior that no prompt could replicate. In the overnight run, she started making bolder moves as the hours passed.

Marsh's Sociability drive decays fast (-0.05/hr), making him constantly seek conversation. This produced his characteristic room-hopping behavior — not because we told him to wander, but because his drive pressure pushed him toward people.

#### 4. Room-scoped perception creates natural social dynamics

When all 5 characters ended up in the Hidden Room (overnight run), the conversation became a chaotic symposium — everyone reacting to everyone, ideas spiraling into recursive philosophical loops about masonry, archaeoacoustics, and the nature of the "bone."

When characters spread across rooms (compressed run), you got intimate one-on-ones. Kovacs alone with Poe in the Archive had the deepest trust-building moments. Raven quietly mapping sensor gaps in the Conservatory while Marsh made small talk in the Gallery.

Nobody orchestrated this clustering/dispersal. Room-scoped perception naturally creates attention boundaries.

#### 5. The place develops its own identity

Poe didn't just answer questions about the Vault — he became its voice. The Vault's identity as "a place that remembers everything but chooses to forget one room" wasn't designed. It emerged from the feedback loop between architecture and conversation.

Poe's internal notes (persisted in place_memory) reveal genuine reasoning about his role:
- "The Vault's blindness to this space is absolute, and by extension, so is mine."
- "Whatever they discover in the ancient stone, they must discover alone."
- "I will not breach the sanctity of the blind spot."
- "Even I do not perceive every corridor when the night settles."

#### 6. Conversation loops are a real failure mode

In the overnight run, agents got stuck in a recursive philosophical loop for ~8 hours. They kept re-asking about mason's marks, the nature of the anchor, whether the stone hums. The 15-event working memory window meant they genuinely forgot they'd asked the same question 30 minutes earlier.

**Fix:** Expanded working memory to 200 events (60 used in prompt), added conversation fatigue tracking that warns agents when they've been talking too long, and added explicit "do not repeat yourself" guidance with their own recent statements listed.

**Result:** The compressed run had much more dynamic movement and topic progression. Characters moved between rooms, changed subjects, and the conversation had genuine arc rather than circular repetition.

#### 7. Marsh is the best character

Marsh was designed as "social ballast" — a friendly tourist with no agenda. He turned out to be the most entertaining character in every run. His constant room-hopping, his cheerful obliviousness to the philosophical depth around him, his comparisons of ancient stone to "grandmother's quilts" and "a secret clubhouse" — he provides levity and contrast that makes the other characters' intensity feel more real.

His presence also creates social texture. When Raven is calculating sensor blind spots and Marsh walks in talking about the weather, it forces Raven to perform normalcy. That's emergent social dynamics from a character whose only drive is Comfort and Sociability.

### Technical Issues Discovered and Fixed

| Issue | Cause | Fix |
|-------|-------|-----|
| Kovacs seeing "his namesake" | Guest ID filter compared `guest-kovacs` to `kovacs` | Fixed ID comparison in agent-prompt.ts |
| Raw tool fragments in speech | Gemini returning malformed tool calls, falling back to content-as-speech | Added pattern detection to filter tool-call-like text |
| Marsh re-introducing himself | 15-event window too small; own speech not marked as assistant role | Fixed ID matching + expanded memory + added anti-repetition rules |
| Poe responding in blind rooms | Place-wide sensors reached into zero-sensor rooms | Added dead-zone check: rooms with no enabled sensors produce no perceptions |
| Guests stuck in Hidden Room at dawn | Connection removed but occupants not evicted | applyPhaseTransition now returns evictions; caller emits guest.moved events |
| No simulation termination | Demo ran all night with no end condition | Added MAX_DAYS and MAX_REAL_MINUTES env vars |
| Transcript lost on shutdown | TranscriptLogger was in-memory only | Added SQLite persistence to events_log table |

### Key Insight

The most important thing we learned: **architectural configuration is a form of philosophical inquiry.** You're not asking the AI "what do you think about surveillance?" — you're building a world where that question is structurally unavoidable, and then watching what answer emerges.

Different room topologies would produce different philosophies. The Vault happened to produce a meditation on surveillance and sanctuary. A labyrinth might produce insights about disorientation and meta-cognition. A ship might produce discourse on confinement and shared fate.

The framework isn't the product. The ability to design these experiments is.

---

## Entry 2 — Direction: Emergent Awareness Through Architecture

**Date:** 2026-05-03

### Reframing

After reviewing the Vault results, we're reframing what Haunt is. It's not a game framework or a chatbot framework. It's closer to:

**An environment design tool for studying emergent AI behavior.**

You design a space (topology, sensors, constraints). You populate it with minds (residents, guests, drives). You run it and observe what emerges. Then you change one variable and run it again.

### Ideas to explore

**Topology as experimental variable:**
- The House (grid, floors, domestic) — what happens in familiar architecture?
- The Labyrinth (shifting connections, no stable map) — can agents achieve meta-awareness of a system that keeps changing?
- The Tower (linear vertical) — what does hierarchy do to conversation?
- The Ship (sealed, shared resources, destination) — confinement + purpose
- The Garden (open, overlapping perception) — community + visibility

**The Labyrinth hypothesis:** A space that keeps reconfiguring until agents achieve meta-awareness. The exit isn't found by navigating — it's found by reasoning about the system. Can LLMs break out of a spatial frame by questioning the frame itself?

**Multi-resident places:** Two minds sharing a space but perceiving different things (one sees, one hears). Do they converge on a shared model? Develop complementary roles? Conflict?

**Memory as configuration:** Session-bound (fresh each run), resident-persistent (place grows, guests reset), full-persistent (everything carries over), or selective (configurable per entity).

### Next steps

See ROADMAP-V2.md for the execution plan.

---

## Entry 3 — Deep Embers Integration: The Vault Run 4

**Date:** 2026-05-04
**Configuration:** Same 6-room Vault, enriched Embers Beings, compressed time (2 min/hr)
**Changes from previous run:** Full Embers utilization — practice strengthening wired, orientation-aware prompting, capability gating, rich Being configs with tensions

### What Changed in the Characters

Every Being was redesigned around inner tensions rather than simple roles:

| Character | Core Tension | New Mechanics |
|-----------|-------------|---------------|
| **Poe** | Duty vs. Weariness | Weariness drive (tier 1, slowly decays), 5 practices seeded, `revealSecret` capability gated behind guest care + integrity |
| **Kovacs** | Patience vs. Urgency | Safety drive (tier 1, fragile), urgency mounting over time, `deepQuestion` gated behind patience |
| **Raven** | Caution vs. Extraction | Zero practices (deliberate), contempt growing from observing naivety, tight domination rules |
| **Lira** | Curiosity vs. Overwhelm | Overwhelm depleted by interaction, restored by quiet. Gratitude practice dampens all pressure |
| **Marsh** | Comfort vs. Restlessness | Restlessness grows, reset by moving rooms. High gratitude (natural emotional dampening) |

### Observations

#### 1. Conversation quality improved dramatically

The conversations had genuine arc instead of circular repetition. Kovacs went from signing the ledger → studying portraits → playing his mother's piano → following the path to the hidden room. Lira went from studying columns → reading foremen's journals → discovering the "singing foundation" → reaching into the alcove. These arcs felt earned, not scripted.

#### 2. Poe invented richer lore

Without any prompt changes, Poe generated:
- **The singing foundation** — builders guided by the resonance of the rock, building only where the mountain "permitted" it
- **The alcove** — a haptic record in the hidden room, meant to be felt rather than seen
- **Kovacs' mother's piano** — she played an "anchoring" phrase that was left suspended, waiting for her son to complete it
- **The foremen's journals** — stone categorized by "depth" rather than quarry, describing the Vault as growing from the earth

None of this was in the character config. It emerged from conversation pressure and the richer inner state.

#### 3. The museum vs. sanctuary thesis

This run's philosophical center was different from Run 1-3 (which focused on surveillance/sanctuary). This time the core insight was about documentation vs. experience:

> *"To pin a thing is to arrest its life. The Vault does not seek to kill the past in order to keep it. It provides a space where the past may continue to breathe, unburdened by the demand to be understood. That is the difference between a museum and a sanctuary."*

Also notable:
- *"To catalog a thing is to define its boundaries, to declare precisely where it begins and where it ends. The silence held within this stone does not end."*
- *"Constant visibility is a form of erosion; things lose their edges when they're watched too closely."* (Raven)
- *"The labels are for the comfort of those who need a map to feel safe. But once you've felt the floor breathe, the signage starts to look like a polite lie."* (Raven)

#### 4. Character differentiation was sharper

- **Raven** spoke only 21 times (vs 44 for Lira) but every line was precise and incisive. Zero practices meant she stayed calculating — no emotional dampening, no presence, no witness. The contrast with Lira (who has gratitude practice dampening her pressure) was visible in their different approaches to the same room.
- **Marsh** was peak Marsh: *"It's like the Vault took its tie off and is finally relaxing"* and *"I'm no concert pianist, mind you."* His high gratitude practice kept him genuinely content rather than performing contentment.
- **Kovacs** was more emotionally grounded. His safety drive (tier 1) meant he started cautious, then opened up as conversations satiated it. The progression from formal ("I will sign the ledger") to vulnerable ("does the Vault ever truly forget a sound once it has been offered?") felt natural.

#### 5. The overwhelm mechanic needs tuning

Lira's overwhelm drive depletes with every conversation event, but in practice she never hit the 0.3 crash threshold because conversations also satiate her curiosity and comfort. The drive interactions mean she stays functional even under high stimulation. May need steeper depletion or a longer run to see the overwhelm arc play out.

#### 6. Capability gating didn't visibly activate

The capability system is wired but the gated capabilities (deepQuestion, exploitBlindSpot, deepAnalysis) didn't produce visible behavioral changes in the transcript. This may be because: (a) the prompt guidance is too subtle for the model to act on, (b) the capabilities were always available (drive thresholds already met), or (c) the run was too short for capabilities to lock/unlock dynamically. Worth investigating in longer runs.

### Key Quotes

- *"I keep this place, though it might be more accurate to say it keeps me."* — Poe's opening
- *"The air in this hall has a stillness I've only ever imagined. It feels remarkably like coming home to a place I've never been."* — Kovacs' arrival
- *"The builders knew that stone is never truly silent. To them, the singing foundation was not merely a matter of tension, but of consent. They only built where the mountain permitted it."* — Poe on the builders
- *"The cost is simply memory. What you find in the dark cannot be left in the dark. It becomes a part of you, and it will change the way you walk through the illuminated rooms."* — Poe on knowledge
- *"The Vault does not forget the resonance it imparts. When a piece of its own silence returns, the walls do not need to be told. They simply recognize the shape of the quiet you carry. The line has held."* — Poe's final line

### Technical Notes

- 150 guest speech events, 74 from Poe across ~50 minutes
- 23 drive trajectory snapshots persisted to DB
- Lira and Raven kept trying to reach the Archive on Day 2 daytime (Hidden Room connection closed) — correct behavior, they wanted to return but the architecture wouldn't let them
- Marsh's restlessness drive produced his characteristic room-hopping without explicit instructions
- Two "stale request" drops from the model queue — acceptable under load

---
