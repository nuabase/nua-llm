import { JsonSchema } from "../../../lib/schema-utils";
import { NormalizedUsage } from "../../../lib/types";

export type { NormalizedUsage };

export type ProviderRequestBase = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  /** Request details with secrets removed for logging */
  loggableUrl?: string;
  loggableHeaders?: Record<string, string>;
  loggableBody?: unknown;
};

export const LLM_PROVIDER_IDS = [
  "groq",
  "cerebras",
  "gemini",
  "openrouter",
  "deepseek",
] as const;

export type LlmProviderId = (typeof LLM_PROVIDER_IDS)[number];

export interface ProviderRequestOptions {
  prompt: string;
  model: string;
  maxTokens: number;
  assistantPrefillPrompt?: string;
  /** A JSON schema the provider enforces on the reply, in strict mode. */
  responseSchema?: JsonSchema;
}

export const normalizedUsageZero: NormalizedUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
};

export type ProviderParsedResponse = {
  text: string;
  usage: NormalizedUsage;
};

export interface ProviderConfig {
  providerId: LlmProviderId;
  apiOperation: string;
  errorLabel: string;
  /** Models that can enforce a response JSON schema in strict mode. */
  strictSchemaModels?: ReadonlySet<string>;
  buildRequest(
    options: ProviderRequestOptions,
    apiKey: string,
  ): ProviderRequestBase;
  parseResponse(response: Response): Promise<ProviderParsedResponse>;
}

type OpenAiStyleResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
  usage?: OpenAiUsage | null;
};

type OpenAiThinkingDetail = {
  type?: string;
  summary?: string;
  format?: string;
  index?: number;
};

type OpenAiThinkingMessage = {
  content?: string | null;
  reasoning?: string | null;
  reasoning_details?: Array<OpenAiThinkingDetail | Record<string, unknown>>;
};

type OpenAiThinkingStyleResponse = {
  choices?: Array<{
    message?: OpenAiThinkingMessage;
  }>;
  error?: {
    message?: string;
  };
  usage?: OpenAiUsage | null;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
  usageMetadata?: GeminiUsageMetadata;
};

export type OpenAiUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: Record<string, unknown> | null;
  completion_tokens_details?: Record<string, unknown> | null;
  [key: string]: unknown;
} | null;

export type GeminiUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  cachedContentTokenCount?: number;
  [key: string]: unknown;
};

export const normalizeOpenAiUsage = (
  usage: OpenAiUsage | undefined,
): NormalizedUsage => {
  if (!usage) {
    // logger.error(
    //   "unexpected-situation. possible-token-leakage. Response does not have valid usage field (OpenAI-style response), request tokens not accounted",
    // );
    return normalizedUsageZero;
  }

  if (
    typeof usage.prompt_tokens !== "number" ||
    typeof usage.completion_tokens !== "number" ||
    typeof usage.total_tokens !== "number"
  ) {
    // logger.error(
    //   "unexpected-situation. possible-token-leakage. Response usage field has non-numeric values (OpenAI-style response), request tokens not accounted",
    // );
    return normalizedUsageZero;
  }

  const details = usage.prompt_tokens_details;
  // OpenRouter and OpenAI report cache reads in prompt_tokens_details; DeepSeek's own API
  // reports them as prompt_cache_hit_tokens.
  const cacheRead = details?.cached_tokens ?? usage.prompt_cache_hit_tokens;
  const cacheWrite = details?.cache_write_tokens;

  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    ...(typeof cacheRead === "number" && { promptCacheReadTokens: cacheRead }),
    ...(typeof cacheWrite === "number" && { promptCacheWriteTokens: cacheWrite }),
  };
};

export const normalizeGeminiUsage = (
  usage: GeminiUsageMetadata | undefined,
): NormalizedUsage => {
  if (!usage) {
    // logger.error(
    //   "unexpected-situation. possible-token-leakage. Gemini response does not have valid usage field, request tokens not accounted",
    // );
    return normalizedUsageZero;
  }

  if (
    typeof usage.promptTokenCount !== "number" ||
    typeof usage.candidatesTokenCount !== "number" ||
    typeof usage.totalTokenCount !== "number"
  ) {
    // logger.error(
    //   "unexpected-situation. possible-token-leakage. Gemini response does not have valid usage field, request tokens not accounted",
    // );
    return normalizedUsageZero;
  }

  return {
    promptTokens: usage.promptTokenCount,
    completionTokens: usage.candidatesTokenCount,
    totalTokens: usage.totalTokenCount,
    ...(typeof usage.cachedContentTokenCount === "number" && {
      promptCacheReadTokens: usage.cachedContentTokenCount,
    }),
  };
};

