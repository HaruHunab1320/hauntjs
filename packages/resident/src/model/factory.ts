import type { ModelProvider, ModelProviderConfig } from "./types.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import { OllamaProvider } from "./ollama.js";

export function createModelProvider(config?: ModelProviderConfig): ModelProvider {
  const provider = config?.provider ?? (process.env.HAUNT_MODEL as ModelProviderConfig["provider"]) ?? "anthropic";

  switch (provider) {
    case "anthropic":
      return new AnthropicProvider({
        apiKey: config?.apiKey,
        model: config?.model,
      });

    case "openai":
      return new OpenAIProvider({
        apiKey: config?.apiKey,
        model: config?.model,
        baseUrl: config?.baseUrl,
      });

    case "ollama":
      return new OllamaProvider({
        host: config?.baseUrl,
        model: config?.model,
      });

    default:
      throw new Error(`Unknown model provider: "${provider}". Expected "anthropic", "openai", or "ollama".`);
  }
}
