import type { GuestId, ResidentAction } from "@hauntjs/core";
import { affordanceId, createLogger, guestId, roomId } from "@hauntjs/core";
import type { ChatResponse } from "./model/types.js";

const log = createLogger("Decision");

/**
 * Parse a model response into a ResidentAction.
 *
 * The model should respond with a tool call. If it responds with plain text
 * (no tool calls), we treat it as a speak action — the resident is talking.
 * If the response is empty or a wait tool call, return null.
 */
export function parseDecision(response: ChatResponse): ResidentAction | null {
  const actions = parseAllDecisions(response);
  return actions.length > 0 ? actions[0] : null;
}

export function parseAllDecisions(response: ChatResponse): ResidentAction[] {
  const actions: ResidentAction[] = [];

  // Parse all tool calls
  if (response.toolCalls && response.toolCalls.length > 0) {
    for (const tc of response.toolCalls) {
      const action = parseToolCall(tc.name, tc.arguments);
      if (action) actions.push(action);
    }
  }

  // If there's also text content alongside tool calls, include it as speech
  if (response.content && response.content.trim().length > 0 && actions.length === 0) {
    actions.push({
      type: "speak",
      text: response.content.trim(),
      audience: "all" as GuestId[] | "all",
    });
  }

  return actions;
}

function parseToolCall(name: string, args: Record<string, unknown>): ResidentAction | null {
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
      log.warn(`Unknown tool call: ${name}`);
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