type OpenAiStyleDialect = {
  /** Some APIs (DeepSeek) accept only the older `max_tokens` parameter. */
  maxTokensParam?: "max_completion_tokens" | "max_tokens";
  /** Provider-specific fields merged into every request body. */
  extraBody?: Record<string, unknown>;
};

const buildOpenAiStyleRequest =
  (
    baseUrl: string,
    {
      maxTokensParam = "max_completion_tokens",
      extraBody,
    }: OpenAiStyleDialect = {},
  ) =>
  (
    {
      prompt,
      model,
      maxTokens,
      assistantPrefillPrompt,
      responseSchema,
    }: ProviderRequestOptions,
    apiKey: string,
  ): ProviderRequestBase => {
    const messages: Array<{ role: string; content: string }> = [];
    messages.push({ role: "user", content: prompt });

    if (assistantPrefillPrompt) {
      messages.push({ role: "assistant", content: assistantPrefillPrompt });
    }

    const body = {
      messages,
      model,
      temperature: 0.6,
      [maxTokensParam]: maxTokens,
      top_p: 1,
      stream: false,
      stop: null,
      ...extraBody,
      ...(responseSchema && {
        response_format: {
          type: "json_schema",
          json_schema: { name: "response", strict: true, schema: responseSchema },
        },
      }),
    };

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };

    return {
      url: baseUrl,
      method: "POST",
      headers,
      body,
      loggableHeaders: {
        ...headers,
        Authorization: "Bearer [REDACTED]",
      },
      loggableBody: body,
    };
  };

const parseOpenAiStyleResponse =
  (errorLabel: string) =>
  async (response: Response): Promise<ProviderParsedResponse> => {
    if (response.status === 200) {
      // TODO: An unsafe type-cast is being used here, to temporarily satisfy tsc.
      const responseBody: OpenAiStyleResponse =
        (await response.json()) as OpenAiStyleResponse;
      const responseText = extractOpenAiMessageText(
        responseBody.choices?.[0]?.message,
      );

      if (responseText) {
        return {
          text: responseText,
          usage: normalizeOpenAiUsage(responseBody.usage),
        };
      }

      throw new Error(
        `${errorLabel} API error: Could not extract text from response. Body: ${JSON.stringify(responseBody)}`,
      );
    }

    const errorBody = await response.text();

    try {
      const parsedError: OpenAiStyleResponse = JSON.parse(errorBody);
      const message = parsedError.error?.message || errorBody;
      throw new Error(
        `${errorLabel} API error: ${response.status} - ${message}`,
      );
    } catch {
      throw new Error(
        `${errorLabel} API error: ${response.status} - ${errorBody}`,
      );
    }
  };

const normalizeOpenAiText = (
  value: string | null | undefined,
): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const extractOpenAiMessageText = (
  message: OpenAiThinkingMessage | undefined,
): string | undefined => {
  if (!message) {
    return undefined;
  }

  return (
    normalizeOpenAiText(message.content) ??
    normalizeOpenAiText(message.reasoning) ??
    normalizeOpenAiText(
      message.reasoning_details
        ?.map((detail) =>
          typeof detail === "object" && detail !== null
            ? "summary" in detail
              ? (detail as OpenAiThinkingDetail).summary
              : undefined
            : undefined,
        )
        .find((summary) => summary !== undefined),
    )
  );
};

// GPT-5 (and other "thinking" models exposed via OpenRouter) return the actual
// text inside reasoning fields instead of `message.content`, so we need a parser
// that falls back to those fields when the content is empty.
const parseOpenAiGPT5ThinkingStyleResponse =
  (errorLabel: string) =>
  async (response: Response): Promise<ProviderParsedResponse> => {
    if (response.status === 200) {
      // TODO: An unsafe type-cast is being used here, to temporarily satisfy tsc.
      const responseBody: OpenAiThinkingStyleResponse =
        (await response.json()) as OpenAiThinkingStyleResponse;
      const content = extractOpenAiMessageText(responseBody.choices?.[0]?.message);

      if (content) {
        return {
          text: content,
          usage: normalizeOpenAiUsage(responseBody.usage),
        };
      }

      throw new Error(
        `${errorLabel} API error: Could not extract text from thinking response. Body: ${JSON.stringify(responseBody)}`,
      );
    }

    const errorBody = await response.text();

    try {
      const parsedError: OpenAiStyleResponse = JSON.parse(errorBody);
      const message = parsedError.error?.message || errorBody;
      throw new Error(
        `${errorLabel} API error: ${response.status} - ${message}`,
      );
    } catch {
      throw new Error(
        `${errorLabel} API error: ${response.status} - ${errorBody}`,
      );
    }
  };

