import { CastResult } from './types';
import { listSchema, NuaLlmClient, providerEngines } from 'nua-llm-core';
import type {
  AnswerOrigin,
  CastResult as CoreCastResult,
  EngineRouter,
  LlmProviderId,
  ModelInput,
} from 'nua-llm-core';
import type { LocalAgent } from 'nua-llm-core/local-agent';
import { z } from 'zod';

// ========== Public Types ==========

/** API keys for the LLM providers direct mode may call. */
export type ProviderApiKeys = {
  [key in LlmProviderId]?: { apiKey: string };
};

/**
 * Either `providers`: API keys for LLM providers, with an optional default `model`.
 * Or `localAgent`: a coding-agent CLI on this machine, from `localAgent()` or
 * `findLocalAgent()` in "nuabase/local-agent".
 */
export type DirectConfig =
  | { providers: ProviderApiKeys; model?: ModelInput; localAgent?: never }
  | { localAgent: LocalAgent; providers?: never; model?: never };

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

// ========== Nua Class ==========

export class Nua {
  private readonly client: NuaLlmClient;

  private constructor(config: DirectConfig) {
    this.client = new NuaLlmClient(enginesFor(config));
  }

  /**
   * Runs casts in this process: on LLM providers' APIs with your API keys (`providers`), or
   * on a coding-agent CLI installed on this machine (`localAgent`, set up with `localAgent()` or
   * `findLocalAgent()` from "nuabase/local-agent").
   */
  static direct(config: DirectConfig): Nua {
    return new Nua(config);
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
    if (typeof prompt !== 'string' || prompt.trim() === '') {
      throw new TypeError('Prompt must be a non-empty string');
    }

    const outputSchema = options?.output?.schema ?? z.string();
    const outputName = options?.output?.name ?? 'result';

    const startTime = Date.now();
    const result = await this.client.castValue({
      model: options?.model,
      input: { prompt, data: options?.input ?? null },
      output: { name: outputName, schema: outputSchema },
    });
    return toDirectResult(result, Date.now() - startTime);
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
    if (typeof prompt !== 'string' || prompt.trim() === '') {
      throw new TypeError('Prompt must be a non-empty string');
    }

    if (!Array.isArray(options.input)) {
      throw new TypeError('Input must be an array for list()');
    }

    if (typeof options.primaryKey !== 'string' || options.primaryKey.trim() === '') {
      throw new TypeError('primaryKey must be a non-empty string');
    }

    const output = listSchema(options.output.schema, {
      primaryKey: options.primaryKey,
      outputName: options.output.name,
    });

    const startTime = Date.now();
    const result = await this.client.castArray<ListResultRow<TSchema, PrimaryKey>>({
      model: options.model,
      input: { prompt, data: options.input },
      output,
    });
    return toDirectResult(result, Date.now() - startTime);
  }
}

function enginesFor(config: DirectConfig): EngineRouter {
  if (config.localAgent) {
    return config.localAgent;
  }
  return providerEngines({ providers: config.providers, model: config.model });
}

function toDirectResult<T>(result: CoreCastResult<T>, latencyMs: number): CastResult<T> {
  if (!result.success) {
    const { error, reason, attempts } = result;
    return { success: false, error, reason, attempts, source: 'direct', latencyMs };
  }
  return {
    success: true,
    data: result.data,
    usage: result.usage,
    model: describeModel(result.origin),
    latencyMs,
    source: 'direct',
    meta: { ...result.origin, schemaEnforcement: result.schemaEnforcement },
  };
}

function describeModel(origin: AnswerOrigin): string {
  switch (origin.engine) {
    case 'http':
      return `${origin.provider}:${origin.model}`;
    case 'local-agent':
      return `${origin.agent}:${origin.model ?? 'default'}`;
  }
}
