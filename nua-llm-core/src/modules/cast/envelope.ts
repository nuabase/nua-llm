import { JsonSchema } from "../../lib/schema-utils";

// Native schema enforcement needs an object at the root (coding-agent CLIs and
// OpenAI-style structured output both require one), so the engine enforces
// { value: <result> } and the result is unwrapped afterwards.

export const ENVELOPE_KEY = "value";

export function wrapInEnvelope(schema: JsonSchema): JsonSchema {
  const { $schema: _ignored, ...inner } = schema;
  return {
    type: "object",
    properties: { [ENVELOPE_KEY]: inner },
    required: [ENVELOPE_KEY],
    additionalProperties: false,
  };
}

export function unwrapEnvelope(
  envelope: unknown,
): { found: true; value: unknown } | { found: false } {
  if (typeof envelope !== "object" || envelope === null || !(ENVELOPE_KEY in envelope)) {
    return { found: false };
  }
  return { found: true, value: (envelope as Record<string, unknown>)[ENVELOPE_KEY] };
}
