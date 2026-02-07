import {
  AgentCompletionReason,
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
  const toolsByName = new Map(params.tools.map((tool) => [tool.name, tool]));
  let completionReason: AgentCompletionReason = "max_turns";

  for (let turn = 0; turn < params.maxTurns; turn++) {
    let response: AgenticParsedResponse;
    try {
      response = await params.sendRequest(
        messages,
        params.tools,
        params.systemPrompt,
      );
    } catch (error) {
      return buildAgentResult(
        messages,
        totalUsage,
        "error",
        error instanceof Error ? error.message : "Unknown error",
      );
    }

    messages.push(response.message);
    totalUsage = addUsage(totalUsage, response.usage);

    const toolCalls = response.message.content.filter(
      (c): c is ToolCallContent => c.type === "toolCall",
    );

    if (toolCalls.length === 0 || response.stopReason === "stop") {
      completionReason = "stop";
      return buildAgentResult(messages, totalUsage, completionReason);
    }

    for (const toolCall of toolCalls) {
      const tool = toolsByName.get(toolCall.name);
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

  return buildAgentResult(
    messages,
    totalUsage,
    completionReason,
    `Reached maxTurns limit (${params.maxTurns}) before receiving a final response`,
  );
}

function addUsage(a: NormalizedUsage, b: NormalizedUsage): NormalizedUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

function extractLastAssistantText(
  messages: ConversationMessage[],
): string | undefined {
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");

  if (lastAssistant?.role !== "assistant") {
    return undefined;
  }

  const text = lastAssistant.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("");

  return text || undefined;
}

function buildAgentResult(
  messages: ConversationMessage[],
  usage: NormalizedUsage,
  completionReason: AgentCompletionReason,
  error?: string,
): AgentResult {
  const success = completionReason === "stop" && !error;
  return {
    success,
    completionReason,
    messages,
    textResponse: extractLastAssistantText(messages),
    usage,
    error,
  };
}
