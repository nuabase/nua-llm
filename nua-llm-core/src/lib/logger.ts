export interface Logger {
  debug(message: string, context?: object): void;
  info(message: string, context?: object): void;
  warn(message: string, context?: object): void;
  error(message: string, context?: object): void;
}

export class ConsoleLogger implements Logger {
  debug(message: string, context?: object): void {
    console.debug(`[DEBUG] ${message}`, context || "");
  }
  info(message: string, context?: object): void {
    console.info(`[INFO] ${message}`, context || "");
  }
  warn(message: string, context?: object): void {
    console.warn(`[WARN] ${message}`, context || "");
  }
  error(message: string, context?: object): void {
    console.error(`[ERROR] ${message}`, context || "");
  }
}

export const generateSpanId = (): string => crypto.randomUUID();

// ============================================================================
// Shared logging utilities (used by api-server and nua-llm-core)
// ============================================================================

/**
 * Generic text truncation for logging previews
 */
export function truncateText(
  text: string,
  limit: number = 500,
): { preview: string; length: number } {
  const length = text.length;
  if (length <= limit) {
    return { preview: text, length };
  }
  return { preview: text.slice(0, limit), length };
}

/**
 * Generic header filtering with allowlist and optional redaction
 */
export function pickHeaders(
  headers: Record<string, string | string[] | undefined>,
  allowlist: Set<string>,
  redactSet?: Set<string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (redactSet?.has(lowerKey)) {
      result[key] = "[REDACTED]";
    } else if (allowlist.has(lowerKey)) {
      result[key] = Array.isArray(value) ? value.join(", ") : (value ?? "");
    }
  }
  return result;
}

/**
 * Error normalization for logging
 */
export function normalizeError(error: unknown): { message: string; stack?: string } | string {
  return error instanceof Error
    ? { message: error.message, stack: error.stack }
    : String(error);
}

// ============================================================================
// LLM-specific logging
// ============================================================================

// Typed interfaces for LLM logging
interface LlmRequestLog {
  url: string;
  httpMethod: string;
  model: string;
  maxTokens: number;
}

interface LlmResponseLog {
  status: number;
  responseText: string;
  headers: Record<string, string>;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

// Header allowlist for LLM responses - only log relevant headers
const LLM_RESPONSE_HEADER_ALLOWLIST = new Set([
  "x-request-id",
  "x-ratelimit-limit-requests",
  "x-ratelimit-limit-tokens",
  "x-ratelimit-remaining-requests",
  "x-ratelimit-remaining-tokens",
  "x-groq-region",
]);

export const logLlmCallStart = (
  logger: Logger,
  spanId: string,
  service: string,
  method: string,
  request: LlmRequestLog,
) => {
  logger.info("LLM call started", {
    type: "llm_call_start",
    span_id: spanId,
    service,
    method,
    ...request,
  });
};

export const logLlmCallComplete = (
  logger: Logger,
  spanId: string,
  service: string,
  method: string,
  response: LlmResponseLog,
  duration: number,
) => {
  const { headers, responseText, ...rest } = response;
  const { preview: responsePreview, length: responseLength } = truncateText(responseText);
  logger.info("LLM call completed", {
    type: "llm_call_complete",
    span_id: spanId,
    service,
    method,
    ...rest,
    responsePreview,
    responseLength,
    ...pickHeaders(headers, LLM_RESPONSE_HEADER_ALLOWLIST),
    duration_ms: duration,
  });
};

export const logLlmCallError = (
  logger: Logger,
  spanId: string,
  service: string,
  method: string,
  error: unknown,
  duration: number,
) => {
  logger.error("LLM call failed", {
    type: "llm_call_error",
    span_id: spanId,
    service,
    method,
    error: normalizeError(error),
    duration_ms: duration,
  });
};
