import { NuaValidationError } from "../../lib/nua-errors";
import {
  LLM_PROVIDER_IDS,
  LlmProviderId,
} from "../llm-client/provider-config";

export type ProviderModel = {
  provider: LlmProviderId;
  model: string;
};

export type ModelAliasName =
  | "fast"
  | "gemini"
  | "qwen"
  | "sonnet"
  | "opus"
  | "haiku"
  | "kimi"
  | "gpt";

export type ModelInput = ProviderModel | { alias: ModelAliasName };

export const MODEL_ALIASES: Record<ModelAliasName, ProviderModel[]> = {
  fast: [
    { provider: "cerebras", model: "zai-glm-4.7" },
    { provider: "groq", model: "qwen/qwen3.6-27b" },
    { provider: "openrouter", model: "z-ai/glm-5.2" },
  ],
  gemini: [
    { provider: "gemini", model: "gemini-2.5-flash" },
    { provider: "openrouter", model: "google/gemini-2.5-flash" },
  ],
  qwen: [
    { provider: "openrouter", model: "qwen/qwen3-vl-235b-a22b-instruct" },
  ],
  sonnet: [
    { provider: "openrouter", model: "anthropic/claude-sonnet-4.6" },
  ],
  opus: [
    { provider: "openrouter", model: "anthropic/claude-opus-4.7" },
  ],
  haiku: [
    { provider: "openrouter", model: "anthropic/claude-haiku-4.5" },
  ],
  kimi: [
    { provider: "openrouter", model: "moonshotai/kimi-k2.7-code" },
  ],
  gpt: [
    { provider: "openrouter", model: "openai/gpt-5" },
  ],
};

export const MODEL_ALIAS_NAMES = Object.keys(
  MODEL_ALIASES,
) as ModelAliasName[];

const MODEL_ALIAS_SET = new Set<string>(MODEL_ALIAS_NAMES);
const LLM_PROVIDER_ID_SET = new Set<string>(LLM_PROVIDER_IDS);

export function isLlmProviderId(value: unknown): value is LlmProviderId {
  return typeof value === "string" && LLM_PROVIDER_ID_SET.has(value);
}

export function isModelAliasName(value: unknown): value is ModelAliasName {
  return typeof value === "string" && MODEL_ALIAS_SET.has(value);
}

function validationError(message: string): NuaValidationError {
  return {
    kind: "validation-error",
    message,
  };
}

function validateProviderModel(
  input: ProviderModel,
  configuredProviders: ReadonlySet<LlmProviderId>,
): ProviderModel | NuaValidationError {
  if (!isLlmProviderId(input.provider)) {
    return validationError(`Invalid LLM provider: ${String(input.provider)}`);
  }

  if (!configuredProviders.has(input.provider)) {
    return validationError(
      `LLM provider ${input.provider} is not configured. Please check your API keys.`,
    );
  }

  if (typeof input.model !== "string") {
    return validationError("model.model must be a string");
  }

  const model = input.model.trim();
  if (!model) {
    return validationError("model.model must be a non-empty string");
  }

  if (input.provider === "gemini" && model.startsWith("models/")) {
    return validationError(
      'Gemini model names must use bare model IDs, for example "gemini-2.5-flash", not "models/gemini-2.5-flash".',
    );
  }

  return {
    provider: input.provider,
    model,
  };
}

export function resolveModelInput(
  input: ModelInput | null | undefined,
  configuredProviders: ReadonlySet<LlmProviderId>,
): ProviderModel | NuaValidationError {
  if (input == null) {
    return resolveModelInput({ alias: "fast" }, configuredProviders);
  }

  if (typeof input !== "object") {
    return validationError("model must be an object with either alias or provider/model fields");
  }

  if ("provider" in input || "model" in input) {
    return validateProviderModel(input as ProviderModel, configuredProviders);
  }

  if ("alias" in input) {
    const alias = input.alias;
    if (!isModelAliasName(alias)) {
      return validationError(`Invalid model alias: ${String(alias)}`);
    }

    const configuredTarget = MODEL_ALIASES[alias].find((target) =>
      configuredProviders.has(target.provider),
    );

    if (!configuredTarget) {
      return validationError(
        `No configured provider found for model alias ${alias}. Please check your API keys.`,
      );
    }

    return configuredTarget;
  }

  return validationError("model must include either alias or provider/model fields");
}
