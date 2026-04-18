import { describe, it, expect } from "vitest";
import { parseDecision } from "./decision.js";
import type { ChatResponse } from "./model/types.js";

describe("parseDecision", () => {
  it("parses a speak tool call", () => {
    const response: ChatResponse = {
      content: "",
      finishReason: "tool_use",
      toolCalls: [
        {
          id: "tc1",
          name: "speak",
          arguments: { text: "Welcome home, Takeshi.", audience: "all" },
        },
      ],
    };

    const action = parseDecision(response);
    expect(action).toEqual({
      type: "speak",
      text: "Welcome home, Takeshi.",
      audience: "all",
    });
  });

  it("parses a speak tool call with specific audience", () => {
    const response: ChatResponse = {
      content: "",
      finishReason: "tool_use",
      toolCalls: [
        {
          id: "tc1",
          name: "speak",
          arguments: { text: "A word, if I may.", audience: "takeshi" },
        },
      ],
    };

    const action = parseDecision(response);
    expect(action?.type).toBe("speak");
    if (action?.type === "speak") {
      expect(action.audience).toEqual(["takeshi"]);
    }
  });

  it("parses a move tool call", () => {
    const response: ChatResponse = {
      content: "",
      finishReason: "tool_use",
      toolCalls: [
        { id: "tc1", name: "move", arguments: { toRoom: "study" } },
      ],
    };

    const action = parseDecision(response);
    expect(action).toEqual({ type: "move", toRoom: "study" });
  });

  it("parses an act tool call", () => {
    const response: ChatResponse = {
      content: "",
      finishReason: "tool_use",
      toolCalls: [
        {
          id: "tc1",
          name: "act",
          arguments: { affordanceId: "fireplace", actionId: "light" },
        },
      ],
    };

    const action = parseDecision(response);
    expect(action).toEqual({
      type: "act",
      affordanceId: "fireplace",
      actionId: "light",
      params: undefined,
    });
  });

  it("parses a note tool call about a guest", () => {
    const response: ChatResponse = {
      content: "",
      finishReason: "tool_use",
      toolCalls: [
        {
          id: "tc1",
          name: "note",
          arguments: { content: "Takeshi seems tired tonight.", about: "takeshi" },
        },
      ],
    };

    const action = parseDecision(response);
    expect(action).toEqual({
      type: "note",
      content: "Takeshi seems tired tonight.",
      about: "takeshi",
    });
  });

  it("parses a note tool call about self", () => {
    const response: ChatResponse = {
      content: "",
      finishReason: "tool_use",
      toolCalls: [
        {
          id: "tc1",
          name: "note",
          arguments: { content: "The garden needs tending.", about: "self" },
        },
      ],
    };

    const action = parseDecision(response);
    expect(action).toEqual({
      type: "note",
      content: "The garden needs tending.",
      about: "self",
    });
  });

  it("returns null for a wait tool call", () => {
    const response: ChatResponse = {
      content: "",
      finishReason: "tool_use",
      toolCalls: [{ id: "tc1", name: "wait", arguments: {} }],
    };

    expect(parseDecision(response)).toBeNull();
  });

  it("treats plain text response as speech", () => {
    const response: ChatResponse = {
      content: "Good evening. The fire is lit.",
      finishReason: "stop",
    };

    const action = parseDecision(response);
    expect(action).toEqual({
      type: "speak",
      text: "Good evening. The fire is lit.",
      audience: "all",
    });
  });

  it("returns null for empty response", () => {
    const response: ChatResponse = {
      content: "",
      finishReason: "stop",
    };

    expect(parseDecision(response)).toBeNull();
  });

  it("returns null for unknown tool name", () => {
    const response: ChatResponse = {
      content: "",
      finishReason: "tool_use",
      toolCalls: [{ id: "tc1", name: "dance", arguments: {} }],
    };

    expect(parseDecision(response)).toBeNull();
  });
});
