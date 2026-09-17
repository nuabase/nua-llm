import { NuaValidationError } from "../../lib/nua-errors";
import { JsonSchema } from "../../lib/schema-utils";

declare const listSchemaBrand: unique symbol;

/** Names the two fields of every row in a list result. */
export type ListRowKeys = {
  /** Holds the primary key of the input row the result row answers. */
  primaryKey: string;
  /** Holds the output value. */
  outputName: string;
};

/**
 * The schema of a list cast's result, with the row keys it was built for. Only
 * listSchema() and parseListSchema() make one, so a castArray call cannot be
 * given an item schema by mistake.
 */
export type ListSchema = ListRowKeys & {
  readonly [listSchemaBrand]: true;
  /** The JSON schema of the whole list, as sent to the model and validated against. */
  jsonSchema: JsonSchema;
};

/**
 * Builds the list schema whose rows each hold one `itemSchema` value:
 *
 *   array<{ <primaryKey>: string | number, <outputName>: <itemSchema> }>
 */
export function listSchema(itemSchema: JsonSchema, keys: ListRowKeys): ListSchema {
  const jsonSchema: JsonSchema = {
    type: "array",
    items: {
      type: "object",
      required: [keys.primaryKey, keys.outputName],
      properties: {
        [keys.primaryKey]: {
          anyOf: [{ type: "string" }, { type: "number" }, { type: "integer" }],
        },
        [keys.outputName]: itemSchema,
      },
    },
  };

  if (typeof itemSchema.$schema === "string") {
    jsonSchema.$schema = itemSchema.$schema;
  }

  return brand(keys, jsonSchema);
}

/**
 * Reads back a list schema that was built by listSchema() and stored as JSON. It is
 * used exactly as stored, so a change to listSchema() does not alter stored ones.
 */
export function parseListSchema(jsonSchema: unknown, keys: ListRowKeys): ListSchema | NuaValidationError {
  if (isObject(jsonSchema) && jsonSchema.type === "array" && rowsHoldKeys(jsonSchema.items, keys)) {
    return brand(keys, jsonSchema);
  }
  return {
    kind: "validation-error",
    message: `Not a list schema with rows keyed by "${keys.primaryKey}" holding "${keys.outputName}"`,
  };
}

/** Whether a list schema's `items` requires both row keys. */
function rowsHoldKeys(items: unknown, keys: ListRowKeys): boolean {
  if (!isObject(items) || !isObject(items.properties) || !Array.isArray(items.required)) {
    return false;
  }
  const { properties, required } = items;
  return [keys.primaryKey, keys.outputName].every((key) => key in properties && required.includes(key));
}

function brand(keys: ListRowKeys, jsonSchema: JsonSchema): ListSchema {
  return { primaryKey: keys.primaryKey, outputName: keys.outputName, jsonSchema } as ListSchema;
}

function isObject(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
