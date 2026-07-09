import { NuaLlmClient } from "../../nua-llm-client";
import { AgentEvent, AgentTool } from "../../modules/agent/types";
import { LlmProviderId } from "../../modules/llm-client/provider-config";
import { ProviderModel } from "../../modules/model-info";

const PROVIDER_TESTS: Array<{
  provider: LlmProviderId;
  model: ProviderModel;
  envKey: string;
}> = [
  { provider: "groq", model: { provider: "groq", model: "qwen/qwen3.6-27b" }, envKey: "GROQ_API_KEY" },
  { provider: "cerebras", model: { provider: "cerebras", model: "zai-glm-4.7" }, envKey: "CEREBRAS_API_KEY" },
  { provider: "gemini", model: { provider: "gemini", model: "gemini-2.5-flash" }, envKey: "GEMINI_API_KEY" },
  { provider: "openrouter", model: { provider: "openrouter", model: "z-ai/glm-5.2" }, envKey: "OPENROUTER_API_KEY" },
  { provider: "openrouter", model: { provider: "openrouter", model: "moonshotai/kimi-k2.7-code" }, envKey: "OPENROUTER_API_KEY" },
  { provider: "openrouter", model: { provider: "openrouter", model: "anthropic/claude-opus-4.7" }, envKey: "OPENROUTER_API_KEY" },
  { provider: "openrouter", model: { provider: "openrouter", model: "anthropic/claude-haiku-4.5" }, envKey: "OPENROUTER_API_KEY" },
];

function makeLookupCapitalTool(): AgentTool {
  return {
    name: "lookup_capital",
    description: "Looks up the capital city of a given country. Returns the capital city name.",
    parameters: {
      type: "object",
      properties: {
        country: {
          type: "string",
          description: "The country to look up the capital for",
        },
      },
      required: ["country"],
    },
    execute: async (_args) => ({
      content: "Paris",
    }),
  };
}

for (const { provider, model, envKey } of PROVIDER_TESTS) {
  const apiKey = process.env[envKey];
  const describeFn = apiKey ? describe : describe.skip;

  describeFn(`${provider} — ${model.model}`, () => {
    let client: NuaLlmClient;

    beforeAll(() => {
      client = new NuaLlmClient({
        providers: {
          [provider]: { apiKey: apiKey! },
        },
      });
    });

    it("completes a simple text conversation", async () => {
      const result = await client.runAgent({
        model,
        messages: [
          { role: "user", content: "What is the capital of France? Reply with just the city name." },
        ],
        tools: [],
      });

      expect(result.success).toBe(true);
      expect(result.textResponse).toBeTruthy();
      expect(result.textResponse!.toLowerCase()).toContain("paris");
      expect(result.usage.totalTokens).toBeGreaterThan(0);
    }, 30_000);

    it("executes a tool and uses the result", async () => {
      const tool = makeLookupCapitalTool();

      const result = await client.runAgent({
        model,
        systemPrompt: "You have access to a lookup_capital tool. Use it to answer questions about capital cities. Always use the tool rather than answering from memory.",
        messages: [
          { role: "user", content: "What is the capital of France? Use the lookup_capital tool to find out." },
        ],
        tools: [tool],
      });

      expect(result.success).toBe(true);

      // Verify the tool was actually invoked
      const toolResultMessages = result.messages.filter((m) => m.role === "toolResult");
      expect(toolResultMessages.length).toBeGreaterThanOrEqual(1);

      // Final response should incorporate the tool's answer
      expect(result.textResponse).toBeTruthy();
      expect(result.textResponse!.toLowerCase()).toContain("paris");
    }, 30_000);

    it("emits streaming events during tool use", async () => {
      const events: AgentEvent[] = [];
      const tool = makeLookupCapitalTool();

      const result = await client.runAgent({
        model,
        systemPrompt: "You have access to a lookup_capital tool. Use it to answer questions about capital cities. Always use the tool rather than answering from memory.",
        messages: [
          { role: "user", content: "What is the capital of France? Use the lookup_capital tool to find out." },
        ],
        tools: [tool],
        onEvent: (e) => events.push(e),
      });

      expect(result.success).toBe(true);

      const eventTypes = events.map((e) => e.type);

      // Should have at least one turn_start
      expect(eventTypes).toContain("turn_start");

      // Should have at least one text_delta from streaming
      expect(eventTypes).toContain("text_delta");

      // Verify event ordering: turn_start must come before any response_complete in the same turn
      const firstTurnStart = eventTypes.indexOf("turn_start");
      const firstResponseComplete = eventTypes.indexOf("response_complete");
      expect(firstTurnStart).toBeLessThan(firstResponseComplete);
    }, 30_000);
  });
}
