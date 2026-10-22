import { z } from "zod";

export type JsonSchema = Record<string, unknown>;

/**
 * The JSON schema that tells the model what to produce. It describes the
 * schema's input side, since the model writes what the schema parses (before
 * defaults and transforms apply). Throws for types JSON schema cannot express.
 */
export function describeSchema(schema: z.ZodType): JsonSchema {
  return z.toJSONSchema(schema, { io: "input" }) as JsonSchema;
}
