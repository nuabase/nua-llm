import { NormalizedUsage } from "./types";
import { PrimaryKeyValue } from "./types";

/**
 * Estimates per-row token usage by distributing the total batch usage
 * proportionally based on each row's character length.
 *
 * Prompt tokens are distributed by input row size.
 * Completion tokens are distributed by output row size.
 */
export function estimateRowTokens(
  inputRows: object[],
  outputRows: object[],
  totalUsage: NormalizedUsage
): NormalizedUsage[] {
  if (inputRows.length === 0 || outputRows.length === 0) {
    return [];
  }

  // Calculate character lengths (minimum 1 to avoid division by zero)
  const inputLengths = inputRows.map((r) =>
    Math.max(1, JSON.stringify(r).length)
  );
  const outputLengths = outputRows.map((r) =>
    Math.max(1, JSON.stringify(r).length)
  );

  const totalInputLen = inputLengths.reduce((a, b) => a + b, 0);
  const totalOutputLen = outputLengths.reduce((a, b) => a + b, 0);

  // Distribute tokens proportionally
  return inputRows.map((_, i) => {
    const promptTokens = Math.round(
      (totalUsage.promptTokens * inputLengths[i]) / totalInputLen
    );
    const completionTokens = Math.round(
      (totalUsage.completionTokens * outputLengths[i]) / totalOutputLen
    );
    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
  });
}

/**
 * Estimates per-row token usage and returns a Map keyed by primary key.
 */
export function estimateRowTokensByPk(
  inputRows: Array<Record<string, unknown>>,
  outputRows: Array<Record<string, unknown>>,
  totalUsage: NormalizedUsage,
  primaryKey: string
): Map<PrimaryKeyValue, NormalizedUsage> {
  const perRowUsages = estimateRowTokens(inputRows, outputRows, totalUsage);
  const result = new Map<PrimaryKeyValue, NormalizedUsage>();

  outputRows.forEach((row, i) => {
    const pkValue = row[primaryKey] as PrimaryKeyValue;
    if (pkValue !== undefined && perRowUsages[i]) {
      result.set(pkValue, perRowUsages[i]);
    }
  });

  return result;
}
