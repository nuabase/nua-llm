import { CastArrayParams, CastResult, CastValueParams, LlmBackend, NormalizedUsage } from './types';
import { NuaLlmClient, wrapArraySchema } from 'nua-llm-core';
import type { LlmProviderId, ModelInput } from 'nua-llm-core';

export type DirectConfig = {
  model?: ModelInput;
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
  private readonly model: ModelInput | undefined;

  constructor(config: DirectConfig) {
    this.model = config.model;
    this.client = new NuaLlmClient({ providers: config.providers });
  }

  async castValue<T>(params: CastValueParams): Promise<CastResult<T>> {
    const model = params.model ?? this.model;
    const startTime = Date.now();
    const result = await this.client.castValue({
      model,
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
      model: formatModelInput(model),
      latencyMs,
      source: 'direct',
      meta: {},
    };
  }

  async castArray<T>(params: CastArrayParams): Promise<CastResult<T[]>> {
    const model = params.model ?? this.model;
    const startTime = Date.now();
    const wrappedSchema = wrapArraySchema(params.outputSchema as Record<string, unknown>, {
      primaryKey: params.primaryKey,
      outputName: params.outputName,
    });
    const result = await this.client.castArray({
      model,
      data: params.data,
      input: { prompt: params.prompt, primaryKey: params.primaryKey },
      output: { name: params.outputName, effectiveSchema: wrappedSchema },
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
      model: formatModelInput(model),
      latencyMs,
      source: 'direct',
      meta: {},
    };
  }
}

function formatModelInput(model: ModelInput | undefined): string {
  if (!model) return 'fast';
  if ('alias' in model) return model.alias;
  return `${model.provider}:${model.model}`;
}
