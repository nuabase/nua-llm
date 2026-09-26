/** Supported coding-agent CLIs, in the order findLocalAgent() tries them. */
export const LOCAL_AGENT_IDS = ["claude-code", "codex", "pi"] as const;

export type LocalAgentId = (typeof LOCAL_AGENT_IDS)[number];

const LOCAL_AGENT_ID_SET = new Set<string>(LOCAL_AGENT_IDS);

export function isLocalAgentId(value: unknown): value is LocalAgentId {
  return typeof value === "string" && LOCAL_AGENT_ID_SET.has(value);
}
