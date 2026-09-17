import {
  generateSpanId,
  logLlmCallComplete,
  logLlmCallError,
  logLlmCallStart,
  Logger,
} from "../../../lib/logger";
import {
  LlmProviderId,
  NormalizedUsage,
  ProviderRequestBase,
  providerConfigs,
} from "./provider-config";

/** A provider's model, and the API key to call it with. */
export type ProviderTarget = {
  provider: LlmProviderId;
  model: string;
  apiKey: string;
};

/** One HTTP request to an LLM provider, and how to read its reply. */
export type ProviderCall<T> = {
  target: ProviderTarget;
  /** The kind of request, for the log (e.g. "chat/completions", "agentic"). */
  apiOperation: string;
  maxTokens: number;
  request: ProviderRequestBase;
  /** Throws when the reply is an error or cannot be read. */
  parseResponse: (response: Response) => Promise<T>;
  /** Characters of reply text, for the log. */
  responseLength: (reply: T) => number;
  usage: (reply: T) => NormalizedUsage | undefined;
};

export type ProviderCallResult<T> =
  | { kind: "ok"; reply: T }
  /** `status` is undefined when no HTTP response arrived. */
  | { kind: "failed"; status: number | undefined; message: string };

/** Sends the request and reads the reply, logging the start and the end of the call. Never throws. */
export async function callProvider<T>(
  call: ProviderCall<T>,
  logger: Logger,
): Promise<ProviderCallResult<T>> {
  const { target, apiOperation, request } = call;
  const method = request.method ?? "POST";
  const spanId = generateSpanId();
  const startTime = Date.now();
  let status: number | undefined;

  logLlmCallStart(logger, spanId, target.provider, apiOperation, {
    url: request.loggableUrl ?? request.url,
    httpMethod: method,
    model: target.model,
    maxTokens: call.maxTokens,
  });

  try {
    const response = await fetch(request.url, {
      method,
      headers: request.headers ?? {},
      body: toFetchableBody(request.body),
    });
    status = response.status;

    const reply = await call.parseResponse(response);

    logLlmCallComplete(
      logger,
      spanId,
      target.provider,
      apiOperation,
      {
        status: response.status,
        responseLength: call.responseLength(reply),
        headers: Object.fromEntries(response.headers.entries()),
        usage: call.usage(reply),
      },
      Date.now() - startTime,
    );

    return { kind: "ok", reply };
  } catch (error) {
    logLlmCallError(logger, spanId, target.provider, apiOperation, error, Date.now() - startTime);

    return {
      kind: "failed",
      status,
      message: `${providerConfigs[target.provider].errorLabel} API request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

function toFetchableBody(body: unknown): string | undefined {
  if (typeof body === "string" || body === undefined) {
    return body;
  }
  return JSON.stringify(body);
}
