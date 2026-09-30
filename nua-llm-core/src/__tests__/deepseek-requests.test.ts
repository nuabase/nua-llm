import { buildOpenAiAgenticRequest } from "../modules/agent/provider-formatters";
import { deepseekRequestFields, providerConfigs } from "../modules/engine/http/provider-config";

describe("DeepSeek requests", () => {
  it("sends casts with max_tokens and thinking disabled", () => {
    const request = providerConfigs.deepseek.buildRequest(
      { prompt: "hi", model: "deepseek-flash", maxTokens: 100 },
      "key",
    );

    expect(request.url).toBe("https://api.deepseek.com/chat/completions");
    expect(request.body).toMatchObject({ max_tokens: 100, thinking: { type: "disabled" } });
    expect(request.body).not.toHaveProperty("max_completion_tokens");
  });

  it("enforces no cast schemas natively", () => {
    expect(providerConfigs.deepseek.strictSchemaModels).toBeUndefined();
  });

  it("sends agent turns with max_tokens and thinking disabled", () => {
    const request = buildOpenAiAgenticRequest(
      { messages: [], tools: [], model: "deepseek-flash", maxTokens: 100 },
      "https://api.deepseek.com/chat/completions",
      "key",
      { maxTokensParam: "max_tokens", extraBody: deepseekRequestFields },
    );

    expect(request.body).toMatchObject({ max_tokens: 100, thinking: { type: "disabled" } });
    expect(request.body).not.toHaveProperty("max_completion_tokens");
  });

  it("leaves other OpenAI-style providers on max_completion_tokens", () => {
    const request = providerConfigs.groq.buildRequest(
      { prompt: "hi", model: "openai/gpt-oss-120b", maxTokens: 100 },
      "key",
    );

    expect(request.body).toMatchObject({ max_completion_tokens: 100 });
    expect(request.body).not.toHaveProperty("thinking");
  });
});
