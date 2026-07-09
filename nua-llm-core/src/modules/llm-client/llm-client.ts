import { AgentEventHandler, AgenticParsedResponse, ConversationMessage, ToolDefinition } from "../agent/types";
import { ProviderParsedResponse } from "./provider-config";

export interface LlmClient {
  sendRequest(
    prompt: string,
    model: string,
    maxTokens: number,
    assistantPrefillPrompt?: string,
  ): Promise<ProviderParsedResponse>;

  sendAgenticRequest(
    messages: ConversationMessage[],
    tools: ToolDefinition[],
    model: string,
    maxTokens: number,
    systemPrompt?: string,
    onEvent?: AgentEventHandler,
  ): Promise<AgenticParsedResponse>;
}
