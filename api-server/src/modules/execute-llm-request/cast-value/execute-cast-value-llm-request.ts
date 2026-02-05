import { config } from "#lib/config";
import { cacheStore } from "#lib/cacheStore";
import { ValueCacheService } from "nua-llm-caching";
import { NuaLlmClient, ConsoleLogger, normalizedUsageZero } from "nua-llm-core";
import { CastValueApiResponse_Success } from "#modules/execute-llm-request/types";
import { CanonicalModelName } from "nua-llm-core";
import { LlmRequest } from "../../../models/llm-request-model";

// Helper to get initialized client (singleton-like or per-request if logging context needed)
// For now, we reuse the config logic.
const nuaClient = new NuaLlmClient({
  logger: new ConsoleLogger(),
  providers: {
    cerebras: { apiKey: config.llm.cerebrasApiKey },
    groq: { apiKey: config.llm.groqApiKey },
    openrouter: { apiKey: config.llm.openRouterApiKey },
    // others if needed
  },
});

export async function executeCastValueLlmRequest(
  llmRequest: LlmRequest,
  effectiveSchema: object,
  model: CanonicalModelName,
): Promise<CastValueApiResponse_Success> {
  const baseResponse = {
    kind: "cast/value",
    isSuccess: true,
    llmRequestId: llmRequest.id,
    model,
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
      return {
        ...baseResponse,
        data: cached.value,
        isCacheHit: true,
        llmUsage: normalizedUsageZero,
        cacheUsage: cached.usage,
      };
    }
  }

  const params = {
    model,
    maxTokens: llmRequest.max_tokens,
    temperature: llmRequest.temperature,
    input: {
      prompt: llmRequest.input_prompt || "",
      data: inputData,
    },
    output: {
      name: llmRequest.output_name,
      effectiveSchema,
    },
  };

  const {
    data: transformedResult,
    usage,
    success,
    error,
  } = await nuaClient.castValue(params);

  if (!success || !transformedResult) {
    throw new Error(`Cast value failed: ${error}`);
  }

  const actualUsage = usage || normalizedUsageZero;

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
