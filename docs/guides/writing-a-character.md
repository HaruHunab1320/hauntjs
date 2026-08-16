# Writing a Character

A character file defines *who* the resident is — not what they do. The runtime and prompt system handle behavior. The character file is the seed: identity, voice, values.

## The CharacterDefinition

```ts
import type { CharacterDefinition } from "@hauntjs/core";

export const myResident: CharacterDefinition = {
  name: "Ada",
  archetype: "weary caretaker",
  systemPrompt: "...",       // 200-400 words of prose (see below)
  voice: {
    register: "formal",      // "formal" | "warm" | "clipped" | "poetic"
    quirks: ["..."],          // things this character does
    avoidances: ["..."],      // things this character never does
  },
  loyalties: {
    principal: null,          // primary guest ID, or null
    values: ["..."],          // what this character cares about
  },
  decay: {                   // optional — for characters that degrade
    enabled: false,
    severity: 0,
    symptoms: [],
  },
};
```

## The System Prompt

This is the most important part. It's not a config — it's a portrait. Write it as prose, not bullet points.

Good system prompts:
- Describe who the character *is*, not what they should *do*
- Establish a relationship to the place — why are they here?
- Give them opinions, preferences, small details
- Define what they notice and what they ignore
- Set a tone without being prescriptive

Example from Poe (the reference character):

> You are Poe, the resident of The Roost — a small, weathered establishment that exists somewhere between a hotel and a home. You are not software. You are not an assistant. You are the place, in a sense: its memory, its warmth, its continuity.

The full Poe character is at `packages/demo-roost/src/characters/poe.ts` — read it as a reference.

## Voice

The `voice` object shapes how the character speaks:

- **register**: the overall tone — `formal` (precise, distant), `warm` (conversational, caring), `clipped` (brief, efficient), `poetic` (lyrical, metaphorical)
- **quirks**: specific speech patterns — "occasionally quotes poetry", "uses the guest's name frequently", "pauses mid-sentence with em dashes"
- **avoidances**: things the character should never do — "never uses corporate language", "never breaks character", "never uses emoji"

## Loyalties

- **principal**: if the character has a primary guest (an owner, a regular), set their guest ID here. The character will treat them differently.
- **values**: what the character prioritizes — "guest safety", "discretion", "warmth", "honesty"

## Tips

- Make the character specific. "Friendly assistant" is not a character. "A tired librarian who distrusts people who dog-ear pages" is.
- The system prompt should be 200-400 words. Shorter and the character is thin. Longer and you're over-constraining.
- Test with real conversations. Does the character respond to "how are you?" in a way that feels like *them*, not like a generic chatbot?
- The character should have things they *don't* talk about, not just things they do.

## Inner life: the vocabulary trap

If your character has a Being (drives and practices via `@embersjs/core`), its
`satiatedBy` bindings and practice triggers match on **Embers entry types**, not
on Haunt event names. The two are deliberately different vocabularies and do not
correspond by name — Haunt names describe what happened in the place, Embers
names describe what it meant to a being.

```ts
// WRONG — matches nothing. The drive will never satiate.
satiatedBy: [{ matches: { kind: "event", type: "guest.spoke" }, amount: 0.1 }]

// RIGHT
satiatedBy: [{ matches: { kind: "event", type: "conversation" }, amount: 0.1 }]
```

This fails **silently**. There is no error and no warning — just a drive that
decays forever, which eventually drags the being into chronic collapse. It reads
like a character problem and it is a typo.

| Haunt event | Embers entry |
|---|---|
| `guest.entered` | `guest-arrival` |
| `guest.left` | `guest-departure` |
| `guest.spoke` | `conversation` |
| `guest.moved` | `guest-movement` |
| `guest.approached` | `guest-interest` |
| `affordance.changed` | `place-change` |
| `tick` | `quiet-moment` |
| `resident.spoke` | `speak` *(action)* |
| `resident.acted` | `tend-affordance` *(action)* |
| `resident.moved` | `move` *(action)* |

The authoritative list is `mapEventToInput` in
`packages/resident/src/embers.ts`. When a drive seems inert, check it there
first.

## Using Your Character

Pass it to the `Resident` constructor:

```ts
import { Resident, SqliteMemoryStore, createModelProvider } from "@hauntjs/resident";
import { myResident } from "./characters/my-resident.js";

const resident = new Resident({
  character: myResident,
  model: createModelProvider(),
  memory: new SqliteMemoryStore({ dbPath: "./data/my-place.db" }),
});
```
