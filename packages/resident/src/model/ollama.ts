import type {
  ModelProvider,
  ChatRequest,
  ChatResponse,
  ChatMessage,
  ToolCall,
  ToolDefinition,
} from "./types.js";

const DEFAULT_HOST = "http://localhost:11434";
const DEFAULT_MODEL = "llama3.1";

interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  tools?: OllamaTool[];
  stream: false;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
}

interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface OllamaTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface OllamaChatResponse {
  message: OllamaMessage;
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider implements ModelProvider {
  readonly name = "ollama";
  private host: string;
  private model: string;

  constructor(options?: { host?: string; model?: string }) {
    this.host = options?.host ?? process.env.OLLAMA_HOST ?? DEFAULT_HOST;
    this.model = options?.model ?? process.env.HAUNT_MODEL_NAME ?? DEFAULT_MODEL;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const messages = this.toOllamaMessages(request.systemPrompt, request.messages);
    const tools = request.tools ? this.toOllamaTools(request.tools) : undefined;

    const body: OllamaChatRequest = {
      model: this.model,
      messages,
      stream: false,
    };

    if (request.temperature !== undefined || request.maxTokens !== undefined) {
      body.options = {};
      if (request.temperature !== undefined) body.options.temperature = request.temperature;
      if (request.maxTokens !== undefined) body.options.num_predict = request.maxTokens;
    }

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const url = `${this.host}/api/chat`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama API error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as OllamaChatResponse;
    return this.fromOllamaResponse(data);
  }

  private toOllamaMessages(
    systemPrompt: string,
    messages: ChatMessage[],
  ): OllamaMessage[] {
    const result: OllamaMessage[] = [
      { role: "system", content: systemPrompt },
    ];

    for (const m of messages) {
      if (m.role === "system") continue;

      const msg: OllamaMessage = {
        role: m.role,
        content: m.content,
      };

      if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
        msg.tool_calls = m.toolCalls.map((tc) => ({
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        }));
      }

      result.push(msg);
    }

    return result;
  }

  private toOllamaTools(tools: ToolDefinition[]): OllamaTool[] {
    return tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  private fromOllamaResponse(data: OllamaChatResponse): ChatResponse {
    const toolCalls: ToolCall[] = [];
    if (data.message.tool_calls) {
      for (const tc of data.message.tool_calls) {
        toolCalls.push({
          id: `ollama-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: tc.function.name,
          arguments: tc.function.arguments,
        });
      }
    }

    return {
      content: data.message.content ?? "",
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: toolCalls.length > 0 ? "tool_use" : "stop",
      usage: {
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
      },
    };
  }
}
