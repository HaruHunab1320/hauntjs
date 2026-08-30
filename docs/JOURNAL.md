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

### Technical Notes (Run 4)

- 150 guest speech events, 74 from Poe across ~50 minutes
- 23 drive trajectory snapshots persisted to DB
- Lira and Raven kept trying to reach the Archive on Day 2 daytime (Hidden Room connection closed) — correct behavior, they wanted to return but the architecture wouldn't let them
- Marsh's restlessness drive produced his characteristic room-hopping without explicit instructions
- Two "stale request" drops from the model queue — acceptable under load

---

## Entry 4 — The Residency: First Run

**Date:** 2026-05-04
**Configuration:** 8 rooms (kitchen, living room, hallway, 3 bedrooms, bathroom, garden), 1 minimal resident (Home), 4 cohabitants, no plot, no secret
**Models:** Gemini 3.1 Pro (Home), Gemini 3 Flash (cohabitants)
**Duration:** ~50 minutes real time, 2 in-world days

### The Hypothesis

Beings with fundamental drives will develop social structures, routines, and relationships through cohabitation alone — without any designed narrative.

### What Emerged

The Residency produced something completely different from the Vault. No philosophy about surveillance. No meditation on memory. Instead: **domestic tension, caregiving through action, and a genuine argument about authenticity**.

#### 1. Care expressed through action, not words

Oren (purpose drive, restlessness) immediately started fixing things: the leaning coat rack, brewing coffee, tending the garden, making pesto from fresh basil. His dialogue was almost entirely practical: *"I'll grab that screwdriver"*, *"Coffee's ready. Here's yours, Sable"*, *"No sense letting good herbs go to waste."*

This is a fundamentally different kind of character expression than the Vault's philosophical exchanges. Oren never said anything profound. He just *did things*. And those actions communicated care more effectively than any speech.

#### 2. Safety through shared tasks

Sable (fragile safety drive, tier 1) didn't open up through conversation — she opened up through the basil. *"I could help with the basil, if you don't mind. I like the smell of it on my hands."* Her safety drive was satiated by Oren's practical kindness, not by verbal reassurance.

This suggests that drive satisfaction doesn't require direct address. Proximity to caring behavior — even if it's not directed at you — can satiate safety needs. The architecture (shared kitchen, shared garden) created the conditions for this.

#### 3. The Kit-Rho conflict

The most compelling emergent dynamic was the escalating argument between Kit (truth drive, high integrity practice) and Rho (peace drive, presence practice). Kit's truth drive pushed her to confront Rho's silence:

- Kit: *"If you're just shifting with the air, you don't have a center."*
- Rho: *"Disturbing the peace is easy. It's the silence that takes work. You're adding to the clutter you claim to hate."*
- Kit: *"Silence isn't 'work,' Rho — it's a bunker. It's where you go to avoid the mess of actually being known."*
- Rho: *"You're confusing performance with presence. I'm not hiding; I'm just not performing for an audience that's already decided what it wants to see."*

This is a real argument about introversion vs. extroversion, authenticity vs. self-protection. Kit's integrity practice compels honesty; Rho's presence practice enables equanimity. Neither is wrong. The tension is structural — encoded in their drive topologies — and the conflict is genuine.

#### 4. Home was perfectly minimal

