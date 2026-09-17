import { ConsoleLogger, Logger } from "../../../lib/logger";
import { isNuaValidationError } from "../../../lib/nua-errors";
import { ModelInput, resolveModelInput } from "../../model-info";
import { EngineRouter, Route } from "../engine-router";
import { HttpEngine } from "./http-engine";
import { ProviderTarget } from "./provider-call";
import { LlmProviderId } from "./provider-config";

export type ProviderEnginesConfig = {
  /** API keys by provider. Providers without a key are never used. */
  providers: { [key in LlmProviderId]?: { apiKey: string } };
  /** Used when a call names no model. Defaults to the "fast" alias. */
  model?: ModelInput;
  /** Defaults to the console. */
  logger?: Logger;
};

type Unroutable = Extract<Route, { kind: "unroutable" }>;

/** Runs calls on LLM providers' HTTP APIs, with API keys. Also runs tool-calling agents (see runAgent). */
export function providerEngines(config: ProviderEnginesConfig): ProviderEngines {
  return new ProviderEngines(config);
}

export class ProviderEngines implements EngineRouter {
  readonly logger: Logger;
  private readonly apiKeys: ReadonlyMap<LlmProviderId, string>;
  private readonly defaultModel: ModelInput | undefined;

  constructor(config: ProviderEnginesConfig) {
    this.logger = config.logger ?? new ConsoleLogger();
    this.defaultModel = config.model;
    const apiKeys = new Map<LlmProviderId, string>();
    for (const [id, provider] of Object.entries(config.providers)) {
      if (provider?.apiKey) {
        apiKeys.set(id as LlmProviderId, provider.apiKey);
      }
    }
    this.apiKeys = apiKeys;
  }

  route(model: ModelInput | undefined): Route {
    const resolved = this.resolve(model);
    if (resolved.kind === "unroutable") {
      return resolved;
    }
    return { kind: "routed", engine: new HttpEngine(resolved.target, this.logger) };
  }

  /** The provider model, with its API key, that a model choice runs on. */
  resolve(model: ModelInput | undefined): { kind: "resolved"; target: ProviderTarget } | Unroutable {
    const providerModel = resolveModelInput(model ?? this.defaultModel, new Set(this.apiKeys.keys()));
    if (isNuaValidationError(providerModel)) {
      return { kind: "unroutable", message: providerModel.message };
    }
    const apiKey = this.apiKeys.get(providerModel.provider);
    if (apiKey === undefined) {
      return { kind: "unroutable", message: `LLM provider ${providerModel.provider} is not configured.` };
    }
    return { kind: "resolved", target: { ...providerModel, apiKey } };
  }
}
