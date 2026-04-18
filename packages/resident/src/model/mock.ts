import type { ModelProvider, ChatRequest, ChatResponse } from "./types.js";

export interface MockResponse {
  content: string;
  toolCalls?: ChatResponse["toolCalls"];
  finishReason?: ChatResponse["finishReason"];
}

export class MockModelProvider implements ModelProvider {
  readonly name = "mock";
  private responses: MockResponse[];
  private callIndex = 0;
  readonly calls: ChatRequest[] = [];

  constructor(responses: MockResponse | MockResponse[]) {
    this.responses = Array.isArray(responses) ? responses : [responses];
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    this.calls.push(request);

    const response = this.responses[this.callIndex % this.responses.length];
    this.callIndex++;

    return {
      content: response.content,
      toolCalls: response.toolCalls,
      finishReason: response.finishReason ?? "stop",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  reset(): void {
    this.callIndex = 0;
    this.calls.length = 0;
  }
}
