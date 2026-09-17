import { Logger } from "../../lib/logger";
import { ModelInput } from "../model-info";
import { LlmEngine } from "./llm-engine";

/** The engine that runs a model choice, or why none can. */
export type Route =
  | { kind: "routed"; engine: LlmEngine }
  | { kind: "unroutable"; message: string };

/**
 * Where a client's calls run. Every setup answers the same question: for this
 * model choice, which engine runs it? Created by providerEngines() for LLM
 * providers' APIs, or by localAgent() / findLocalAgent() in the Node-only
 * "nua-llm-core/local-agent" entry point for a coding-agent CLI.
 */
export interface EngineRouter {
  /** Where the engines log their calls. Casts log their retries here too. */
  readonly logger: Logger;
  /** `model` undefined means this router's default model. */
  route(model: ModelInput | undefined): Route;
}
