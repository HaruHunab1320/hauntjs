/**
 * Manual test script for verifying real API connectivity.
 * Run with: pnpm --filter @hauntjs/resident exec tsx scripts/test-models.ts
 *
 * Set environment variables before running:
 *   ANTHROPIC_API_KEY=...  (for anthropic)
 *   OPENAI_API_KEY=...     (for openai)
 *   OLLAMA_HOST=...        (for ollama, defaults to http://localhost:11434)
 */

import { createModelProvider } from "../src/model/factory.js";
import type { ModelProviderConfig } from "../src/model/types.js";

const PROVIDERS: Array<{ name: ModelProviderConfig["provider"]; envKey?: string }> = [
  { name: "anthropic", envKey: "ANTHROPIC_API_KEY" },
  { name: "openai", envKey: "OPENAI_API_KEY" },
  { name: "ollama" },
];

async function testProvider(providerName: ModelProviderConfig["provider"]): Promise<void> {
  console.log(`\n--- Testing ${providerName} ---`);

  try {
    const provider = createModelProvider({ provider: providerName });

    const response = await provider.chat({
      systemPrompt: "You are a helpful assistant. Respond in one sentence.",
      messages: [{ role: "user", content: "Say hello and tell me your name." }],
      maxTokens: 100,
      temperature: 0.7,
    });

    console.log(`  Response: ${response.content}`);
    console.log(`  Finish reason: ${response.finishReason}`);
    if (response.usage) {
      console.log(`  Tokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`);
    }
    console.log(`  ✓ ${providerName} works`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ ${providerName} failed: ${message}`);
  }
}

async function main(): Promise<void> {
  console.log("Haunt Model Provider Test");
  console.log("=========================");

  const targetProvider = process.argv[2] as ModelProviderConfig["provider"] | undefined;

  if (targetProvider) {
    await testProvider(targetProvider);
    return;
  }

  for (const { name, envKey } of PROVIDERS) {
    if (envKey && !process.env[envKey]) {
      console.log(`\n--- Skipping ${name} (${envKey} not set) ---`);
      continue;
    }
    await testProvider(name);
  }
}

main().catch(console.error);
