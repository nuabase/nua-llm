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
  NormalizedUsage,
  ProviderConfig,
  ProviderParsedResponse,
  ProviderRequestBase,
  providerConfigs,
} from "./provider-config";
import {
  AgenticParsedResponse,
  ConversationMessage,
  ToolDefinition,
} from "../agent/types";
import {
  buildGeminiAgenticRequest,
  buildOpenAiAgenticRequest,
  parseGeminiAgenticResponse,
  parseOpenAiAgenticResponse,
} from "../agent/provider-formatters";

type FetchableBody = string | undefined;

type AgenticProviderCodec = {
  buildRequest: (options: {
    messages: ConversationMessage[];
    tools: ToolDefinition[];
    model: string;
    maxTokens: number;
    systemPrompt?: string;
  }) => ProviderRequestBase;
  parseResponse: (response: Response) => Promise<AgenticParsedResponse>;
};

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
    const provider = this.getProviderConfig();
    const providerModelName = this.getProviderModelName(model);

    const requestOptions = provider.buildRequest(
      {
        prompt,
        model: providerModelName,
        maxTokens,
        assistantPrefillPrompt,
      },
      this.apiKey,
    );

    return this.executeProviderCall({
      provider,
      model,
      maxTokens,
      apiOperation: provider.apiOperation,
      requestOptions,
      parseResponse: provider.parseResponse,
      getResponsePreview: (parsedResponse) => parsedResponse.text,
      getUsage: (parsedResponse) => parsedResponse.usage,
    });
  }

  async sendAgenticRequest(
    messages: ConversationMessage[],
    tools: ToolDefinition[],
    model: CanonicalModelName,
    maxTokens: number,
    systemPrompt?: string,
  ): Promise<AgenticParsedResponse> {
    const provider = this.getProviderConfig();
    const providerModelName = this.getProviderModelName(model);
    const codec = this.getAgenticProviderCodec(provider.errorLabel);

    const requestOptions = codec.buildRequest({
      messages,
      tools,
      model: providerModelName,
      maxTokens,
      systemPrompt,
    });

    return this.executeProviderCall({
      provider,
      model,
      maxTokens,
      apiOperation: "agentic",
      requestOptions,
      parseResponse: codec.parseResponse,
      getResponsePreview: (parsedResponse) =>
        parsedResponse.message.content
          .filter((content): content is { type: "text"; text: string } => content.type === "text")
          .map((content) => content.text)
          .join(""),
      getUsage: (parsedResponse) => parsedResponse.usage,
    });
  }

  private getProviderConfig(): ProviderConfig {
    const provider = providerConfigs[this.providerId];
    if (!provider) {
      throw new Error(`Unknown LLM provider: ${this.providerId}`);
    }
    return provider;
  }

  private getProviderModelName(model: CanonicalModelName): string {
    const providerSpecificModelName = SUPPORTED_MODELS[model].find(
      (pm) => pm.provider === this.providerId,
    );

    if (!providerSpecificModelName) {
      throw new Error(
        `LLM Provider ${this.providerId} does not support model ${model}. If this is an error and the provider does support this model, please contact us to fix it`,
      );
    }

    return providerSpecificModelName.providerModelName;
  }

  private async executeProviderCall<T>(params: {
    provider: ProviderConfig;
    model: CanonicalModelName;
    maxTokens: number;
    apiOperation: string;
    requestOptions: ProviderRequestBase;
    parseResponse: (response: Response) => Promise<T>;
    getResponsePreview: (parsedResponse: T) => string;
    getUsage: (parsedResponse: T) => NormalizedUsage | undefined;
  }): Promise<T> {
    const method = params.requestOptions.method ?? "POST";
    const headers = params.requestOptions.headers ?? {};
    const body = this.toFetchableBody(params.requestOptions.body);
    const spanId = generateSpanId();
    const startTime = Date.now();

    logLlmCallStart(
      this.logger,
      spanId,
      params.provider.providerId,
      params.apiOperation,
      {
        url: params.requestOptions.loggableUrl ?? params.requestOptions.url,
        httpMethod: method,
        model: params.model,
        maxTokens: params.maxTokens,
      },
    );

    try {
      const response = await fetch(params.requestOptions.url, {
        method,
        headers,
        body,
      });

      const parsedResponse = await params.parseResponse(response);
      const duration = Date.now() - startTime;

      logLlmCallComplete(
        this.logger,
        spanId,
        params.provider.providerId,
        params.apiOperation,
        {
          status: response.status,
          responseText: params.getResponsePreview(parsedResponse),
          headers: Object.fromEntries(response.headers.entries()),
          usage: params.getUsage(parsedResponse),
        },
        duration,
      );

      return parsedResponse;
    } catch (error) {
      const duration = Date.now() - startTime;

      logLlmCallError(
        this.logger,
        spanId,
        params.provider.providerId,
        params.apiOperation,
        error,
        duration,
      );

      throw new Error(
        `${params.provider.errorLabel} API request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private toFetchableBody(bodyPayload: unknown): FetchableBody {
    if (typeof bodyPayload === "string") {
      return bodyPayload;
    }
    if (bodyPayload === undefined) {
      return undefined;
    }
    return JSON.stringify(bodyPayload);
  }

  private getAgenticProviderCodec(errorLabel: string): AgenticProviderCodec {
    switch (this.providerId) {
      case "groq":
        return {
          buildRequest: (options) =>
            buildOpenAiAgenticRequest(
              options,
              "https://api.groq.com/openai/v1/chat/completions",
              this.apiKey,
            ),
          parseResponse: (response) =>
            parseOpenAiAgenticResponse(response, errorLabel),
        };
      case "cerebras":
        return {
          buildRequest: (options) =>
            buildOpenAiAgenticRequest(
              options,
              "https://api.cerebras.ai/v1/chat/completions",
              this.apiKey,
            ),
          parseResponse: (response) =>
            parseOpenAiAgenticResponse(response, errorLabel),
        };
      case "openrouter":
        return {
          buildRequest: (options) =>
            buildOpenAiAgenticRequest(
              options,
              "https://openrouter.ai/api/v1/chat/completions",
              this.apiKey,
            ),
          parseResponse: (response) =>
            parseOpenAiAgenticResponse(response, errorLabel),
        };
      case "gemini":
        return {
          buildRequest: (options) => buildGeminiAgenticRequest(options, this.apiKey),
          parseResponse: parseGeminiAgenticResponse,
        };
      default:
        throw new Error(
          `Unsupported provider for agentic requests: ${this.providerId}`,
        );
    }
  }
}
