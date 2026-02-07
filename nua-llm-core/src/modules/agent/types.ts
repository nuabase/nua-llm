import { NormalizedUsage } from "../llm-client/provider-config";

// --- Tool Types ---

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
};

export type ToolExecutionResult = {
  content: string;
  isError?: boolean;
};

export type AgentTool = ToolDefinition & {
  execute: (args: Record<string, unknown>) => Promise<ToolExecutionResult>;
};

// --- Content Block Types ---

export type TextContent = {
  type: "text";
  text: string;
};

export type ToolCallContent = {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type AssistantContentBlock = TextContent | ToolCallContent;

// --- Message Types ---

export type UserMessage = {
  role: "user";
  content: string;
};

export type AssistantMessage = {
  role: "assistant";
  content: AssistantContentBlock[];
};

export type ToolResultMessage = {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: string;
  isError: boolean;
};

export type ConversationMessage =
  | UserMessage
  | AssistantMessage
  | ToolResultMessage;

// --- LLM Response (single turn) ---

export type AgenticParsedResponse = {
  message: AssistantMessage;
  usage: NormalizedUsage;
  stopReason: "stop" | "tool_use";
};

// --- Agent Run Params & Result ---

export type AgentRunParams = {
  model: string;
  systemPrompt?: string;
  messages: ConversationMessage[];
  tools: AgentTool[];
  maxTokens?: number;
  maxTurns?: number; // default 10, safety limit
};

export type AgentCompletionReason = "stop" | "max_turns" | "error";

export type AgentResult = {
  success: boolean;
  completionReason: AgentCompletionReason;
  messages: ConversationMessage[];
  textResponse?: string; // convenience: final assistant text
  usage: NormalizedUsage; // total across all turns
  error?: string;
};
