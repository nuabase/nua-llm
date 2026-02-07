import {
  AgentResult,
  AgentTool,
  AgenticParsedResponse,
  ConversationMessage,
  ToolCallContent,
} from "./types";
import { NormalizedUsage, normalizedUsageZero } from "../llm-client/provider-config";

export type SendAgenticRequestFn = (
  messages: ConversationMessage[],
  tools: AgentTool[],
  systemPrompt?: string,
) => Promise<AgenticParsedResponse>;

export async function runAgentLoop(params: {
  messages: ConversationMessage[];
  tools: AgentTool[];
  systemPrompt?: string;
  maxTurns: number;
  sendRequest: SendAgenticRequestFn;
}): Promise<AgentResult> {
  const messages = [...params.messages];
  let totalUsage: NormalizedUsage = { ...normalizedUsageZero };

  for (let turn = 0; turn < params.maxTurns; turn++) {
    const response = await params.sendRequest(
      messages,
      params.tools,
      params.systemPrompt,
    );

    messages.push(response.message);
    totalUsage = addUsage(totalUsage, response.usage);

    const toolCalls = response.message.content.filter(
      (c): c is ToolCallContent => c.type === "toolCall",
    );

    if (toolCalls.length === 0 || response.stopReason === "stop") {
      break;
    }

    for (const toolCall of toolCalls) {
      const tool = params.tools.find((t) => t.name === toolCall.name);
      if (!tool) {
        messages.push({
          role: "toolResult",
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          content: `Tool "${toolCall.name}" not found`,
          isError: true,
        });
        continue;
      }

      try {
        const result = await tool.execute(toolCall.arguments);
        messages.push({
          role: "toolResult",
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          content: result.content,
          isError: result.isError ?? false,
        });
      } catch (error) {
        messages.push({
          role: "toolResult",
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          content: `Tool execution error: ${error instanceof Error ? error.message : "Unknown error"}`,
          isError: true,
        });
      }
    }
  }

  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");
  const textResponse =
    lastAssistant?.role === "assistant"
      ? lastAssistant.content
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map((c) => c.text)
          .join("")
      : undefined;

  return {
    success: true,
    messages,
    textResponse: textResponse || undefined,
    usage: totalUsage,
  };
}

function addUsage(a: NormalizedUsage, b: NormalizedUsage): NormalizedUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}
