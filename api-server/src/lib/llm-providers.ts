import { config } from "#lib/config";
import type { LlmProviderId } from "nua-llm-core";

export function getConfiguredProviderIds(): Set<LlmProviderId> {
  const providers = new Set<LlmProviderId>();

  if (config.llm.cerebrasApiKey) providers.add("cerebras");
  if (config.llm.groqApiKey) providers.add("groq");
  if (config.llm.openRouterApiKey) providers.add("openrouter");
  if (config.llm.geminiApiKey) providers.add("gemini");

  return providers;
}
