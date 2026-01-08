import { config } from "#lib/config";
import {
  initializeCastArrayCache,
  MappedLlmOutputEffectiveSchemaRow,
} from "#modules/execute-llm-request/cast-array/cast-array-request-service";
import { isNuaValidationError, NuaValidationError } from "nua-llm-core";
import { CastArrayApiResponse_Success } from "#modules/execute-llm-request/types";
import { CanonicalModelName } from "nua-llm-core";
import { LlmRequest, LlmRequestModel } from "../../../models/llm-request-model";
import { NuaLlmClient, ConsoleLogger, normalizedUsageZero } from "nua-llm-core";
import {  NormalizedUsage } from "nua-llm-core";
import { ArrayCacheService } from "nua-llm-caching";
import { MappableInputDataRow } from "#handlers/cast-array-handler/validate-mappable-input-data";

// Helper to get initialized client (singleton-like or per-request if logging context needed)
const nuaClient = new NuaLlmClient({
  logger: new ConsoleLogger(),
  providers: {
    cerebras: { apiKey: config.llm.cerebrasApiKey },
    groq: { apiKey: config.llm.groqApiKey },
    openrouter: { apiKey: config.llm.openRouterApiKey },
  },
});

export async function executeCastArrayLlmRequest(
  llmRequest: LlmRequest,
  effectiveSchema: object,
  model: CanonicalModelName,
): Promise<CastArrayApiResponse_Success> {
  // Get the parsed input data, which is an array of objects, with one property being primaryKey
  // Fingerprint each row.
  // result = []
  // For each row:
  //   - Get if cache exist (by looking at fingerprint)
  //   - If exists, then result.append({[primaryKey], [outputName]: cacheValue)
  //   - If not exists, then result.append({[primaryKey]})
  // Now for every row with undefined outputName, filter rows from the original data. These are UNCACHED_ROWS.
  // LLM_RESPONSE = Call LLM with UNCACHED_ROWS.
  // Validate LLM_RESPONSE holistically (we won't do granular validation and retry per row now. Let's get all this working first)
  // Reassemble:
  //   iterate thru result; for each row, if outputName is undefined, then try finding it from LLM_RESPONSE.
  //   if found, then update [outputName] with result. add to cache.
  // This preserves the order of the original data.
  // Return result.filter(outputName is defined).

  const cacheServiceOrError: NuaValidationError | ArrayCacheService<MappableInputDataRow> =
    await initializeCastArrayCache(llmRequest, effectiveSchema);
  if (isNuaValidationError(cacheServiceOrError)) {
    throw new Error(
      `unexpected-situation. Invalid data stored in llm record. ${cacheServiceOrError.message}`,
    );
  }
  const cacheService = cacheServiceOrError;

  let llmOutputMappedRows: MappedLlmOutputEffectiveSchemaRow[];
  let usage: NormalizedUsage;
  if (cacheService.uncachedRows.length == 0) {
    llmOutputMappedRows = [];
    usage = normalizedUsageZero;
  } else {
    const params = {
      model,
      maxTokens: llmRequest.max_tokens,
      temperature: llmRequest.temperature,
      input: {
        prompt: llmRequest.input_prompt || "",
        primaryKey: llmRequest.input_primary_key || "id", // fallback, though type guarantees string if cast/array?
      },
      data: cacheService.uncachedRows,
      output: {
        name: llmRequest.output_name,
        effectiveSchema,
      },
    };

    const { data, usage: resultUsage, success, error, prompt } = await nuaClient.castArray(params);

    if (!success || !data) {
      throw new Error(`Cast array failed: ${error}`);
    }

    usage = resultUsage || normalizedUsageZero;
    llmOutputMappedRows = data as MappedLlmOutputEffectiveSchemaRow[];

    // Save the prompt used
    if (prompt) {
      const table = new LlmRequestModel();
      await table.update(llmRequest.id, {
        full_prompt: prompt,
      });
    }
  }

  // Let's save the results and update the cache (with per-row token estimates)
  await cacheService.storeResults(llmOutputMappedRows, usage);

  // And the full and final result that includes cache hits and new llm output rows
  const baseResponse = {
    llmRequestId: llmRequest.id,
    kind: "cast/array",
    isSuccess: true,
  } satisfies Partial<CastArrayApiResponse_Success>;

  // dataResponse includes data, rowsWithNoResults, cacheHits, and cacheUsage
  const result = cacheService.assembleResult();
  const dataResponse = {
    data: result.data as MappedLlmOutputEffectiveSchemaRow[],
    rowsWithNoResults: result.rowsWithNoResults,
    cacheHits: result.cacheHitCount,
    cacheUsage: result.cacheUsage,
    llmUsage: usage,
  };

  return { ...baseResponse, ...dataResponse };
}
