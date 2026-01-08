import { PrimaryKeyValue } from "../types";

/**
 * Converts LLM array output into a lookup table keyed by primary key.
 * Useful for efficient retrieval of results by primary key value.
 */
export function arrayOutputToLookup<T>(
  llmOutput: unknown[],
  primaryKey: string,
  outputName: string
): Map<PrimaryKeyValue, T> {
  const result = new Map<PrimaryKeyValue, T>();

  if (!Array.isArray(llmOutput)) {
    throw new TypeError("Input 'llmOutput' must be an array.");
  }

  llmOutput.forEach((row, index) => {
    if (typeof row !== "object" || row === null) {
      throw new Error(`Row at index ${index} is not an object.`);
    }

    const rowRecord = row as Record<string, unknown>;

    // Runtime check: Ensure the primary key property exists
    if (!(primaryKey in rowRecord)) {
      throw new Error(
        `Row at index ${index} is missing the primary key property '${primaryKey}'.`
      );
    }

    const key = rowRecord[primaryKey];

    if (key === null || (typeof key !== "string" && typeof key !== "number")) {
      throw new Error(
        `Row at index ${index} has an invalid value for the primary key '${primaryKey}'. The value must be a non-null string or number.`
      );
    }

    // Ensure the output value property exists
    if (!(outputName in rowRecord)) {
      throw new Error(
        `Row at index ${index} is missing the output value property '${outputName}'.`
      );
    }

    result.set(key as PrimaryKeyValue, rowRecord[outputName] as T);
  });

  return result;
}
