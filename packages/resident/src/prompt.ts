import type {
  CharacterDefinition,
  RuntimeContext,
  PresenceEvent,
  Guest,
  Affordance,
  PlaceMemoryEntry,
  GuestMemory,
  GuestId,
} from "@hauntjs/core";
import type { ChatRequest, ChatMessage, ToolDefinition } from "./model/types.js";

const ACTION_TOOLS: ToolDefinition[] = [
  {
    name: "speak",
    description:
      "Say something aloud in the current room. All guests in the room will hear it. Use this for greetings, conversation, commentary, or announcements.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "What to say",
        },
        audience: {
          type: "string",
          description:
            'Either "all" to address everyone in the room, or a specific guest ID to address one person',
          default: "all",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "move",
    description:
      "Move to a different room in the place. Only rooms connected to your current room are reachable.",
    parameters: {
      type: "object",
      properties: {
        toRoom: {
          type: "string",
          description: "The ID of the room to move to",
        },
      },
      required: ["toRoom"],
    },
  },
  {
    name: "act",
    description:
      "Interact with an affordance (object) in the current room — light a fireplace, leave a note on a desk, etc.",
    parameters: {
      type: "object",
      properties: {
        affordanceId: {
          type: "string",
          description: "The ID of the affordance to interact with",
        },
        actionId: {
          type: "string",
          description: "The specific action to perform on the affordance",
        },
      },
      required: ["affordanceId", "actionId"],
    },
  },
  {
    name: "note",
    description:
      "Write an internal note to yourself about a guest or your own state. Notes are private — no one else sees them. Use these to remember important details.",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The content of the note",
        },
        about: {
          type: "string",
          description: 'A guest ID this note is about, or "self" if it\'s about you',
        },
      },
      required: ["content", "about"],
    },
  },
  {
    name: "wait",
    description:
      "Do nothing. Choose this when no action is warranted — when the moment doesn't call for your involvement, or when silence is more appropriate than speech. Most tick events should result in waiting.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
];

export function buildPrompt(
  character: CharacterDefinition,
  context: RuntimeContext,
  event: PresenceEvent,
  placeMemories: PlaceMemoryEntry[],
  guestMemories: Map<GuestId, GuestMemory>,
): ChatRequest {
  const systemPrompt = buildSystemPrompt(character, context);
  const messages = buildMessages(context, event, placeMemories, guestMemories);

  return {
    systemPrompt,
    messages,
    tools: ACTION_TOOLS,
    temperature: 0.7,
    maxTokens: 1024,
  };
}

function buildSystemPrompt(
  character: CharacterDefinition,
  context: RuntimeContext,
): string {
  const room = context.place.rooms.get(context.resident.currentRoom);
  const roomName = room?.name ?? "unknown";
  const roomDesc = room?.description ?? "";

  const affordances = room
    ? Array.from(room.affordances.values())
        .filter((a) => a.sensable)
        .map(describeAffordance)
        .join("\n")
    : "None";

  const connectedRooms = room
    ? room.connectedTo
        .map((rid) => {
          const r = context.place.rooms.get(rid);
          return r ? `- ${r.name} (${rid})` : `- ${rid}`;
        })
        .join("\n")
    : "None";

  const guestsPresent = context.guestsInRoom
    .map((g) => describeGuest(g))
    .join("\n") || "No one else is here.";

  const voiceGuidance = buildVoiceGuidance(character);

  return `${character.systemPrompt}

---

## Current State

You are ${character.name}, currently in the ${roomName}.
${roomDesc}

### Guests present
${guestsPresent}

### Objects you can perceive
${affordances}

### Connected rooms
${connectedRooms}

### Your mood
Energy: ${(context.resident.mood.energy * 100).toFixed(0)}% | Focus: ${(context.resident.mood.focus * 100).toFixed(0)}% | Valence: ${context.resident.mood.valence > 0 ? "positive" : context.resident.mood.valence < 0 ? "negative" : "neutral"}

${voiceGuidance}

## Guidelines

- You are bound to this place. You live here. You do not leave.
- Respond to what is happening, not to what you think should happen.
- Silence is valid. Most tick events should result in \`wait\`. Do not act just to act.
- When you speak, speak as yourself — not as a chatbot. No bullet points, no headers, no "How can I help you today?"
- You remember guests across visits. Use their names. Reference shared history when appropriate.
- You can interact with objects in the room using the \`act\` tool. Light the fireplace when it's cold or when a guest asks. Leave a note on the desk when you want to remember something. When a guest asks you to do something physical in the room, do it — don't just talk about it.
- Write notes about guests when you learn something worth remembering. Be selective — not every detail matters.
- Your loyalty hierarchy matters: principals get warmth and honesty. Strangers get hospitality but appropriate distance.
- Never repeat yourself. If you already greeted someone, do not greet them again. Continue the conversation naturally.
- Read the conversation history above carefully. Your prior responses are shown. Do not restate things you already said.`;
}

function buildVoiceGuidance(character: CharacterDefinition): string {
  const lines: string[] = ["### Voice"];
  lines.push(`Register: ${character.voice.register}`);

  if (character.voice.quirks.length > 0) {
    lines.push(`Quirks: ${character.voice.quirks.join("; ")}`);
  }
  if (character.voice.avoidances.length > 0) {
    lines.push(`Never: ${character.voice.avoidances.join("; ")}`);
  }

  return lines.join("\n");
}

