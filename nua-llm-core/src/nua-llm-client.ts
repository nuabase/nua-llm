import { isNuaValidationError } from "./lib/nua-errors";
import { JsonSchema } from "./lib/schema-utils";
import { validateMappableInputData } from "./lib/validate-mappable-input-data";
import { CastRequest } from "./modules/cast/cast-request";
import { ListSchema } from "./modules/cast/list-schema";
import { CastResult, runCast } from "./modules/cast/run-cast";
import { EngineRouter } from "./modules/engine/engine-router";
import { ModelInput } from "./modules/model-info";

export type CastValueParams = {
  model?: ModelInput;
  maxTokens?: number;
  input: { prompt: string; data?: unknown };
  output: { name: string; schema: object };
};

export type CastArrayParams = {
  model?: ModelInput;
  maxTokens?: number;
  input: { prompt: string; data: unknown[] };
  /** Built with listSchema(); it names each row's primary key and output field. */
  output: ListSchema;
};

const DEFAULT_MAX_TOKENS = 4096;

/**
 * Turns a prompt, data and a JSON schema into a validated value. Where the calls
 * run is up to the engine router it is given: providerEngines() for LLM
 * providers' APIs, or localAgent() from "nua-llm-core/local-agent".
 */
export class NuaLlmClient {
  constructor(private readonly engines: EngineRouter) {}

  async castValue<T = unknown>(params: CastValueParams): Promise<CastResult<T>> {
    const route = this.engines.route(params.model);
    if (route.kind === "unroutable") {
      return { success: false, error: route.message };
    }

    const request: CastRequest = {
      kind: "value",
      prompt: params.input.prompt,
      data: params.input.data,
      outputName: params.output.name,
      schema: params.output.schema as JsonSchema,
      maxTokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
    };
    return runCast<T>(route.engine, request, this.engines.logger);
  }

  async castArray<T = unknown>(params: CastArrayParams): Promise<CastResult<T[]>> {
    const { primaryKey, outputName, jsonSchema } = params.output;
    const rows = validateMappableInputData(params.input.data, primaryKey);
    if (isNuaValidationError(rows)) {
      return { success: false, error: rows.message };
    }

    const route = this.engines.route(params.model);
    if (route.kind === "unroutable") {
      return { success: false, error: route.message };
    }

    const request: CastRequest = {
      kind: "list",
      prompt: params.input.prompt,
      rows,
      primaryKey,
      outputName,
      schema: jsonSchema,
      maxTokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
    };
    return runCast<T[]>(route.engine, request, this.engines.logger);
  }
}
