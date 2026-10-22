import { Logger } from "../../../lib/logger";
import { ModelInput } from "../../model-info";
import { EngineRouter, Route } from "../engine-router";
import { AgentCallOptions } from "./adapters/types";
import { LocalAgentId } from "./agent-id";
import { AgentCall, AgentRunner, LocalAgentEngine } from "./local-agent-engine";

/** What `LocalAgent.with()` changes: how its casts run, not which processes run them. */
export type LocalAgentCallOptions = AgentCallOptions & {
  /** Per-call limit in milliseconds. */
  timeoutMs?: number;
};

/**
 * A coding-agent CLI on this machine, set up once and ready to run casts.
 * Created by localAgent() or findLocalAgent().
 */
export class LocalAgent implements EngineRouter {
  readonly agent: LocalAgentId;
  readonly logger: Logger;

  constructor(
    private readonly runner: AgentRunner,
    /** How calls that name no model run. */
    private readonly call: AgentCall,
  ) {
    this.agent = runner.adapter.id;
    this.logger = runner.logger;
  }

  /**
   * The same agent with other call options, sharing this one's executable,
   * environment, logger and limit on processes running at once. Options left
   * out keep this agent's; a model or effort given as undefined is the CLI's
   * default.
   */
  with(options: LocalAgentCallOptions): LocalAgent {
    if (options.model !== undefined && options.model.trim() === "") {
      throw new TypeError("model must be a non-empty string; pass undefined to use the agent's default model");
    }
    return new LocalAgent(this.runner, {
      ...this.call,
      ...options,
      timeoutMs: options.timeoutMs ?? this.call.timeoutMs,
    });
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