const buildGeminiRequest = (
  { prompt, model, maxTokens, assistantPrefillPrompt }: ProviderRequestOptions,
  apiKey: string,
): ProviderRequestBase => {
  const contents: Array<{
    role: "user" | "model";
    parts: Array<{ text: string }>;
  }> = [];

  contents.push({ role: "user", parts: [{ text: prompt }] });

  if (assistantPrefillPrompt) {
    contents.push({
      role: "model",
      parts: [{ text: assistantPrefillPrompt }],
    });
  }

  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  return {
    url,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
    loggableUrl: url.replace(/key=[^&]+/, "key=[REDACTED]"),
    loggableBody: body,
  };
};

const parseGeminiResponse = async (
  response: Response,
): Promise<ProviderParsedResponse> => {
  if (response.status === 200) {
    // TODO: An unsafe type-cast is being used here, to temporarily satisfy tsc.
    const responseBody: GeminiResponse =
      (await response.json()) as GeminiResponse;
    const responseText = responseBody.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("");

    if (responseText) {
      return {
        text: responseText,
        usage: normalizeGeminiUsage(responseBody.usageMetadata),
      };
    }

    throw new Error(
      `Gemini API error: Could not extract text from response. Body: ${JSON.stringify(responseBody)}`,
    );
  }

  const errorBody = await response.text();

  try {
    const parsedError: GeminiResponse = JSON.parse(errorBody);
    const message = parsedError.error?.message || errorBody;
    throw new Error(`Gemini API error: ${response.status} - ${message}`);
  } catch {
    throw new Error(`Gemini API error: ${response.status} - ${errorBody}`);
  }
};

/**
 * DeepSeek thinks by default, and its reasoning counts against `max_tokens`,
 * which can leave a cast with no answer. Thinking with tool calls also requires
 * sending `reasoning_content` back each turn, which the agent loop doesn't keep.
 */
export const deepseekRequestFields = { thinking: { type: "disabled" } };

export const providerConfigs: Record<LlmProviderId, ProviderConfig> = {
  groq: {
    providerId: "groq",
    apiOperation: "chat/completions",
    errorLabel: "Groq",
    // https://console.groq.com/docs/structured-outputs
    strictSchemaModels: new Set([
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "qwen/qwen3.8-27b",
    ]),
    buildRequest: buildOpenAiStyleRequest(
      "https://api.groq.com/openai/v1/chat/completions",
    ),
    parseResponse: parseOpenAiStyleResponse("Groq"),
  },
  cerebras: {
    providerId: "cerebras",
    apiOperation: "chat/completions",
    errorLabel: "Cerebras",
    buildRequest: buildOpenAiStyleRequest(
      "https://api.cerebras.ai/v1/chat/completions",
    ),
    parseResponse: parseOpenAiStyleResponse("Cerebras"),
  },
  gemini: {
    providerId: "gemini",
    apiOperation: "generateContent",
    errorLabel: "Gemini",
    buildRequest: buildGeminiRequest,
    parseResponse: parseGeminiResponse,
  },
  openrouter: {
    providerId: "openrouter",
    apiOperation: "chat/completions",
    errorLabel: "OpenRouter",
    buildRequest: buildOpenAiStyleRequest(
      "https://openrouter.ai/api/v1/chat/completions",
    ),
    parseResponse: parseOpenAiGPT5ThinkingStyleResponse("OpenRouter"),
  },
  deepseek: {
    providerId: "deepseek",
    apiOperation: "chat/completions",
    errorLabel: "DeepSeek",
    // DeepSeek offers only `json_object` mode, not strict `json_schema`, so no
    // model enforces cast schemas natively.
    // https://api-docs.deepseek.com/api/create-chat-completion
    buildRequest: buildOpenAiStyleRequest(
      "https://api.deepseek.com/chat/completions",
      { maxTokensParam: "max_tokens", extraBody: deepseekRequestFields },
    ),
    parseResponse: parseOpenAiStyleResponse("DeepSeek"),
  },
};
