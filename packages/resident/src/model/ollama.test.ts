import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OllamaProvider } from "./ollama.js";

describe("OllamaProvider", () => {
  let provider: OllamaProvider;
  const mockFetch = vi.fn();

  beforeEach(() => {
    provider = new OllamaProvider({ host: "http://localhost:11434", model: "llama3.1" });
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has the correct name", () => {
    expect(provider.name).toBe("ollama");
  });

  it("returns a chat response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          message: { role: "assistant", content: "Welcome home." },
          done: true,
          prompt_eval_count: 50,
          eval_count: 15,
        }),
    });

    const response = await provider.chat({
      systemPrompt: "You are Poe.",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(response.content).toBe("Welcome home.");
    expect(response.finishReason).toBe("stop");
    expect(response.usage).toEqual({ inputTokens: 50, outputTokens: 15 });

    // Verify the fetch call
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:11434/api/chat",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("handles tool call responses", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          message: {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                function: {
                  name: "speak",
                  arguments: { text: "Hello there" },
                },
              },
            ],
          },
          done: true,
        }),
    });

    const response = await provider.chat({
      systemPrompt: "You are Poe.",
      messages: [{ role: "user", content: "Greet me" }],
      tools: [
        {
          name: "speak",
          description: "Say something",
          parameters: { type: "object", properties: { text: { type: "string" } } },
        },
      ],
    });

    expect(response.finishReason).toBe("tool_use");
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls![0].name).toBe("speak");
  });

  it("throws on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal server error"),
    });

    await expect(
      provider.chat({
        systemPrompt: "You are Poe.",
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).rejects.toThrow(/Ollama API error \(500\)/);
  });

  it("sends correct request body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          message: { role: "assistant", content: "Ok" },
          done: true,
        }),
    });

    await provider.chat({
      systemPrompt: "You are Poe.",
      messages: [{ role: "user", content: "Hello" }],
      temperature: 0.7,
      maxTokens: 500,
    });

    const lastCallIdx = mockFetch.mock.calls.length - 1;
    const rawBody = mockFetch.mock.calls[lastCallIdx][1].body as string;
    const body = JSON.parse(rawBody);
    expect(body.model).toBe("llama3.1");
    expect(body.stream).toBe(false);
    expect(body.options).toEqual({ temperature: 0.7, num_predict: 500 });
    expect(body.messages[0]).toEqual({ role: "system", content: "You are Poe." });
    expect(body.messages[1]).toEqual({ role: "user", content: "Hello" });
  });
});
