import {
  AgentCompletionReason,
  AgentEventHandler,
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

function safeEmit(onEvent: AgentEventHandler | undefined, event: Parameters<AgentEventHandler>[0]): void {
  if (!onEvent) return;
  try {
    onEvent(event);
  } catch {
    // Never let callback errors break the loop
  }
}

export async function runAgentLoop(params: {
  messages: ConversationMessage[];
  tools: AgentTool[];
  systemPrompt?: string;
  maxTurns: number;
  sendRequest: SendAgenticRequestFn;
  onEvent?: AgentEventHandler;
}): Promise<AgentResult> {
  const messages = [...params.messages];
  let totalUsage: NormalizedUsage = { ...normalizedUsageZero };
  const toolsByName = new Map(params.tools.map((tool) => [tool.name, tool]));
  let completionReason: AgentCompletionReason = "max_turns";
  const onEvent = params.onEvent;

  for (let turn = 0; turn < params.maxTurns; turn++) {
    safeEmit(onEvent, { type: "turn_start", turn });

    let response: AgenticParsedResponse;
    try {
      response = await params.sendRequest(
        messages,
        params.tools,
        params.systemPrompt,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      safeEmit(onEvent, { type: "error", error: errorMessage });
      return buildAgentResult(
        messages,
        totalUsage,
        "error",
        errorMessage,
      );
    }

    messages.push(response.message);
    totalUsage = addUsage(totalUsage, response.usage);

    safeEmit(onEvent, {
      type: "response_complete",
      message: response.message,
      usage: response.usage,
      stopReason: response.stopReason,
    });

    const toolCalls = response.message.content.filter(
      (c): c is ToolCallContent => c.type === "toolCall",
    );

    if (toolCalls.length === 0 || response.stopReason === "stop") {
      completionReason = "stop";
      return buildAgentResult(messages, totalUsage, completionReason);
    }

    for (const toolCall of toolCalls) {
      safeEmit(onEvent, {
        type: "tool_start",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        arguments: toolCall.arguments,
      });

      const tool = toolsByName.get(toolCall.name);
      if (!tool) {
        const result = {
          content: `Tool "${toolCall.name}" not found`,
          isError: true,
        };
        messages.push({
          role: "toolResult",
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          content: result.content,
          isError: true,
        });
        safeEmit(onEvent, {
          type: "tool_complete",
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          result,
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
        safeEmit(onEvent, {
          type: "tool_complete",
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          result,
        });
      } catch (error) {
        const errorContent = `Tool execution error: ${error instanceof Error ? error.message : "Unknown error"}`;
        const result = { content: errorContent, isError: true };
        messages.push({
          role: "toolResult",
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          content: errorContent,
          isError: true,
        });
        safeEmit(onEvent, {
          type: "tool_complete",
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          result,
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
