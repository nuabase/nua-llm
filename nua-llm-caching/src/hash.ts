import { createHash } from "crypto";
import { stableStringify } from "nua-llm-core";

/**
 * SHA-256 hash of a string, returned as hex.
 */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Convenience: hash an object deterministically.
 */
export function hashObject(obj: unknown): string {
  return sha256(stableStringify(obj));
}
