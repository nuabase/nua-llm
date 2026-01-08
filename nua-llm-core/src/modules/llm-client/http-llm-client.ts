import { CanonicalModelName, SUPPORTED_MODELS } from "../model-info";
import {
  generateSpanId,
  logApiCallComplete,
  logApiCallError,
  logApiCallStart,
  Logger,
} from "../../lib/logger";
import { LlmClient } from "./llm-client";
import {
  LlmProviderId,
  providerConfigs,
  ProviderParsedResponse,
} from "./provider-config";

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

    logApiCallStart(
      this.logger,
      spanId,
      provider.providerId,
      provider.apiOperation,
      {
        url: requestOptions.loggableUrl ?? requestOptions.url,
        method,
        headers: requestOptions.loggableHeaders ?? headers,
        body: requestOptions.loggableBody ?? bodyPayload,
        model: model,
        maxTokens: maxTokens,
        assistantPrefillPrompt,
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

      logApiCallComplete(
        this.logger,
        spanId,
        provider.providerId,
        provider.apiOperation,
        {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: parsedResponse.text,
          responseLength: parsedResponse.text.length,
          usage: parsedResponse.usage,
        },
        duration,
      );

      return parsedResponse;
    } catch (error) {
      const duration = Date.now() - startTime;

      logApiCallError(
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
}
