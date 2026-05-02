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
    .filter((g) => g.currentRoom === currentRoom && (g.id as string) !== `guest-${config.id}`)
    .map((g) => g.name);

  const residentHere = "Poe"; // The resident is always "present" in Host mode

  const innerState = situation
    ? `\n### Your inner state\n${situation.felt}\nOrientation: ${situation.orientation}`
    : "";

  // Build a summary of topics already covered to prevent repetition
  const topicSummary = buildTopicSummary(config, workingMemory);

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
- Choose ONE action per turn.
- IMPORTANT: Do not repeat yourself. Review the conversation history carefully. If you already introduced yourself, asked a question, or made a point, do NOT say it again — move the conversation forward with new observations or questions.
- If the conversation has been going in circles on the same topic, change the subject, explore a different room, or simply wait and observe. Stale conversations are a sign you should move on.
- Keep your responses concise. A few sentences is usually enough. Long monologues slow the conversation.
${topicSummary}`;

  // Build message history from working memory — use full history for context

  const messages: ChatMessage[] = [];
  const recentEvents = workingMemory.slice(-60);

  for (const event of recentEvents) {
    if (event.type === "guest.spoke") {
      const guest = place.guests.get(event.guestId);
      const name = guest?.name ?? event.guestId;
      if ((event.guestId as string) === `guest-${config.id}`) {
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
  };
}

/**
 * Builds a brief summary of what the agent has already said/asked,
 * so the model knows not to repeat those topics.
 */
function buildTopicSummary(config: GuestAgentConfig, workingMemory: PresenceEvent[]): string {
  const myId = `guest-${config.id}`;
  const myMessages = workingMemory
    .filter((e) => e.type === "guest.spoke" && (e.guestId as string) === myId)
    .map((e) => (e as { text: string }).text);

  if (myMessages.length === 0) return "";

  // Count how many times we've spoken — signal conversation length
  const msgCount = myMessages.length;

  // Extract key phrases from recent messages to detect repetition
  const recentSummaries = myMessages.slice(-10).map((text) => {
    // Take the first sentence as a rough topic indicator
    const firstSentence = text.split(/[.!?]/)[0]?.trim() ?? "";
    return firstSentence.length > 80 ? firstSentence.slice(0, 80) + "..." : firstSentence;
  });

  let summary = `\n### Conversation awareness\nYou have spoken ${msgCount} times in this conversation.`;

  if (msgCount > 5) {
    summary += ` The conversation has been going for a while — avoid rehashing old ground.`;
  }
  if (msgCount > 15) {
    summary += ` You have been talking for a LONG time. Consider moving to a different room, changing the subject entirely, or waiting silently. Repetitive conversations are boring — do something new.`;
  }

  summary += `\nYour recent statements (DO NOT repeat these):\n`;
  for (const s of recentSummaries) {
    summary += `- "${s}"\n`;
  }

  return summary;
}
