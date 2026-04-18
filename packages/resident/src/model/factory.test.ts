import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createModelProvider } from "./factory.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import { OllamaProvider } from "./ollama.js";

describe("createModelProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("creates an AnthropicProvider when provider is 'anthropic'", () => {
    const p = createModelProvider({ provider: "anthropic", apiKey: "test-key" });
    expect(p).toBeInstanceOf(AnthropicProvider);
    expect(p.name).toBe("anthropic");
  });

  it("creates an OpenAIProvider when provider is 'openai'", () => {
    const p = createModelProvider({ provider: "openai", apiKey: "test-key" });
    expect(p).toBeInstanceOf(OpenAIProvider);
    expect(p.name).toBe("openai");
  });

  it("creates an OllamaProvider when provider is 'ollama'", () => {
    const p = createModelProvider({ provider: "ollama" });
    expect(p).toBeInstanceOf(OllamaProvider);
    expect(p.name).toBe("ollama");
  });

  it("defaults to anthropic when no config given", () => {
    delete process.env.HAUNT_MODEL;
    const p = createModelProvider();
    expect(p).toBeInstanceOf(AnthropicProvider);
  });

  it("reads HAUNT_MODEL env var when no config", () => {
    process.env.HAUNT_MODEL = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    const p = createModelProvider();
    expect(p).toBeInstanceOf(OpenAIProvider);
  });

  it("throws for unknown provider", () => {
    expect(() =>
      // @ts-expect-error testing invalid input
      createModelProvider({ provider: "magic" }),
    ).toThrow(/Unknown model provider/);
  });
});
