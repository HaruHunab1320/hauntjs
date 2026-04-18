import OpenAI from "openai";
import type {
  ModelProvider,
  ChatRequest,
  ChatResponse,
  ChatMessage,
  ToolCall,
  ToolDefinition,
} from "./types.js";

const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_MAX_TOKENS = 1024;

export class OpenAIProvider implements ModelProvider {
  readonly name = "openai";
  private client: OpenAI;
  private model: string;

  constructor(options?: { apiKey?: string; model?: string; baseUrl?: string }) {
    this.client = new OpenAI({
      apiKey: options?.apiKey ?? process.env.OPENAI_API_KEY,
      baseURL: options?.baseUrl,
    });
    this.model = options?.model ?? process.env.HAUNT_MODEL_NAME ?? DEFAULT_MODEL;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const messages = this.toOpenAIMessages(request.systemPrompt, request.messages);
    const tools = request.tools ? this.toOpenAITools(request.tools) : undefined;

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: request.temperature,
      messages,
      ...(tools && tools.length > 0 ? { tools } : {}),
    });

    return this.fromOpenAIResponse(response);
  }

  private toOpenAIMessages(
    systemPrompt: string,
    messages: ChatMessage[],
  ): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
    ];

    for (const m of messages) {
      if (m.role === "system") continue;

      if (m.role === "tool" && m.toolCallId) {
        result.push({
          role: "tool",
          content: m.content,
          tool_call_id: m.toolCallId,
        });
        continue;
      }

      if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
        result.push({
          role: "assistant",
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        });
        continue;
      }

      result.push({
        role: m.role as "user" | "assistant",
        content: m.content,
      });
    }

    return result;
  }

  private toOpenAITools(
    tools: ToolDefinition[],
  ): OpenAI.ChatCompletionTool[] {
    return tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  private fromOpenAIResponse(
    response: OpenAI.ChatCompletion,
  ): ChatResponse {
    const choice = response.choices[0];
    if (!choice) {
      return { content: "", finishReason: "error" };
    }

    const toolCalls: ToolCall[] = [];
    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        if ("function" in tc) {
          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
          });
        }
      }
    }

    const finishReason =
      choice.finish_reason === "tool_calls"
        ? "tool_use" as const
        : choice.finish_reason === "length"
          ? "length" as const
          : "stop" as const;

    return {
      content: choice.message.content ?? "",
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason,
      usage: response.usage
        ? {
            inputTokens: response.usage.prompt_tokens,
            outputTokens: response.usage.completion_tokens ?? 0,
          }
        : undefined,
    };
  }
}
