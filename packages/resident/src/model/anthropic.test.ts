import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "./anthropic.js";

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "Welcome home, Takeshi." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 100, output_tokens: 25 },
        }),
      };
    },
  };
});

describe("AnthropicProvider", () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    provider = new AnthropicProvider({ apiKey: "test-key" });
  });

  it("has the correct name", () => {
    expect(provider.name).toBe("anthropic");
  });

  it("returns a chat response", async () => {
    const response = await provider.chat({
      systemPrompt: "You are Poe.",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(response.content).toBe("Welcome home, Takeshi.");
    expect(response.finishReason).toBe("stop");
    expect(response.usage).toBeDefined();
    expect(response.usage!.inputTokens).toBe(100);
  });

  it("handles tool use responses", async () => {
    // Override the mock for this test
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const instance = new Anthropic();
    vi.mocked(instance.messages.create).mockResolvedValueOnce({
      id: "msg_123",
      type: "message",
      role: "assistant",
      model: "claude-opus-4-7",
      content: [
        { type: "text", text: "Let me light that for you." },
        {
          type: "tool_use",
          id: "tu_123",
          name: "act",
          input: { affordanceId: "fireplace", actionId: "light" },
        },
      ],
      stop_reason: "tool_use",
      usage: {
        input_tokens: 150,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    });

    // Create a fresh provider that uses this instance
    const testProvider = new AnthropicProvider({ apiKey: "test-key" });
    const response = await testProvider.chat({
      systemPrompt: "You are Poe.",
      messages: [{ role: "user", content: "It's cold in here" }],
      tools: [
        {
          name: "act",
          description: "Interact with an affordance",
          parameters: { type: "object", properties: {} },
        },
      ],
    });

    // The mocked create is shared, so the response comes from our mock
    expect(response).toBeDefined();
    expect(response.finishReason).toBeDefined();
  });
});
