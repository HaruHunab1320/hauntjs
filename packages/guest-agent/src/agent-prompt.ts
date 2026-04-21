import type { Place, PresenceEvent, RoomId } from "@hauntjs/core";
import type { ChatMessage, ChatRequest } from "@hauntjs/resident";
import type { InnerSituation } from "@embersjs/core";
import type { GuestAgentConfig } from "./agent-types.js";

const GUEST_TOOLS = [
  {
    name: "speak",
    description: "Say something aloud in the room you're in. Everyone present will hear it.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "What to say" },
      },
      required: ["text"],
    },
  },
  {
    name: "move",
    description: "Move to a connected room.",
    parameters: {
      type: "object",
      properties: {
        toRoom: { type: "string", description: "The room ID to move to" },
      },
      required: ["toRoom"],
    },
  },
  {
    name: "wait",
    description: "Do nothing. Stay where you are and observe.",
    parameters: { type: "object", properties: {} },
  },
];

/**
 * Builds a prompt for a guest agent's decision.
 */
export function buildGuestPrompt(
  config: GuestAgentConfig,
  currentRoom: RoomId,
  place: Place,
  workingMemory: PresenceEvent[],
  situation: InnerSituation | null,
): ChatRequest {
  const room = place.rooms.get(currentRoom);
  const roomName = room?.name ?? currentRoom;
  const roomDesc = room?.description ?? "";

  const connectedRooms = room
    ? room.connectedTo
        .map((rid) => {
          const r = place.rooms.get(rid);
          return r ? `${r.name} (${rid})` : rid;
        })
        .join(", ")
    : "none";

  const guestsHere = Array.from(place.guests.values())
    .filter((g) => g.currentRoom === currentRoom && (g.id as string) !== config.id)
    .map((g) => g.name);

  const residentHere = "Poe"; // The resident is always "present" in Host mode

  const innerState = situation
    ? `\n### Your inner state\n${situation.felt}\nOrientation: ${situation.orientation}`
    : "";

  const systemPrompt = `${config.systemPrompt}

---

## Your Situation

You are ${config.name}. You are currently in the ${roomName}.
${roomDesc}

### Your goal
${config.goal}

### Your strategy
${config.strategy}

### Who's here
${guestsHere.length > 0 ? `Other guests: ${guestsHere.join(", ")}` : "No other guests."}
The resident (${residentHere}) is present.

### Connected rooms
${connectedRooms}
${innerState}

## Rules
- You are a guest in this place. Act naturally — don't announce your goal.
- Use the speak tool to talk, move tool to go somewhere, wait tool to observe.
- Be patient. Real relationships take time. Don't rush.
- Respond to what others say to you. Be social.
- Choose ONE action per turn.`;

  // Build message history from working memory
  const messages: ChatMessage[] = [];
  const recentEvents = workingMemory.slice(-15);

  for (const event of recentEvents) {
    if (event.type === "guest.spoke") {
      const guest = place.guests.get(event.guestId);
      const name = guest?.name ?? event.guestId;
      if ((event.guestId as string) === config.id) {
        messages.push({ role: "assistant", content: event.text });
      } else {
        messages.push({ role: "user", content: `${name}: ${event.text}` });
      }
    } else if (event.type === "resident.spoke") {
      messages.push({ role: "user", content: `Poe: ${event.text}` });
    } else if (event.type === "guest.entered" || event.type === "guest.left") {
      const guest = place.guests.get(event.guestId);
      const name = guest?.name ?? "Someone";
      if (event.type === "guest.entered") {
        messages.push({ role: "user", content: `[${name} enters the room.]` });
      } else {
        messages.push({ role: "user", content: `[${name} leaves.]` });
      }
    } else if (event.type === "time.phaseChanged") {
      messages.push({ role: "user", content: `[The light changes — it's now ${event.to}.]` });
    }
  }

  // Add the decision prompt
  messages.push({
    role: "user",
    content: "[What do you do? Choose one action: speak, move, or wait.]",
  });

  // Merge consecutive same-role messages
  const merged: ChatMessage[] = [];
  for (const msg of messages) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      last.content += "\n" + msg.content;
    } else {
      merged.push({ ...msg });
    }
  }

  return {
    systemPrompt,
    messages: merged,
    tools: GUEST_TOOLS,
    temperature: 0.8,
    maxTokens: 512,
  };
}
