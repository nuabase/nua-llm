import { Logger } from "../../../lib/logger";
import { ModelInput } from "../../model-info";
import { EngineRouter, Route } from "../engine-router";
import { LocalAgentId } from "./agent-id";
import { AgentRunner, LocalAgentEngine } from "./local-agent-engine";

/**
 * A coding-agent CLI on this machine, set up once and ready to run casts.
 * Created by localAgent() or findLocalAgent().
 */
export class LocalAgent implements EngineRouter {
  readonly agent: LocalAgentId;
  readonly logger: Logger;

  constructor(
    private readonly runner: AgentRunner,
    /** The CLI's own model name for calls that name no model; undefined uses the CLI's default. */
    private readonly defaultModel: string | undefined,
  ) {
    this.agent = runner.adapter.id;
    this.logger = runner.logger;
  }

  /**
   * No model choice runs the default model. An alias runs the CLI's equivalent
   * model, if it has one. Provider models cannot run on a local agent.
   */
  route(model: ModelInput | undefined): Route {
    if (model === undefined) {
      return this.routeTo(this.defaultModel);
    }

    if (!("alias" in model)) {
      return {
        kind: "unroutable",
        message: `${this.agent} takes model aliases, not provider models. Set the agent's own model with localAgent({ model }).`,
      };
    }

    const agentModel = this.runner.adapter.modelAliases[model.alias];
    if (agentModel === undefined) {
      return { kind: "unroutable", message: `Model alias "${model.alias}" has no ${this.agent} equivalent` };
    }
    return this.routeTo(agentModel);
  }

  private routeTo(model: string | undefined): Route {
    return { kind: "routed", engine: new LocalAgentEngine(this.runner, model) };
  }
}
