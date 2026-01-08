/**
 * LLM Provider Harness
 *
 * Purpose:
 *   The script executes every configured canonical model / provider pairing and captures
 *   the exact request and response payloads so that we can inspect the real-world
 *   response shapes before normalizing them. This lets us confidently switch between
 *   providers because we know the variability we need to normalize.
 *
 * How it works:
 *   - Discovers all canonical model/provider combinations from `SUPPORTED_MODELS`.
 *   - For each combination, it builds the HTTP request using the existing provider
 *     configs (reusing the same request builders/headers as production) and sends it.
 *   - Every result records start/end timestamps, HTTP status, request metadata,
 *     response headers/body, parsed JSON (when possible), and what our provider parser
 *     extracted. Errors (missing API keys, HTTP failures, parsing issues) are tagged.
 *   - The run artifact is persisted to `logs/` by default, but this path can be
 *     overridden.
 *
 * How to run it:
 *   - Ensure the relevant API keys are set (e.g. `GROQ_API_KEY`, `CEREBRAS_API_KEY`,
 *     `OPENROUTER_API_KEY`, `GEMINI_API_KEY` for future Gemini support).
 *   - Execute `npm run llm:harness -- [options]`. Run with `--help` to see the CLI
 *     options for overriding prompt/max tokens, filtering models/providers, and setting
 *     the output file.
 *
 * Output outline:
 *   - `metadata`: prompt, filters, run timestamps, and output path.
 *   - `combinations`: which canonical model/provider pairs were attempted.
 *   - `results`: per-combination entries containing status (`success`, `skipped`,
 *     `http-error`, `parse-error`, `request-error`), sanitized request info, raw
 *     response data, parsed JSON (if valid), provider-parsed text, and error metadata.
 *     Inspecting these JSON files gives a ground-truth view of each provider's shape.
 */

import "../register-path-aliases";
import fs from "node:fs/promises";
import path from "node:path";

import {
  CANONICAL_MODELS,
  CanonicalModelName,
  SUPPORTED_MODELS,
} from "nua-llm-core";
import {
  type NormalizedUsage,
  LlmProviderId,
  providerConfigs,
} from "nua-llm-core";

const DEFAULT_PROMPT =
  "You are a helpful assistant. Reply with a very short summary of the current weather in San Francisco.";
const DEFAULT_MAX_TOKENS = 256;

const PROVIDER_ENV_VARS: Record<LlmProviderId, string> = {
  groq: "GROQ_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  gemini: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

type HarnessRunStatus =
  | "success"
  | "http-error"
  | "parse-error"
  | "request-error"
  | "skipped";

type ModelProviderCombination = {
  canonicalModel: CanonicalModelName;
  providerId: LlmProviderId;
  providerModelName: string;
};

type ProviderRunResult = {
  canonicalModel: CanonicalModelName;
  providerId: LlmProviderId;
  providerModelName: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: HarnessRunStatus;
  missingApiKeyEnvVar?: string;
  request?: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: unknown;
  };
  response?: {
    status: number;
    headers: Record<string, string>;
    bodyText?: string;
    parsedJson?: unknown;
  };
  providerParsedText?: string;
  providerParsedUsage?: NormalizedUsage;
  parseError?: string;
  error?: string;
};

type HarnessRunMetadata = {
  startedAt: string;
  finishedAt: string;
  prompt: string;
  assistantPrefillPrompt?: string;
  maxTokens: number;
  filters?: {
    models?: CanonicalModelName[];
    providers?: LlmProviderId[];
  };
  outputPath: string;
};

export type HarnessRunArtifact = {
  metadata: HarnessRunMetadata;
  combinations: ModelProviderCombination[];
  results: ProviderRunResult[];
};

export type RunHarnessOptions = {
  prompt?: string;
  assistantPrefillPrompt?: string;
  maxTokens?: number;
  models?: CanonicalModelName[];
  providers?: LlmProviderId[];
  outputPath?: string;
};

type ResolvedHarnessOptions = {
  prompt: string;
  assistantPrefillPrompt?: string;
  maxTokens: number;
  modelFilters?: Set<CanonicalModelName>;
  providerFilters?: Set<LlmProviderId>;
  outputPath: string;
};

type CliParseResult = RunHarnessOptions & {
  showHelp?: boolean;
};

function isCanonicalModelName(value: string): value is CanonicalModelName {
  return (CANONICAL_MODELS as readonly string[]).includes(value);
}

function isProviderId(value: string): value is LlmProviderId {
  return (Object.keys(PROVIDER_ENV_VARS) as LlmProviderId[]).includes(
    value as LlmProviderId,
  );
}

