// Node.js-only entry point ("nuabase/local-agent"): runs coding-agent CLIs installed on
// this machine. Kept apart from the main entry point so that one stays loadable in edge
// runtimes (such as Cloudflare Workers or Vercel Edge).

export {
  agentSessionMode,
  detectLocalAgents,
  findLocalAgent,
  isLocalAgentId,
  LOCAL_AGENT_IDS,
  localAgent,
  sessionLauncher,
  startAgentSession,
} from 'nua-llm-core/local-agent';
export type {
  AgentSessionConfig,
  AgentSessionFiles,
  AgentSessionMode,
  AgentSessionRefusal,
  AgentSessionStart,
  LocalAgent,
  LocalAgentAuthMode,
  LocalAgentConfig,
  LocalAgentId,
  LocalAgentOptions,
  LocalAgentStatus,
  Logger,
  SessionApproval,
  SessionLauncherTarget,
} from 'nua-llm-core/local-agent';
