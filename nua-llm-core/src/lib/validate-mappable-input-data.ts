import { NuaValidationError } from "./nua-errors";

// This is llmRequest.input_data, but for mapped requests. So they are always an array of objects,
// with a primary key guaranteed to be present.
export type MappableInputDataRow = Record<string, unknown>;
export type MappableInputData = MappableInputDataRow[];

// Ensure each item in the data array is an object with at least two keys, and one of it is the declared primary key
export function validateMappableInputData(
  data: unknown,
  primaryKey: string | null,
): NuaValidationError | MappableInputData {
  if (!Array.isArray(data))
    return {
      kind: "validation-error",
      message: "input.data must be an array",
    };

  if (typeof primaryKey !== "string" || primaryKey.trim() === "") {
    return {
      kind: "validation-error",
      message: "input.primaryKey must be a non-empty string",
    };
  }

  const invalidDataMessage = `Each item in 'data' must be an object with at least one key including the primary key '${primaryKey}'`;

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (item === null || typeof item !== "object" || Array.isArray(item))
      return {
        kind: "validation-error",
        message: invalidDataMessage,
      };

    const keys = Object.keys(item as Record<string, unknown>);
    if (keys.length < 2 || !keys.includes(primaryKey))
      return {
        kind: "validation-error",
        message: invalidDataMessage,
      };
  }

  return data;
}
