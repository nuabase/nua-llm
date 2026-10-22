import { JsonSchema } from "../../lib/schema-utils";

// Native schema enforcement needs an object at the root (coding-agent CLIs and
// OpenAI-style structured output both require one), so the engine enforces
// { value: <result> } and the result is unwrapped afterwards.

export const ENVELOPE_KEY = "value";

// The schema's refs are written relative to its own root ("#/$defs/Account",
// or "#" for a recursive schema), which becomes the envelope's root once it is
// nested. So its definitions move up to the envelope's root, where those refs
// find them, and every other local ref is pointed at the value field.

const ENVELOPE_VALUE_POINTER = `#/properties/${ENVELOPE_KEY}`;
const DEFINITIONS_KEYWORDS = ["$defs", "definitions"];

export function wrapInEnvelope(schema: JsonSchema): JsonSchema {
  const value = nestedBelowEnvelope(schema);
  const envelope: JsonSchema = {
    type: "object",
    properties: { [ENVELOPE_KEY]: value },
    required: [ENVELOPE_KEY],
    additionalProperties: false,
  };
  for (const keyword of DEFINITIONS_KEYWORDS) {
    if (keyword in value) {
      envelope[keyword] = value[keyword];
      delete value[keyword];
    }
  }
  return envelope;
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
 * Readies a schema and all its subschemas to sit below the envelope's root:
 * removes $schema, and points local refs outside the definitions at the value
 * field. Property names and literal values (const, enum, default) are left alone.
 */
function nestedBelowEnvelope(schema: JsonSchema): JsonSchema {
  const result: JsonSchema = {};
  for (const [keyword, value] of Object.entries(schema)) {
    if (keyword === "$schema") continue;
    if (keyword === "$ref" && typeof value === "string") {
      result[keyword] = refBelowEnvelope(value);
    } else if (SUBSCHEMA_KEYWORDS.has(keyword)) {
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
  return isObject(value) ? nestedBelowEnvelope(value) : value;
}

/**
 * A ref into the definitions still resolves once they move to the envelope's
 * root. Any other JSON pointer into the schema ("#", "#/properties/name") gets
 * the value field's path in front. Anchors and other documents' refs are kept.
 */
function refBelowEnvelope(ref: string): string {
  const isPointer = ref === "#" || ref.startsWith("#/");
  const intoDefinitions = DEFINITIONS_KEYWORDS.some((keyword) => ref.startsWith(`#/${keyword}/`));
  return isPointer && !intoDefinitions ? ENVELOPE_VALUE_POINTER + ref.slice(1) : ref;
}

function isObject(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