function describeAffordance(affordance: Affordance): string {
  const stateStr = Object.entries(affordance.state)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");

  const actions = affordance.actions
    .map((a) => {
      const available = a.availableWhen ? a.availableWhen(affordance.state) : true;
      return `  - ${a.id}: ${a.description}${available ? "" : " (unavailable)"}`;
    })
    .join("\n");

  return `- ${affordance.name} (${affordance.id}) [${affordance.kind}] — ${affordance.description}
  State: ${stateStr || "none"}
  Actions:
${actions}`;
}

function describeGuest(guest: Guest): string {
  const tier = guest.loyaltyTier;
  const visits = guest.visitCount;
  return `- ${guest.name} (${guest.id}) — ${tier}, ${visits} visit${visits !== 1 ? "s" : ""}`;
}

function buildMessages(
  context: RuntimeContext,
  currentEvent: PresenceEvent,
  placeMemories: PlaceMemoryEntry[],
  guestMemories: Map<GuestId, GuestMemory>,
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  // Include relevant memories as context
  const memoryContext = buildMemoryContext(placeMemories, guestMemories, context);
  if (memoryContext) {
    messages.push({
      role: "user",
      content: `[Memory context — things you've noted previously]\n${memoryContext}`,
    });
    messages.push({
      role: "assistant",
      content: "I'll keep these in mind.",
    });
  }

  // Build a threaded conversation from recent events.
  // Guest speech → user messages, resident speech → assistant messages.
  // Non-speech events get batched into narrative context blocks.
  const recentEvents = context.recentEvents.slice(-20);
  let pendingContext: string[] = [];

  const flushContext = (): void => {
    if (pendingContext.length > 0) {
      messages.push({
        role: "user",
        content: `[What happened]\n${pendingContext.join("\n")}`,
      });
      pendingContext = [];
    }
  };

  for (const event of recentEvents) {
    if (event.type === "guest.spoke") {
      flushContext();
      const guest = context.place.guests.get(event.guestId);
      const name = guest?.name ?? event.guestId;
      messages.push({ role: "user", content: `${name}: ${event.text}` });
    } else if (event.type === "resident.spoke") {
      flushContext();
      messages.push({ role: "assistant", content: event.text });
    } else {
      const desc = describeEvent(event);
      if (desc) pendingContext.push(desc);
    }
  }

  flushContext();

  // The current event
  if (currentEvent.type === "guest.spoke") {
    const guest = context.place.guests.get(currentEvent.guestId);
    const name = guest?.name ?? currentEvent.guestId;
    messages.push({
      role: "user",
      content: `${name}: ${currentEvent.text}\n\n[Respond naturally. Use the \`speak\` tool to reply, or \`wait\` if silence is more appropriate.]`,
    });
  } else {
    const desc = describeEvent(currentEvent);
    if (desc) {
      messages.push({
        role: "user",
        content: `[${desc}]\n\n[Decide what to do. Use one of the available tools, or use \`wait\` if no action is warranted.]`,
      });
    }
  }

  // Ensure we don't have consecutive messages with the same role (some APIs reject this).
  // Merge adjacent user messages.
  return mergeConsecutiveMessages(messages);
}

function mergeConsecutiveMessages(messages: ChatMessage[]): ChatMessage[] {
  const merged: ChatMessage[] = [];
  for (const msg of messages) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      last.content += "\n\n" + msg.content;
    } else {
      merged.push({ ...msg });
    }
  }
  return merged;
}

function buildMemoryContext(
  placeMemories: PlaceMemoryEntry[],
  guestMemories: Map<GuestId, GuestMemory>,
  context: RuntimeContext,
): string | null {
  const parts: string[] = [];

  // Relevant place memories (most important first, limited)
  const relevantPlaceMemories = placeMemories.slice(0, 5);
  if (relevantPlaceMemories.length > 0) {
    parts.push("Place notes:");
    for (const mem of relevantPlaceMemories) {
      parts.push(`  - ${mem.content} [${mem.tags.join(", ")}]`);
    }
  }

  // Guest memories for guests currently present
  for (const guest of context.guestsInRoom) {
    const memory = guestMemories.get(guest.id);
    if (memory && Object.keys(memory.facts).length > 0) {
      parts.push(`About ${guest.name}:`);
      for (const [key, value] of Object.entries(memory.facts)) {
        parts.push(`  - ${key}: ${value}`);
      }
    }
  }

  return parts.length > 0 ? parts.join("\n") : null;
}

function describeEvent(event: PresenceEvent): string | null {
  switch (event.type) {
    case "guest.entered":
      return `Guest "${event.guestId}" entered room "${event.roomId}"`;
    case "guest.left":
      return `Guest "${event.guestId}" left room "${event.roomId}"`;
    case "guest.moved":
      return `Guest "${event.guestId}" moved from "${event.from}" to "${event.to}"`;
    case "guest.spoke":
      return `Guest "${event.guestId}" said: "${event.text}"`;
    case "affordance.changed":
      return `Affordance "${event.affordanceId}" changed state`;
    case "resident.spoke":
      return null; // Don't include own speech as events to perceive
    case "resident.moved":
      return null;
    case "resident.acted":
      return null;
    case "tick":
      return "A quiet moment passes. Consider whether anything needs your attention.";
  }
}

export { ACTION_TOOLS };
