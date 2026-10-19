import { AuthTokenManager } from './lib/auth';
import { resolveConfigValue } from './lib/env';
import { parseErrorResponse } from './lib/error-response';
import { getErrorMessageFromException } from './lib/error-utils';
import { CastResult, ModelInput, NormalizedUsage, QueueResult } from './types';
import { z } from 'zod';

// ========== Public Types ==========

type GatewayApiKeyConfig = {
  apiKey?: string;
  fetchToken?: never;
  baseUrl?: string;
  dangerouslyAllowBrowserApiKeyInLocalhost?: boolean;
};

type GatewayTokenConfig = {
  fetchToken: () => Promise<string>;
  apiKey?: never;
  baseUrl?: string;
};

export type GatewayConfig = GatewayApiKeyConfig | GatewayTokenConfig;

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

// ========== Nuabase API responses ==========

type ApiCastValueResponse = {
  llmRequestId: string;
  data: unknown;
  isCacheHit: boolean;
  llmUsage: NormalizedUsage;
  cacheUsage: NormalizedUsage;
  model: string;
};

type ApiCastArrayResponse = {
  llmRequestId: string;
  data: unknown[];
  cacheHits: number;
  llmUsage: NormalizedUsage;
  cacheUsage: NormalizedUsage;
  model: string;
};

// A queued request's id: the llm_request that the job will fill in.
type ApiQueuedResponse = {
  id: string;
};

type ApiErrorResponse = {
  error: string;
};

function isErrorResponse(response: unknown): response is ApiErrorResponse {
  return Boolean(response && typeof response === 'object' && 'error' in response);
}

// ========== NuaGateway Class ==========

/**
 * Client for the hosted Nuabase API. Every call sends its prompt, input data and output schema
 * to Nuabase, which runs the LLM request, caches results row by row, and records the request.
 *
 * With no config, it reads the API key from NUABASE_API_KEY and the API URL from NUABASE_API_URL
 * (Node.js only).
 */
export class NuaGateway {
  private readonly baseUrl: string;
  private readonly authManager: AuthTokenManager;

  constructor(config: GatewayConfig = {}) {
    this.baseUrl =
      resolveConfigValue(config, 'baseUrl', 'NUABASE_API_URL') || 'https://api.nuabase.com';
    this.authManager = new AuthTokenManager(config);
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
    const body = valueBody(prompt, options);

    const startTime = Date.now();
    const response = await this.post('cast/value/now', body);
    const latencyMs = Date.now() - startTime;

    if (isErrorResponse(response)) {
      return { success: false, error: response.error, source: 'gateway', latencyMs };
    }

    const apiResponse = response as ApiCastValueResponse;
    return {
      success: true,
      data: apiResponse.data,
      usage: combinedUsage(apiResponse.llmUsage, apiResponse.cacheUsage),
      model: apiResponse.model,
      latencyMs,
      source: 'gateway',
      meta: {
        requestId: apiResponse.llmRequestId,
        cached: apiResponse.isCacheHit,
        llmUsage: apiResponse.llmUsage,
        cacheUsage: apiResponse.cacheUsage,
      },
    };
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
    const body = arrayBody(prompt, options, 'list()');

    const startTime = Date.now();
    const response = await this.post('cast/array/now', body);
    const latencyMs = Date.now() - startTime;

    if (isErrorResponse(response)) {
      return { success: false, error: response.error, source: 'gateway', latencyMs };
    }

    const apiResponse = response as ApiCastArrayResponse;
    return {
      success: true,
      data: apiResponse.data as ListResultRow<TSchema, PrimaryKey>[],
      usage: combinedUsage(apiResponse.llmUsage, apiResponse.cacheUsage),
      model: apiResponse.model,
      latencyMs,
      source: 'gateway',
      meta: {
        requestId: apiResponse.llmRequestId,
        cached: apiResponse.cacheHits === apiResponse.data.length,
        llmUsage: apiResponse.llmUsage,
        cacheUsage: apiResponse.cacheUsage,
      },
    };
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
    const response = await this.post('cast/value', valueBody(prompt, options));

    if (isErrorResponse(response)) {
      return { success: false, error: response.error, source: 'gateway' };
    }

    const apiResponse = response as ApiQueuedResponse;
    return { success: true, jobId: apiResponse.id, source: 'gateway' };
  }

