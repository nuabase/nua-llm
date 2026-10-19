import { GatewayApi, GatewayConfig } from './gateway-api';
import { CastArrayParams, CastResult, CastValueParams, ModelInput, QueueResult } from './types';
import { z } from 'zod';

// ========== Public Types ==========

export type OutputDef<TSchema extends z.ZodTypeAny> = {
  name: string;
  schema: TSchema;
};

export type GetOptions<TSchema extends z.ZodTypeAny> = {
  input?: unknown;
  output: OutputDef<TSchema>;
  model?: ModelInput;
};

export type ListOptions<
  TSchema extends z.ZodTypeAny,
  TData extends Record<string, unknown>,
  PrimaryKey extends keyof TData & string,
> = {
  input: TData[];
  primaryKey: PrimaryKey;
  output: OutputDef<TSchema>;
  model?: ModelInput;
};

// Result row for list operations: primaryKey + output field
export type ListResultRow<TSchema extends z.ZodTypeAny, PrimaryKey extends string> = {
  [K in PrimaryKey]: string | number;
} & {
  [outputName: string]: z.infer<TSchema>;
};

// ========== NuaGateway Class ==========

/**
 * Client for the hosted Nuabase API. Every call sends its prompt, input data and output schema
 * to Nuabase, which runs the LLM request, caches results row by row, and records the request.
 *
 * With no config, it reads the API key from NUABASE_API_KEY and the API URL from NUABASE_API_URL
 * (Node.js only).
 */
export class NuaGateway {
  private readonly api: GatewayApi;

  constructor(config: GatewayConfig = {}) {
    this.api = new GatewayApi(config);
  }

  // ========== get() - Single Value Operations ==========

  // Overload 1: Prompt only → string
  get(prompt: string): Promise<CastResult<string>>;

  // Overload 2: With options → typed result
  get<TSchema extends z.ZodTypeAny>(
    prompt: string,
    options: GetOptions<TSchema>
  ): Promise<CastResult<z.infer<TSchema>>>;

  // Implementation
  async get(prompt: string, options?: GetOptions<z.ZodTypeAny>): Promise<CastResult<unknown>> {
    return this.api.castValue(valueRequest(prompt, options));
  }

  // ========== list() - Array Operations ==========

  async list<
    TSchema extends z.ZodTypeAny,
    TData extends Record<string, unknown>,
    PrimaryKey extends keyof TData & string,
  >(
    prompt: string,
    options: ListOptions<TSchema, TData, PrimaryKey>
  ): Promise<CastResult<ListResultRow<TSchema, PrimaryKey>[]>> {
    return this.api.castArray(arrayRequest(prompt, options, 'list()'));
  }

  // ========== queueGet() - Async Single Value ==========

  // Overload 1: Prompt only
  queueGet(prompt: string): Promise<QueueResult>;

  // Overload 2: With options
  queueGet<TSchema extends z.ZodTypeAny>(
    prompt: string,
    options: GetOptions<TSchema>
  ): Promise<QueueResult>;

  // Implementation
  async queueGet(prompt: string, options?: GetOptions<z.ZodTypeAny>): Promise<QueueResult> {
    return this.api.queueCastValue(valueRequest(prompt, options));
  }

  // ========== queueList() - Async Array Operations ==========

  async queueList<
    TSchema extends z.ZodTypeAny,
    TData extends Record<string, unknown>,
    PrimaryKey extends keyof TData & string,
  >(prompt: string, options: ListOptions<TSchema, TData, PrimaryKey>): Promise<QueueResult> {
    return this.api.queueCastArray(arrayRequest(prompt, options, 'queueList()'));
  }
}

// ========== Request building ==========

function valueRequest(prompt: string, options?: GetOptions<z.ZodTypeAny>): CastValueParams {
  checkPrompt(prompt);

  return {
    prompt,
    data: options?.input ?? null,
    outputName: options?.output?.name ?? 'result',
    outputSchema: z.toJSONSchema(options?.output?.schema ?? z.string()),
    model: options?.model,
  };
}

function arrayRequest(
  prompt: string,
  options: ListOptions<z.ZodTypeAny, Record<string, unknown>, string>,
  method: string
): CastArrayParams {
  checkPrompt(prompt);

  if (!Array.isArray(options.input)) {
    throw new TypeError(`Input must be an array for ${method}`);
  }

  if (typeof options.primaryKey !== 'string' || options.primaryKey.trim() === '') {
    throw new TypeError('primaryKey must be a non-empty string');
  }

  return {
    prompt,
    data: options.input,
    primaryKey: options.primaryKey,
    outputName: options.output.name,
    outputSchema: z.toJSONSchema(options.output.schema),
    model: options.model,
  };
}

function checkPrompt(prompt: string): void {
  if (typeof prompt !== 'string' || prompt.trim() === '') {
    throw new TypeError('Prompt must be a non-empty string');
  }
}
