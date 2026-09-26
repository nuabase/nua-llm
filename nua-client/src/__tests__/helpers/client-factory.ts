import { findLocalAgent, isLocalAgentId, localAgent } from '../../local-agent';
import { Nua } from '../../nua';
import type { LocalAgentId, ModelInput } from 'nua-llm-core';

/**
 * One way of running casts that the shared tests exercise:
 * - gateway: the Nuabase API at NUABASE_API_URL
 * - direct: LLM providers' APIs, with API keys
 * - local-agent: a coding-agent CLI on this machine, with its own login
 */
export type TestMode = { name: string } & (
  | { kind: 'gateway' }
  | { kind: 'direct' }
  | { kind: 'local-agent'; agent: LocalAgentId | 'auto' }
);

/**
 * Supported LLM providers for direct mode testing.
 * - groq: Fast inference, requires GROQ_API_KEY
 * - openrouter: Access to many models, requires OPENROUTER_API_KEY
 * - cerebras: Fast inference, requires CEREBRAS_API_KEY
 * - gemini: Google's models, requires GEMINI_API_KEY
 */
type DirectProvider = 'groq' | 'openrouter' | 'cerebras' | 'gemini';

// Each agent's model for tests: Claude Code's fastest model, and the default model for
// Codex and Pi (Pi needs its own `provider/id` name, which differs per machine).
const LOCAL_AGENT_TEST_MODELS: Record<LocalAgentId, string | undefined> = {
  'claude-code': 'haiku',
  codex: undefined,
  pi: undefined,
};

/**
 * Returns the modes to run the shared tests in.
 * - gateway, unless SKIP_GATEWAY_TESTS is set.
 * - direct, when a provider API key is set, unless SKIP_DIRECT_TESTS is set.
 * - one local-agent mode per agent in NUA_LOCAL_AGENTS (e.g. "claude-code,codex", or "auto").
 */
export function getTestModes(): TestMode[] {
  const modes: TestMode[] = [];

  if (!process.env.SKIP_GATEWAY_TESTS) {
    modes.push({ name: 'gateway', kind: 'gateway' });
  }

  const hasDirectApiKey =
    process.env.GROQ_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.CEREBRAS_API_KEY ||
    process.env.GEMINI_API_KEY;

  if (!process.env.SKIP_DIRECT_TESTS && hasDirectApiKey) {
    modes.push({ name: 'direct', kind: 'direct' });
  }

  for (const agent of localAgentsToTest()) {
    modes.push({ name: `local-agent:${agent}`, kind: 'local-agent', agent });
  }

  return modes;
}

function localAgentsToTest(): (LocalAgentId | 'auto')[] {
  const names = (process.env.NUA_LOCAL_AGENTS ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  return names.map((name) => {
    if (name === 'auto' || isLocalAgentId(name)) return name;
    throw new Error(`NUA_LOCAL_AGENTS: unknown agent "${name}"`);
  });
}

/**
 * Creates a Nua client for the specified test mode.
 *
 * Gateway mode: Requires NUABASE_API_URL and NUABASE_API_KEY for a running Nuabase API
 * Direct mode: Requires one of GROQ_API_KEY, OPENROUTER_API_KEY, CEREBRAS_API_KEY, or GEMINI_API_KEY
 * Local-agent mode: Requires that agent installed and logged in on this machine
 */
export async function createTestClient(mode: TestMode): Promise<Nua> {
  switch (mode.kind) {
    case 'gateway':
      return Nua.gateway({});
    case 'direct':
      return createDirectClient();
    case 'local-agent':
      return Nua.direct({
        localAgent:
          mode.agent === 'auto'
            ? await findLocalAgent()
            : localAgent({ agent: mode.agent, model: LOCAL_AGENT_TEST_MODELS[mode.agent] }),
      });
  }
}

function createDirectClient(): Nua {
  // Try providers in order of preference for testing
  const providerConfigs: Array<{
    provider: DirectProvider;
    envKey: string;
    defaultModel: string;
  }> = [
    { provider: 'groq', envKey: 'GROQ_API_KEY', defaultModel: 'qwen/qwen3.8-27b' },
    { provider: 'openrouter', envKey: 'OPENROUTER_API_KEY', defaultModel: 'z-ai/glm-5.2' },
    { provider: 'cerebras', envKey: 'CEREBRAS_API_KEY', defaultModel: 'qwen-3.8-27b' },
    { provider: 'gemini', envKey: 'GEMINI_API_KEY', defaultModel: 'gemini-2.5-flash' },
  ];

  for (const config of providerConfigs) {
    const apiKey = process.env[config.envKey];
    if (apiKey) {
      const model: ModelInput = {
        provider: config.provider,
        model: process.env.TEST_LLM_MODEL || config.defaultModel,
      };

      return Nua.direct({
        model,
        providers: {
          [config.provider]: { apiKey },
        },
      });
    }
  }

  throw new Error(
    'Direct mode requires one of: GROQ_API_KEY, OPENROUTER_API_KEY, CEREBRAS_API_KEY, or GEMINI_API_KEY. ' +
      'Set SKIP_DIRECT_TESTS=1 to skip direct mode tests.'
  );
}

/** The result `source` a mode produces: local agents run through the direct backend. */
export function expectedSource(mode: TestMode): 'gateway' | 'direct' {
  return mode.kind === 'gateway' ? 'gateway' : 'direct';
}

/** The part of a direct result's `meta` that says which engine answered. */
export function expectedDirectMeta(mode: TestMode): Record<string, unknown> {
  switch (mode.kind) {
    case 'gateway':
      return {};
    case 'direct':
      return { engine: 'http' };
    case 'local-agent':
      return mode.agent === 'auto'
        ? { engine: 'local-agent' }
        : { engine: 'local-agent', agent: mode.agent };
  }
}

/** Per-test time limit. A coding-agent CLI starts a process and may reason before answering. */
export function testTimeoutMs(mode: TestMode): number {
  return mode.kind === 'local-agent' ? 180_000 : 30_000;
}