  // ========== queueList() - Async Array Operations ==========

  async queueList<
    TSchema extends z.ZodTypeAny,
    TData extends Record<string, unknown>,
    PrimaryKey extends keyof TData & string,
  >(prompt: string, options: ListOptions<TSchema, TData, PrimaryKey>): Promise<QueueResult> {
    const response = await this.post('cast/array', arrayBody(prompt, options, 'queueList()'));

    if (isErrorResponse(response)) {
      return { success: false, error: response.error, source: 'gateway' };
    }

    const apiResponse = response as ApiQueuedResponse;
    return { success: true, jobId: apiResponse.id, source: 'gateway' };
  }

  private async post(path: string, body: object): Promise<unknown> {
    const url = `${this.baseUrl}/${path}`;

    let response: Response;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.authManager.getToken()}`,
      'Content-Type': 'application/json',
    };

    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (e) {
      return { error: `Error calling Nuabase API: ${getErrorMessageFromException(e)}` };
    }

    if (!response.ok) {
      return await parseErrorResponse(response, path);
    }

    try {
      return await response.json();
    } catch {
      return { error: 'Invalid response received from Nuabase API call, unable to parse' };
    }
  }
}

// ========== Request bodies ==========

// The body of POST /cast/value and /cast/value/now.
function valueBody(prompt: string, options?: GetOptions<z.ZodTypeAny>) {
  checkPrompt(prompt);

  return {
    input: { prompt, data: options?.input ?? null },
    output: {
      name: options?.output?.name ?? 'result',
      schema: z.toJSONSchema(options?.output?.schema ?? z.string()),
    },
    ...(options?.model && { model: options.model }),
  };
}

// The body of POST /cast/array and /cast/array/now.
function arrayBody(
  prompt: string,
  options: ListOptions<z.ZodTypeAny, Record<string, unknown>, string>,
  method: string
) {
  checkPrompt(prompt);

  if (!Array.isArray(options.input)) {
    throw new TypeError(`Input must be an array for ${method}`);
  }

  if (typeof options.primaryKey !== 'string' || options.primaryKey.trim() === '') {
    throw new TypeError('primaryKey must be a non-empty string');
  }

  return {
    input: { prompt, data: options.input, primaryKey: options.primaryKey },
    output: { name: options.output.name, schema: z.toJSONSchema(options.output.schema) },
    ...(options.model && { model: options.model }),
  };
}

function checkPrompt(prompt: string): void {
  if (typeof prompt !== 'string' || prompt.trim() === '') {
    throw new TypeError('Prompt must be a non-empty string');
  }
}

/**
 * Tokens the LLM used for this request plus the tokens of results served from the gateway's cache.
 * The provider's prompt-cache counts come from the LLM call alone.
 */
function combinedUsage(llmUsage: NormalizedUsage, cacheUsage: NormalizedUsage): NormalizedUsage {
  return {
    promptTokens: llmUsage.promptTokens + cacheUsage.promptTokens,
    completionTokens: llmUsage.completionTokens + cacheUsage.completionTokens,
    totalTokens: llmUsage.totalTokens + cacheUsage.totalTokens,
    ...(llmUsage.promptCacheReadTokens !== undefined && {
      promptCacheReadTokens: llmUsage.promptCacheReadTokens,
    }),
    ...(llmUsage.promptCacheWriteTokens !== undefined && {
      promptCacheWriteTokens: llmUsage.promptCacheWriteTokens,
    }),
  };
}
