import { Logger } from "../../lib/logger";
import { callProvider, ProviderTarget } from "../engine/http/provider-call";
import { ProviderRequestBase, providerConfigs } from "../engine/http/provider-config";
import {
  buildGeminiAgenticRequest,
  buildOpenAiAgenticRequest,
  parseGeminiAgenticResponse,
  parseOpenAiAgenticResponse,
  streamGeminiAgenticResponse,
  streamOpenAiAgenticResponse,
} from "./provider-formatters";
import {
  AgentEventHandler,
  AgenticParsedResponse,
  ConversationMessage,
  ToolDefinition,
} from "./types";

export type AgentTurn = {
  target: ProviderTarget;
  maxTokens: number;
  messages: ConversationMessage[];
  tools: ToolDefinition[];
  systemPrompt?: string;
  /** When set, the reply is streamed and reported through it as it arrives. */
  onEvent?: AgentEventHandler;
};

/**
 * Sends one turn of a tool-calling conversation to an LLM provider's HTTP API.
 * Throws when the call fails; the agent loop reports that as the end of the conversation.
 */
export async function sendAgentTurn(turn: AgentTurn, logger: Logger): Promise<AgenticParsedResponse> {
  const codec = agentCodec(turn.target);
  const onEvent = turn.onEvent;

  const call = await callProvider(
    {
      target: turn.target,
      apiOperation: "agentic",
      maxTokens: turn.maxTokens,
      request: codec.buildRequest({
        messages: turn.messages,
        tools: turn.tools,
        model: turn.target.model,
        maxTokens: turn.maxTokens,
        systemPrompt: turn.systemPrompt,
        stream: onEvent !== undefined,
      }),
      parseResponse: onEvent
        ? (response) => codec.parseStreamingResponse(response, onEvent)
        : codec.parseResponse,
      responseLength: (reply) =>
        reply.message.content.reduce(
          (total, content) => total + (content.type === "text" ? content.text.length : 0),
          0,
        ),
      usage: (reply) => reply.usage,
    },
    logger,
  );

  if (call.kind === "failed") {
    throw new Error(call.message);
  }
  return call.reply;
}

type AgentRequestOptions = {
  messages: ConversationMessage[];
  tools: ToolDefinition[];
  model: string;
  maxTokens: number;
  systemPrompt?: string;
  stream?: boolean;
};

/** How one provider's API encodes tool-calling requests and replies. */
type AgentCodec = {
  buildRequest: (options: AgentRequestOptions) => ProviderRequestBase;
  parseResponse: (response: Response) => Promise<AgenticParsedResponse>;
  parseStreamingResponse: (response: Response, onEvent: AgentEventHandler) => Promise<AgenticParsedResponse>;
};

function agentCodec({ provider, apiKey }: ProviderTarget): AgentCodec {
  const errorLabel = providerConfigs[provider].errorLabel;
  switch (provider) {
    case "groq":
      return openAiStyleCodec("https://api.groq.com/openai/v1/chat/completions", apiKey, errorLabel);
    case "cerebras":
      return openAiStyleCodec("https://api.cerebras.ai/v1/chat/completions", apiKey, errorLabel);
    case "openrouter":
      return openAiStyleCodec("https://openrouter.ai/api/v1/chat/completions", apiKey, errorLabel);
    case "gemini":
      return {
        buildRequest: (options) => buildGeminiAgenticRequest(options, apiKey),
        parseResponse: parseGeminiAgenticResponse,
        parseStreamingResponse: streamGeminiAgenticResponse,
      };
  }
}

function openAiStyleCodec(url: string, apiKey: string, errorLabel: string): AgentCodec {
  return {
    buildRequest: (options) => buildOpenAiAgenticRequest(options, url, apiKey),
    parseResponse: (response) => parseOpenAiAgenticResponse(response, errorLabel),
    parseStreamingResponse: (response, onEvent) =>
      streamOpenAiAgenticResponse(response, errorLabel, onEvent),
  };
}
