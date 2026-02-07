import { CanonicalModelName } from "../model-info";
import { AgenticParsedResponse, ConversationMessage, ToolDefinition } from "../agent/types";
import { ProviderParsedResponse } from "./provider-config";

export interface LlmClient {
  sendRequest(
    prompt: string,
    model: CanonicalModelName,
    maxTokens: number,
    assistantPrefillPrompt?: string,
  ): Promise<ProviderParsedResponse>;

  sendAgenticRequest(
    messages: ConversationMessage[],
    tools: ToolDefinition[],
    model: CanonicalModelName,
    maxTokens: number,
    systemPrompt?: string,
  ): Promise<AgenticParsedResponse>;
}
