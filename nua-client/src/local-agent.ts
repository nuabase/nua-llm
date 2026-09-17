// Node.js-only entry point ("nuabase/local-agent"): runs coding-agent CLIs installed on
// this machine. Kept apart from the main entry point so that one stays loadable in browsers.

export {
  detectLocalAgents,
  findLocalAgent,
  isLocalAgentId,
  LOCAL_AGENT_IDS,
  localAgent,
} from 'nua-llm-core/local-agent';
export type {
  LocalAgent,
  LocalAgentAuthMode,
  LocalAgentConfig,
  LocalAgentId,
  LocalAgentOptions,
  LocalAgentStatus,
} from 'nua-llm-core/local-agent';
