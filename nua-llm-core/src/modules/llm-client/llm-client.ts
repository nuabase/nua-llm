import { CanonicalModelName } from "../model-info";
import { ProviderParsedResponse } from "./provider-config";

export interface LlmClient {
  sendRequest(
    prompt: string,
    model: CanonicalModelName,
    maxTokens: number,
    assistantPrefillPrompt?: string,
  ): Promise<ProviderParsedResponse>;
}
