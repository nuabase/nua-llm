import { JsonSchema } from "../../lib/schema-utils";
import { MappableInputData } from "../../lib/types";

/** A cast ready to run, as plain data. Its prompt is rendered per attempt (see prompts/render-prompt). */
export type CastRequest = ValueCastRequest | ListCastRequest;

/** Asks for one value. */
export type ValueCastRequest = {
  kind: "value";
  /** The caller's instructions. */
  prompt: string;
  data: unknown;
  outputName: string;
  /** The schema the result must satisfy. */
  schema: JsonSchema;
  maxTokens: number;
};

/** Asks for one result row per input row, each keyed by the input row's primary key. */
export type ListCastRequest = {
  kind: "list";
  /** The caller's instructions. */
  prompt: string;
  rows: MappableInputData;
  primaryKey: string;
  outputName: string;
  /** The schema the whole list must satisfy (see list-schema). */
  schema: JsonSchema;
  maxTokens: number;
};

/** The prompt one attempt sends. `system` is the part that tells the model how to shape its answer. */
export type RenderedPrompt = {
  system: string;
  full: string;
};
