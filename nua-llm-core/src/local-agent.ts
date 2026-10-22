// Node.js-only entry point: runs coding-agent CLIs installed on this machine.
// Kept separate from the main entry point so that one stays loadable in edge runtimes
// (such as Cloudflare Workers or Vercel Edge).

export { findLocalAgent, localAgent } from "./modules/engine/local-agent/create-local-agent";
export type {
  LocalAgentAuthMode,
  LocalAgentConfig,
  LocalAgentOptions,
} from "./modules/engine/local-agent/create-local-agent";
export type { LocalAgent } from "./modules/engine/local-agent/local-agent";
export type { Logger } from "./lib/logger";
export { detectLocalAgents } from "./modules/engine/local-agent/detect";
export type { LocalAgentStatus } from "./modules/engine/local-agent/detect";
export { LOCAL_AGENT_IDS, isLocalAgentId } from "./modules/engine/local-agent/agent-id";
export type { LocalAgentId } from "./modules/engine/local-agent/agent-id";
export {
  agentSessionMode,
  fitsAgentSession,
  openInTerminal,
  sessionLauncher,
  writeAgentSession,
} from "./modules/engine/local-agent/session";
export type {
  AgentSessionConfig,
  AgentSessionFiles,
  AgentSessionMode,
  SessionLauncherTarget,
} from "./modules/engine/local-agent/session";
export type { SessionApproval } from "./modules/engine/local-agent/adapters/types";
