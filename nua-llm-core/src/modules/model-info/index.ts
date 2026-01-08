import { NuaValidationError } from "../../lib/nua-errors";
import { LlmProviderId } from "../llm-client/provider-config";

export const CANONICAL_MODELS = [
  "qwen3-30b-a3b-instruct-2507",
  "claude-sonnet-4-5",
  "qwen3-vl-235b-a22b-instruct",
  "qwen3-max",
  "gpt-5",
  "gemini-2.5-flash-lite-preview-09-2025",
  "qwen3-coder-flash",
  "gpt-oss-120b",
] as const;

// 2) Type is derived from the array (no duplication)
export type CanonicalModelName = (typeof CANONICAL_MODELS)[number];

// 3) Fast lookup at runtime
const CANONICAL_SET = new Set<string>(CANONICAL_MODELS);

export type ProviderAndModel = {
  provider: LlmProviderId;
  providerModelName: string;
};

export const SUPPORTED_MODELS: Record<
  CanonicalModelName,
  Array<ProviderAndModel>
> = {
  "gpt-oss-120b": [
    {
      provider: "cerebras",
      providerModelName: "gpt-oss-120b",
    },
    {
      provider: "openrouter",
      providerModelName: "openai/gpt-oss-120b",
    },
  ],
  "qwen3-30b-a3b-instruct-2507": [
    {
      provider: "openrouter",
      providerModelName: "qwen/qwen3-30b-a3b-instruct-2507",
    },
  ],
  "claude-sonnet-4-5": [
    {
      provider: "openrouter",
      providerModelName: "anthropic/claude-sonnet-4.5",
    },
  ],
  "qwen3-vl-235b-a22b-instruct": [
    {
      provider: "openrouter",
      providerModelName: "qwen/qwen3-vl-235b-a22b-instruct",
    },
  ],
  "qwen3-max": [
    {
      provider: "openrouter",
      providerModelName: "qwen/qwen3-max",
    },
  ],
  "gpt-5": [
    {
      provider: "openrouter",
      providerModelName: "openai/gpt-5",
    },
  ],
  "gemini-2.5-flash-lite-preview-09-2025": [
    {
      provider: "openrouter",
      providerModelName: "google/gemini-2.5-flash-lite-preview-09-2025",
    },
  ],
  "qwen3-coder-flash": [
    {
      provider: "openrouter",
      providerModelName: "qwen/qwen3-coder-flash",
    },
  ],
} as const;

export function parseCanonicalModelName(
  requestedModel: string | null | undefined,
): CanonicalModelName | NuaValidationError {
  let m = requestedModel || "fast";
  if (CANONICAL_SET.has(m)) return m as CanonicalModelName;

  let m2: undefined | CanonicalModelName;
  switch (m) {
    case "fast":
      // As per Cerebras docs, this is the fastest. https://inference-docs.cerebras.ai/models/overview
      m2 = "gpt-oss-120b";
      // m2 = "gemini-2.5-flash-lite-preview-09-2025";
      break;
    case "qwen":
      m2 = "qwen3-vl-235b-a22b-instruct";
      break;
    case "sonnet":
      m2 = "claude-sonnet-4-5";
      break;
    case "gpt":
      m2 = "gpt-5";
      break;
  }
  if (m2) return m2 as CanonicalModelName;

  return {
    kind: "validation-error",
    message: `Invalid model name: ${m ?? "null/undefined"}`,
  };
}
