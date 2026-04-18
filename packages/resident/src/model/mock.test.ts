import { describe, it, expect } from "vitest";
import { MockModelProvider } from "./mock.js";
import type { ChatRequest } from "./types.js";

function makeRequest(text = "Hello"): ChatRequest {
  return {
    systemPrompt: "You are Poe.",
    messages: [{ role: "user", content: text }],
  };
}

describe("MockModelProvider", () => {
  it("returns a canned response", async () => {
    const mock = new MockModelProvider({ content: "Welcome home." });
    const response = await mock.chat(makeRequest());
    expect(response.content).toBe("Welcome home.");
    expect(response.finishReason).toBe("stop");
  });

  it("records calls", async () => {
    const mock = new MockModelProvider({ content: "Hi" });
    await mock.chat(makeRequest("Hello"));
    await mock.chat(makeRequest("How are you?"));
    expect(mock.calls).toHaveLength(2);
    expect(mock.calls[0].messages[0].content).toBe("Hello");
    expect(mock.calls[1].messages[0].content).toBe("How are you?");
  });

  it("cycles through multiple responses", async () => {
    const mock = new MockModelProvider([
      { content: "First" },
      { content: "Second" },
    ]);
    const r1 = await mock.chat(makeRequest());
    const r2 = await mock.chat(makeRequest());
    const r3 = await mock.chat(makeRequest());
    expect(r1.content).toBe("First");
    expect(r2.content).toBe("Second");
    expect(r3.content).toBe("First"); // cycles back
  });

  it("returns tool calls when configured", async () => {
    const mock = new MockModelProvider({
      content: "",
      toolCalls: [
        { id: "tc1", name: "speak", arguments: { text: "Hello" } },
      ],
      finishReason: "tool_use",
    });
    const response = await mock.chat(makeRequest());
    expect(response.finishReason).toBe("tool_use");
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls![0].name).toBe("speak");
  });

  it("resets call history and index", async () => {
    const mock = new MockModelProvider([
      { content: "First" },
      { content: "Second" },
    ]);
    await mock.chat(makeRequest());
    mock.reset();
    expect(mock.calls).toHaveLength(0);
    const r = await mock.chat(makeRequest());
    expect(r.content).toBe("First"); // restarted from index 0
  });
});
