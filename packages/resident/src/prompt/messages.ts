import type {
  GuestId,
  GuestMemory,
  Perception,
  PlaceMemoryEntry,
  PresenceEvent,
  RuntimeContext,
} from "@hauntjs/core";
import type { ChatMessage } from "../model/types.js";

/** Builds the message array for the model call. */
export function buildMessages(
  context: RuntimeContext,
  currentEvent: PresenceEvent,
  currentPerceptions: Perception[],
  placeMemories: PlaceMemoryEntry[],
  guestMemories: Map<GuestId, GuestMemory>,
): ChatMessage[] {
  const messages: ChatMessage[] = [];

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

  if (currentEvent.type === "guest.spoke") {
    const speechPerception = currentPerceptions.find(
      (p) => p.modality === "sound" || p.modality === "text",
    );
    if (speechPerception) {
      messages.push({
        role: "user",
        content: `[Perception] ${speechPerception.content}${speechPerception.confidence < 0.8 ? ` (confidence: ${(speechPerception.confidence * 100).toFixed(0)}%)` : ""}\n\n[Respond naturally. Use the \`speak\` tool to reply, the \`act\` tool to interact with objects, the \`move\` tool to go somewhere, or \`wait\` if silence is more appropriate. If the guest is agreeing to something you offered, follow through with action — don't just acknowledge.]`,
      });
    } else {
      const guest = context.place.guests.get(currentEvent.guestId);
      const name = guest?.name ?? currentEvent.guestId;
      messages.push({
        role: "user",
        content: `${name}: ${currentEvent.text}\n\n[Respond naturally.]`,
      });
    }
  } else if (currentPerceptions.length > 0) {
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
    const desc = describeEvent(currentEvent, context);
    if (desc) {
      messages.push({
        role: "user",
        content: `[${desc}]\n\n[Decide what to do. Use one of the available tools, or use \`wait\` if no action is warranted.]`,
      });
    }
  }

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

  const relevantPlaceMemories = placeMemories.slice(0, 5);
  if (relevantPlaceMemories.length > 0) {
    parts.push("Place notes:");
    for (const mem of relevantPlaceMemories) {
      parts.push(`  - ${mem.content} [${mem.tags.join(", ")}]`);
    }
  }

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

export function describeEvent(event: PresenceEvent, context?: RuntimeContext): string | null {
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
      return null;
    case "resident.moved":
      return null;
    case "resident.acted":
      return null;
    case "tick":
      return "A quiet moment.";
  }
}
