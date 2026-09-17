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
  /** `model` is the CLI's own model name; undefined uses the CLI's default. */
  buildInvocation(request: AttemptRequest, model: string | undefined): AgentInvocation;
  readResult(result: AgentProcessResult, request: AttemptRequest): AgentReply;

  loginStatusArgs: string[];
  readLoginStatus(result: AgentProcessResult): AgentLoginStatus;
}
