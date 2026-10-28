import { Logger } from "../../../lib/logger";
import { ModelInput } from "../../model-info";
import { EngineRouter, Route } from "../engine-router";
import { AgentCallOptions } from "./adapters/types";
import { LocalAgentId } from "./agent-id";
import { AgentCall, AgentRunner, LocalAgentEngine } from "./local-agent-engine";

/**
 * How a local agent's casts run, not which processes run them: what
 * localAgent() sets and `LocalAgent.with()` changes. An option left out, or
 * given as undefined, takes its default.
 */
export type LocalAgentCallOptions = AgentCallOptions & {
  /** Per-call limit in milliseconds. Defaults to 600000. */
  timeoutMs?: number;
  /**
   * How long, in milliseconds, the agent may print nothing before it is
   * stopped as stuck; null for no limit. Defaults to the agent's own limit,
   * which is none for an agent that is quiet while it works.
   */
  idleTimeoutMs?: number | null;
};

const DEFAULT_TIMEOUT_MS = 600_000;

// setTimeout fires at once for a delay that is not in 1..2^31-1 ms.
const MAX_LIMIT_MS = 2 ** 31 - 1;

/**
 * A coding-agent CLI on this machine, set up once and ready to run casts.
 * Created by localAgent() or findLocalAgent().
 */
export class LocalAgent implements EngineRouter {
  readonly agent: LocalAgentId;
  readonly logger: Logger;

  /** How calls that name no model run. */
  private readonly call: AgentCall;

  constructor(
    private readonly runner: AgentRunner,
    options: LocalAgentCallOptions,
  ) {
    this.agent = runner.adapter.id;
    this.logger = runner.logger;
    this.call = {
      model: options.model,
      effort: options.effort,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      idleTimeoutMs: options.idleTimeoutMs === undefined ? runner.adapter.idleTimeoutMs : options.idleTimeoutMs,
    };

    if (this.call.model !== undefined && this.call.model.trim() === "") {
      throw new TypeError("model must be a non-empty string, or undefined for the agent's default model");
    }
    if (!isLimit(this.call.timeoutMs)) {
      throw new TypeError(`timeoutMs must be from 1 to ${MAX_LIMIT_MS} milliseconds`);
    }
    if (this.call.idleTimeoutMs !== null && !isLimit(this.call.idleTimeoutMs)) {
      throw new TypeError(`idleTimeoutMs must be from 1 to ${MAX_LIMIT_MS} milliseconds, or null for no limit`);
    }
  }

  /**
   * The same agent with other call options, sharing this one's executable,
   * environment, logger and limit on processes running at once. Options left
   * out keep this agent's; an option given as undefined takes its default.
   */
  with(options: LocalAgentCallOptions): LocalAgent {
    return new LocalAgent(this.runner, { ...this.call, ...options });
  }

  /**
   * No model choice runs the default model. An alias runs the CLI's equivalent
   * model, if it has one. Provider models cannot run on a local agent.
   */
  route(model: ModelInput | undefined): Route {
    if (model === undefined) {
      return this.routeTo(this.call);
    }

    if (!("alias" in model)) {
      return {
        kind: "unroutable",
        message: `${this.agent} takes model aliases, not provider models. Set the agent's own model with localAgent({ model }) or with().`,
      };
    }

    const agentModel = this.runner.adapter.modelAliases[model.alias];
    if (agentModel === undefined) {
      return { kind: "unroutable", message: `Model alias "${model.alias}" has no ${this.agent} equivalent` };
    }
    return this.routeTo({ ...this.call, model: agentModel });
  }

  private routeTo(call: AgentCall): Route {
    return { kind: "routed", engine: new LocalAgentEngine(this.runner, call) };
  }
}

/** False for NaN too. */
function isLimit(ms: number): boolean {
  return ms >= 1 && ms <= MAX_LIMIT_MS;
}
