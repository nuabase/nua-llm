import { z } from "zod";

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
 * listSchema() makes one, so a castArray call cannot be given an item schema by
 * mistake.
 */
export type ListSchema = ListRowKeys & {
  readonly [listSchemaBrand]: true;
  /** The schema of the whole list, as described to the model and validated against. */
  schema: z.ZodType;
};

/**
 * Builds the list schema whose rows each hold one `itemSchema` value:
 *
 *   array<{ <primaryKey>: string | number, <outputName>: <itemSchema> }>
 */
export function listSchema(itemSchema: z.ZodType, keys: ListRowKeys): ListSchema {
  const schema = z.array(
    z.object({
      [keys.primaryKey]: z.union([z.string(), z.number()]),
      [keys.outputName]: itemSchema,
    }),
  );
  return brand(keys, schema);
}

function brand(keys: ListRowKeys, schema: z.ZodType): ListSchema {
  return { primaryKey: keys.primaryKey, outputName: keys.outputName, schema } as ListSchema;
}
