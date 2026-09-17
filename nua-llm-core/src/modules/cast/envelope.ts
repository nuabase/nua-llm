import { JsonSchema } from "../../lib/schema-utils";

// Native schema enforcement needs an object at the root (coding-agent CLIs and
// OpenAI-style structured output both require one), so the engine enforces
// { value: <result> } and the result is unwrapped afterwards.

export const ENVELOPE_KEY = "value";

export function wrapInEnvelope(schema: JsonSchema): JsonSchema {
  return {
    type: "object",
    properties: { [ENVELOPE_KEY]: withoutSchemaKeyword(schema) },
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

/** Keywords whose value is a subschema or an array of subschemas. */
const SUBSCHEMA_KEYWORDS = new Set([
  "items",
  "additionalItems",
  "prefixItems",
  "contains",
  "additionalProperties",
  "propertyNames",
  "unevaluatedItems",
  "unevaluatedProperties",
  "not",
  "if",
  "then",
  "else",
  "allOf",
  "anyOf",
  "oneOf",
]);

/** Keywords whose value maps names to subschemas. */
const SUBSCHEMA_MAP_KEYWORDS = new Set([
  "properties",
  "patternProperties",
  "dependentSchemas",
  "dependencies",
  "$defs",
  "definitions",
]);

/**
 * Removes $schema from a schema and all its subschemas, since the envelope nests
 * them below the root. Property names and literal values (const, enum, default)
 * are left alone.
 */
function withoutSchemaKeyword(schema: JsonSchema): JsonSchema {
  const result: JsonSchema = {};
  for (const [keyword, value] of Object.entries(schema)) {
    if (keyword === "$schema") continue;
    if (SUBSCHEMA_KEYWORDS.has(keyword)) {
      result[keyword] = Array.isArray(value) ? value.map(subschema) : subschema(value);
    } else if (SUBSCHEMA_MAP_KEYWORDS.has(keyword) && isObject(value)) {
      result[keyword] = Object.fromEntries(
        Object.entries(value).map(([name, child]) => [name, subschema(child)]),
      );
    } else {
      result[keyword] = value;
    }
  }
  return result;
}

/** Subschemas can also be booleans, and `dependencies` values can be arrays of names. */
function subschema(value: unknown): unknown {
  return isObject(value) ? withoutSchemaKeyword(value) : value;
}

function isObject(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
