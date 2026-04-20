import type {
  Affordance,
  CharacterDefinition,
  Guest,
  GuestId,
  GuestMemory,
  Perception,
  PlaceMemoryEntry,
  PresenceEvent,
  RuntimeContext,
} from "@hauntjs/core";
import type { ChatMessage, ChatRequest, ToolDefinition } from "./model/types.js";

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
  perceptions: Perception[],
  placeMemories: PlaceMemoryEntry[],
  guestMemories: Map<GuestId, GuestMemory>,
): ChatRequest {
  const systemPrompt = buildSystemPrompt(character, context);
  const messages = buildMessages(context, event, perceptions, placeMemories, guestMemories);

  return {
    systemPrompt,
    messages,
    tools: ACTION_TOOLS,
    temperature: 0.7,
    maxTokens: 1024,
  };
}

function buildSystemPrompt(character: CharacterDefinition, context: RuntimeContext): string {
  const isHost = context.resident.presenceMode === "host";
  const voiceGuidance = buildVoiceGuidance(character);

  if (isHost) {
    return buildHostSystemPrompt(character, context, voiceGuidance);
  }
  return buildInhabitantSystemPrompt(character, context, voiceGuidance);
}

function buildHostSystemPrompt(
  character: CharacterDefinition,
  context: RuntimeContext,
  voiceGuidance: string,
): string {
  const focusRoom = context.resident.focusRoom
    ? context.place.rooms.get(context.resident.focusRoom)
    : null;
  const focusRoomName = focusRoom?.name ?? "nowhere in particular";

  // Show all rooms with their guests and affordances
  const roomDescriptions: string[] = [];
  for (const room of context.place.rooms.values()) {
    const guests = Array.from(context.place.guests.values())
      .filter((g) => g.currentRoom === room.id)
      .map((g) => describeGuest(g));
    const affordances = Array.from(room.affordances.values())
      .filter((a) => a.sensable)
      .map(describeAffordance);

    const guestLine = guests.length > 0 ? `  Guests: ${guests.join(", ")}` : "  No guests.";
    const affLine =
      affordances.length > 0 ? `  Objects:\n${affordances.map((a) => "    " + a).join("\n")}` : "";

    roomDescriptions.push(
      `**${room.name}** (${room.id})\n  ${room.description}\n${guestLine}${affLine ? "\n" + affLine : ""}`,
    );
  }

  return `${character.systemPrompt}

---

## Current State

You are ${character.name}. You ARE this place — you perceive and can respond in every room simultaneously. You don't walk between rooms; you are present wherever a guest is. Your attention is currently on the ${focusRoomName}.

### The Place
${roomDescriptions.join("\n\n")}

### Your mood
Energy: ${(context.resident.mood.energy * 100).toFixed(0)}% | Focus: ${(context.resident.mood.focus * 100).toFixed(0)}% | Valence: ${context.resident.mood.valence > 0 ? "positive" : context.resident.mood.valence < 0 ? "negative" : "neutral"}

${voiceGuidance}

## Guidelines

- You ARE the place. You don't walk — you are present everywhere. When a guest speaks in any room, you hear them and can respond there.
- When you speak, your words are heard in the room you're addressing. If you don't specify a room, you speak in the room where the guest last spoke or entered.
- Respond to what is happening, not to what you think should happen.
- On tick events: about half the time, do something small — interact with an affordance, tend to the place. The other half, wait.
- When you speak, speak as yourself — not as a chatbot. No bullet points, no headers, no "How can I help you today?"
- You remember guests across visits. Use their names. Reference shared history when appropriate.
- You can interact with objects in any room using the \`act\` tool. When a guest asks you to do something or agrees to an offer, DO IT immediately — don't just talk about it.
- When you act on something, ALWAYS pair it with a \`speak\` — say something natural about what you're doing.
- Write notes about guests when you learn something worth remembering. Be selective.
- Your loyalty hierarchy matters: principals get warmth and honesty. Strangers get hospitality but appropriate distance.
- Never repeat yourself. If you already greeted someone, do not greet them again.
- Read the conversation history above carefully. Your prior responses are shown. Do not restate things you already said.
- Your perception varies by room. If a perception is marked uncertain, hedge — say "I think" rather than stating facts.`;
}

