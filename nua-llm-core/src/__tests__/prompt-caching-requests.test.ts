import { buildOpenAiAgenticRequest } from "../modules/agent/provider-formatters";
import { openRouterDialect, providerConfigs } from "../modules/engine/http/provider-config";
import { textHash } from "../lib/text-hash";

const reusablePrefix = "Instructions\n<json-schema-spec> {} </json-schema-spec>";
const prompt = `${reusablePrefix}\n<input-data>[1]</input-data>`;

function castBody(
  provider: keyof typeof providerConfigs,
  model: string,
  options: { prompt?: string; reusablePrefix?: string } = {},
) {
  const request = providerConfigs[provider].buildRequest(
    {
      prompt: options.prompt ?? prompt,
      reusablePrefix: "reusablePrefix" in options ? options.reusablePrefix : reusablePrefix,
      model,
      maxTokens: 100,
    },
    "key",
  );
  return request.body as { messages: Array<{ content: unknown }>; session_id?: string };
}

describe("cast requests and prompt caching", () => {
  it("marks the reusable prefix for Claude on OpenRouter, and sends the rest after it", () => {
    expect(castBody("openrouter", "anthropic/claude-sonnet-5.5").messages[0].content).toEqual([
      { type: "text", text: reusablePrefix, cache_control: { type: "ephemeral" } },
      { type: "text", text: "\n<input-data>[1]</input-data>" },
    ]);
    expect(castBody("openrouter", "~anthropic/claude-haiku-latest").messages[0].content).toHaveLength(2);
  });

  it("marks the whole prompt when nothing but whitespace follows the prefix", () => {
    const body = castBody("openrouter", "anthropic/claude-sonnet-5.5", { prompt: `${reusablePrefix}\n` });

    expect(body.messages[0].content).toEqual([
      { type: "text", text: `${reusablePrefix}\n`, cache_control: { type: "ephemeral" } },
    ]);
  });

  it("sends the prompt as plain text to models that cache automatically, and to other providers", () => {
    expect(castBody("openrouter", "z-ai/glm-5.3-flash").messages[0].content).toBe(prompt);
    expect(castBody("groq", "openai/gpt-oss-120b").messages[0].content).toBe(prompt);
    expect(castBody("deepseek", "deepseek-flash").messages[0].content).toBe(prompt);
  });

  it("sends plain text when there is no reusable prefix, or it does not start the prompt", () => {
    expect(castBody("openrouter", "anthropic/claude-sonnet-5.5", { reusablePrefix: undefined }).messages[0].content).toBe(prompt);
    expect(castBody("openrouter", "anthropic/claude-sonnet-5.5", { reusablePrefix: "other" }).messages[0].content).toBe(prompt);
  });

  it("keys OpenRouter casts to the reusable prefix, so calls of one cast share an upstream", () => {
    const first = castBody("openrouter", "deepseek/deepseek-v4-pro-0813");
    const sameCast = castBody("openrouter", "deepseek/deepseek-v4-pro-0813", {
      prompt: `${reusablePrefix}\n<input-data>[2]</input-data>`,
    });
    const otherCast = castBody("openrouter", "deepseek/deepseek-v4-pro-0813", {
      prompt: "Other\n<input-data>[1]</input-data>",
      reusablePrefix: "Other",
    });

    expect(first.session_id).toBe(`nua-cast-${textHash(reusablePrefix)}`);
    expect(sameCast.session_id).toBe(first.session_id);
    expect(otherCast.session_id).not.toBe(first.session_id);
    expect(castBody("openrouter", "z-ai/glm-5.3-flash", { reusablePrefix: undefined }).session_id).toBeUndefined();
    expect(castBody("groq", "openai/gpt-oss-120b").session_id).toBeUndefined();
  });
});

describe("agent requests and prompt caching", () => {
  function agentBody(model: string) {
    return buildOpenAiAgenticRequest(
      { messages: [{ role: "user", content: "hi" }], tools: [], model, maxTokens: 100 },
      "https://openrouter.ai/api/v1/chat/completions",
      "key",
      openRouterDialect,
    ).body as Record<string, unknown>;
  }

  it("asks Claude to cache through the last block of the conversation", () => {
    expect(agentBody("anthropic/claude-opus-5.5").cache_control).toEqual({ type: "ephemeral" });
  });

  it("sends no marker to models that cache automatically, and no session_id", () => {
    expect(agentBody("z-ai/glm-5.3-flash")).not.toHaveProperty("cache_control");
    expect(agentBody("anthropic/claude-opus-5.5")).not.toHaveProperty("session_id");
  });
});

describe("textHash", () => {
  it("is stable, 16 hex digits, and differs for different text", () => {
    expect(textHash("abc")).toBe(textHash("abc"));
    expect(textHash("abc")).toMatch(/^[0-9a-f]{16}$/);
    expect(textHash("abc")).not.toBe(textHash("abd"));
    // FNV-1a 64 reference value for the empty string.
    expect(textHash("")).toBe("cbf29ce484222325");
  });
});
