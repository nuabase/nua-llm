import { LocalAgentId } from "../agent-id";
import { claudeCodeAdapter } from "./claude-code";
import { codexAdapter } from "./codex";
import { AgentAdapter } from "./types";

export const AGENT_ADAPTERS: Record<LocalAgentId, AgentAdapter> = {
  "claude-code": claudeCodeAdapter,
  codex: codexAdapter,
};