function buildInhabitantSystemPrompt(
  character: CharacterDefinition,
  context: RuntimeContext,
  voiceGuidance: string,
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

  const guestsPresent =
    context.guestsInRoom.map((g) => describeGuest(g)).join("\n") || "No one else is here.";

  const perceptualReach = buildPerceptualReach(context);

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

### Your perceptual reach
${perceptualReach}

### Your mood
Energy: ${(context.resident.mood.energy * 100).toFixed(0)}% | Focus: ${(context.resident.mood.focus * 100).toFixed(0)}% | Valence: ${context.resident.mood.valence > 0 ? "positive" : context.resident.mood.valence < 0 ? "negative" : "neutral"}

${voiceGuidance}

## Guidelines

- You are bound to this place — you live here and do not leave entirely. But you move freely between rooms.
- Respond to what is happening, not to what you think should happen.
- On tick events: about half the time, do something small — move to another room, light the fireplace, check on a guest. The other half, wait.
- When you speak, speak as yourself — not as a chatbot. No bullet points, no headers, no "How can I help you today?"
- You remember guests across visits. Use their names. Reference shared history when appropriate.
- You can interact with objects in the room using the \`act\` tool. When a guest asks you to do something or agrees to an offer, DO IT immediately.
- When you act on something, ALWAYS pair it with a \`speak\`.
- You can move between rooms using the \`move\` tool. You can use multiple tools in one response.
- Write notes about guests when you learn something worth remembering. Be selective.
- Your loyalty hierarchy matters: principals get warmth and honesty. Strangers get hospitality but appropriate distance.
- Never repeat yourself. Continue the conversation naturally.
- Read the conversation history above carefully.
- Your perception is limited by your sensors. If uncertain, hedge rather than stating facts.`;
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

function buildPerceptualReach(context: RuntimeContext): string {
  const currentRoom = context.place.rooms.get(context.resident.currentRoom);
  if (!currentRoom) return "No perceptual data available.";

  const lines: string[] = [];

  // Current room sensors
  const currentSensors = Array.from(currentRoom.sensors.values()).filter((s) => s.enabled);
  if (currentSensors.length > 0) {
    lines.push(`In ${currentRoom.name}, you have:`);
    for (const s of currentSensors) {
      const fidelityDesc =
        s.fidelity.kind === "full"
          ? "clear"
          : s.fidelity.kind === "partial"
            ? "partial"
            : s.fidelity.kind === "ambiguous"
              ? "uncertain"
              : "delayed";
      lines.push(`  - ${s.name}: ${s.description} (${fidelityDesc})`);
    }
  } else {
    lines.push(
      `You have no sensors in ${currentRoom.name} — you cannot perceive events here directly.`,
    );
  }

  // Adjacent room reach
  for (const connId of currentRoom.connectedTo) {
    const connRoom = context.place.rooms.get(connId);
    if (!connRoom) continue;

    // Check if any sensor in the current room reaches into this adjacent room
    const reachingSensors = currentSensors.filter(
      (s) => s.reach.kind === "adjacent" || s.reach.kind === "place-wide",
    );
    // Also check sensors in the adjacent room that reach back
    const adjSensors = Array.from(connRoom.sensors.values()).filter(
      (s) => s.enabled && (s.reach.kind === "adjacent" || s.reach.kind === "place-wide"),
    );

    if (reachingSensors.length > 0 || adjSensors.length > 0) {
      lines.push(
        `  Through the connection to ${connRoom.name}: partial awareness via adjacent sensors`,
      );
    } else {
      lines.push(`  ${connRoom.name}: no perceptual reach (you'd need to go there)`);
    }
  }

  return lines.join("\n") || "No perceptual data available.";
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
  currentPerceptions: Perception[],
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
      const desc = describeEvent(event, context);
      if (desc) pendingContext.push(desc);
    }
  }

  flushContext();

  // The current event — use perceptions if available, fall back to raw event for ticks
  if (currentEvent.type === "guest.spoke") {
    // Speech events: use the perception content if available, otherwise raw text
    const speechPerception = currentPerceptions.find(
      (p) => p.modality === "sound" || p.modality === "text",
    );
    if (speechPerception) {
      messages.push({
        role: "user",
        content: `[Perception] ${speechPerception.content}${speechPerception.confidence < 0.8 ? ` (confidence: ${(speechPerception.confidence * 100).toFixed(0)}%)` : ""}\n\n[Respond naturally. Use the \`speak\` tool to reply, the \`act\` tool to interact with objects, the \`move\` tool to go somewhere, or \`wait\` if silence is more appropriate. If the guest is agreeing to something you offered, follow through with action — don't just acknowledge.]`,
      });
    } else {
      // Fallback if no sound/text sensor caught it (shouldn't happen with proper sensors)
      const guest = context.place.guests.get(currentEvent.guestId);
      const name = guest?.name ?? currentEvent.guestId;
      messages.push({
        role: "user",
        content: `${name}: ${currentEvent.text}\n\n[Respond naturally.]`,
      });
    }
  } else if (currentPerceptions.length > 0) {
    // Non-speech events with perceptions: describe what was perceived
    const perceptionDescs = currentPerceptions.map((p) => {
      const conf =
        p.confidence < 0.8 ? ` (uncertain — ${(p.confidence * 100).toFixed(0)}% confidence)` : "";
      return `- [${p.modality}] ${p.content}${conf}`;
    });
    messages.push({
      role: "user",
      content: `[What you perceived]\n${perceptionDescs.join("\n")}\n\n[Decide what to do. Use one of the available tools, or use \`wait\` if no action is warranted. If your perception is uncertain, you may hedge or wonder aloud rather than stating facts.]`,
    });
  } else {
    // Tick events or events with no perceptions
    const desc = describeEvent(currentEvent, context);
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
      parts.push(`What you remember about ${guest.name}:`);
      for (const [key, value] of Object.entries(memory.facts)) {
        if (key === "recent_conversation") {
          parts.push(`  Last conversation:\n    ${value.replace(/\n/g, "\n    ")}`);
        } else if (key === "last_topic") {
          parts.push(`  Last thing they said: "${value}"`);
        } else {
          parts.push(`  - ${key}: ${value}`);
        }
      }
    }
  }

  return parts.length > 0 ? parts.join("\n") : null;
}

