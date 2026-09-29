import { Logger } from "../../../lib/logger";
import { JsonSchema } from "../../../lib/schema-utils";
import { toStrictSchema } from "../../../lib/strict-json-schema";
import { Answer, AttemptFailure, AttemptOutcome, AttemptRequest, LlmEngine } from "../llm-engine";
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

  /** Enforced in strict mode on models whose provider supports it; other models get the schema in the prompt. */
  nativeSchema(envelopeSchema: JsonSchema): JsonSchema | null {
    const { provider, model } = this.target;
    if (!providerConfigs[provider].strictSchemaModels?.has(model)) return null;
    return toStrictSchema(envelopeSchema);
  }

  async attempt(request: AttemptRequest): Promise<AttemptOutcome> {
    const { provider, model, apiKey } = this.target;
    const config = providerConfigs[provider];
    const responseSchema = request.enforcement.kind === "native" ? request.enforcement.schema : undefined;

    const call = await callProvider(
      {
        target: this.target,
        apiOperation: config.apiOperation,
        maxTokens: request.maxTokens,
        request: config.buildRequest(
          { prompt: request.prompt, model, maxTokens: request.maxTokens, responseSchema },
          apiKey,
        ),
        parseResponse: config.parseResponse,
        responseLength: (reply) => reply.text.length,
        usage: (reply) => reply.usage,
      },
      this.logger,
    );

    if (call.kind === "failed") {
      return { kind: "failed", failure: failureForStatus(call.status, call.message, responseSchema !== undefined) };
    }

    const answer = responseSchema ? readEnvelope(call.reply.text) : { kind: "text" as const, text: call.reply.text };
    if (!answer) {
      return {
        kind: "failed",
        failure: { kind: "transient", message: `Structured output is not valid JSON: ${call.reply.text}` },
      };
    }

    return {
      kind: "answered",
      answer,
      usage: call.reply.usage,
      origin: { engine: "http", provider, model },
    };
  }
}

function readEnvelope(text: string): Answer | null {
  try {
    return { kind: "structured", envelope: JSON.parse(text) };
  } catch {
    return null;
  }
}

function failureForStatus(status: number | undefined, message: string, sentSchema: boolean): AttemptFailure {
  // A 400 on a request that carried a schema is most likely the provider refusing the schema.
  if (sentSchema && status === 400) return { kind: "schema-rejected", message };
  const fatal = status !== undefined && FATAL_HTTP_STATUSES.has(status);
  return { kind: fatal ? "fatal" : "transient", message };
}
