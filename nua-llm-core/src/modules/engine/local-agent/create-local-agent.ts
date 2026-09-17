import { ConsoleLogger, Logger } from "../../../lib/logger";
import { AGENT_ADAPTERS } from "./adapters";
import { AgentAdapter } from "./adapters/types";
import { isLocalAgentId, LocalAgentId } from "./agent-id";
import { detectLocalAgents } from "./detect";
import { LocalAgent } from "./local-agent";
import { findOnPath } from "./process-runner";
import { Semaphore } from "./semaphore";

/**
 * - subscription: removes API-key env vars (ANTHROPIC_API_KEY, OPENAI_API_KEY, ...) from the
 *   agent's environment, so the CLI uses its own login and plan.
 * - inherit: passes the environment through unchanged.
 */
export type LocalAgentAuthMode = "subscription" | "inherit";

export type LocalAgentOptions = {
  /** The agent's own model name (e.g. "haiku" for Claude Code) for calls that name no model. Defaults to the agent's default. */
  model?: string;
  /** Per-call limit in milliseconds. Defaults to 180000. */
  timeoutMs?: number;
  /** Maximum agent processes running at once. Defaults to 2. */
  concurrency?: number;
  /** Defaults to "subscription". */
  auth?: LocalAgentAuthMode;
  /** Where calls and cast retries are logged. Defaults to the console. */
  logger?: Logger;
};

export type LocalAgentConfig = LocalAgentOptions & {
  agent: LocalAgentId;
  /** Path to the agent executable. Defaults to looking it up on PATH. */
  binaryPath?: string;
};

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_CONCURRENCY = 2;

/**
 * Sets up the named coding-agent CLI on this machine. Throws right away when the
 * CLI cannot be found; a missing login shows up as the first call's error. Node.js only.
 */
export function localAgent(config: LocalAgentConfig): LocalAgent {
  if (!isLocalAgentId(config.agent)) {
    throw new TypeError(`Unknown local agent: ${String(config.agent)}`);
  }
  const settings = parseOptions(config);

  const adapter = AGENT_ADAPTERS[config.agent];
  const binaryPath = config.binaryPath ?? findOnPath(adapter.binaryName);
  if (!binaryPath) {
    throw new Error(`${adapter.binaryName} was not found on PATH. Install ${config.agent} or set binaryPath.`);
  }
  return setUpLocalAgent(adapter, binaryPath, settings);
}

/**
 * Sets up the first supported coding-agent CLI that is installed and logged in,
 * trying Claude Code first. Rejects when none is. Node.js only.
 */
export async function findLocalAgent(options: LocalAgentOptions = {}): Promise<LocalAgent> {
  const settings = parseOptions(options);

  const statuses = await detectLocalAgents();
  for (const status of statuses) {
    if (status.installed && status.loggedIn) {
      return setUpLocalAgent(AGENT_ADAPTERS[status.agent], status.binaryPath, settings);
    }
  }

  const summary = statuses
    .map((s) => `${s.agent}: ${s.installed ? "not logged in" : "not installed"}`)
    .join(", ");
  throw new Error(`No logged-in coding agent found (${summary})`);
}

type Settings = {
  model: string | undefined;
  timeoutMs: number;
  concurrency: number;
  auth: LocalAgentAuthMode;
  logger: Logger;
};

function parseOptions(options: LocalAgentOptions): Settings {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new TypeError("concurrency must be a positive integer");
  }
  if (options.model !== undefined && options.model.trim() === "") {
    throw new TypeError("model must be a non-empty string; omit it to use the agent's default model");
  }
  return {
    model: options.model,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    concurrency,
    auth: options.auth ?? "subscription",
    logger: options.logger ?? new ConsoleLogger(),
  };
}

function setUpLocalAgent(adapter: AgentAdapter, binaryPath: string, settings: Settings): LocalAgent {
  if (/\.(cmd|bat)$/i.test(binaryPath)) {
    // Running .cmd shims needs a shell, and cmd.exe quoting would mangle the
    // JSON schema and empty-string arguments.
    throw new Error(
      `${binaryPath} is a .cmd shim, which local agents cannot run safely. ` +
        "Set binaryPath to the agent's native executable.",
    );
  }

  const runner = {
    adapter,
    binaryPath,
    timeoutMs: settings.timeoutMs,
    unsetEnv: settings.auth === "subscription" ? adapter.apiKeyEnvVars : [],
    limiter: new Semaphore(settings.concurrency),
    logger: settings.logger,
  };
  return new LocalAgent(runner, settings.model);
}
