import { ProviderEngines } from "../engine/http/provider-engines";
import { normalizedUsageZero } from "../engine/http/provider-config";
import { runAgentLoop } from "./agent-loop";
import { sendAgentTurn } from "./agent-turn";
import { AgentResult, AgentRunParams } from "./types";

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_MAX_TURNS = 10;

/**
 * Runs a multi-turn, tool-calling conversation on an LLM provider's API. It needs
 * the providers' API directly, so it takes provider engines rather than any engine router.
 */
export async function runAgent(providers: ProviderEngines, params: AgentRunParams): Promise<AgentResult> {
  const resolved = providers.resolve(params.model);
  if (resolved.kind === "unroutable") {
    return {
      success: false,
      completionReason: "error",
      messages: params.messages,
      usage: normalizedUsageZero,
      error: resolved.message,
    };
  }

  const maxTokens = params.maxTokens ?? DEFAULT_MAX_TOKENS;
  return runAgentLoop({
    messages: params.messages,
    tools: params.tools,
    systemPrompt: params.systemPrompt,
    maxTurns: params.maxTurns ?? DEFAULT_MAX_TURNS,
    onEvent: params.onEvent,
    sendRequest: (messages, tools, systemPrompt) =>
      sendAgentTurn(
        { target: resolved.target, maxTokens, messages, tools, systemPrompt, onEvent: params.onEvent },
        providers.logger,
      ),
  });
}
