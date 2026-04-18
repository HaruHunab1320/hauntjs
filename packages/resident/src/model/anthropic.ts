import Anthropic from "@anthropic-ai/sdk";
import type {
  ModelProvider,
  ChatRequest,
  ChatResponse,
  ChatMessage,
  ToolCall,
  ToolDefinition,
} from "./types.js";

const DEFAULT_MODEL = "claude-opus-4-7";
const DEFAULT_MAX_TOKENS = 1024;

export class AnthropicProvider implements ModelProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    this.client = new Anthropic({
      apiKey: options?.apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
    this.model = options?.model ?? process.env.HAUNT_MODEL_NAME ?? DEFAULT_MODEL;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const messages = this.toAnthropicMessages(request.messages);
    const tools = request.tools ? this.toAnthropicTools(request.tools) : undefined;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: request.temperature,
      system: request.systemPrompt,
      messages,
      ...(tools && tools.length > 0 ? { tools } : {}),
    });

    return this.fromAnthropicResponse(response);
  }

  private toAnthropicMessages(
    messages: ChatMessage[],
  ): Anthropic.MessageParam[] {
    return messages
      .filter((m) => m.role !== "system")
      .map((m): Anthropic.MessageParam => {
        if (m.role === "tool" && m.toolCallId) {
          return {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: m.toolCallId,
                content: m.content,
              },
            ],
          };
        }

        if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
          const content: Anthropic.ContentBlockParam[] = [];
          if (m.content) {
            content.push({ type: "text", text: m.content });
          }
          for (const tc of m.toolCalls) {
            content.push({
              type: "tool_use",
              id: tc.id,
              name: tc.name,
              input: tc.arguments,
            });
          }
          return { role: "assistant", content };
        }

        return {
          role: (m.role === "tool" ? "user" : m.role) as "user" | "assistant",
          content: m.content,
        };
      });
  }

  private toAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool.InputSchema,
    }));
  }

  private fromAnthropicResponse(
    response: Anthropic.Message,
  ): ChatResponse {
    let content = "";
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        content += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        });
      }
    }

    const finishReason =
      response.stop_reason === "tool_use"
        ? "tool_use" as const
        : response.stop_reason === "max_tokens"
          ? "length" as const
          : "stop" as const;

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
