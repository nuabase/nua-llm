// We expect the primary key for the mapped requests - both input and output
// to be always either a string or a number
export type UserDataPKValue = string | number;

import { MappableInputDataRow } from "#handlers/cast-array-handler/validate-mappable-input-data";
import { MappedLlmOutputEffectiveSchemaRow } from "#modules/execute-llm-request/cast-array/cast-array-request-service";
import { NormalizedUsage } from "nua-llm-core";

// Re-export from nua-llm-caching for backward compatibility
export type { CachedValueWithUsage } from "nua-llm-caching";
export { parseCachedValue } from "nua-llm-caching";

export type MappableInputDataLookupTable = Record<
  UserDataPKValue,
  MappableInputDataRow
>;

export type CastArrayApiResponse_Success = {
  llmRequestId: string;
  kind: "cast/array";
  isSuccess: true;
  data: MappedLlmOutputEffectiveSchemaRow[];
  cacheHits: number;
  rowsWithNoResults: UserDataPKValue[];
  llmUsage: NormalizedUsage;
  cacheUsage: NormalizedUsage;
};

export type CastArrayApiResponse_Error = {
  kind: "cast/array";
  llmRequestId: string;
  error: string;
  isError: true;
};

export type CastValueApiResponse_Success = {
  kind: "cast/value";
  llmRequestId: string;
  data: unknown;
  isCacheHit: boolean;
  isSuccess: true;
  llmUsage: NormalizedUsage;
  cacheUsage: NormalizedUsage;
};

export type CastValueApiResponse_Error = {
  kind: "cast/value";
  llmRequestId: string;
  error: string;
  isError: true;
};

export type CastValueApiResponse =
  | CastValueApiResponse_Success
  | CastValueApiResponse_Error;

export type CastArrayApiResponse =
  | CastArrayApiResponse_Success
  | CastArrayApiResponse_Error;

export type EarlyError = {
  error: string;
  isError: true;
};

export type CastApiResponse =
  | CastArrayApiResponse
  | CastValueApiResponse
  | EarlyError;
