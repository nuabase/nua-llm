import { JsonSchema } from "./schema-utils";

// Keywords OpenAI strict mode rejects. A schema using any of them is not
// converted, rather than silently loosened.
const STRICT_UNSUPPORTED_KEYWORDS = new Set([
  "patternProperties",
  "propertyNames",
  "unevaluatedProperties",
  "dependentRequired",
  "dependentSchemas",
  "if",
  "then",
  "else",
  "not",
  "allOf",
  "oneOf",
]);

/**
 * Converts a schema to OpenAI strict mode, or returns null when that would
 * change which values are valid (optional properties, open-ended objects,
 * unsupported keywords).
 */
export function toStrictSchema(schema: JsonSchema): JsonSchema | null {
  return strictNode(schema);
}

function strictNode(node: unknown): JsonSchema | null {
  if (typeof node !== "object" || node === null || Array.isArray(node)) {
    return null;
  }
  const schema = node as JsonSchema;

  for (const key of Object.keys(schema)) {
    if (STRICT_UNSUPPORTED_KEYWORDS.has(key)) return null;
  }

  const result: JsonSchema = { ...schema };
  delete result.$schema;

  const isObject =
    schema.type === "object" ||
    (Array.isArray(schema.type) && schema.type.includes("object")) ||
    schema.properties !== undefined;

  if (isObject) {
    const properties = (schema.properties ?? {}) as Record<string, unknown>;
    if (schema.additionalProperties !== undefined && schema.additionalProperties !== false) {
      return null;
    }
    const required = new Set((schema.required as string[] | undefined) ?? []);
    const shapedProperties: Record<string, JsonSchema> = {};
    for (const [name, child] of Object.entries(properties)) {
      if (!required.has(name)) return null;
      const shaped = strictNode(child);
      if (!shaped) return null;
      shapedProperties[name] = shaped;
    }
    result.properties = shapedProperties;
    result.required = Object.keys(shapedProperties);
    result.additionalProperties = false;
  }

  if (schema.items !== undefined) {
    const shaped = strictNode(schema.items);
    if (!shaped) return null;
    result.items = shaped;
  }
  if (schema.prefixItems !== undefined) return null;

  if (schema.anyOf !== undefined) {
    const variants = (schema.anyOf as unknown[]).map(strictNode);
    if (variants.some((v) => v === null)) return null;
    result.anyOf = variants;
  }

  for (const defsKey of ["$defs", "definitions"]) {
    if (schema[defsKey] !== undefined) {
      const defs: Record<string, JsonSchema> = {};
      for (const [name, child] of Object.entries(schema[defsKey] as Record<string, unknown>)) {
        const shaped = strictNode(child);
        if (!shaped) return null;
        defs[name] = shaped;
      }
      result[defsKey] = defs;
    }
  }

  return result;
}
