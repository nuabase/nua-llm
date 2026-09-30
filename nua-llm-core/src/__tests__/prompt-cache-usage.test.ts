import { normalizeGeminiUsage, normalizeOpenAiUsage } from "../modules/engine/http/provider-config";

describe("prompt-cache usage", () => {
  it("reads OpenRouter's cache reads and writes", () => {
    expect(
      normalizeOpenAiUsage({
        prompt_tokens: 5501,
        completion_tokens: 10,
        total_tokens: 5511,
        prompt_tokens_details: { cached_tokens: 5485, cache_write_tokens: 0 },
      }),
    ).toEqual({
      promptTokens: 5501,
      completionTokens: 10,
      totalTokens: 5511,
      promptCacheReadTokens: 5485,
      promptCacheWriteTokens: 0,
    });
  });

  it("reads DeepSeek's cache hits", () => {
    expect(
      normalizeOpenAiUsage({
        prompt_tokens: 4073,
        completion_tokens: 10,
        total_tokens: 4083,
        prompt_cache_hit_tokens: 3840,
        prompt_cache_miss_tokens: 233,
      }),
    ).toMatchObject({ promptTokens: 4073, promptCacheReadTokens: 3840 });
  });

  it("leaves the cache counts out when the provider reports none", () => {
    const usage = normalizeOpenAiUsage({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });

    expect(usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
  });

  it("reads Gemini's cached content tokens", () => {
    expect(
      normalizeGeminiUsage({
        promptTokenCount: 4984,
        candidatesTokenCount: 20,
        totalTokenCount: 5004,
        cachedContentTokenCount: 4096,
      }),
    ).toEqual({ promptTokens: 4984, completionTokens: 20, totalTokens: 5004, promptCacheReadTokens: 4096 });
  });
});
