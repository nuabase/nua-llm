import { CastArrayParams, CastResult, CastValueParams, LlmBackend } from './types';
import { listSchema, NuaLlmClient, providerEngines } from 'nua-llm-core';
import type {
  AnswerOrigin,
  CastResult as CoreCastResult,
  EngineRouter,
  JsonSchema,
  LlmProviderId,
  ModelInput,
} from 'nua-llm-core';
import type { LocalAgent } from 'nua-llm-core/local-agent';

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

export class DirectBackend implements LlmBackend {
  private readonly client: NuaLlmClient;

  constructor(config: DirectConfig) {
    this.client = new NuaLlmClient(enginesFor(config));
  }

  async castValue<T>(params: CastValueParams): Promise<CastResult<T>> {
    const startTime = Date.now();
    const result = await this.client.castValue<T>({
      model: params.model,
      input: { prompt: params.prompt, data: params.data },
      output: { name: params.outputName, schema: params.outputSchema },
    });
    return toDirectResult(result, Date.now() - startTime);
  }

  async castArray<T>(params: CastArrayParams): Promise<CastResult<T[]>> {
    const startTime = Date.now();
    const result = await this.client.castArray<T>({
      model: params.model,
      input: { prompt: params.prompt, data: params.data },
      output: listSchema(params.outputSchema as JsonSchema, {
        primaryKey: params.primaryKey,
        outputName: params.outputName,
      }),
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
    return { success: false, error: result.error, source: 'direct', latencyMs };
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
