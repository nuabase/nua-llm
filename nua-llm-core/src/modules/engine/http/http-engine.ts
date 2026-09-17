import { Logger } from "../../../lib/logger";
import { AttemptFailure, AttemptOutcome, AttemptRequest, LlmEngine } from "../llm-engine";
import { callProvider, ProviderTarget } from "./provider-call";
import { providerConfigs } from "./provider-config";

// Statuses where repeating the same request cannot succeed: a bad API key, no
// access, or an unknown model or endpoint.
const FATAL_HTTP_STATUSES = new Set([401, 403, 404]);

/** Answers cast attempts on one model of an LLM provider's HTTP API. */
export class HttpEngine implements LlmEngine {
  constructor(
    private readonly target: ProviderTarget,
    private readonly logger: Logger,
  ) {}

  /** Provider APIs are given the schema in the prompt; none is enforced natively yet. */
  nativeSchema(): null {
    return null;
  }

  async attempt(request: AttemptRequest): Promise<AttemptOutcome> {
    const { provider, model, apiKey } = this.target;
    const config = providerConfigs[provider];

    const call = await callProvider(
      {
        target: this.target,
        apiOperation: config.apiOperation,
        maxTokens: request.maxTokens,
        request: config.buildRequest(
          { prompt: request.prompt, model, maxTokens: request.maxTokens },
          apiKey,
        ),
        parseResponse: config.parseResponse,
        responseLength: (reply) => reply.text.length,
        usage: (reply) => reply.usage,
      },
      this.logger,
    );

    if (call.kind === "failed") {
      return { kind: "failed", failure: failureForStatus(call.status, call.message) };
    }

    return {
      kind: "answered",
      answer: { kind: "text", text: call.reply.text },
      usage: call.reply.usage,
      origin: { engine: "http", provider, model },
    };
  }
}

function failureForStatus(status: number | undefined, message: string): AttemptFailure {
  const fatal = status !== undefined && FATAL_HTTP_STATUSES.has(status);
  return { kind: fatal ? "fatal" : "transient", message };
}