function splitListArg(value: string): string[] {
  return value
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function parseCliArgs(argv: string[]): CliParseResult {
  const overrides: CliParseResult = {};

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      overrides.showHelp = true;
      continue;
    }

    const [rawKey, inlineValue] = arg.startsWith("--")
      ? arg.split("=", 2)
      : [arg, undefined];

    const key = rawKey;

    const readValue = (): string => {
      if (inlineValue !== undefined) {
        return inlineValue;
      }

      const nextArg = argv[index + 1];
      if (!nextArg) {
        throw new Error(`Missing value for argument ${key}`);
      }
      index += 1;
      return nextArg;
    };

    switch (key) {
      case "--prompt":
        overrides.prompt = readValue();
        break;
      case "--assistant-prefill":
      case "--assistant-prefill-prompt":
        overrides.assistantPrefillPrompt = readValue();
        break;
      case "--max-tokens":
      case "--maxTokens":
        overrides.maxTokens = Number(readValue());
        break;
      case "--model":
      case "--models": {
        const rawModels = splitListArg(readValue());
        overrides.models = [
          ...(overrides.models ?? []),
          ...rawModels.filter(isCanonicalModelName),
        ];
        break;
      }
      case "--provider":
      case "--providers": {
        const rawProviders = splitListArg(readValue());
        overrides.providers = [
          ...(overrides.providers ?? []),
          ...rawProviders.filter(isProviderId),
        ];
        break;
      }
      case "--output":
      case "--output-path":
        overrides.outputPath = readValue();
        break;
      default:
        console.warn(`Unknown argument ${key} - ignoring`);
        break;
    }
  }

  return overrides;
}

function printCliHelp(): void {
  console.log(
    [
      "LLM Provider Harness",
      "",
      "Usage:",
      "  npm run llm:harness -- [options]",
      "",
      "Options:",
      "  --prompt \"...\"                Override the default prompt.",
      "  --assistant-prefill \"...\"      Prefill an assistant response before the real call.",
      "  --max-tokens <number>          Max tokens to request (default 256).",
      "  --models model1,model2         Only run for specific canonical models.",
      "  --providers provider1,provider2 Only run for specific providers.",
      "  --output ./path/to/file.json   Where to persist the run artifact (defaults to logs/).",
      "  --help                         Show this help text.",
      "",
      "Environment variables:",
      Object.entries(PROVIDER_ENV_VARS)
        .map(([provider, envVar]) => `  ${provider}: ${envVar}`)
        .join("\n"),
    ].join("\n"),
  );
}

function resolveHarnessOptions(
  overrides: RunHarnessOptions = {},
): ResolvedHarnessOptions {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace(/Z$/, "");
  const outputPath = overrides.outputPath
    ? path.resolve(process.cwd(), overrides.outputPath)
    : path.resolve(
      process.cwd(),
      "logs",
      `llm-harness-results-${timestamp}.json`,
    );

  const modelFilters =
    overrides.models && overrides.models.length > 0
      ? new Set(overrides.models)
      : undefined;
  const providerFilters =
    overrides.providers && overrides.providers.length > 0
      ? new Set(overrides.providers)
      : undefined;

  return {
    prompt: overrides.prompt ?? DEFAULT_PROMPT,
    assistantPrefillPrompt: overrides.assistantPrefillPrompt,
    maxTokens:
      typeof overrides.maxTokens === "number" && !Number.isNaN(overrides.maxTokens)
        ? overrides.maxTokens
        : DEFAULT_MAX_TOKENS,
    modelFilters,
    providerFilters,
    outputPath,
  };
}

function collectCombinations(
  options: ResolvedHarnessOptions,
): ModelProviderCombination[] {
  const combinations: ModelProviderCombination[] = [];

  for (const canonicalModel of CANONICAL_MODELS) {
    if (options.modelFilters && !options.modelFilters.has(canonicalModel)) {
      continue;
    }

    const providerEntries = SUPPORTED_MODELS[canonicalModel];
    providerEntries.forEach((entry) => {
      if (
        options.providerFilters &&
        !options.providerFilters.has(entry.provider)
      ) {
        return;
      }

      combinations.push({
        canonicalModel,
        providerId: entry.provider,
        providerModelName: entry.providerModelName,
      });
    });
  }

  return combinations;
}

function toFetchableBody(body: unknown): string | undefined {
  if (typeof body === "string") {
    return body;
  }

  if (body === undefined) {
    return undefined;
  }

  return JSON.stringify(body);
}

function tryParseJson(value: string): unknown | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return typeof error === "string" ? error : JSON.stringify(error);
}

