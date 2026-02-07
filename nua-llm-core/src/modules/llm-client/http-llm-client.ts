import { CanonicalModelName, SUPPORTED_MODELS } from "../model-info";
import {
  generateSpanId,
  logLlmCallComplete,
  logLlmCallError,
  logLlmCallStart,
  Logger,
} from "../../lib/logger";
import { LlmClient } from "./llm-client";
import {
  LlmProviderId,
  providerConfigs,
  ProviderParsedResponse,
} from "./provider-config";
import {
  AgenticParsedResponse,
  ConversationMessage,
  ToolDefinition,
} from "../agent/types";
import {
  buildOpenAiAgenticRequest,
  parseOpenAiAgenticResponse,
  buildGeminiAgenticRequest,
  parseGeminiAgenticResponse,
} from "../agent/provider-formatters";

type FetchableBody = string | undefined;

export class HttpLlmClient implements LlmClient {
  private readonly providerId: LlmProviderId;
  private readonly apiKey: string;
  private readonly logger: Logger;

  constructor(providerId: LlmProviderId, apiKey: string, logger: Logger) {
    this.providerId = providerId;
    this.apiKey = apiKey;
    this.logger = logger;
  }

  async sendRequest(
    prompt: string,
    model: CanonicalModelName,
    maxTokens: number,
    assistantPrefillPrompt?: string,
  ): Promise<ProviderParsedResponse> {
    const provider = providerConfigs[this.providerId];

    if (!provider) {
      throw new Error(`Unknown LLM provider: ${this.providerId}`);
    }

    const providerSpecificModelName = SUPPORTED_MODELS[model].find(
      (pm) => pm.provider === this.providerId,
    );

    if (!providerSpecificModelName) {
      throw new Error(
        `LLM Provider ${this.providerId} does not support model ${model}. If this is an error and the provider does support this model, please contact us to fix it`,
      );
    }

    const requestOptions = provider.buildRequest(
      {
        prompt,
        model: providerSpecificModelName.providerModelName,
        maxTokens: maxTokens,
        assistantPrefillPrompt,
      },
      this.apiKey,
    );

    const method = requestOptions.method ?? "POST";
    const headers = requestOptions.headers ?? {};
    const bodyPayload = requestOptions.body;
    const body: FetchableBody =
      typeof bodyPayload === "string"
        ? bodyPayload
        : bodyPayload !== undefined
          ? JSON.stringify(bodyPayload)
          : undefined;

    const spanId = generateSpanId();
    const startTime = Date.now();

    logLlmCallStart(
      this.logger,
      spanId,
      provider.providerId,
      provider.apiOperation,
      {
        url: requestOptions.loggableUrl ?? requestOptions.url,
        httpMethod: method,
        model,
        maxTokens,
      },
    );

    try {
      const response = await fetch(requestOptions.url, {
        method,
        headers,
        body,
      });

      const parsedResponse: ProviderParsedResponse =
        await provider.parseResponse(response);
      const duration = Date.now() - startTime;

      logLlmCallComplete(
        this.logger,
        spanId,
        provider.providerId,
        provider.apiOperation,
        {
          status: response.status,
          responseText: parsedResponse.text,
          headers: Object.fromEntries(response.headers.entries()),
          usage: parsedResponse.usage,
        },
        duration,
      );

      return parsedResponse;
    } catch (error) {
      const duration = Date.now() - startTime;

      logLlmCallError(
        this.logger,
        spanId,
        provider.providerId,
        provider.apiOperation,
        error,
        duration,
      );

      throw new Error(
        `${provider.errorLabel} API request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async sendAgenticRequest(
    messages: ConversationMessage[],
    tools: ToolDefinition[],
    model: CanonicalModelName,
    maxTokens: number,
    systemPrompt?: string,
  ): Promise<AgenticParsedResponse> {
    const provider = providerConfigs[this.providerId];

    if (!provider) {
      throw new Error(`Unknown LLM provider: ${this.providerId}`);
    }

    const providerSpecificModelName = SUPPORTED_MODELS[model].find(
      (pm) => pm.provider === this.providerId,
    );

    if (!providerSpecificModelName) {
      throw new Error(
        `LLM Provider ${this.providerId} does not support model ${model}. If this is an error and the provider does support this model, please contact us to fix it`,
      );
    }

    const requestOptions = this.buildAgenticProviderRequest(
      {
        messages,
        tools,
        model: providerSpecificModelName.providerModelName,
        maxTokens,
        systemPrompt,
      },
    );

    const method = requestOptions.method ?? "POST";
    const headers = requestOptions.headers ?? {};
    const bodyPayload = requestOptions.body;
    const body: FetchableBody =
      typeof bodyPayload === "string"
        ? bodyPayload
        : bodyPayload !== undefined
          ? JSON.stringify(bodyPayload)
          : undefined;

    const spanId = generateSpanId();
    const startTime = Date.now();

    logLlmCallStart(
      this.logger,
      spanId,
      provider.providerId,
      "agentic",
      {
        url: requestOptions.loggableUrl ?? requestOptions.url,
        httpMethod: method,
        model,
        maxTokens,
      },
    );

    try {
      const response = await fetch(requestOptions.url, {
        method,
        headers,
        body,
      });

      const parsedResponse = await this.parseAgenticProviderResponse(
        response,
        provider.errorLabel,
      );

      const duration = Date.now() - startTime;

      const responsePreview = parsedResponse.message.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("");

      logLlmCallComplete(
        this.logger,
        spanId,
        provider.providerId,
        "agentic",
        {
          status: response.status,
          responseText: responsePreview,
          headers: Object.fromEntries(response.headers.entries()),
          usage: parsedResponse.usage,
        },
        duration,
      );

      return parsedResponse;
    } catch (error) {
      const duration = Date.now() - startTime;

      logLlmCallError(
        this.logger,
        spanId,
        provider.providerId,
        "agentic",
        error,
        duration,
      );

      throw new Error(
        `${provider.errorLabel} API request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private buildAgenticProviderRequest(options: {
    messages: ConversationMessage[];
    tools: ToolDefinition[];
    model: string;
    maxTokens: number;
    systemPrompt?: string;
  }) {
    switch (this.providerId) {
      case "groq":
        return buildOpenAiAgenticRequest(
          options,
          "https://api.groq.com/openai/v1/chat/completions",
          this.apiKey,
        );
      case "cerebras":
        return buildOpenAiAgenticRequest(
          options,
          "https://api.cerebras.ai/v1/chat/completions",
          this.apiKey,
        );
      case "openrouter":
        return buildOpenAiAgenticRequest(
          options,
          "https://openrouter.ai/api/v1/chat/completions",
          this.apiKey,
        );
      case "gemini":
        return buildGeminiAgenticRequest(options, this.apiKey);
      default:
        throw new Error(
          `Unsupported provider for agentic requests: ${this.providerId}`,
        );
    }
  }

  private async parseAgenticProviderResponse(
    response: Response,
    errorLabel: string,
  ): Promise<AgenticParsedResponse> {
    switch (this.providerId) {
      case "groq":
      case "cerebras":
      case "openrouter":
        return parseOpenAiAgenticResponse(response, errorLabel);
      case "gemini":
        return parseGeminiAgenticResponse(response);
      default:
        throw new Error(
          `Unsupported provider for agentic response parsing: ${this.providerId}`,
        );
    }
  }
}
