import { Nua } from '../../nua';

export type TestMode = 'gateway' | 'direct';

/**
 * Supported LLM providers for direct mode testing.
 * - groq: Fast inference, requires GROQ_API_KEY
 * - openrouter: Access to many models, requires OPENROUTER_API_KEY
 * - cerebras: Fast inference, requires CEREBRAS_API_KEY
 * - gemini: Google's models, requires GEMINI_API_KEY
 */
type DirectProvider = 'groq' | 'openrouter' | 'cerebras' | 'gemini';

/**
 * Creates a Nua client for the specified test mode.
 *
 * Gateway mode: Requires api-server running on localhost:3030
 * Direct mode: Requires one of GROQ_API_KEY, OPENROUTER_API_KEY, CEREBRAS_API_KEY, or GEMINI_API_KEY
 *
 * @param mode - 'gateway' or 'direct'
 * @returns Configured Nua instance
 */
export function createTestClient(mode: TestMode): Nua {
  if (mode === 'gateway') {
    return Nua.gateway({});
  }

  // Try providers in order of preference for testing
  const providerConfigs: Array<{
    provider: DirectProvider;
    envKey: string;
    defaultModel: string;
  }> = [
    { provider: 'groq', envKey: 'GROQ_API_KEY', defaultModel: 'openai/gpt-oss-120b' },
    { provider: 'openrouter', envKey: 'OPENROUTER_API_KEY', defaultModel: 'moonshotai/kimi-k2.5' },
    { provider: 'cerebras', envKey: 'CEREBRAS_API_KEY', defaultModel: 'gpt-oss-120b' },
    { provider: 'gemini', envKey: 'GEMINI_API_KEY', defaultModel: 'gemini-2.5-flash' },
  ];

  for (const config of providerConfigs) {
    const apiKey = process.env[config.envKey];
    if (apiKey) {
      return Nua.direct({
        model: process.env.TEST_LLM_MODEL || config.defaultModel,
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

/**
 * Returns the list of test modes to run based on environment.
 * Respects SKIP_DIRECT_TESTS and SKIP_GATEWAY_TESTS env vars.
 */
export function getTestModes(): TestMode[] {
  const modes: TestMode[] = [];

  if (!process.env.SKIP_GATEWAY_TESTS) {
    modes.push('gateway');
  }

  const hasDirectApiKey =
    process.env.GROQ_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.CEREBRAS_API_KEY ||
    process.env.GEMINI_API_KEY;

  if (!process.env.SKIP_DIRECT_TESTS && hasDirectApiKey) {
    modes.push('direct');
  }

  return modes;
}
