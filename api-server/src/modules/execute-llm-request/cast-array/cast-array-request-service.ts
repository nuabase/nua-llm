import {
  MappableInputData,
  MappableInputDataRow,
  validateMappableInputData,
} from "#handlers/cast-array-handler/validate-mappable-input-data";
import { getErrorMessageFromException } from "#lib/error-utils";
import { cacheStore } from "#lib/cacheStore";
import { ArrayCacheService } from "nua-llm-caching";
import {
  isNuaValidationError,
  NuaValidationError,
} from "nua-llm-core";
import { LlmRequest } from "../../../models/llm-request-model";
import { UserDataPKValue } from "#modules/execute-llm-request/types";

// This is the general type for the effective schema we wrap below.
// Each row here will always have the values of the [primaryKeyName] and [outputName]
// parameters as their only 2 properties. But since they're dynamic, we can't type it.
export type MappedLlmOutputEffectiveSchemaRow = Record<UserDataPKValue, unknown>;

export async function initializeCastArrayCache(
  llmRequest: LlmRequest,
  effectiveSchema: object,
): Promise<ArrayCacheService<MappableInputDataRow> | NuaValidationError> {
  const outputName = llmRequest.output_name;

  // Parse primary key and input_data
  const primaryKey = llmRequest.input_primary_key as string; // will be validated by the validateMappableInputData
  let inputDataObj;
  try {
    inputDataObj = JSON.parse(llmRequest.input_data as any);
  } catch (e) {
    return {
      kind: "validation-error",
      message: `unexpected-situation JSON parse error for existing input_data. ${getErrorMessageFromException(e)}`,
    };
  }
  const inputData: NuaValidationError | MappableInputData =
    validateMappableInputData(inputDataObj, primaryKey);
  if (isNuaValidationError(inputData)) return inputData;

  const cacheService = new ArrayCacheService(cacheStore, inputData, {
    outputName,
    prompt: llmRequest.input_prompt || "",
    primaryKey,
    effectiveSchema: effectiveSchema as Record<string, unknown>,
    requestType: "cast/array",
  });

  // Check cache (respects invalidate_cache option)
  await cacheService.checkCache({
    invalidateCache: llmRequest.invalidate_cache ?? false,
  });

  return cacheService;
}
