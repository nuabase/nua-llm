import { ConsoleLogger, Logger } from "./lib/logger";
import {
  CastArrayPromptInput,
  CastValuePromptInput,
  MappableInputData,
  NormalizedUsage,
} from "./lib/types";
import { validateMappableInputData } from "./lib/validate-mappable-input-data";
import { callLLM } from "./modules/execution/call-llm-service";
import { buildNuaJsonSchemaValueValidation } from "./modules/json-schema-validation/nua-json-schema-value-validation";
import { HttpLlmClient } from "./modules/llm-client/http-llm-client";
import { LlmProviderId, normalizedUsageZero } from "./modules/llm-client/provider-config";
import {
  CanonicalModelName,
  parseCanonicalModelName,
  SUPPORTED_MODELS,
} from "./modules/model-info";
import castArrayPromptBuilder from "./modules/prompt-builders/cast-array-prompt-builder";
import castPromptBuilder from "./modules/prompt-builders/cast-prompt-builder";
import { isNuaValidationError } from "./lib/nua-errors";
import { AgentRunParams, AgentResult } from "./modules/agent/types";
import { runAgentLoop } from "./modules/agent/agent-loop";

export type NuaLlmClientConfig = {
  logger?: Logger;
  providers: {
    [key in LlmProviderId]?: {
      apiKey: string;
    };
  };
};

export type CastResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
  usage?: NormalizedUsage;
  prompt?: string;
};

export class NuaLlmClient {
  private logger: Logger;
  private clients: Map<LlmProviderId, HttpLlmClient>;

  constructor(config: NuaLlmClientConfig) {
    this.logger = config.logger || new ConsoleLogger();
    this.clients = new Map();

    // Initialize clients
    Object.entries(config.providers).forEach(([providerId, providerConfig]) => {
      if (providerConfig?.apiKey) {
        this.clients.set(
          providerId as LlmProviderId,
          new HttpLlmClient(
            providerId as LlmProviderId,
            providerConfig.apiKey,
            this.logger,
          ),
        );
      }
    });
  }

  private getClientForModel(model: CanonicalModelName): HttpLlmClient {
    const supported = SUPPORTED_MODELS[model];
    if (!supported || supported.length === 0) {
      throw new Error(
        `Model ${model} is not supported or configuration is missing.`,
      );
    }

    // Simple strategy: pick the first supported provider that is configured
    for (const option of supported) {
      if (this.clients.has(option.provider)) {
        return this.clients.get(option.provider)!;
      }
    }

    throw new Error(
      `No configured provider found for model ${model}. Please check your API keys.`,
    );
  }

  private resolveModel(modelName: string): CanonicalModelName {
    const result = parseCanonicalModelName(modelName);
    if (isNuaValidationError(result)) {
      throw new Error(result.message);
    }
    return result;
  }

  async castValue<T = unknown>(
    params: CastValuePromptInput & {
      model: string;
      maxTokens?: number;
      temperature?: number;
    },
  ): Promise<CastResult<T>> {
    const model = this.resolveModel(params.model);
    const client = this.getClientForModel(model);
    const maxTokens = params.maxTokens || 4096;
    const temperature = params.temperature ?? 0.0;

    // Build prompt
    const prompt = castPromptBuilder.buildFullPrompt(params);

    // Build validation
    const validationFn = buildNuaJsonSchemaValueValidation(
      "library-req",
      params.output.effectiveSchema,
    );

    try {
      const result = await callLLM(
        client,
        prompt,
        model,
        maxTokens,
        temperature,
        3, // default retries
        validationFn,
      );

      return {
        success: true,
        data: result.data as T,
        usage: result.usage,
        prompt: prompt,
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  async castArray<T = unknown>(
    params: CastArrayPromptInput & {
      data: unknown[];
      model: string;
      maxTokens?: number;
      temperature?: number;
    },
  ): Promise<CastResult<T[]>> {
    const model = this.resolveModel(params.model);
    const client = this.getClientForModel(model);
    const maxTokens = params.maxTokens || 4096;
    const temperature = params.temperature ?? 0.0;

    // Validate input data structure
    const validData = validateMappableInputData(
      params.data,
      params.input.primaryKey,
    );
    if (isNuaValidationError(validData)) {
      return {
        success: false,
        error: validData.message,
      };
    }

    // Build prompt (pass all data as 'uncached' since we are pure logic here)
    const prompt = castArrayPromptBuilder.buildFullPrompt(params, validData);

    // Prepare effective schema for array output
    // The prompt builder puts the effectiveSchema into the prompt.
    // We need to validate the output against the "Wrapped" schema (Array of items).
    // The user passes `effectiveSchema` which is the schema for a SINGLE item?
    // Wait, let's check `types.ts` for CastArrayPromptInput.
    // It has `output.effectiveSchema`.
    // In the API, `llmRequest.output_effective_schema` is the schema for the INDIVIDUAL ITEM?
    // No, `mapped-request-effective-schema` wraps it.
    // Let's assume the user passes the ITEM schema, and we wrap it here?
    // Or does the user pass the wrapped schema?

    // In API `executeCastArrayLlmRequest`, `effectiveSchema` is passed in.
    // It calls `buildNuaJsonSchemaValueValidation(..., effectiveSchema)`.
    // `effectiveSchema` in API seems to be the WRAPPED schema (Array).
    // Let's check `wrapSchemaToEffectiveSchema` usage.

    // Assuming params.output.effectiveSchema IS the full array schema.
    // If the user wants convenience, we might want a helper to wrap it.
    // But for low level client, let's assume it's passed correct.

    const validationFn = buildNuaJsonSchemaValueValidation(
      "library-req",
      params.output.effectiveSchema,
    );

    try {
      const result = await callLLM(
        client,
        prompt,
        model,
        maxTokens,
        temperature,
        3,
        validationFn,
      );

      // result.data should be MappedLlmOutputEffectiveSchemaRow[]
      return {
        success: true,
        data: result.data as T[],
        usage: result.usage,
        prompt: prompt,
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  async runAgent(params: AgentRunParams): Promise<AgentResult> {
    try {
      const model = this.resolveModel(params.model);
      const client = this.getClientForModel(model);
      const maxTokens = params.maxTokens ?? 4096;
      const maxTurns = params.maxTurns ?? 10;

      return runAgentLoop({
        messages: params.messages,
        tools: params.tools,
        systemPrompt: params.systemPrompt,
        maxTurns,
        sendRequest: (messages, tools, systemPrompt) =>
          client.sendAgenticRequest(
            messages,
            tools,
            model,
            maxTokens,
            systemPrompt,
          ),
      });
    } catch (e) {
      return {
        success: false,
        completionReason: "error",
        messages: params.messages,
        usage: normalizedUsageZero,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
