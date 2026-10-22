import { JsonSchema } from "../../../../lib/schema-utils";
import { ModelAliasName } from "../../../model-info";
import { NormalizedUsage } from "../../http/provider-config";
import { Answer, AttemptFailure, AttemptRequest } from "../../llm-engine";
import { LocalAgentId } from "../agent-id";

/** A process to run inside a fresh, empty working directory. */
export type AgentInvocation = {
  args: string[];
  stdin: string;
  /** Files written into the working directory before the process starts. */
  files?: { name: string; content: string }[];
  /** Files read back from the working directory after the process exits. */
  outputFiles?: string[];
};

export type AgentProcessResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** Contents of the requested output files; undefined when a file was not written. */
  outputFiles: Record<string, string | undefined>;
};

/** What an agent's output says about one attempt. */
export type AgentReply =
  | {
      kind: "answered";
      answer: Answer;
      usage: NormalizedUsage;
      /** The model the agent reports having used, when it says. */
      model: string | undefined;
      costUsdEstimate: number | undefined;
    }
  | { kind: "failed"; failure: AttemptFailure };

/**
 * How hard the agent's model thinks before it answers: the CLI's own reasoning
 * or effort setting, at one of the levels every supported CLI has.
 */
export type AgentEffort = "low" | "medium" | "high";

/** How one cast runs on an agent. An undefined field leaves it to the CLI's default. */
export type AgentCallOptions = {
  /** The CLI's own model name. */
  model?: string;
  effort?: AgentEffort;
};

/**
 * Who approves an interactive session's edits and commands:
 * - ask: the user, step by step, as the CLI does by default.
 * - auto: the CLI's own auto mode. Its reviewer approves routine steps and stops risky ones.
 */
export type SessionApproval = "ask" | "auto";

export type AgentLoginStatus = {
  loggedIn: boolean;
  detail?: string;
};

/**
 * Knows one coding-agent CLI: which models it offers, how to invoke it headless,
 * and how to read its output. Adapters do no I/O; the process runner does the spawning.
 */
export interface AgentAdapter {
  id: LocalAgentId;
  /** Executable name looked up on PATH. */
  binaryName: string;
  /** Env vars that would make the CLI bill an API key instead of the user's subscription. */
  apiKeyEnvVars: string[];
  /** The CLI's own model name for each model alias it has an equivalent for. */
  modelAliases: Partial<Record<ModelAliasName, string>>;

  /** The envelope schema in the form this CLI accepts, or null if it can't enforce it. */
  nativeSchema(envelopeSchema: JsonSchema): JsonSchema | null;
  buildInvocation(request: AttemptRequest, options: AgentCallOptions): AgentInvocation;
  readResult(result: AgentProcessResult, request: AttemptRequest): AgentReply;

  loginStatusArgs: string[];
  readLoginStatus(result: AgentProcessResult): AgentLoginStatus;

  /**
   * Options for an interactive session in the user's own project, which go
   * before its first message. `model` is the CLI's own model name; undefined
   * uses the CLI's default.
   */
  sessionArgs(model: string | undefined, approval: SessionApproval): string[];
}
