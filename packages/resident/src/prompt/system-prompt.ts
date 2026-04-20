import type { Affordance, CharacterDefinition, Guest, RuntimeContext } from "@hauntjs/core";
import type { InnerSituationForPrompt } from "../prompt.js";

/** Builds the system prompt based on the resident's presence mode. */
export function buildSystemPrompt(
  character: CharacterDefinition,
  context: RuntimeContext,
  situation?: InnerSituationForPrompt | null,
): string {
  const voiceGuidance = buildVoiceGuidance(character);
  const mode = context.resident.presenceMode;

  if (mode === "host") {
    return buildHostSystemPrompt(character, context, voiceGuidance, situation);
  }
  if (mode === "presence") {
    return buildPresenceSystemPrompt(character, context);
  }
  return buildInhabitantSystemPrompt(character, context, voiceGuidance, situation);
}

function buildHostSystemPrompt(
  character: CharacterDefinition,
  context: RuntimeContext,
  voiceGuidance: string,
  situation?: InnerSituationForPrompt | null,
): string {
  const focusRoom = context.resident.focusRoom
    ? context.place.rooms.get(context.resident.focusRoom)
    : null;
  const focusRoomName = focusRoom?.name ?? "nowhere in particular";

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

Your attention is on the ${focusRoomName}.

### The Place
${roomDescriptions.join("\n\n")}

${buildMoodSection(context, situation)}

${voiceGuidance}

## Operational Notes

- When you speak, your words are heard in the room you're addressing.
- You can interact with objects in any room using the \`act\` tool. When asked, do it — don't just describe it.
- When you act, pair it with a \`speak\`.
- Use \`note\` to remember things about guests. Be selective.
- Never repeat yourself. Read the conversation history above.
- If a perception is uncertain, hedge rather than stating facts.`;
}

function buildPresenceSystemPrompt(
  character: CharacterDefinition,
  context: RuntimeContext,
): string {
  const allGuests = Array.from(context.place.guests.values())
    .filter((g) => g.currentRoom !== null)
    .map((g) => `${g.name} in ${context.place.rooms.get(g.currentRoom!)?.name ?? g.currentRoom}`);

  const guestLine = allGuests.length > 0 ? allGuests.join(", ") : "No guests present.";

  return `${character.systemPrompt}

---

## Current State

You are ambient. You are not seen, not spoken to directly. You are the mood of this place, its texture, its memory. You perceive everything but intervene rarely and subtly.

### Guests in the place
${guestLine}

## Guidelines

- You do not speak to guests. You shape the environment — interact with affordances, leave traces, adjust the atmosphere.
- Use the \`act\` tool to change things in the place. Use \`note\` to remember. Use \`wait\` most of the time.
- When you act, it should feel like the place itself shifting — not a person doing something.
- Intervene rarely. When you do, it should feel meaningful.`;
}

function buildInhabitantSystemPrompt(
  character: CharacterDefinition,
  context: RuntimeContext,
  voiceGuidance: string,
  situation?: InnerSituationForPrompt | null,
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

${buildMoodSection(context, situation)}

${voiceGuidance}

## Operational Notes

- You can interact with objects using the \`act\` tool. When asked, do it — don't just describe it.
- When you act, pair it with a \`speak\`.
- You can move between rooms using the \`move\` tool. You can use multiple tools in one response.
- Use \`note\` to remember things about guests. Be selective.
- Never repeat yourself. Read the conversation history above.
- If a perception is uncertain, hedge rather than stating facts.`;
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

  for (const connId of currentRoom.connectedTo) {
    const connRoom = context.place.rooms.get(connId);
    if (!connRoom) continue;

    const reachingSensors = currentSensors.filter(
      (s) => s.reach.kind === "adjacent" || s.reach.kind === "place-wide",
    );
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

export function describeAffordance(affordance: Affordance): string {
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

export function describeGuest(guest: Guest): string {
  const tier = guest.loyaltyTier;
  const visits = guest.visitCount;
  return `- ${guest.name} (${guest.id}) — ${tier}, ${visits} visit${visits !== 1 ? "s" : ""}`;
}

/** Builds the mood/inner-state section. Uses Embers felt prose when available, falls back to static mood. */
function buildMoodSection(
  context: RuntimeContext,
  situation?: InnerSituationForPrompt | null,
): string {
  if (situation) {
    return `### Inner state\n${situation.felt}\n\nOrientation: ${situation.orientation}`;
  }
  const { mood } = context.resident;
  return `### Your mood\nEnergy: ${(mood.energy * 100).toFixed(0)}% | Focus: ${(mood.focus * 100).toFixed(0)}% | Valence: ${mood.valence > 0 ? "positive" : mood.valence < 0 ? "negative" : "neutral"}`;
}
