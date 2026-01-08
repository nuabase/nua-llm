import { AuthTokenManager } from '../lib/auth';
import { resolveConfigValue } from '../lib/env';
import { parseErrorResponse } from '../lib/error-response';
import { getErrorMessageFromException } from '../lib/error-utils';
import {
  CastArrayParams,
  CastResult,
  CastValueParams,
  LlmBackend,
  NormalizedUsage,
  QueueResult,
} from './types';

type GatewayApiKeyConfig = {
  apiKey?: string;
  fetchToken?: never;
  baseUrl?: string;
};

type GatewayTokenConfig = {
  fetchToken: () => Promise<string>;
  apiKey?: never;
  baseUrl?: string;
};

export type GatewayConfig = GatewayApiKeyConfig | GatewayTokenConfig;

type ApiCastValueResponse = {
  llmRequestId: string;
  data: unknown;
  isCacheHit: boolean;
  llmUsage: NormalizedUsage;
  cacheUsage: NormalizedUsage;
  model?: string; // TODO: api-server needs to return this (nua-llm-29a)
};

type ApiCastArrayResponse = {
  llmRequestId: string;
  data: unknown[];
  cacheHits: number;
  llmUsage: NormalizedUsage;
  cacheUsage: NormalizedUsage;
  model?: string; // TODO: api-server needs to return this (nua-llm-29a)
};

type ApiErrorResponse = {
  error: string;
};

function isErrorResponse(response: unknown): response is ApiErrorResponse {
  return Boolean(response && typeof response === 'object' && 'error' in response);
}

export class GatewayBackend implements LlmBackend {
  private readonly baseUrl: string;
  private readonly authManager: AuthTokenManager;

  constructor(config: GatewayConfig) {
    this.baseUrl =
      resolveConfigValue(config, 'baseUrl', 'NUABASE_API_URL') || 'https://api.nuabase.com';
    this.authManager = new AuthTokenManager(config);
  }

  async castValue<T>(params: CastValueParams): Promise<CastResult<T>> {
    const startTime = Date.now();
    const response = await this.post('cast/value/now', {
      input: { prompt: params.prompt, data: params.data },
      output: { name: params.outputName, schema: params.outputSchema },
    });
    const latencyMs = Date.now() - startTime;

    if (isErrorResponse(response)) {
      return { success: false, error: response.error, source: 'gateway', latencyMs };
    }

    const apiResponse = response as ApiCastValueResponse;
    const usage: NormalizedUsage = {
      promptTokens: apiResponse.llmUsage.promptTokens + apiResponse.cacheUsage.promptTokens,
      completionTokens:
        apiResponse.llmUsage.completionTokens + apiResponse.cacheUsage.completionTokens,
      totalTokens: apiResponse.llmUsage.totalTokens + apiResponse.cacheUsage.totalTokens,
    };

    return {
      success: true,
      data: apiResponse.data as T,
      usage,
      model: apiResponse.model ?? 'unknown',
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

  async castArray<T>(params: CastArrayParams): Promise<CastResult<T[]>> {
    const startTime = Date.now();
    const response = await this.post('cast/array/now', {
      input: { prompt: params.prompt, data: params.data, primaryKey: params.primaryKey },
      output: { name: params.outputName, schema: params.outputSchema },
    });
    const latencyMs = Date.now() - startTime;

    if (isErrorResponse(response)) {
      return { success: false, error: response.error, source: 'gateway', latencyMs };
    }

    const apiResponse = response as ApiCastArrayResponse;
    const usage: NormalizedUsage = {
      promptTokens: apiResponse.llmUsage.promptTokens + apiResponse.cacheUsage.promptTokens,
      completionTokens:
        apiResponse.llmUsage.completionTokens + apiResponse.cacheUsage.completionTokens,
      totalTokens: apiResponse.llmUsage.totalTokens + apiResponse.cacheUsage.totalTokens,
    };

    return {
      success: true,
      data: apiResponse.data as T[],
      usage,
      model: apiResponse.model ?? 'unknown',
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

  async queueCastValue(params: CastValueParams): Promise<QueueResult> {
    const response = await this.post('cast/value', {
      input: { prompt: params.prompt, data: params.data },
      output: { name: params.outputName, schema: params.outputSchema },
    });

    if (isErrorResponse(response)) {
      return { success: false, error: response.error, source: 'gateway' };
    }

    const apiResponse = response as { jobId: string };
    return { success: true, jobId: apiResponse.jobId, source: 'gateway' };
  }

  async queueCastArray(params: CastArrayParams): Promise<QueueResult> {
    const response = await this.post('cast/array', {
      input: { prompt: params.prompt, data: params.data, primaryKey: params.primaryKey },
      output: { name: params.outputName, schema: params.outputSchema },
    });

    if (isErrorResponse(response)) {
      return { success: false, error: response.error, source: 'gateway' };
    }

    const apiResponse = response as { jobId: string };
    return { success: true, jobId: apiResponse.jobId, source: 'gateway' };
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
