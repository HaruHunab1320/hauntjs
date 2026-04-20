import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAIProvider } from "./openai.js";

const mockCreate = vi.fn();

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockCreate,
        },
      };
    },
  };
});

describe("OpenAIProvider", () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            role: "assistant",
            content: "Welcome home.",
            tool_calls: undefined,
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 80,
        completion_tokens: 20,
      },
    });
    provider = new OpenAIProvider({ apiKey: "test-key" });
  });

  it("has the correct name", () => {
    expect(provider.name).toBe("openai");
  });

  it("returns a chat response", async () => {
    const response = await provider.chat({
      systemPrompt: "You are Poe.",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(response.content).toBe("Welcome home.");
    expect(response.finishReason).toBe("stop");
    expect(response.usage).toBeDefined();
    expect(response.usage!.inputTokens).toBe(80);
  });

  it("handles empty choices gracefully", async () => {
    mockCreate.mockResolvedValueOnce({
      id: "chatcmpl-123",
      object: "chat.completion",
      created: Date.now(),
      model: "gpt-4o",
      choices: [],
    });

    const response = await provider.chat({
      systemPrompt: "You are Poe.",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(response.content).toBe("");
    expect(response.finishReason).toBe("error");
  });
});
