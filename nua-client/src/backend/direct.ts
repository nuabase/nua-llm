import { CastArrayParams, CastResult, CastValueParams, LlmBackend, NormalizedUsage } from './types';
import { LlmProviderId, NuaLlmClient } from 'nua-llm-core';

export type DirectConfig = {
  model: string;
  providers: {
    [key in LlmProviderId]?: { apiKey: string };
  };
};

const normalizedUsageZero: NormalizedUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
};

export class DirectBackend implements LlmBackend {
  private readonly client: NuaLlmClient;
  private readonly model: string;

  constructor(config: DirectConfig) {
    if (!config.model) {
      throw new Error('model is required for direct mode');
    }
    this.model = config.model;
    this.client = new NuaLlmClient({ providers: config.providers });
  }

  async castValue<T>(params: CastValueParams): Promise<CastResult<T>> {
    const startTime = Date.now();
    const result = await this.client.castValue({
      model: this.model,
      input: { prompt: params.prompt, data: params.data },
      output: { name: params.outputName, effectiveSchema: params.outputSchema },
    });
    const latencyMs = Date.now() - startTime;

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Unknown error',
        source: 'direct',
        latencyMs,
      };
    }

    return {
      success: true,
      data: result.data as T,
      usage: result.usage || normalizedUsageZero,
      model: this.model,
      latencyMs,
      source: 'direct',
      meta: {},
    };
  }

  async castArray<T>(params: CastArrayParams): Promise<CastResult<T[]>> {
    const startTime = Date.now();
    const result = await this.client.castArray({
      model: this.model,
      data: params.data,
      input: { prompt: params.prompt, primaryKey: params.primaryKey },
      output: { name: params.outputName, effectiveSchema: params.outputSchema },
    });
    const latencyMs = Date.now() - startTime;

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Unknown error',
        source: 'direct',
        latencyMs,
      };
    }

    return {
      success: true,
      data: result.data as T[],
      usage: result.usage || normalizedUsageZero,
      model: this.model,
      latencyMs,
      source: 'direct',
      meta: {},
    };
  }
}