async function runCombination(
  combination: ModelProviderCombination,
  options: ResolvedHarnessOptions,
): Promise<ProviderRunResult> {
  const startedAt = new Date();
  const envVar = PROVIDER_ENV_VARS[combination.providerId];
  const apiKey = envVar ? process.env[envVar] : undefined;

  if (!apiKey) {
    const finishedAt = new Date();
    return {
      canonicalModel: combination.canonicalModel,
      providerId: combination.providerId,
      providerModelName: combination.providerModelName,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      status: "skipped",
      missingApiKeyEnvVar: envVar,
    };
  }

  const provider = providerConfigs[combination.providerId];
  if (!provider) {
    const finishedAt = new Date();
    return {
      canonicalModel: combination.canonicalModel,
      providerId: combination.providerId,
      providerModelName: combination.providerModelName,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      status: "request-error",
      error: `Missing provider configuration for ${combination.providerId}`,
    };
  }

  const requestOptions = provider.buildRequest(
    {
      prompt: options.prompt,
      model: combination.providerModelName,
      maxTokens: options.maxTokens,
      assistantPrefillPrompt: options.assistantPrefillPrompt,
    },
    apiKey,
  );

  const loggableRequest = {
    url: requestOptions.loggableUrl ?? requestOptions.url,
    method: requestOptions.method ?? "POST",
    headers: requestOptions.loggableHeaders ?? requestOptions.headers,
    body: requestOptions.loggableBody ?? requestOptions.body,
  };

  const fetchBody = toFetchableBody(requestOptions.body);

  try {
    const response = await fetch(requestOptions.url, {
      method: requestOptions.method ?? "POST",
      headers: requestOptions.headers,
      body: fetchBody,
    });

    const responseHeaders = Object.fromEntries(response.headers.entries());

    let providerParsedText: string | undefined;
    let providerParsedUsage: NormalizedUsage | undefined;
    let parseError: string | undefined;

    if (response.ok) {
      try {
        const parsed = await provider.parseResponse(response.clone());
        providerParsedText = parsed.text;
        providerParsedUsage = parsed.usage;
      } catch (error) {
        parseError = formatError(error);
      }
    }

    const responseBodyText = await response.text();
    const parsedJson = tryParseJson(responseBodyText);
    const finishedAt = new Date();

    const status: HarnessRunStatus = response.ok
      ? parseError
        ? "parse-error"
        : "success"
      : "http-error";

    return {
      canonicalModel: combination.canonicalModel,
      providerId: combination.providerId,
      providerModelName: combination.providerModelName,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      status,
      request: loggableRequest,
      response: {
        status: response.status,
        headers: responseHeaders,
        bodyText: responseBodyText,
        parsedJson,
      },
      providerParsedText,
      providerParsedUsage,
      parseError,
    };
  } catch (error) {
    const finishedAt = new Date();
    return {
      canonicalModel: combination.canonicalModel,
      providerId: combination.providerId,
      providerModelName: combination.providerModelName,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      status: "request-error",
      request: loggableRequest,
      error: formatError(error),
    };
  }
}

async function persistArtifact(
  artifact: HarnessRunArtifact,
  outputPath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(artifact, null, 2), "utf-8");
}

export async function runLlmProviderHarness(
  overrides: RunHarnessOptions = {},
): Promise<HarnessRunArtifact> {
  const resolvedOptions = resolveHarnessOptions(overrides);
  const combinations = collectCombinations(resolvedOptions);

  const startedAt = new Date();
  const results: ProviderRunResult[] = [];

  for (const combination of combinations) {
    const result = await runCombination(combination, resolvedOptions);
    results.push(result);
    const statusLabel =
      result.status === "success" ? "✅" : result.status === "skipped" ? "⚪" : "⚠️";
    console.log(
      `${statusLabel} ${combination.canonicalModel} -> ${combination.providerId} (${combination.providerModelName}) - ${result.status}`,
    );
  }

  const finishedAt = new Date();

  const artifact: HarnessRunArtifact = {
    metadata: {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      prompt: resolvedOptions.prompt,
      assistantPrefillPrompt: resolvedOptions.assistantPrefillPrompt,
      maxTokens: resolvedOptions.maxTokens,
      filters: {
        models: resolvedOptions.modelFilters
          ? Array.from(resolvedOptions.modelFilters.values())
          : undefined,
        providers: resolvedOptions.providerFilters
          ? Array.from(resolvedOptions.providerFilters.values())
          : undefined,
      },
      outputPath: resolvedOptions.outputPath,
    },
    combinations,
    results,
  };

  await persistArtifact(artifact, resolvedOptions.outputPath);
  console.log(
    `Saved ${results.length} result(s) to ${resolvedOptions.outputPath}. Successes: ${results.filter((r) => r.status === "success").length
    }, skipped: ${results.filter((r) => r.status === "skipped").length}`,
  );

  return artifact;
}

async function runFromCli(): Promise<void> {
  try {
    const cliOverrides = parseCliArgs(process.argv.slice(2));

    if (cliOverrides.showHelp) {
      printCliHelp();
      return;
    }

    await runLlmProviderHarness(cliOverrides);
  } catch (error) {
    console.error(`Harness run failed: ${formatError(error)}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runFromCli();
}
