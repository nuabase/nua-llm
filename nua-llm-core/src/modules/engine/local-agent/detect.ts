import { AGENT_ADAPTERS } from "./adapters";
import { AgentAdapter } from "./adapters/types";
import { LOCAL_AGENT_IDS, LocalAgentId } from "./agent-id";
import { findOnPath, runInvocation } from "./process-runner";

const STATUS_TIMEOUT_MS = 20_000;

export type LocalAgentStatus =
  | { agent: LocalAgentId; installed: false; loggedIn: false; detail?: string }
  | {
      agent: LocalAgentId;
      installed: true;
      loggedIn: boolean;
      binaryPath: string;
      version?: string;
      detail?: string;
    };

/**
 * Reports which supported coding agents are installed and logged in, in
 * preference order. Runs each CLI's version and login-status commands, which
 * make no model calls.
 */
export async function detectLocalAgents(
  binaryPaths: Partial<Record<LocalAgentId, string>> = {},
): Promise<LocalAgentStatus[]> {
  return Promise.all(
    LOCAL_AGENT_IDS.map((id) => detectAgent(AGENT_ADAPTERS[id], binaryPaths[id])),
  );
}

async function detectAgent(
  adapter: AgentAdapter,
  binaryPathOverride: string | undefined,
): Promise<LocalAgentStatus> {
  const binaryPath = binaryPathOverride ?? findOnPath(adapter.binaryName);
  if (!binaryPath) {
    return { agent: adapter.id, installed: false, loggedIn: false };
  }

  try {
    const [versionResult, statusResult] = await Promise.all([
      runInvocation({
        binaryPath,
        invocation: { args: ["--version"], stdin: "" },
        timeoutMs: STATUS_TIMEOUT_MS,
      }),
      runInvocation({
        binaryPath,
        invocation: { args: adapter.loginStatusArgs, stdin: "" },
        timeoutMs: STATUS_TIMEOUT_MS,
        // Report the CLI's own login, not an API key that happens to be set.
        unsetEnv: adapter.apiKeyEnvVars,
      }),
    ]);
    if (versionResult.exitCode !== 0) {
      return {
        agent: adapter.id,
        installed: false,
        loggedIn: false,
        detail: `${binaryPath} --version exited with code ${versionResult.exitCode}`,
      };
    }
    const login = adapter.readLoginStatus(statusResult);
    return {
      agent: adapter.id,
      installed: true,
      loggedIn: login.loggedIn,
      binaryPath,
      version: versionResult.stdout.trim() || undefined,
      detail: login.detail,
    };
  } catch (error) {
    return {
      agent: adapter.id,
      installed: false,
      loggedIn: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
