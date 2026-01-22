export type JsonSchema = Record<string, unknown>;

export interface ArraySchemaOptions {
  primaryKey: string;
  outputName: string;
}

/**
 * Wraps a single-item schema for array batch operations.
 * Adds primary key field and wraps in array.
 *
 * Output format:
 * array<{
 *   <primaryKey>: string | number,
 *   <outputName>: <originalSchema>
 * }>
 */
export function wrapArraySchema(
  schema: JsonSchema,
  options: ArraySchemaOptions,
): JsonSchema {
  const { primaryKey, outputName } = options;

  const schemaVersion =
    typeof schema.$schema === "string" ? schema.$schema : undefined;

  const wrappedSchema: JsonSchema = {
    type: "array",
    items: {
      type: "object",
      required: [primaryKey, outputName],
      properties: {
        [primaryKey]: {
          anyOf: [{ type: "string" }, { type: "number" }, { type: "integer" }],
        },
        [outputName]: schema,
      },
    },
  };

  if (schemaVersion) {
    wrappedSchema.$schema = schemaVersion;
  }

  return wrappedSchema;
}

/**
 * Extracts the inner schema from a wrapped array schema.
 */
export function unwrapArraySchema(
  wrappedSchema: JsonSchema,
  outputName: string,
): JsonSchema | null {
  const items = wrappedSchema.items as JsonSchema | undefined;
  if (!items || typeof items !== "object") {
    return null;
  }

  const properties = items.properties as Record<string, JsonSchema> | undefined;
  if (!properties || typeof properties !== "object") {
    return null;
  }

  return properties[outputName] ?? null;
}
