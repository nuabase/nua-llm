import { DirectBackend, DirectConfig } from './backend/direct';
import { GatewayBackend, GatewayConfig } from './backend/gateway';
import { CastResult, LlmBackend, QueueResult } from './backend/types';
import { z } from 'zod';

// ========== Public Types ==========

export type OutputDef<TSchema extends z.ZodTypeAny> = {
  name: string;
  schema: TSchema;
};

export type GetOptions<TSchema extends z.ZodTypeAny> = {
  input?: unknown;
  output: OutputDef<TSchema>;
};

export type ListOptions<
  TSchema extends z.ZodTypeAny,
  TData extends Record<string, unknown>,
  PrimaryKey extends keyof TData & string,
> = {
  input: TData[];
  primaryKey: PrimaryKey;
  output: OutputDef<TSchema>;
};

// Result row for list operations: primaryKey + output field
export type ListResultRow<TSchema extends z.ZodTypeAny, PrimaryKey extends string> = {
  [K in PrimaryKey]: string | number;
} & {
  [outputName: string]: z.infer<TSchema>;
};

// ========== Nua Class ==========

export class Nua {
  private readonly backend: LlmBackend;

  private constructor(backend: LlmBackend) {
    this.backend = backend;
  }

  static gateway(config: GatewayConfig): Nua {
    return new Nua(new GatewayBackend(config));
  }

  static direct(config: DirectConfig): Nua {
    return new Nua(new DirectBackend(config));
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
    const jsonSchema = z.toJSONSchema(outputSchema);

    return this.backend.castValue({
      prompt,
      data: options?.input ?? null,
      outputName,
      outputSchema: jsonSchema,
    });
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

    const jsonSchema = z.toJSONSchema(options.output.schema);

    return this.backend.castArray({
      prompt,
      data: options.input,
      primaryKey: options.primaryKey,
      outputName: options.output.name,
      outputSchema: jsonSchema,
    });
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
    if (typeof prompt !== 'string' || prompt.trim() === '') {
      throw new TypeError('Prompt must be a non-empty string');
    }

    if (!this.backend.queueCastValue) {
      throw new Error('Queue operations are only supported in gateway mode');
    }

    const outputSchema = options?.output?.schema ?? z.string();
    const outputName = options?.output?.name ?? 'result';
    const jsonSchema = z.toJSONSchema(outputSchema);

    return this.backend.queueCastValue({
      prompt,
      data: options?.input ?? null,
      outputName,
      outputSchema: jsonSchema,
    });
  }

  // ========== queueList() - Async Array Operations ==========

  async queueList<
    TSchema extends z.ZodTypeAny,
    TData extends Record<string, unknown>,
    PrimaryKey extends keyof TData & string,
  >(prompt: string, options: ListOptions<TSchema, TData, PrimaryKey>): Promise<QueueResult> {
    if (typeof prompt !== 'string' || prompt.trim() === '') {
      throw new TypeError('Prompt must be a non-empty string');
    }

    if (!this.backend.queueCastArray) {
      throw new Error('Queue operations are only supported in gateway mode');
    }

    if (!Array.isArray(options.input)) {
      throw new TypeError('Input must be an array for queueList()');
    }

    if (typeof options.primaryKey !== 'string' || options.primaryKey.trim() === '') {
      throw new TypeError('primaryKey must be a non-empty string');
    }

    const jsonSchema = z.toJSONSchema(options.output.schema);

    return this.backend.queueCastArray({
      prompt,
      data: options.input,
      primaryKey: options.primaryKey,
      outputName: options.output.name,
      outputSchema: jsonSchema,
    });
  }
}
