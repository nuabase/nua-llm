import { config } from "#lib/config";
import { cacheStore } from "#lib/cacheStore";
import { ValueCacheService } from "nua-llm-caching";
import {
  NuaLlmClient,
  ConsoleLogger,
  normalizedUsageZero,
  providerEngines,
} from "nua-llm-core";
import { CastValueApiResponse_Success } from "#modules/execute-llm-request/types";
import { ProviderModel } from "nua-llm-core";
import { LlmRequest, LlmRequestModel } from "../../../models/llm-request-model";

// Helper to get initialized client (singleton-like or per-request if logging context needed)
// For now, we reuse the config logic.
const nuaClient = new NuaLlmClient(
  providerEngines({
    logger: new ConsoleLogger(),
    providers: {
      cerebras: { apiKey: config.llm.cerebrasApiKey },
      groq: { apiKey: config.llm.groqApiKey },
      openrouter: { apiKey: config.llm.openRouterApiKey },
      gemini: config.llm.geminiApiKey
        ? { apiKey: config.llm.geminiApiKey }
        : undefined,
    },
  }),
);

export async function executeCastValueLlmRequest(
  llmRequest: LlmRequest,
  effectiveSchema: object,
  model: ProviderModel,
): Promise<CastValueApiResponse_Success> {
  const baseResponse = {
    kind: "cast/value",
    isSuccess: true,
    llmRequestId: llmRequest.id,
    provider: model.provider,
    model: model.model,
  } satisfies Partial<CastValueApiResponse_Success>;

  // Parse input data for cache context
  const inputData = llmRequest.input_data
    ? JSON.parse(llmRequest.input_data)
    : undefined;

  // Set up cache service
  const cache = new ValueCacheService(cacheStore, {
    outputName: llmRequest.output_name,
    prompt: llmRequest.input_prompt || "",
    schema: effectiveSchema as Record<string, unknown>,
    data: inputData,
    requestType: llmRequest.request_type,
    primaryKey: llmRequest.input_primary_key ?? undefined,
  });

  // Try getting from cache
  if (!llmRequest.invalidate_cache) {
    const cached = await cache.get();
    if (cached.hit) {
      const table = new LlmRequestModel();
      await table.update(llmRequest.id, {
        full_prompt: "//# Served from cache",
      });
      return {
        ...baseResponse,
        data: cached.value,
        isCacheHit: true,
        llmUsage: normalizedUsageZero,
        cacheUsage: cached.usage,
      };
    }
  }

  const result = await nuaClient.castValue({
    model,
    maxTokens: llmRequest.max_tokens,
    input: {
      prompt: llmRequest.input_prompt || "",
      data: inputData,
    },
    output: {
      name: llmRequest.output_name,
      schema: effectiveSchema,
    },
  });

  // Save the prompt that was sent, regardless of success/failure, so we can reproduce errors
  if (result.prompt) {
    const table = new LlmRequestModel();
    await table.update(llmRequest.id, {
      system_prompt: result.prompt.system,
      full_prompt: result.prompt.full,
    });
  }

  if (!result.success) {
    throw new Error(`Cast value failed: ${result.error}`);
  }

  const transformedResult = result.data;
  const actualUsage = result.usage;

  // Store result with usage in cache
  await cache.set(transformedResult, actualUsage);

  return {
    ...baseResponse,
    data: transformedResult,
    isCacheHit: false,
    llmUsage: actualUsage,
    cacheUsage: normalizedUsageZero,
  };
}