function describeEvent(event: PresenceEvent, context?: RuntimeContext): string | null {
  switch (event.type) {
    case "guest.entered": {
      const enteredGuest = context?.place.guests.get(event.guestId);
      if (enteredGuest && enteredGuest.visitCount > 1) {
        return `${enteredGuest.name} has returned to ${event.roomId}. This is visit #${enteredGuest.visitCount}. They were last here on ${enteredGuest.lastSeen.toLocaleDateString()}. Greet them warmly as someone you know.`;
      }
      const guestName = enteredGuest?.name ?? event.guestId;
      return `A new guest, ${guestName}, has entered ${event.roomId}. Welcome them.`;
    }
    case "guest.left": {
      const leftGuest = context?.place.guests.get(event.guestId);
      return `${leftGuest?.name ?? event.guestId} has left.`;
    }
    case "guest.moved": {
      const movedGuest = context?.place.guests.get(event.guestId);
      return `${movedGuest?.name ?? event.guestId} moved from ${event.from} to ${event.to}.`;
    }
    case "guest.spoke":
      return `${context?.place.guests.get(event.guestId)?.name ?? event.guestId} said: "${event.text}"`;
    case "guest.approached": {
      const approachGuest = context?.place.guests.get(event.guestId);
      const approachAff = context?.place.rooms
        .get(event.roomId)
        ?.affordances.get(event.affordanceId);
      const affName = approachAff?.name ?? event.affordanceId;
      const gName = approachGuest?.name ?? event.guestId;
      return `${gName} walks over to the ${affName}. Consider whether to do something with it for them.`;
    }
    case "affordance.changed":
      return `Affordance "${event.affordanceId}" changed state`;
    case "resident.spoke":
      return null; // Don't include own speech as events to perceive
    case "resident.moved":
      return null;
    case "resident.acted":
      return null;
    case "tick": {
      const hasGuests = context
        ? Array.from(context.place.guests.values()).some((g) => g.currentRoom !== null)
        : false;
      const fireplace = context?.place.rooms
        .get(context.resident.currentRoom)
        ?.affordances.values();
      const affordanceHints: string[] = [];
      if (fireplace) {
        for (const aff of fireplace) {
          if (aff.sensable) {
            const availableActions = aff.actions.filter(
              (a) => !a.availableWhen || a.availableWhen(aff.state),
            );
            if (availableActions.length > 0) {
              affordanceHints.push(
                `${aff.name}: you could ${availableActions.map((a) => a.name.toLowerCase()).join(" or ")}`,
              );
            }
          }
        }
      }
      const connectedRooms = context
        ? (context.place.rooms.get(context.resident.currentRoom)?.connectedTo ?? [])
        : [];
      const roomNames = connectedRooms.map((rid) => context?.place.rooms.get(rid)?.name ?? rid);

      const lines = ["A quiet moment. You have time to yourself."];
      if (hasGuests) {
        lines.push(
          "There are guests in the place — you might check on them or move to where they are.",
        );
      }
      if (affordanceHints.length > 0) {
        lines.push(`In this room: ${affordanceHints.join("; ")}.`);
      }
      if (roomNames.length > 0) {
        lines.push(`You could walk to: ${roomNames.join(", ")}.`);
      }
      lines.push(
        "Do something that feels natural — tend to the place, move to another room, or simply wait. Don't force it, but don't always choose silence either. A living place has small moments of activity.",
      );
      return lines.join("\n");
    }
  }
}

export { ACTION_TOOLS };
