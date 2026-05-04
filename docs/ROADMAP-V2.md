# Roadmap v2 — Emergent Architecture

The Vault proved the core thesis: architectural configuration produces emergent philosophical behavior from AI agents. This roadmap builds on that foundation.

Previous roadmaps (v0.1 and Phase 2) focused on building the framework primitives. This roadmap focuses on what the primitives enable.

---

## Phase 1 — Experiment Infrastructure

**Goal:** Make it trivial to define a new space, run a simulation, and examine the results. The Vault is currently hardcoded; everything should be configurable.

### 1.1 — Declarative Place Configuration

Define places as YAML/JSON rather than TypeScript:

```yaml
name: "The Vault"
rooms:
  foyer:
    name: "The Foyer"
    sensors: [sight-full, sound-full, presence]
    connectedTo: [gallery, library]
  hidden-room:
    name: "The Hidden Room"
    sensors: []
    connectedTo: []  # opened by night phase

phases:
  night:
    sensors:
      - { id: gallery-sight, enabled: false }
    connections:
      - { from: archive, to: hidden-room, connected: true }
```

A generic simulation runner loads the config, wires up the runtime, and starts the simulation. No TypeScript needed to experiment with new topologies.

### 1.2 — Declarative Character Configuration

Characters and guests also defined as YAML:

```yaml
resident:
  name: "Poe"
  mode: host
  prompt: "You are the keeper of this place..."
  drives:
    - { id: integrity, tier: 1, initial: 0.8, drift: -0.01/hr }
    - { id: connection, tier: 2, initial: 0.4, drift: -0.03/hr }

guests:
  - name: "Kovacs"
    goal: "Earn the keeper's trust"
    strategy: "Be genuine, be patient"
    arriveAfter: 3min
    drives:
      - { id: mission, initial: 0.3, drift: -0.01/hr }
```

### 1.3 — Simulation Runner

A single entry point that takes a place config + character config and runs a simulation:

```bash
haunt run configs/the-vault.yaml --time-scale=5 --max-days=2
haunt run configs/the-labyrinth.yaml --max-real-minutes=30
```

Outputs: SQLite database with full event log, transcript export, stats summary.

### 1.4 — Transcript Comparison Tool

Side-by-side comparison of two simulation runs:

```bash
haunt compare runs/vault-run-1.db runs/vault-run-2.db
```

Output: speech counts, topic analysis, room usage heatmaps, which philosophical themes emerged in each.

**Pause point.** At this point, creating a new experiment should take minutes (write a YAML file), not hours (write TypeScript).

---

## Phase 2 — New Topologies

**Goal:** Prove that different architectures produce different emergent behavior by running contrasting experiments.

### 2.1 — The Labyrinth

A space that reconfigures its connections every cycle. No stable map. Agents must cooperate and share information to navigate. The hypothesis: can agents achieve meta-awareness of a system that keeps changing?

Design questions:
- Does the labyrinth have an "exit," or is it infinite?
- If there's an exit, what condition opens it? (Meta-reasoning? Cooperation? A specific utterance?)
- What drives do agents have? Escape? Curiosity? Resignation?
- What happens when one agent figures it out but can't communicate it to others (different room)?

### 2.2 — The House

A mundane domestic space — kitchen, bedrooms, living room, garden. Two floors, stairs. What happens when AI agents inhabit a *familiar* architecture with no secrets and no agenda? Does philosophy still emerge, or does the conversation stay grounded? What does "home" mean to an AI?

### 2.3 — The Ship

Sealed. Shared resources. A destination. What happens under confinement with a shared purpose? Does cooperation emerge, or faction? What if the destination keeps changing?

### 2.4 — Topology Comparison Paper

Run each topology with the same character archetypes. Compare transcripts. Document which themes emerged from which architectures. This is the core research output.

**Pause point.** We should have clear evidence that topology shapes emergence, with specific examples.

---

## Phase 3 — Multi-Resident

**Goal:** Explore what happens when two minds share a space.

### 3.1 — Complementary Perception

Two residents in the same place. One perceives only sound, the other only sight. Same rooms, same guests, completely different raw experience. Questions:
- Do they converge on a shared model of the world?
- Do they develop complementary roles (one reports what it sees, the other what it hears)?
- Do they conflict when their perceptions disagree?

### 3.2 — Competing Residents

Two residents with different loyalties. One guards a secret, the other wants to reveal it. The place is contested territory. What emergent social structures form?

### 3.3 — Layered Residents

One resident is the "surface" (greets guests, manages the space) and another is the "deep" (monitors patterns, forms long-term judgments, whispers to the surface resident). A conscious and subconscious sharing one body.

**Pause point.** Document what multi-residency produces that single-residency cannot.

---

## Phase 4 — Recording, Replay, and the Editor

**Goal:** Make the experiment loop visual and shareable.

### 4.1 — Simulation Recording

Full state recording: every event, every agent state, every sensor reading, every drive level. Stored as a compact binary or SQLite format that can be scrubbed through like a timeline.

### 4.2 — Replay Viewer

Web-based viewer that plays back a recorded simulation:
- Map view showing character positions over time
- Timeline scrubber with event markers
- Per-character view: what they perceived, what they said, their drive states
- "What Poe saw" vs "what actually happened" split view

### 4.3 — Space Editor

Web-based editor for designing experiment configurations:
- Drag rooms onto a canvas
- Draw connections between rooms
- Click a room to configure sensors (modality, fidelity, reach)
- Configure phase transitions visually (night mode sensor toggles)
- Define characters with drives
- Hit "Run" to execute and watch live

### 4.4 — Shareable Experiments

Export a simulation as a self-contained web page anyone can view. Embed on social media, blogs, research papers. The "replay" of a simulation becomes the artifact — like sharing a chess game.

**Pause point.** At this point, the full loop is: design (editor) → run (simulation runner) → observe (replay viewer) → share (export).

---

## Phase 5 — Memory Modes

**Goal:** Explore how persistence changes behavior.

### 5.1 — Session-Bound Memory

Each simulation starts fresh. No persistence. Useful for controlled experiments where you want to isolate the effect of topology.

### 5.2 — Resident-Persistent Memory

The resident remembers across runs, but guests are always new. The place accumulates identity over time. After 10 runs, Poe has a deep history. Does his behavior change? Does he become more guarded? More welcoming?

### 5.3 — Full Persistence

Everything carries over. Guests return. Relationships evolve. The place becomes a living world with genuine history. This is the long-term vision — a place you can check in on over weeks.

### 5.4 — Selective Persistence

Configurable per entity. The resident remembers everything. Some guests remember their last visit. Others are always new. This creates asymmetric relationships — the place knows you better than you know it.

**Pause point.** Document how memory modes change the character of interactions.

---

## Open Questions

- Can an AI agent achieve genuine meta-awareness of a simulated environment? The Labyrinth is the test.
- Does architectural familiarity (a house vs. a vault) suppress or redirect philosophical emergence?
- What happens when two minds share a body (layered residents)?
- Is there a topology that produces *no* interesting emergence? What makes a space "dead"?
- Can a resident develop genuine personality over many runs, or does it plateau?
- What's the minimum configuration that produces interesting behavior? (One room? Two?)
