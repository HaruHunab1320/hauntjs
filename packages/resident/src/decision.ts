import type { ResidentAction, GuestId } from "@hauntjs/core";
import { guestId, roomId, affordanceId } from "@hauntjs/core";
import type { ChatResponse } from "./model/types.js";

/**
 * Parse a model response into a ResidentAction.
 *
 * The model should respond with a tool call. If it responds with plain text
 * (no tool calls), we treat it as a speak action — the resident is talking.
 * If the response is empty or a wait tool call, return null.
 */
export function parseDecision(response: ChatResponse): ResidentAction | null {
  // If the model used a tool, parse it
  if (response.toolCalls && response.toolCalls.length > 0) {
    return parseToolCall(response.toolCalls[0].name, response.toolCalls[0].arguments);
  }

  // If the model responded with plain text (no tool call), treat as speech
  if (response.content && response.content.trim().length > 0) {
    return {
      type: "speak",
      text: response.content.trim(),
      audience: "all" as GuestId[] | "all",
    };
  }

  // Empty response — do nothing
  return null;
}

function parseToolCall(
  name: string,
  args: Record<string, unknown>,
): ResidentAction | null {
  switch (name) {
    case "speak":
      return parseSpeakAction(args);
    case "move":
      return parseMoveAction(args);
    case "act":
      return parseActAction(args);
    case "note":
      return parseNoteAction(args);
    case "wait":
      return null; // Explicit wait = no action
    default:
      console.warn(`Unknown tool call: ${name}`);
      return null;
  }
}

function parseSpeakAction(args: Record<string, unknown>): ResidentAction {
  const text = String(args.text ?? "");
  const audienceRaw = args.audience;

  let audience: GuestId[] | "all" = "all";
  if (typeof audienceRaw === "string" && audienceRaw !== "all") {
    audience = [guestId(audienceRaw)];
  } else if (Array.isArray(audienceRaw)) {
    audience = audienceRaw.map((a) => guestId(String(a)));
  }

  return { type: "speak", text, audience };
}

function parseMoveAction(args: Record<string, unknown>): ResidentAction {
  return { type: "move", toRoom: roomId(String(args.toRoom ?? "")) };
}

function parseActAction(args: Record<string, unknown>): ResidentAction {
  return {
    type: "act",
    affordanceId: affordanceId(String(args.affordanceId ?? "")),
    actionId: String(args.actionId ?? ""),
    params: (args.params as Record<string, unknown>) ?? undefined,
  };
}

function parseNoteAction(args: Record<string, unknown>): ResidentAction {
  const about = String(args.about ?? "self");
  return {
    type: "note",
    content: String(args.content ?? ""),
    about: about === "self" ? "self" : guestId(about),
  };
}