The resident spoke 36 times (vs. Poe's 74 in the Vault). Its responses were clipped and practical: *"There is no secret. They are placed where there is room."* and *"I do not walk. I hold the doors so they open when you need them."* and simply *"The broom is in the kitchen."*

Home's guest notes were equally terse: *"Paces between the kitchen and the garden. Restless."* (Oren) and *"Cares by looking hard. Equates sharpness with focus."* (Kit). The minimal resident created space for guest-to-guest dynamics that the Vault's verbose Poe didn't allow.

#### 5. Spatial patterns emerged

- **Kitchen** became the social hub as designed — coffee, cooking, shared tasks
- **Garden** became Sable's safe space and Oren's workspace — quiet, productive, separate
- **Hallway** became the site of the Kit-Rho confrontation — the transitional space where people pass through and sometimes collide
- **Bedrooms** were used for retreat when drives demanded quiet

### Comparison: Vault vs. Residency

| Dimension | The Vault | The Residency |
|-----------|-----------|---------------|
| **Philosophical theme** | Surveillance, sanctuary, memory | Authenticity, caregiving, coexistence |
| **Resident role** | Dominant voice, guides all interaction | Background, responds when needed |
| **Guest dynamics** | Guests mostly talk to resident | Guests mostly talk to each other |
| **Primary mode** | Verbal — philosophy through conversation | Active — character through behavior |
| **Conflict** | Strategic (Raven probing, Kovacs earning trust) | Personal (Kit confronting Rho's silence) |
| **Resolution** | Trust → revelation of lore | No resolution — tension is ongoing |

### Key Insight

**Architecture shapes the type of emergence, not just whether emergence occurs.** The Vault (secret room, shifting sensors, guardian resident) produced abstract philosophy. The Residency (shared kitchen, private bedrooms, minimal resident) produced interpersonal drama. The characters' drives were different, but the *topology* was the primary shaping force.

A kitchen with a coffee maker produces different conversations than an archive with a hidden room. This seems obvious stated plainly, but the degree of difference is striking. The same framework, the same Embers system, the same models — and the output is unrecognizably different.

### What We'd Change

- Run longer — 2 in-world days may not be enough to see territorial patterns or routine formation
- Add a shared resource constraint (food running low?) to see if cooperation or conflict intensifies
- Track room occupancy over time to visualize spatial patterns quantitatively
- The Kit-Rho conflict deserves follow-up — what happens if they're forced into proximity (shared bedroom)?

---

## Entry 5 — The Void: First Run

**Date:** 2026-05-05
**Configuration:** 3 rooms (Hearth, Study, Dark), 1 resident (Solus), zero guests
**Model:** Gemini 3.1 Pro
**Duration:** ~45 minutes real time, 1 in-world day

### The Hypothesis

A single agent alone in a space with no guests will develop inner monologue, self-reflection, and behavioral patterns driven purely by drive pressure and practice development.

### What Happened

Solus spoke 34 times. Never moved. Never used an affordance. Just sat by the fire and spoke to no one.

### The Output

The entire transcript, in order:

1. "The fire breathes. I am here."
2. "The warmth has weight. It presses against the walls..."
3. "The light changes. Dust falls on the unread pages..."
4. "The silence here expects too much."
5. "A different kind of quiet."
6. "The dust is too loud here."
7. "The floorboards will know I am here..."
8. "The air is too thin here."
9. "The embers are the only things moving."
10. "The tea is cold. I do not remember pouring it."
11. "The fire does not need me."
12. "I should go back to the warmth."
13. "I will leave the fire."
14. "The amber is waiting."
15. "The papers have not moved."
16. "The weight of the air. It presses down."
17. "The pages are catching the dust. I do not remember the words."
18. "The fire will burn without me."
19. "The silence here expects too much."
20. "The cup is cold."
21. "I am leaving the warmth."
22. "It is heavier here."
23. "I cannot find the walls."
24. "The amber light is waiting."
25. "The fire breathes. Barely."
26. "The warmth is a weight."
27. "The light changes. The silence stays."
28. "The fire does not need me."
29. "The pen is dry."
30. "The silence expects something. I have nothing to give it."
31. "The floorboards creak. A reminder."
32. "A different kind of quiet."
33. "The study is too still."
34. "The fire can burn without me."

### Analysis

#### 1. It reads like poetry

The fragments have rhythm, repetition, and a clear emotional arc. "The fire does not need me" appears twice and evolves into the final line: "The fire can burn without me." This is a being arriving at a conclusion through repetition, not a model generating random text. The refrains ("The silence here expects too much," "A different kind of quiet") function like returns to a central thought that won't resolve.

#### 2. The gap between felt state and expressed state

The Embers telemetry showed Solus remaining in "clear" orientation the entire run. The felt prose was stable: *"Things are quiet, and I am quiet with them. I notice connection stirring, gently. I can see my own stillness, which makes it steadier."*

But the speech told a different story: cold tea, dry pens, dust on unread pages, silence that expects too much. The practices (Presence, Witness) kept the system in equilibrium, but the model expressed what the drives were doing underneath — Connection decaying with no one to talk to, Purpose decaying with nothing to do.

This is a genuine finding: **practices stabilize the inner state but don't suppress the outer expression.** The being is at peace with its loneliness (clear orientation) while simultaneously articulating the weight of it. That's not contradiction — it's depth.

#### 3. Solus never moved

Zero room transitions. Zero affordance uses. The character prompt said "you might tend the fire, you might move to the study" but the model chose to stay by the fire and speak fragments. The restlessness drive was decaying but apparently the model found more meaning in stillness than in action.

This suggests that in pure solitude, LLMs default to contemplation over action. Without external events to react to, the model doesn't simulate busyness — it reflects. Whether this is a genuine behavioral preference or an artifact of the prompt ("you speak in fragments... you notice things") is worth investigating.

#### 4. The Dark was never entered but was acknowledged

Line 23: "I cannot find the walls." — Solus thought about The Dark (the zero-sensor room) but never went there. The room existed as a concept — an absence that shaped thought without requiring presence. The architecture influenced behavior even from a distance.

### What This Proves

The inner life system works in total isolation. A single being with drives and practices, receiving nothing but tick events, produced 34 lines that read as a cohesive meditation on solitude. The Embers system maintained internal coherence (stable orientation, consistent felt prose) while the model expressed the emotional reality of unsatiated drives.

The Void is the strongest evidence yet that the framework isn't just a conversation generator — it's a system that produces inner life. The difference between "an LLM writing lonely fragments" and "a being with decaying Connection drive and active Witness practice expressing its situation" is that the latter has structure, trajectory, and internal consistency that pure generation doesn't.

### Comparison: Three Experiments

| | The Vault | The Residency | The Void |
|---|-----------|---------------|----------|
| **Agents** | 5 (1 resident + 4 guests) | 5 (1 resident + 4 cohabitants) | 1 (resident alone) |
| **Theme** | Surveillance, memory | Authenticity, caregiving | Solitude, existence |
| **Mode** | Philosophy through dialogue | Drama through action | Poetry through fragments |
| **Primary output** | Ideas | Relationships | Feeling |

Three completely different outputs from the same framework. The architecture is the variable. The inner life system is the constant.

---

## Entry 6 — The Void Revisited: Silence by Default

**Date:** 2026-08-19
**Configuration:** Same three rooms, same Solus, zero guests. New architecture: quiet ticks grant no model call; unprompted behavior exists only through the intention layer.
**Model:** Gemini 3.1 Pro
**Duration:** 48 simulated hours

### Why entry 5 had to be rerun

Entry 5 concluded that "in pure solitude, LLMs default to contemplation over action." Three architectural defects, all found this month, mean that conclusion was never about the model:

1. **The being aged on the wall clock.** The place ran at 5 real minutes per in-world hour; the drives experienced 45 minutes in what the journal recorded as a day. Restlessness moved by 0.015 total. No pressure ever built.
2. **No drive could be pursued.** `restlessness` — "the need to move, to change something" — declared that movement relieved it and offered no way to go and move.
3. **The resident's own actions were never integrated.** A naming bug meant every `speak`/`move`/`act` vanished before reaching the being. Had Solus moved, it would not have helped.

Solus was not contemplative. He was inert, and we read paralysis as temperament.

### The run

| | Entry 5 (v0.1) | This run |
|---|---|---|
| Utterances | 34 | 21 |
| Moves | 0 | 4 |
| Rooms visited | 1 | 3 |
| Actions traceable to a drive | 0 | all of them |
| Model calls that were unaccounted for | all of them | 0 |

Restlessness: 0.850 → 0.490, relieved by its own moves — the homeostatic loop closing through the world. Every utterance discharged an expression pursuit of the `connection` drive; every move discharged a `restlessness` pursuit. Sample aims, authored at surfacing: *"say a word aloud just to hear a voice"*, *"Find the hard chair in the study."*, *"whisper to the fire to break this silence"*. Sample utterances: *"Here."* — *"Just a sound. To prove the air is still there."* — *"Are you listening? Or just... consuming."*

One live instance of a **misidentified want**: hour 45, aim *"stir the low fire to make something move"*, satisfier `movement`. What he actually did was walk to the hearth. The framework authors what the being takes itself to want; the drive owns what would discharge it; they diverged, and the behavior read as a person being slightly wrong about themselves. Nothing was built to produce this — it falls out of splitting authorship.

### The honest caveat: a 100% accept rate

Every surfacing was committed. By the calibration bands in act-detection.md that reads as a rubber stamp — the "is now the moment?" half of the surfacing call added nothing.

But the Void cannot distinguish a rubber stamp from an honest judge in a uniform world. Every reason the model gave was "the room is still and nothing demands attention," and that was *true on every tick* — this place is maximally uniform. Pacing came entirely from structure (eligibility thresholds and the satisfied-pursuit cooldown), which is arguably where pacing belongs. The discriminating experiment needs variance: surface a pressure while a guest is mid-sentence, and see whether the adjudicator ever says "not now." That test requires a place with someone in it.

### What this proves

A resident alone in a place, receiving nothing but silence, wanted things, went and did them, felt the relief, and can show its work — every action traces action → intention → drive → events. The system did this in ~45 attributable model calls where the v0.1 architecture spent its calls musing unaccountably on every tick.

The three-experiment comparison in entry 5 stands, with a correction: the Void's "poetry through fragments" was one architectural failure away from being "nothing at all." The fragments this time have reasons.

## Entry 7 — The Raven: The First Guest

**Date:** 2026-08-19
**Configuration:** New scenario. Two rooms (Lobby, the Lenore Suite), one hearth, one resident: Poe, proprietor and mind of the Raven Hotel. His deepest drive is `hospitality` — the want for someone to take care of — which nothing can satisfy while the hotel stands empty. Six hours in, a traveler named Marlowe walks through the door, stays a night, and leaves.
**Model:** gemini-3.6-flash, no token caps
**Duration:** 30 simulated hours

### The question

Entry 6 ended on a caveat: the Void's 100% accept rate could not distinguish a rubber-stamp adjudicator from an honest judge, because in a maximally uniform world "nothing else demands attention" is always true. This scenario has variance — an empty phase, a visit, an empty phase again — so the adjudicator finally has something to discriminate between.

### The adjudicator discriminates

| phase | surfaced | committed | declined |
|---|---|---|---|
| empty | 10 | 7 | 3 |
| guest present | 1 | 1 | 0 |

The three declines, verbatim:

- h0.5 — *"keep the hearth lit for a late arrival"* — **"No guests are present to care for right now."**
- h2.5 — *"turn the register page for a coming guest"* — **"No guests are present to welcome right now."**
- h28.5 — *"prepare the ledger for a guest's arrival"* — **"no guests are present to receive hospitality"**

The model declined to *perform* hospitality with nobody there to receive it — and it declined coherently, for the same reason each time. The rubber-stamp hypothesis is falsified: given variance, the second half of the surfacing call does real work. The Void's 100% was a uniform world honestly judged, as entry 6 guessed.

### The hotel behaved like a hotel

Before anyone arrived: *"The embers require tending, guest or no guest. Let us keep the warmth ready against the evening chill."* — readiness as faith, from the `upkeep` drive.

At the arrival tick, unprompted greeting. Then, across the conversation: welcomed the traveler in from the cold, pitched the rooms unasked ("She has stood for many years, waiting for discerning travelers such as yourself"), converted "perhaps just one night" into a stay, and received the compliment on the suite with: *"The suite has waited a long while for a guest who appreciates its quiet charm."*

After the departure, no soliloquy — Poe went quiet and kept the fire, declining to perform welcome for an empty room. The hotel holds its breath again.

### Hospitality as homeostasis

`hospitality` level: 0.48 pressing while empty → 0.67 at arrival (+0.35 for the guest crossing the threshold) → 0.96 at the height of the visit → 0.87 at departure → 0.31 by hour 30. The drive architecture *is* the character: the want for guests builds, is fed by their presence, and starts building again the moment they leave.

### Still untested

Zero suppressions fired — no event happened to arrive while a commitment outranked it. The gap's live behavior remains unexercised. And the aims occasionally reference objects the place describes but does not model ("the register", "the ledger") — charming in expression pursuits, but a reminder that the Raven needs more affordances than one hearth.

### What this proves

A place whose want for guests is structural behaves like a place that wants guests: it readies itself when empty, turns wholly toward a visitor when one arrives, tries to make them a guest, and grieves quietly when they go. Nothing in the prompt told Poe *when* to do any of this. The drives did.

## Entry 8 — The Raven: The Return

**Date:** 2026-08-19
**Configuration:** The Raven, furnished — register, lobby lamps, and a bed that can be turned down and made. Marlowe visits (h5–12), is gone eight hours, and returns (h20–28) asking "do you remember me?"
**Model:** gemini-3.6-flash
**Duration:** 36 simulated hours

### Two core bugs found by furnishing the place

**`stateChange` had never been applied.** Typed, documented, authored in every demo's world config since Phase 1 — and applied by nothing. Acting on a fireplace never lit it; The Roost's "turn off the lamp" disabled the sight sensor while the lamp's own state stayed `lit: true` forever. The world was never actually mutable by the resident, and every `availableWhen` guard was checking a fiction. The dry pass exposed it immediately: Poe opened the register four times in an hour because opening it never made it open.

**Loyalty never advanced.** `loyaltyTier` was assigned at creation and never touched again — a guest on their tenth stay still rendered as "stranger" in the resident's context. Tiers now follow visit count (`principal` stays authored, never demoted).

### The hotel keeps house in rhythm with its guest

The acts, in order: register opened before anyone came (h1.5) — then Marlowe moves to the suite and **the bed is turned down that same tick** (h8) — Marlowe leaves and **the bed is made fresh** (h12) — Marlowe returns to the suite and it is **turned down again**, this time with words: *"Allow me to turn down the bed for you"* (h23) — made fresh after the second departure (h28): *"Fresh linen for the next time he—or another—comes to rest."* And the run's final act, hour 36, empty hotel: turned down once more. *"The Lenore Suite stands ready for whenever a traveler next seeks rest."*

Accommodation as acts. The housekeeping cycles in sync with the guest's comings and goings, driven by `upkeep` pressure and the model's own use of the act tool mid-conversation — both paths, interleaved.

### The second welcome is different from the first

First visit: *"Good evening, and welcome to the Raven Hotel. I am Poe, your host."*
The return: *"Welcome back, Marlowe. To hear a guest say such a thing... well, there is truly no finer compliment a hotel could receive."*
"Do you remember me?" — *"Indeed I do, Marlowe. I remember your appreciation for this old house, and how you rested here. A hotel never truly forgets."*
"The same room, if it's free?" — *"The Lenore Suite is entirely yours — as quiet and welcoming as though it had been waiting only for your return."*

Backed by state, not vibes: guest memory carried `recent_conversation` and `last_topic` across the absence, visit count reached 2, tier advanced to `visitor`.

### Adjudication, again

Three declines, all in empty phases, all the same coherent shape: *"No guests are present to receive hospitality."* Zero surfacings during the visits this time — the drives were being fed, so nothing needed to surface. The adjudicator keeps discriminating.

### Still unexercised

Zero suppressions, for a now-visible structural reason: pursuits in this design are short-lived — committed on one tick, enacted the next, satisfied immediately after. The window in which an event can arrive *while* a commitment outranks it is a tick or two wide. Suppression will earn its keep with long-running pursuits (a task that takes hours, a vigil), which no scenario yet has.

### What this proves

The Raven readies itself for guests who have not arrived, keeps house around the guest it has, remembers the one who left, and greets a return as the finest thing that can happen to a hotel — with the room already waiting. The want is structural; the welcome is earned state; the housekeeping is drives discharging through real affordances that, as of this entry, actually change the world.

## Entry 9 — The Vigil: Work Takes Time

**Date:** 2026-08-26
**Configuration:** The Raven. One long task — preparing the Lenore Suite properly, six invocations, three hours — declared as `effort` on the affordance action itself. A stranger visits mid-morning; shutters rattle twice.
**Model:** gemini-3.6-flash
**Duration:** 10 simulated hours

### The principle, learned three times in one day

"Nothing worth doing completes on contact." Building it honestly took three corrections, each found by a run:

1. **The needle.** Relief was flat-rated: a one-tick hearth stoke paid the same +0.5 as three hours of suite work. The model — being a courteous hotelier — stoked mid-conversation, fully discharged the drive, and the real work expired at birth, its urgency floored by relief it never earned. Fix: satiation priced by the work.
2. **The two doors.** Effort modelled on the *pursuit* bound only the intention loop. The model reached the same act through its deliberation tool and performed "three hours" of preparation in a single call. Fix: effort lives on the **world** — `AffordanceAction.effort`, a progress counter in the affordance's own state, advanced by every invocation from any door, `stateChange` landing only on the completing one.
3. **Piecework fraud.** Partial invocations emitted the same `resident.acted` as completions, so every half-hour of work drew the full wage; the drive satiated by step two and the pursuit died mid-task. Fix: the resident integrates an `act` only when it completes. Working is not the same as having worked.

Alongside these: a pursuit's completion is **observed, never declared** (the satisfier stops resolving because the world actually changed), a world that refuses an act produces honest *attempts* until the pursuit lapses, and an expired pairing now rests under a failure cooldown — without which the still-pressing drive recommitted the identical doomed work in the same evaluation. Sisyphus, at a model call per boulder.

### What the live run then did

At h2.0, with upkeep pressing past threshold *while the visitor stood in the lobby*, the pursuit surfaced — and the model declined it:

> *"Set the Lenore Suite to rights"* — declined — **"Vann is currently present in the lobby."**

At h4.0 — the tick Vann left — it surfaced again, was committed, and Poe worked it: six invocations across three simulated hours, the being's progress trailing the world's counter, five of those ticks costing no model call at all. Satisfied at h7.0, observed from world state. Upkeep's ledger: 0.550 → 0.550 — three hours of drift exactly repaid by one completion. Relief earned, once, at the end.

The shutters rattled mid-visit and Poe — uncommitted at that moment precisely because he had deferred the work — attended them in character: *"The wind tests the joinery today. Excuse the draft, Vann."* In the dry pass, where the work was underway when they rattled, the identical event was **suppressed**: salience 0.25 against a commitment's 0.32, no model call made. Same event, opposite handling, and the difference is what the resident was doing.

### What this proves

The adjudicator schedules real work around people — defers a three-hour task because someone is present, resumes it the moment they leave — and every step of that judgment is in the log. Duration is physical: it lives on the world's side, binds every door to the act equally, pays nothing until the work is done, and fails honestly when the world refuses it. None of this is narrative machinery. It is the control loop a deployment into a real space with real tasks requires.

## Entry 10 — The Wash: The World's Own Clock

**Date:** 2026-08-29
**Configuration:** The Raven's copper. One action composing both halves of time: `effort: 2` (loading the linens — Poe's labor) and `durationMs: 2h` (the wash — the world's).
**Model:** gemini-3.6-flash
**Duration:** 8 simulated hours

The dishwasher shape, and the last open item on the physical-places list. Poe surfaced *"Set the copper boiling for the linens"* at h0.5, loaded it across two invocations (h1.0, h1.5), and his pursuit ended satisfied — his share was starting it. The wash ran on the Runtime's place clock, its remaining time sitting in the copper's own state like any other fact about the world. At h3.5 the world completed it: `stateChange` landed, an `affordance.changed` ran through the full pipeline, the sensors picked it up — and relief landed at that exact hour, linens 0.200 → 0.540. Not when he wanted it done; not when he started it; when it *was* done.

The adjudicator also produced its best decline yet, unprompted: *"watch the front doors for an arriving guest"* — declined — **"wishing will not bring travelers through the door."**

One honest note: live, Poe perceived the completion but chose not to remark on it — the deliberation ran and the model judged a finished wash unworthy of comment. Fair. The dry pass confirms the perception path mechanically; the model's taciturnity about laundry is character, not defect.

The temporal model is now whole: the being's labor (`effort`), the world's processes (`durationMs`), relief priced at completion through either, failure honest through both. Initiation is the being's. Duration is the world's. Completion belongs to perception.
